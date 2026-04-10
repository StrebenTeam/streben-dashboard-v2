const https = require('https');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

class GHLClient {
  // Two modes:
  //   1. Agency mode: new GHLClient(agencyApiKey, companyId)
  //   2. Sub-account mode: new GHLClient(subAccountApiKey) with no companyId
  constructor(apiKey = null, companyId = null) {
    this.apiKey = apiKey || process.env.GHL_API_KEY;
    this.companyId = companyId || process.env.GHL_COMPANY_ID || null;
    this.baseUrl = 'https://services.leadconnectorhq.com';
    this.apiVersion = '2021-07-28';

    // Cache for location tokens: { locationId: { token, expiresAt } }
    this.locationTokens = {};

    // If no companyId, we're in sub-account mode (token works directly)
    this.isSubAccountMode = !this.companyId;

    if (!this.apiKey) {
      throw new Error('GHL_API_KEY is required. Set via constructor or environment variable.');
    }
  }

  // Low-level HTTP request with a specific token
  async rawRequest(method, endpoint, token, body = null, queryParams = {}) {
    const url = new URL(endpoint, this.baseUrl);

    Object.keys(queryParams).forEach(key => {
      if (queryParams[key] !== undefined && queryParams[key] !== null) {
        url.searchParams.append(key, queryParams[key]);
      }
    });

    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Version': this.apiVersion,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = data ? JSON.parse(data) : null;
            console.log(`[GHL] ${method} ${endpoint} (${res.statusCode})`);

            if (res.statusCode >= 400) {
              reject({
                status: res.statusCode,
                message: parsed?.message || 'Unknown error',
                data: parsed,
              });
            } else {
              resolve(parsed);
            }
          } catch (e) {
            reject(new Error(`Failed to parse response: ${e.message}`));
          }
        });
      });

      req.on('error', reject);

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  // Agency-level request (uses the main API key directly)
  async agencyRequest(method, endpoint, body = null, queryParams = {}) {
    return this.rawRequest(method, endpoint, this.apiKey, body, queryParams);
  }

  // Exchange agency token for a location-level access token.
  // GHL endpoint: POST /oauth/locationToken
  // Body: { companyId, locationId }
  // Returns: { access_token, token_type, expires_in, ... }
  async getLocationToken(locationId) {
    // Check cache first
    const cached = this.locationTokens[locationId];
    if (cached && cached.expiresAt > Date.now()) {
      return cached.token;
    }

    console.log(`[GHL] Exchanging agency token for location token (${locationId})...`);
    const response = await this.rawRequest(
      'POST',
      '/oauth/locationToken',
      this.apiKey,
      { companyId: this.companyId, locationId }
    );

    const token = response.access_token;
    const expiresIn = response.expires_in || 86400; // default 24h

    // Cache it with a 5-minute buffer before expiry
    this.locationTokens[locationId] = {
      token,
      expiresAt: Date.now() + (expiresIn * 1000) - 300000,
    };

    console.log(`[GHL] Location token obtained for ${locationId} (expires in ${expiresIn}s)`);
    return token;
  }

  // Location-level request.
  // In sub-account mode: uses the API key directly (it already has location access).
  // In agency mode: exchanges the agency token for a location token first.
  async locationRequest(method, endpoint, locationId, body = null, queryParams = {}) {
    if (this.isSubAccountMode) {
      return this.rawRequest(method, endpoint, this.apiKey, body, queryParams);
    }
    const token = await this.getLocationToken(locationId);
    return this.rawRequest(method, endpoint, token, body, queryParams);
  }

  // ============================================================
  // AGENCY-LEVEL ENDPOINTS (use agency token directly)
  // ============================================================

  // Get all sub-accounts (locations) for the company
  async listLocations(limit = 100, skip = 0) {
    const params = { companyId: this.companyId, limit };
    if (skip > 0) params.skip = skip;
    return this.agencyRequest('GET', '/locations/search', null, params);
  }

  // Get single location detail (agency-level endpoint)
  async getLocation(locationId) {
    return this.agencyRequest('GET', `/locations/${locationId}`);
  }

  // ============================================================
  // LOCATION-LEVEL ENDPOINTS (exchange token per location)
  // ============================================================

  // Get contacts for a location with pagination support
  // GHL uses cursor pagination (startAfterId) or timestamp (startAfter)
  async getContacts(locationId, opts = {}) {
    const { limit = 100, startAfterId, startAfter, query } = opts;
    const params = { locationId, limit };
    if (startAfterId) params.startAfterId = startAfterId;
    if (startAfter) params.startAfter = startAfter;
    if (query) params.query = query;
    return this.locationRequest('GET', '/contacts/', locationId, null, params);
  }

  // Get pipelines for a location
  async getPipelines(locationId) {
    return this.locationRequest('GET', '/opportunities/pipelines', locationId, null, { locationId });
  }

  // Get opportunities for a location and optional pipeline
  async getOpportunities(locationId, pipelineId = null) {
    const params = { location_id: locationId };
    if (pipelineId) params.pipeline_id = pipelineId;
    return this.locationRequest('GET', '/opportunities/search', locationId, null, params);
  }

  // Get conversations for a location
  async getConversations(locationId, limit = 50) {
    const params = { locationId, limit };
    return this.locationRequest('GET', '/conversations/search', locationId, null, params);
  }

  // Get calendars for a location
  async getCalendars(locationId) {
    return this.locationRequest('GET', '/calendars/', locationId, null, { locationId });
  }

  // Get calendar events for a specific calendar within a time range
  async getCalendarEvents(locationId, calendarId, startTime, endTime) {
    return this.locationRequest('GET', '/calendars/events', locationId, null, {
      locationId,
      calendarId,
      startTime,
      endTime,
    });
  }
}

