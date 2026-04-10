/**
 * chatbot-tools.js - Tool definitions for Claude tool-use + MCP execution
 * 
 * Each tool maps to a Google Ads MCP operation.
 * The LLM sees the Claude tool-use schema; execution calls the real MCP proxy.
 */

const MCC_ID = process.env.GOOGLE_ADS_MCC_ID || '5130868844';

// ─── Tool Definitions (sent to Claude API) ───────────────────────────────────

const TOOLS = [
  {
    name: 'get_search_terms',
    description: 'Pull search term report showing actual queries triggering ads. Use to find negative keyword opportunities or new keyword candidates.',
    input_schema: {
      type: 'object',
      properties: {
        customer_id: { type: 'string', description: 'Google Ads account ID' },
        days: { type: 'number', description: 'Lookback window: 7, 14, 30, or 90', default: 30 },
        min_clicks: { type: 'number', description: 'Min clicks to filter noise', default: 1 }
      },
      required: ['customer_id']
    }
  },
  {
    name: 'add_negative_keywords',
    description: 'Add negative keywords to a campaign to block unwanted search terms. Always dry-run first to preview, then confirm to execute.',
    input_schema: {
      type: 'object',
      properties: {
        customer_id: { type: 'string', description: 'Google Ads account ID' },
        campaign_id: { type: 'string', description: 'Campaign ID to add negatives to' },
        keywords: { type: 'array', items: { type: 'string' }, description: 'List of negative keyword strings' },
        match_type: { type: 'string', enum: ['BROAD', 'PHRASE', 'EXACT'], default: 'BROAD' }
      },
      required: ['customer_id', 'campaign_id', 'keywords']
    }
  },
  {
    name: 'update_campaign_budget',
    description: 'Change a campaign daily budget. Always dry-run first, then confirm.',
    input_schema: {
      type: 'object',
      properties: {
        customer_id: { type: 'string', description: 'Google Ads account ID' },
        campaign_id: { type: 'string', description: 'Campaign ID' },
        new_daily_budget_dollars: { type: 'number', description: 'New daily budget in dollars' }
      },
      required: ['customer_id', 'campaign_id', 'new_daily_budget_dollars']
    }
  },
  {
    name: 'update_campaign_status',
    description: 'Pause or enable a campaign. Always dry-run first, then confirm.',
    input_schema: {
      type: 'object',
      properties: {
        customer_id: { type: 'string', description: 'Google Ads account ID' },
        campaign_id: { type: 'string', description: 'Campaign ID' },
        status: { type: 'string', enum: ['ENABLED', 'PAUSED'], description: 'New campaign status' }
      },
      required: ['customer_id', 'campaign_id', 'status']
    }
  },
  {
    name: 'query_google_ads',
    description: 'Run a GAQL query to fetch any data from Google Ads: campaigns, ad groups, keywords, metrics, etc. Use for deep analysis.',
    input_schema: {
      type: 'object',
      properties: {
        customer_id: { type: 'string', description: 'Google Ads account ID' },
        query: { type: 'string', description: 'Valid GAQL SELECT statement' }
      },
      required: ['customer_id', 'query']
    }
  },
  {
    name: 'get_recommendations',
    description: 'Get Google Ads optimization recommendations for an account.',
    input_schema: {
      type: 'object',
      properties: {
        customer_id: { type: 'string', description: 'Google Ads account ID' }
      },
      required: ['customer_id']
    }
  },
  {
    name: 'get_keyword_performance',
    description: 'Get keyword-level performance data for an account.',
    input_schema: {
      type: 'object',
      properties: {
        customer_id: { type: 'string', description: 'Google Ads account ID' },
        campaign_id: { type: 'string', description: 'Optional: filter to specific campaign' }
      },
      required: ['customer_id']
    }
  }
];

// Read-only tools (execute immediately, no confirmation needed)
const READ_ONLY_TOOLS = ['get_search_terms', 'query_google_ads', 'get_recommendations', 'get_keyword_performance'];

// Write tools (require user confirmation before execution)
const WRITE_TOOLS = ['add_negative_keywords', 'update_campaign_budget', 'update_campaign_status'];

// ─── Tool Execution (calls MCP proxy endpoint) ──────────────────────────────

// This will be called by the chatbot API to execute tools.
// For now, it stores the MCP call params. The actual MCP execution
// happens through a proxy endpoint that forwards to the MCP server.
// When we move to a remote server, this becomes a direct MCP client call.

async function executeTool(toolName, params, httpClient) {
  // httpClient is a function that calls our MCP proxy: POST /api/mcp/:tool
  var loginId = MCC_ID;

  switch (toolName) {
    case 'get_search_terms':
      return await httpClient('get_search_terms', {
        customer_id: params.customer_id,
        days: params.days || 30,
        min_clicks: params.min_clicks || 1,
        login_customer_id: loginId
      });

    case 'query_google_ads':
      return await httpClient('execute_gaql', {
        customer_id: params.customer_id,
        query: params.query,
        login_customer_id: loginId
      });

    case 'get_recommendations':
      return await httpClient('get_recommendations', {
        customer_id: params.customer_id,
        login_customer_id: loginId
      });

    case 'get_keyword_performance':
      var q = 'SELECT campaign.name, campaign.id, ad_group.name, ad_group.id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM keyword_view WHERE segments.date DURING LAST_30_DAYS AND metrics.impressions > 0';
      if (params.campaign_id) q += " AND campaign.id = '" + params.campaign_id + "'";
      q += ' ORDER BY metrics.cost_micros DESC LIMIT 50';
      return await httpClient('execute_gaql', {
        customer_id: params.customer_id,
        query: q,
        login_customer_id: loginId
      });

    case 'add_negative_keywords':
      return await httpClient('add_negative_keywords', {
        customer_id: params.customer_id,
        campaign_id: params.campaign_id,
        keywords: params.keywords,
        match_type: params.match_type || 'BROAD',
        confirm: params.confirm || false,
        login_customer_id: loginId
      });

    case 'update_campaign_budget':
      return await httpClient('update_campaign_budget', {
        customer_id: params.customer_id,
        campaign_id: params.campaign_id,
        new_daily_budget_dollars: params.new_daily_budget_dollars,
        confirm: params.confirm || false,
        login_customer_id: loginId
      });

    case 'update_campaign_status':
      return await httpClient('update_campaign_status', {
        customer_id: params.customer_id,
        campaign_id: params.campaign_id,
        status: params.status,
        confirm: params.confirm || false,
        login_customer_id: loginId
      });

    default:
      return { error: 'Unknown tool: ' + toolName };
  }
}

module.exports = { TOOLS, READ_ONLY_TOOLS, WRITE_TOOLS, executeTool };
