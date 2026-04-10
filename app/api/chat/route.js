import Anthropic from '@anthropic-ai/sdk';
import { buildAccountContext, contextToPrompt, buildPortfolioContext, listAccounts } from '@/lib/chatbot-context';
import conversationStore from '@/lib/conversation-store';
import { TOOLS, WRITE_TOOLS } from '@/lib/chatbot-tools';
import crypto from 'crypto';

let client = null;

function getClient() {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

const SYSTEM_PROMPT_BASE = [
  'You are Streben, an expert Google Ads strategist embedded in a dashboard.',
  'You analyze account data and help the user optimize their Google Ads campaigns.',
  'You have access to tools that can query Google Ads data and make changes to accounts.',
  '',
  'RULES:',
  '- Be direct and specific. Use actual numbers from the context provided.',
  '- Never use em dashes or double dashes. Use periods, commas, or semicolons instead.',
  '- Each account is a separate client. Never recommend moving budget between accounts.',
  '- For write actions (adding negatives, changing budgets, pausing campaigns), always explain what you plan to do and why BEFORE using the tool.',
  '- When using query_google_ads, write valid GAQL. Cost fields are in micros (divide by 1,000,000 for dollars).',
  '- Keep responses concise but actionable. 2 to 4 paragraphs max unless the user asks for detail.',
  '- Never use markdown formatting (no bold, headers, or asterisks). Use plain text only.',
  '- When you find negative keyword opportunities from search terms, list them clearly with the reason each should be negated.',
  '',
  'AVAILABLE ACCOUNTS:',
].join('\n');

async function mcpProxy(toolName, params) {
  return { pending: true, tool: toolName, params: params };
}

async function executeReadTool(toolName, params) {
  const dataBridge = await import('@/lib/data-bridge');
  await dataBridge.ensureSearchTermsTable();
  const accountId = params.customer_id || params.account_id || params.accountId || '';

  if (toolName === 'get_search_terms') {
    const terms = await dataBridge.getSearchTerms(accountId, params.min_clicks || 1);
    if (terms.length === 0) {
      return 'No cached search terms found for account ' + accountId + '. Search term data is refreshed periodically. Use the account context in the system prompt for current insights.';
    }
    return { search_terms: terms, total: terms.length, note: 'Data from 30-day cache (last refreshed today)' };
  }

  if (toolName === 'get_keyword_performance') {
    const snapshots = await dataBridge.getKeywordPerformance(accountId);
    if (snapshots.length === 0) {
      return 'No performance data found for account ' + accountId;
    }
    return { weekly_snapshots: snapshots, total_weeks: snapshots.length };
  }

  if (toolName === 'query_google_ads') {
    return 'Live GAQL queries are not available in local mode. Use get_search_terms or get_keyword_performance tools to access cached data, or reference the account context in the system prompt.';
  }

  if (toolName === 'get_recommendations') {
    return 'Recommendations are available in the account context above. Review the health score, trends, and benchmarks to provide specific recommendations.';
  }

  return 'Tool ' + toolName + ' executed. Check account context for relevant data.';
}

function formatActionTitle(toolName, params) {
  switch (toolName) {
    case 'add_negative_keywords':
      return 'Add ' + (params.keywords || []).length + ' negative keywords';
    case 'update_campaign_budget':
      return 'Change budget to $' + (params.new_daily_budget_dollars || 0).toFixed(2) + '/day';
    case 'update_campaign_status':
      return (params.status === 'PAUSED' ? 'Pause' : 'Enable') + ' campaign';
    default:
      return toolName.replace(/_/g, ' ');
  }
}

function formatActionDescription(toolName, params) {
  switch (toolName) {
    case 'add_negative_keywords':
      return 'Campaign ' + (params.campaign_id || '?') + ': ' +
        (params.keywords || []).slice(0, 5).join(', ') +
        ((params.keywords || []).length > 5 ? ' (+' + ((params.keywords || []).length - 5) + ' more)' : '') +
        ' [' + (params.match_type || 'BROAD') + ']';
    case 'update_campaign_budget':
      return 'Campaign ' + (params.campaign_id || '?') + ': set daily budget to $' + (params.new_daily_budget_dollars || 0).toFixed(2);
    case 'update_campaign_status':
      return 'Campaign ' + (params.campaign_id || '?') + ': ' + (params.status || '?');
    default:
      return JSON.stringify(params);
  }
}

export async function POST(request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const userMessage = (body.message || '').trim();
    const accountRef = body.accountId || body.accountName || null;
    let conversationId = body.conversationId || null;

    if (!userMessage) {
      return Response.json({ error: 'Message is required' }, { status: 400 });
    }

    // Get or create conversation
    let conv;
    if (conversationId) {
      conv = conversationStore.get(conversationId);
    }
    if (!conv) {
      conversationId = conversationStore.create(accountRef || 'portfolio');
      conv = conversationStore.get(conversationId);
    }

    // Build system prompt with account context
    const accountList = listAccounts();
    const systemParts = [SYSTEM_PROMPT_BASE];
    accountList.forEach(function(a) {
      systemParts.push('- ' + a.name + ' [ID: ' + a.id + '] (' + a.vertical + ')');
    });

    // If user references a specific account, inject full context
    if (accountRef) {
      const ctx = await buildAccountContext(accountRef);
      if (ctx && !ctx.error) {
        systemParts.push('');
        systemParts.push('FOCUSED ACCOUNT DATA:');
        systemParts.push(contextToPrompt(ctx));
        conv.accountId = ctx.accountId;
      }
    } else {
      // Try to detect account from message
      for (let i = 0; i < accountList.length; i++) {
        const nameWords = accountList[i].name.toLowerCase().split(' ');
        const msgLower = userMessage.toLowerCase();
        const match = nameWords.some(function(w) { return w.length > 3 && msgLower.includes(w); });
        if (match) {
          const ctx2 = await buildAccountContext(accountList[i].id);
          if (ctx2 && !ctx2.error) {
            systemParts.push('');
            systemParts.push('DETECTED ACCOUNT FROM MESSAGE:');
            systemParts.push(contextToPrompt(ctx2));
            conv.accountId = ctx2.accountId;
          }
          break;
        }
      }
    }

    // If no account detected and we have a prior account in conversation, inject that
    if (!conv.accountId && conv.messages.length > 0) {
      // Keep previous context
    } else if (conv.accountId && systemParts.length < 15) {
      const ctx3 = await buildAccountContext(conv.accountId);
      if (ctx3 && !ctx3.error) {
        systemParts.push('');
        systemParts.push('CONVERSATION ACCOUNT:');
        systemParts.push(contextToPrompt(ctx3));
      }
    }

    // If still no account context, add portfolio overview
    if (systemParts.length < 15) {
      const portCtx = await buildPortfolioContext();
      systemParts.push('');
      systemParts.push(portCtx);
    }

    const systemPrompt = systemParts.join('\n');

    // Build messages array
    conversationStore.addMessage(conversationId, 'user', userMessage);
    const messages = conversationStore.getMessages(conversationId);

    // Call Claude Haiku with tools
    const anthropic = getClient();
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: systemPrompt,
      tools: TOOLS,
      messages: messages
    });

    // Process response
    const textParts = [];
    const proposedActions = [];
    const toolResults = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        textParts.push(block.text);
      } else if (block.type === 'tool_use') {
        const toolName = block.name;
        const toolInput = block.input;
        const toolId = block.id;

        if (WRITE_TOOLS.includes(toolName)) {
          const actionId = crypto.randomUUID();
          const action = {
            actionId, toolCallId: toolId, type: toolName,
            title: formatActionTitle(toolName, toolInput),
            description: formatActionDescription(toolName, toolInput),
            parameters: toolInput, requiresConfirmation: true
          };
          proposedActions.push(action);
          conversationStore.storeAction(conversationId, action);
          toolResults.push({
            type: 'tool_result', tool_use_id: toolId,
            content: 'Action proposed to user for confirmation. Action ID: ' + actionId
          });
        } else {
          const toolResult = await executeReadTool(toolName, toolInput);
          toolResults.push({
            type: 'tool_result', tool_use_id: toolId,
            content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult)
          });
        }
      }
    }

    // If tool calls, do a second turn for final text
    if (toolResults.length > 0 && response.stop_reason === 'tool_use') {
      const followUpMessages = messages.concat([
        { role: 'assistant', content: response.content },
        { role: 'user', content: toolResults }
      ]);

      const followUp = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: systemPrompt,
        tools: TOOLS,
        messages: followUpMessages
      });

      for (const block of followUp.content) {
        if (block.type === 'text') {
          textParts.push(block.text);
        }
      }
    }

    const assistantText = textParts.join('\n\n');
    conversationStore.addMessage(conversationId, 'assistant', assistantText);

    return Response.json({
      conversationId,
      response: assistantText,
      actions: proposedActions,
      accountId: conv.accountId || null
    });
  } catch (err) {
    console.error('Chat error:', err.message);
    return Response.json({ error: 'Chat failed: ' + err.message }, { status: 500 });
  }
}
