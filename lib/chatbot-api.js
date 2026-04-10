/**
 * chatbot-api.js - Main chatbot endpoint
 * Receives user messages, gathers context, calls Claude Haiku with tools,
 * returns responses + action proposals.
 */

const express = require('express');
const Anthropic = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk');
const { buildAccountContext, contextToPrompt, buildPortfolioContext, resolveAccount, listAccounts } = require('./chatbot-context');
const conversationStore = require('./conversation-store');
const { TOOLS, READ_ONLY_TOOLS, WRITE_TOOLS, executeTool } = require('./chatbot-tools');
const crypto = require('crypto');

const router = express.Router();
var client = null;

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

// ─── MCP Proxy Client ────────────────────────────────────────────────────────
// Since MCP tools are available to the Cowork session (not the Express server),
// we store pending MCP calls. For read-only tools, we execute GAQL directly
// through our own DB or a lightweight proxy. For write tools, we queue them
// for confirmation.
//
// For now: read tools execute via our internal GAQL endpoint,
// write tools return as "proposed actions" for user confirmation.

async function mcpProxy(toolName, params) {
  // This is a placeholder for write tool execution.
  // When deployed remotely, this calls the MCP server.
  return { pending: true, tool: toolName, params: params };
}

// Execute read-only tools from local database cache
async function executeReadTool(toolName, params) {
  var dataBridge = require('./data-bridge');
  await dataBridge.ensureSearchTermsTable();
  var accountId = params.customer_id || params.account_id || params.accountId || '';

  if (toolName === 'get_search_terms') {
    var terms = await dataBridge.getSearchTerms(accountId, params.min_clicks || 1);
    if (terms.length === 0) {
      return 'No cached search terms found for account ' + accountId + '. Search term data is refreshed periodically. Use the account context in the system prompt for current insights.';
    }
    return { search_terms: terms, total: terms.length, note: 'Data from 30-day cache (last refreshed today)' };
  }

  if (toolName === 'get_keyword_performance') {
    var snapshots = await dataBridge.getKeywordPerformance(accountId);
    if (snapshots.length === 0) {
      return 'No performance data found for account ' + accountId;
    }
    return { weekly_snapshots: snapshots, total_weeks: snapshots.length };
  }

  if (toolName === 'query_google_ads') {
    return 'Live GAQL queries are not available in local mode. Use get_search_terms or get_keyword_performance tools to access cached data, or reference the account context in the system prompt.';
  }

  if (toolName === 'get_recommendations') {
    // Pull from intelligence API
    var healthData = require('./intelligence-api');
    return 'Recommendations are available in the account context above. Review the health score, trends, and benchmarks to provide specific recommendations.';
  }

  return 'Tool ' + toolName + ' executed. Check account context for relevant data.';
}

// ─── POST /api/chat ──────────────────────────────────────────────────────────

