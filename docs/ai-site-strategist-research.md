# AI Site Strategist — Technical Architecture Research
### Research Date: March 7, 2026

---

## Executive Summary

This document lays out the optimized technical approach for building an AI-powered website analysis and content strategy tool. The product takes a user's website, understands what each page is trying to achieve (through both automated crawling and intelligent questionnaires), and delivers actionable recommendations for content creation, SEO, UX improvements, and growth — continuously, as the site evolves.

Nothing like this exists as a clean standalone product. The closest tools (Surfer SEO, Frase, Semrush Copilot) are content optimization tools that bolted on some AI. This product is an **AI strategist that happens to use web data** — the intelligence IS the product.

---

## Recommended Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Frontend** | Next.js 14+ (App Router) | SSR for SEO, React Server Components for performance, your existing expertise |
| **Database** | Supabase (PostgreSQL) | Auth, storage, realtime subscriptions, Row Level Security — separate project from PU/HarmonySet |
| **Hosting** | Vercel | Auto-deployment from GitHub, edge functions, your existing workflow |
| **AI Intelligence** | Claude API (Sonnet) | Best cost-to-quality ratio for structured analysis; upgrade to Opus for complex strategy |
| **Site Crawling** | Firecrawl API (primary) / Crawl4AI (fallback) | See detailed comparison below |
| **Data Integrations** | Google Search Console API, Google Analytics 4 API | OAuth 2.0 via NextAuth.js |
| **Background Jobs** | Vercel Cron + Supabase Edge Functions | Periodic re-crawls and monitoring |
| **Notifications** | Resend (email) | Already on your roadmap |

---

## Component 1: Site Crawling — The Data Foundation

### The Decision: Firecrawl vs. Crawl4AI vs. Crawlee

This is the most important infrastructure decision. The crawler determines the quality of everything downstream.

### Option A: Firecrawl (API) — RECOMMENDED FOR MVP

**What it is:** An API service that takes a URL, crawls every accessible page, and returns clean LLM-ready markdown + structured metadata. Handles JavaScript rendering, anti-bot, proxies — everything.

**Why it wins for your use case:**
- One API call crawls an entire site and returns clean markdown per page — no infrastructure to manage
- Built-in AI extraction: you can define a schema and Firecrawl's built-in LLM extracts structured data from pages (meta tags, headings, links, images, content sections)
- Handles JS-heavy SPAs (which many modern sites are, including yours)
- Has a `/map` endpoint that instantly discovers all URLs on a site — perfect for the initial "site map of intent" feature
- Node.js SDK available, fits directly into Next.js

**Pricing reality:**
- Free tier: 500 pages (one-time) — enough for ~10 full site analyses during development
- Hobby: $16/month for 3,000 pages — enough for your sandbox phase
- Standard: $83/month for 100,000 pages — enough for public beta with many users
- 1 credit = 1 page, simple and predictable

**Important caveat:** The `/extract` feature (AI-powered structured extraction) is billed separately on a token basis, starting at $89/month. For MVP, skip `/extract` — use Firecrawl for raw crawling and feed the markdown to Claude API for analysis. This keeps costs to just the $16/month Hobby tier + Claude API usage.

**Integration example:**
```javascript
import Firecrawl from '@mendable/firecrawl-js';

const app = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });

// Step 1: Discover all URLs instantly
const mapResult = await app.map('https://example.com');
// Returns: { links: [{ url, title, description }, ...] }

// Step 2: Full crawl with markdown output
const crawlResult = await app.crawl('https://example.com', {
  limit: 50,
  scrapeOptions: { formats: ['markdown', 'html'] }
});
// Returns per-page: { markdown, metadata: { title, description, sourceURL, statusCode } }
```

### Option B: Crawl4AI (Self-Hosted) — RECOMMENDED FOR SCALE / COST OPTIMIZATION

**What it is:** The #1 trending open-source crawler on GitHub (58K+ stars). Python-based, completely free, self-hostable via Docker. Outputs LLM-ready markdown natively.

**Why it's the long-term play:**
- Zero per-page cost — only infrastructure cost (a small VPS or Supabase Edge Function)
- Full control: no rate limits, no vendor lock-in
- Supports LLM-driven extraction using any provider (Claude, OpenAI, local models via Ollama)
- BM25 content filtering for relevance-based extraction
- Deep crawl strategies (BFS, DFS) with configurable depth

**Why NOT for MVP:**
- Python-based — adds complexity to a Node.js/Next.js stack
- Requires managing a Docker container or separate server
- More setup and maintenance than a simple API call
- The Firecrawl API handles all the hard stuff (proxies, JS rendering, anti-bot) that you'd need to configure manually

