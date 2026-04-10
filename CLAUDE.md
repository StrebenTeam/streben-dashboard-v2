@AGENTS.md

# Streben Dashboard v2 — Project Reference

## What This Is

A Google Ads + Meta Ads + GHL (GoHighLevel) performance dashboard for Streben, a digital marketing agency. Built with Next.js 16 App Router, deployed on Vercel at `streben-dashboard-v2.vercel.app`. Auth via Clerk. Database is Turso (cloud SQLite). Previous version was a localhost Express.js + CDN React app.

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | Next.js 16 App Router | `proxy.js` NOT `middleware.js` (Next.js 16 breaking change) |
| Auth | Clerk (`@clerk/nextjs` v7) | Dark theme, sign-in at `/sign-in` |
| Database | Turso (`@libsql/client`) | Cloud SQLite, credentials in env vars |
| Frontend | React 19, Recharts | Client components with `'use client'` |
| AI | Anthropic SDK | ChatWidget uses `/api/chat` |
| CRM | GHL API | Per-sub-account PIT tokens in `lib/ghl-config.json` |
| Deployment | Vercel | Auto-deploys from `main` branch on GitHub |

## Environment Variables (in `.env.local` and Vercel)

```
TURSO_DATABASE_URL=libsql://streben-dashboard-streben.aws-us-east-1.turso.io
TURSO_AUTH_TOKEN=<token>
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_Z2l2aW5nLXNlYWwtMjIuY2xlcmsuYWNjb3VudHMuZGV2JA
CLERK_SECRET_KEY=<secret>
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
ANTHROPIC_API_KEY=<key>
```

## Project Structure

```
streben-dashboard-v2/
├── app/
│   ├── layout.js              # Root layout — Urbanist font, ClerkProvider, favicon
│   ├── page.js                # Main dashboard — state management, routing, all views
│   ├── globals.css            # Complete brand stylesheet (Streben colors, animations)
│   ├── sign-in/[[...sign-in]]/page.js  # Clerk sign-in page
│   └── api/                   # 35 API route handlers
│       ├── accounts/route.js
│       ├── overview/route.js
│       ├── weeks/route.js
│       ├── account-groups/route.js
│       ├── platform-map/route.js
│       ├── anomalies/route.js
│       ├── recommendations/[id]/route.js
│       ├── recommendations/route.js
│       ├── groups/[id]/route.js
│       ├── ghl-match/route.js
│       ├── chat/route.js          # AI chatbot endpoint
│       ├── chat/confirm/route.js  # Action confirmation
│       ├── intelligence/          # alerts, benchmarks, health, portfolio, summary, synthesis, verticals, account-map
│       ├── meta/                  # overview, accounts/[id], match
│       └── ghl/                   # overview, locations/[id]
├── components/
│   ├── Sidebar.jsx            # Navigation sidebar with Streben logo
│   ├── OverviewPage.jsx       # MCC overview with metric cards + charts
│   ├── AccountPage.jsx        # Individual Google Ads account detail
│   ├── GroupPage.jsx          # Grouped accounts view
│   ├── MetaAccountPage.jsx    # Meta Ads account detail
│   ├── IntelligencePage.jsx   # AI-powered insights, health scores, portfolio analysis
│   ├── LeadSourcesPage.jsx    # GHL lead source analytics
│   ├── PipelinePage.jsx       # GHL pipeline/opportunity tracking
│   ├── LocationDetailPage.jsx # Individual GHL location detail
│   ├── ChatWidget.jsx         # Floating AI chat assistant
│   ├── MetricCard.jsx         # Reusable metric display card
│   └── DeltaBadge.jsx         # Week-over-week change indicator
├── lib/
│   ├── db.js                  # Turso database layer (query, queryOne, run, batch)
│   ├── ghl-client.js          # GHL API client (uses per-location PIT tokens)
│   ├── ghl-config.json        # 12 GHL locations with sub-account tokens
│   ├── chatbot-api.js         # AI chatbot logic
│   ├── chatbot-context.js     # Context builder for AI
│   ├── chatbot-tools.js       # Tool definitions for AI actions
│   ├── conversation-store.js  # In-memory conversation storage
│   ├── data-bridge.js         # Data access bridge for chatbot
│   ├── rule-engine.js         # Alert/anomaly rules
│   ├── synthesis-engine.js    # Cross-account synthesis
│   ├── trend-engine.js        # Trend detection
│   ├── benchmarks.js          # Industry benchmarks
│   ├── formatters.js          # Number/currency formatting utils
│   └── sources.js             # Data source definitions
├── scripts/
│   ├── weekly-pull.js         # Data pipeline: JSON files → Turso (run weekly)
│   └── migrate-to-turso.js    # One-time migration script (already completed)
├── proxy.js                   # Clerk auth middleware (Next.js 16 convention)
├── .env.local                 # Environment variables (not committed)
└── package.json
```

## Database Schema (Turso — 13 tables)

| Table | Rows | Purpose |
|-------|------|---------|
| accounts | 12 | Google Ads account metadata |
| weekly_snapshots | 137 | Weekly Google Ads performance snapshots |
| campaign_snapshots | 217 | Per-campaign weekly data |
| search_terms_cache | 9,734 | Search term report cache |
| meta_accounts | 7 | Meta Ads account metadata |
| meta_weekly_snapshots | 134 | Weekly Meta Ads performance |
| meta_campaign_snapshots | 237 | Per-campaign Meta weekly data |
| anomalies | 8 | Detected performance anomalies |
| recommendations | 6 | AI-generated recommendations |
| pull_log | 10 | Data pull history |
| ghl_lead_snapshots | 0 | GHL lead data (not yet populated) |
| ghl_pipeline_snapshots | 0 | GHL pipeline data (not yet populated) |