class GHLConfigManager {
  constructor(configPath = null) {
    this.configPath = configPath || path.join(process.cwd(), 'lib', 'ghl-config.json');
    this.config = null;
    this.clients = {}; // Cache of location clients: { locationId: GHLClient }
  }

  // Load config from JSON file
  loadConfig() {
    if (this.config) return this.config;

    if (!fs.existsSync(this.configPath)) {
      throw new Error(`Config file not found: ${this.configPath}`);
    }

    const raw = fs.readFileSync(this.configPath, 'utf8');
    this.config = JSON.parse(raw);
    console.log('[GHLConfigManager] Config loaded from', this.configPath);
    return this.config;
  }

  // Get all configured locations (filtered to those with tokens and not skipGhl)
  getLocations() {
    const cfg = this.loadConfig();
    return (cfg.locations || []).filter(loc => loc.ghlToken && !loc.skipGhl);
  }

  // Get ALL configured locations (including skipGhl, for platform-map)
  getAllLocations() {
    const cfg = this.loadConfig();
    return cfg.locations || [];
  }

  // Get ALL configured locations (including skipGhl, for platform-map)
  getAllLocations() {
    const cfg = this.loadConfig();
    return cfg.locations || [];
  }

  // Get GHLClient instance for a specific location
  // Creates one in sub-account mode using that location's token
  getClientForLocation(locationId) {
    if (this.clients[locationId]) {
      return this.clients[locationId];
    }

    const cfg = this.loadConfig();
    const location = cfg.locations.find(l => l.ghlLocationId === locationId);

    if (!location || !location.ghlToken) {
      throw new Error(`Location ${locationId} not found or has no token`);
    }

    // Create client in sub-account mode using this location's token
    const client = new GHLClient(location.ghlToken, null);
    this.clients[locationId] = client;
    return client;
  }

  // Find location config by Google Ads account ID
  getLocationByGoogleAdsId(googleAdsId) {
    const cfg = this.loadConfig();
    return cfg.locations.find(loc => loc.googleAdsAccountId === googleAdsId);
  }

  // Get full config entry for a location
  getLocationConfig(locationId) {
    const cfg = this.loadConfig();
    return cfg.locations.find(loc => loc.ghlLocationId === locationId);
  }
}

module.exports = GHLClient;
module.exports.GHLConfigManager = GHLConfigManager;