**Migration path:** Start with Firecrawl API for MVP → when you have paying users and need to optimize costs, deploy Crawl4AI on a VPS or Railway.app container and point your app at it instead. The data format (markdown + metadata) is nearly identical, so the switch is straightforward.

### Option C: Crawlee (Node.js) — NOT RECOMMENDED

Crawlee is a powerful Node.js crawling library, but it's a library, not a service. You'd need to build the entire crawling pipeline yourself — JS rendering, proxy management, rate limiting, error handling, markdown conversion. That's weeks of work that Firecrawl solves with one API call.

### Verdict

**Phase 1 (MVP/Sandbox): Firecrawl API** — $16/month, zero infrastructure, instant results.
**Phase 2 (Scale): Crawl4AI self-hosted** — $0/month for crawling, full control.

---

## Component 2: Data Integrations (GSC + GA4)

### Google Search Console API

The user connects their GSC account via OAuth 2.0. Your app then pulls performance data per page: impressions, clicks, CTR, average position, top queries.

**Auth flow:**
1. User clicks "Connect Google Search Console"
2. Redirect to Google OAuth consent screen (scope: `webmasters.readonly`)
3. User grants access → Google returns authorization code
4. Your backend exchanges code for access token + refresh token
5. Store tokens encrypted in Supabase (per-user)
6. Use refresh token to maintain access without re-auth

**Implementation:** NextAuth.js handles 90% of this. You configure the Google provider with the `webmasters.readonly` scope, and NextAuth manages token storage and refresh.

**Key API endpoints:**
- `searchanalytics/query` — performance data (impressions, clicks, CTR, position) filtered by page, query, date range
- `sitemaps/list` — discover submitted sitemaps
- `urlInspection/index:inspect` — real-time indexing status per URL (this is gold — it's what GSC's URL Inspection tool uses)

**Data pull frequency:** Daily via Vercel Cron job. Store 90 days of historical data in Supabase.

### Google Analytics 4 API

Optional for MVP, but valuable for Phase 2. Provides:
- Page-level traffic and engagement metrics
- User flow (where do people go after landing?)
- Bounce rate per page
- Conversion events (if configured)

Same OAuth flow, different scope: `analytics.readonly`

---

## Component 3: The Intelligence Layer (Claude API)

This is the product. Everything else is plumbing.

### Architecture: Two-Pass Analysis

**Pass 1: Per-Page Analysis (runs on each crawled page)**

Input to Claude:
- The page's markdown content (from Firecrawl)
- The page's metadata (title, description, URL, status code)
- The user's onboarding questionnaire answers (site purpose, target audience, goals)

Claude outputs a structured JSON:
```json
{
  "page_url": "/festivals",
  "intent_classification": "Discovery / Directory",
  "target_audience": "Psytrance fans looking for festival information",
  "content_quality": {
    "score": 6,
    "strengths": ["Comprehensive list", "Good genre coverage"],
    "weaknesses": ["No filtering/search", "No original editorial content", "No structured data for Google"]
  },
  "seo_assessment": {
    "title_tag_quality": "Good",
    "meta_description": "Missing",
    "heading_structure": "Flat — all H2, no H3 hierarchy",
    "internal_links": 3,
    "external_links": 12
  },
  "recommendations": [
    {
      "priority": "high",
      "category": "content",
      "action": "Write a 'Complete Guide to Psytrance Festivals 2026' editorial section above the list",
      "reasoning": "This page gets 2000% more impressions for 'psytrance festivals' — original content would capture this traffic and improve rankings",
      "effort": "medium"
    },
    {
      "priority": "high",
      "category": "ux",
      "action": "Add 'Add to Calendar' buttons for each festival",
      "reasoning": "Increases engagement, gives users a reason to return, creates a utility that competitors don't offer",
      "effort": "medium"
    },
    {
      "priority": "medium",
      "category": "seo",
      "action": "Add Event structured data (schema.org) to each festival entry",
      "reasoning": "Enables rich results in Google search — event dates, locations directly in search results",
      "effort": "low"
    }
  ]
}
```

**Pass 2: Site-Level Strategy (runs after all pages are analyzed)**

Input to Claude:
- All per-page analyses
- GSC data (if connected): top queries, impressions, clicks per page
- User's onboarding answers

Claude outputs:
```json
{
  "site_health_score": 72,
  "top_3_priorities": [
    "Your festivals page is your biggest growth opportunity — it gets 85% of your search impressions but has no original content",
    "5 pages are missing meta descriptions entirely",
    "Your mix pages have no structured data — Google can't identify them as audio content"
  ],
  "content_calendar": [
    {
      "week": 1,
      "action": "Write 'Psytrance Festivals 2026: The Complete Guide'",
      "target_page": "/festivals",
      "expected_impact": "high"
    }
  ],
  "missing_pages": [
    {
      "suggested_url": "/genres/progressive-psytrance",
      "reasoning": "You have content about progressive psytrance scattered across mix pages but no dedicated landing page — this keyword gets 4,400 monthly searches"
    }
  ]
}
```