## Key Patterns

### Database Access
All database calls are async via `lib/db.js`:
```js
const { query, queryOne, run, batch } = require('@/lib/db');
const rows = await query('SELECT * FROM accounts WHERE id = ?', [id]);
```

### API Route Pattern (Next.js 16 App Router)
```js
// app/api/example/route.js
import { query } from '@/lib/db';
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const data = await query('SELECT ...', []);
  return Response.json(data);
}
```

### Client-Side Navigation
The app uses a single-page architecture within `page.js`. Navigation is state-driven via `navTo(view, opts)`:
```js
navTo('account', { accountId: id })    // Go to account detail
navTo('group', { groupId: id })        // Go to group view
navTo('meta-account', { metaAccountId: id })
navTo('overview')                       // Back to MCC overview
```

### GHL API
Each GHL sub-account has its own PIT (Private Integration Token) stored in `lib/ghl-config.json`. The client loads tokens per-location, NOT from a single env var:
```js
const GHLClient = require('@/lib/ghl-client');
const ghl = new GHLClient();
// Config path: path.join(process.cwd(), 'lib', 'ghl-config.json')
```

## Data Pipeline

### How Data Gets Updated
1. **Google Ads**: `scripts/pull-google-live.js` (in the old `streben-dashboard/` repo) pulls data from Google Ads API → saves as JSON files in `streben-dashboard/data/weekly-pull/`
2. **Meta Ads**: Same script pulls Meta data → JSON files
3. **Turso Ingest**: `scripts/weekly-pull.js` reads those JSON files → batch inserts into Turso cloud DB
4. **Run weekly** after Monday (when Google Ads finalizes prior week data)

### Running the Pipeline
```bash
# From the streben-dashboard-v2 directory:
node scripts/weekly-pull.js
# Reads from: ../streben-dashboard/data/weekly-pull/
# Writes to: Turso cloud via TURSO_DATABASE_URL
```

## Streben Brand Guide

### Colors
- **Primary Green**: `#8AC245` (accent, CTAs, positive indicators, currency values)
- **Blue**: `#6EC1E4` (secondary accent, chart bars, links)
- **Background**: `#0A0A0A` (near-black)
- **Surface**: `#111111` (cards, sidebar)
- **Surface2**: `#1A1A1A` (elevated surfaces)
- **Border**: `#2A2A2A` (subtle borders)
- **Text**: `#FFFFFF` / `rgba(255,255,255,0.55)` dim
- **Red**: `#E54D4D` (errors, negative changes)
- **Yellow**: `#E5C94D` (warnings)
- **Orange**: `#E5944D` (caution)

### Typography
- **Font**: Urbanist (Google Fonts) — weights 400, 500, 600, 700, 900
- **Letter spacing**: 1px throughout
- **Body size**: 16px, weight 500

### UI Patterns
- **Buttons**: Pill shape (border-radius: 25px)
- **Cards**: 1px solid border (#2A2A2A), no heavy box shadows
- **Animations**: fadeInUp (12px translate, 0.5s ease-out-quart), staggered 60ms for metric cards, 40ms for table rows
- **Reduced motion**: Respects `prefers-reduced-motion`
- **Logo**: `https://streben.io/wp-content/uploads/2025/01/Streben-logo-final-03-1_edited.avif` (white version)
- **Favicon**: `https://streben.io/wp-content/uploads/2025/01/Isotipo-Streben-Green-Blue.png`

### Color Rules — DO NOT USE
- `#6366f1` (indigo/purple) — replaced with `#6EC1E4`
- `#8b5cf6` (violet) — replaced with `#6EC1E4`
- `#22c55e` (generic green) — replaced with `#8AC245`
- `#4ade80` (light green) — replaced with `#8AC245`
- Any Tailwind default palette colors in inline styles

## Common Issues & Fixes

### "proxy.js" not "middleware.js"
Next.js 16 renamed middleware. If you create `middleware.js`, you'll get a deprecation warning and it won't work.

### GHL config path
Use `path.join(process.cwd(), 'lib', 'ghl-config.json')` — NOT `__dirname` (doesn't resolve correctly in Next.js bundled code).

### Clerk blocks preview tool
The Clerk auth JS blocks the browser preview tool from rendering. To visually test, either:
1. Log in on the live site
2. Temporarily set `proxy.js` to `export default function proxy() {}` and `config.matcher = []`

### accounts.filter is not a function
API may return error object instead of array when DB fails. Always guard: `setAccounts(Array.isArray(d) ? d : [])`

### sql.js WASM path (legacy — only in data-bridge.js)
If using sql.js anywhere, add `locateFile: file => path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file)` to `initSqlJs()`.

## GitHub & Deployment
- **Repo**: `https://github.com/StrebenTeam/streben-dashboard-v2.git`
- **Branch**: `main` (auto-deploys to Vercel)
- **Live URL**: `streben-dashboard-v2.vercel.app`
- **Vercel env vars**: Same as `.env.local` above — set in Vercel dashboard