router.post('/', async function(req, res) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  var userMessage = (req.body.message || '').trim();
  var accountRef = req.body.accountId || req.body.accountName || null;
  var conversationId = req.body.conversationId || null;

  if (!userMessage) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    // Get or create conversation
    var conv;
    if (conversationId) {
      conv = conversationStore.get(conversationId);
    }
    if (!conv) {
      conversationId = conversationStore.create(accountRef || 'portfolio');
      conv = conversationStore.get(conversationId);
    }

    // Build system prompt with account context
    var accountList = listAccounts();
    var systemParts = [SYSTEM_PROMPT_BASE];
    accountList.forEach(function(a) {
      systemParts.push('- ' + a.name + ' [ID: ' + a.id + '] (' + a.vertical + ')');
    });

    // If user references a specific account, inject full context
    if (accountRef) {
      var ctx = await buildAccountContext(accountRef);
      if (ctx && !ctx.error) {
        systemParts.push('');
        systemParts.push('FOCUSED ACCOUNT DATA:');
        systemParts.push(contextToPrompt(ctx));
        conv.accountId = ctx.accountId;
      }
    } else {
      // Try to detect account from message
      for (var i = 0; i < accountList.length; i++) {
        var nameWords = accountList[i].name.toLowerCase().split(' ');
        var msgLower = userMessage.toLowerCase();
        // Check if any significant word (>3 chars) from account name is in message
        var match = nameWords.some(function(w) { return w.length > 3 && msgLower.includes(w); });
        if (match) {
          var ctx2 = await buildAccountContext(accountList[i].id);
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
      var ctx3 = await buildAccountContext(conv.accountId);
      if (ctx3 && !ctx3.error) {
        systemParts.push('');
        systemParts.push('CONVERSATION ACCOUNT:');
        systemParts.push(contextToPrompt(ctx3));
      }
    }

    // If still no account context, add portfolio overview
    if (systemParts.length < 15) {
      var portCtx = await buildPortfolioContext();
      systemParts.push('');
      systemParts.push(portCtx);
    }

    var systemPrompt = systemParts.join('\n');

    // Build messages array (conversation history + new message)
    conversationStore.addMessage(conversationId, 'user', userMessage);
    var messages = conversationStore.getMessages(conversationId);

    // Call Claude Haiku with tools
    var anthropic = getClient();
    var response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: systemPrompt,
      tools: TOOLS,
      messages: messages
    });

    // Process response: extract text + tool calls
    var textParts = [];
    var proposedActions = [];
    var toolResults = [];

    for (var j = 0; j < response.content.length; j++) {
      var block = response.content[j];
      if (block.type === 'text') {
        textParts.push(block.text);
      } else if (block.type === 'tool_use') {
        var toolName = block.name;
        var toolInput = block.input;
        var toolId = block.id;

        if (WRITE_TOOLS.includes(toolName)) {
          // Write tools: propose action, don't execute yet
          var actionId = crypto.randomUUID();
          var action = {
            actionId: actionId,
            toolCallId: toolId,
            type: toolName,
            title: formatActionTitle(toolName, toolInput),
            description: formatActionDescription(toolName, toolInput),
            parameters: toolInput,
            requiresConfirmation: true
          };
          proposedActions.push(action);
          conversationStore.storeAction(conversationId, action);

          // Return a tool result saying "awaiting confirmation"
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolId,
            content: 'Action proposed to user for confirmation. Action ID: ' + actionId
          });
        } else {
          // Read tools: execute from local cache/database
          var toolResult = await executeReadTool(toolName, toolInput);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolId,
            content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult)
          });
        }
      }
    }

    // If the model made tool calls, we need a second turn to get the final text
    if (toolResults.length > 0 && response.stop_reason === 'tool_use') {
      var followUpMessages = messages.concat([
        { role: 'assistant', content: response.content },
        { role: 'user', content: toolResults }
      ]);

      var followUp = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: systemPrompt,
        tools: TOOLS,
        messages: followUpMessages
      });

      for (var k = 0; k < followUp.content.length; k++) {
        if (followUp.content[k].type === 'text') {
          textParts.push(followUp.content[k].text);
        }
      }
    }

    var assistantText = textParts.join('\n\n');
    conversationStore.addMessage(conversationId, 'assistant', assistantText);

    res.json({
      conversationId: conversationId,
      response: assistantText,
      actions: proposedActions,
      accountId: conv.accountId || null
    });

  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: 'Chat failed: ' + err.message });
  }
});

// ─── POST /api/chat/confirm ──────────────────────────────────────────────────
// User confirms a proposed action

router.post('/confirm', async function(req, res) {
  var conversationId = req.body.conversationId;
  var actionId = req.body.actionId;

  if (!conversationId || !actionId) {
    return res.status(400).json({ error: 'conversationId and actionId required' });
  }

  var action = conversationStore.getAction(conversationId, actionId);
  if (!action) {
    return res.status(404).json({ error: 'Action not found or expired' });
  }

  try {
    // Execute via MCP proxy (placeholder for now)
    var result = await mcpProxy(action.type, action.parameters);
    conversationStore.removeAction(conversationId, actionId);

    res.json({
      success: true,
      actionId: actionId,
      type: action.type,
      result: result,
      message: 'Action queued for execution: ' + action.title
    });
  } catch (err) {
    res.status(500).json({ error: 'Action execution failed: ' + err.message });
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

module.exports = router;