### Prompt Architecture

The quality of recommendations depends entirely on prompt engineering. Key principles:

1. **Always include the user context.** The same page gets different recommendations depending on whether the user is a solo creator vs. an e-commerce business vs. a non-profit.

2. **Use the questionnaire answers as a lens.** "The user said their site is meant to attract people who don't know their YouTube channel. Therefore, recommendations should focus on discoverability and first impressions."

3. **Ground recommendations in data.** If GSC data shows a page getting impressions but no clicks, the recommendation is about improving the title/description. If a page gets no impressions at all, the recommendation is about content gaps.

4. **Separate what's broken from what's missing.** Broken = things that should work but don't (missing meta tags, broken links). Missing = things that would add value but don't exist yet (Add to Calendar, structured data).

5. **Always specify effort level.** A solo creator won't act on "redesign your entire navigation." They will act on "add a meta description to these 5 pages."

### Model Selection

- **Claude Sonnet** for per-page analysis — fast, cost-effective, handles structured output well
- **Claude Opus** for site-level strategy — needs deeper reasoning, pattern recognition across pages, creative recommendations

### Cost Estimation (Claude API)

Per site analysis (assuming 20 pages):
- 20 per-page analyses × ~2K input tokens + ~1K output tokens = ~60K tokens
- 1 site-level strategy × ~10K input + ~2K output = ~12K tokens
- Total: ~72K tokens per full analysis
- At Sonnet pricing: approximately $0.05-0.10 per full site analysis
- Extremely cost-effective even at scale

---

## Component 4: The Questionnaires

### Moment 1 — Onboarding (About the User)

Asked once at registration. Stored in Supabase `user_profiles` table.

**Questions:**
1. What is your website about? (free text)
2. Who is your target audience? (free text)
3. What does success look like for this site? (multi-select: more traffic, more subscribers, more sales, brand awareness, community building, other)
4. Is this site for profit? (yes/no/not yet)
5. Are you willing to invest money to grow it? (not now / small budget / moderate budget / whatever it takes)
6. How would you describe your site when it's finished and perfect? (free text — this is the gold question)
7. What's your role? (solo creator / small team / agency / other)

### Moment 2 — Post-Scan (About the Site)

Generated dynamically by Claude after analyzing the crawl data. The AI identifies areas of ambiguity and asks targeted questions.

Examples:
- "I found 30 festival entries on your festivals page. Is this meant to be a comprehensive directory, or a curated selection of your favorites?"
- "Your site links to a YouTube channel with 634K subscribers, but this isn't mentioned prominently. Should driving YouTube subscriptions be a primary goal?"
- "I see 5 pages with very similar content about different psytrance genres. Should these be consolidated into one page or kept separate?"

These questions are generated per-site, per-analysis. The answers feed back into Pass 2 (site-level strategy) for more accurate recommendations.

---

## Component 5: Database Schema (Supabase)

```sql
-- Users (extends Supabase Auth)
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  onboarding_answers JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sites being analyzed
CREATE TABLE sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES user_profiles(id),
  url TEXT NOT NULL,
  name TEXT,
  gsc_connected BOOLEAN DEFAULT FALSE,
  ga4_connected BOOLEAN DEFAULT FALSE,
  last_crawl_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- OAuth tokens for GSC/GA4
CREATE TABLE oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES user_profiles(id),
  provider TEXT NOT NULL, -- 'gsc' or 'ga4'
  access_token TEXT NOT NULL, -- encrypted
  refresh_token TEXT NOT NULL, -- encrypted
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Crawl snapshots
CREATE TABLE crawl_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id),
  crawl_data JSONB, -- full Firecrawl response
  page_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Per-page analysis results
CREATE TABLE page_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crawl_snapshot_id UUID REFERENCES crawl_snapshots(id),
  page_url TEXT NOT NULL,
  page_title TEXT,
  intent_classification TEXT,
  content_quality_score INTEGER,
  analysis_data JSONB, -- full Claude analysis output
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Site-level strategy
CREATE TABLE site_strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crawl_snapshot_id UUID REFERENCES crawl_snapshots(id),
  health_score INTEGER,
  strategy_data JSONB, -- full Claude strategy output
  post_scan_questions JSONB, -- Moment 2 questions
  post_scan_answers JSONB, -- user responses
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- GSC performance data (daily snapshots)
CREATE TABLE gsc_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id),
  page_url TEXT,
  date DATE,
  impressions INTEGER,
  clicks INTEGER,
  ctr FLOAT,
  position FLOAT,
  top_queries JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recommendations tracking
CREATE TABLE recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_analysis_id UUID REFERENCES page_analyses(id),
  priority TEXT, -- 'high', 'medium', 'low'
  category TEXT, -- 'content', 'seo', 'ux', 'technical'
  action TEXT,
  reasoning TEXT,
  effort TEXT, -- 'low', 'medium', 'high'
  status TEXT DEFAULT 'pending', -- 'pending', 'in_progress', 'done', 'dismissed'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_tokens ENABLE ROW LEVEL SECURITY;
-- (policies: users can only access their own data)
```

---

## Component 6: Monitoring & Change Detection (Phase 2)

### How it works:
1. **Vercel Cron Job** runs daily (or weekly — user configurable)
2. Re-crawls the site via Firecrawl
3. Compares new crawl snapshot to previous snapshot
4. Detects: new pages, removed pages, content changes, meta tag changes, new/broken links
5. For changed pages: re-runs Claude per-page analysis
6. If changes are significant: re-runs site-level strategy
7. Pushes notification to user (email via Resend, or in-app)

### Change detection algorithm:
- Compare markdown content using diff (not exact match — normalize whitespace first)
- Track structural changes separately from content changes
- Flag high-impact changes (new pages, removed pages, title changes) vs low-impact (minor text edits)

---

## Build Order

### Phase 1A — Foundation (Week 1)
- Next.js project setup with Supabase Auth
- Onboarding questionnaire (Moment 1)
- Database schema creation
- Basic dashboard shell

### Phase 1B — Crawl + Analyze (Week 2)
- Firecrawl integration (map + crawl)
- Claude API integration for per-page analysis
- Store results in Supabase
- Display per-page analysis on dashboard

### Phase 1C — Strategy Layer (Week 3)
- Site-level strategy generation
- Post-scan questionnaire (Moment 2)
- Recommendations dashboard with priority/category filters
- Recommendation status tracking (pending → done)

### Phase 1D — GSC Integration (Week 4)
- Google OAuth setup in Google Cloud Console
- NextAuth.js Google provider with webmasters.readonly scope
- GSC data pull and storage
- Integrate GSC data into Claude analysis prompts

### Phase 2 — Monitoring (Month 2)
- Vercel Cron for periodic re-crawls
- Change detection engine
- Re-analysis on changes
- Email notifications via Resend
- Historical comparison view

### Phase 3 — Multi-Site + Public (Month 3+)
- Multi-site support per user
- Pricing tiers
- Public marketing site
- User onboarding flow polish

---

## Monthly Cost Estimate (MVP / Sandbox Phase)

| Service | Cost |
|---------|------|
| Vercel (Hobby) | $0 |
| Supabase (Free tier) | $0 |
| Firecrawl (Hobby) | $16/month |
| Claude API (estimated 50 site analyses/month) | ~$5/month |
| Resend (Free tier, 100 emails/day) | $0 |
| **Total** | **~$21/month** |

At scale with 100+ users doing daily analyses, costs shift primarily to Claude API (~$50-100/month) and Firecrawl Standard ($83/month). Still very manageable.

---

## Key Technical Risks & Mitigations

**Risk: Firecrawl can't crawl certain sites (anti-bot, auth walls)**
Mitigation: For MVP, target publicly accessible sites only. For Phase 2, consider Crawl4AI self-hosted with Playwright for more control.

**Risk: Claude analysis quality varies**
Mitigation: Build a structured prompt template with strict JSON output schema. Test on 20+ diverse sites before launch. Use Sonnet for consistency, Opus for complex cases.

**Risk: GSC OAuth approval process is slow**
Mitigation: Start the Google Cloud Console setup immediately — OAuth consent screen review can take days. For development, use "Testing" mode which allows up to 100 test users without review.

**Risk: Crawl data gets stale between snapshots**
Mitigation: Show "Last analyzed: X days ago" prominently. Let users trigger manual re-analysis anytime.

---

## What Makes This Product Different

1. **Starts from the website, not from keywords.** Every other tool asks "what keyword do you want to rank for?" This tool asks "what is your website trying to do?" and works forward from there.

2. **Understands intent through questionnaires.** The onboarding questions force the user to articulate their vision — which itself is valuable — and give the AI the context to make relevant recommendations. A solo creator building a passion project gets different advice than an agency managing client sites.

3. **Recommendations are specific and actionable.** Not "improve your content quality" but "add an 'Add to Calendar' button to your festivals page." Not "optimize your SEO" but "these 5 pages are missing meta descriptions — here's what each should say."

4. **The site is a living thing.** Change detection means the tool grows with the site. New pages trigger new analysis. Performance changes trigger new recommendations. It's not a one-time audit — it's an ongoing advisor.

5. **Content creation is the primary output.** While SEO and technical fixes are included, the main value is: "here's what content you should create, why, and what impact it will have." That's what content creators actually need.
