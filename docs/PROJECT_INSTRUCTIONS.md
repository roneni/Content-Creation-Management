# AI Site Strategist — Project Instructions

---

## What This Is

An AI-powered website analysis and content strategy tool. The user connects a website, the tool crawls it, understands what each page is trying to achieve (through automated analysis + intelligent questionnaires), and delivers actionable recommendations for content creation, SEO, UX, and growth — continuously, as the site evolves.

**This product does not exist anywhere.** The closest tools (Surfer SEO, Frase, Semrush) are keyword-first content optimizers. This is a website-first AI strategist — the intelligence IS the product.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14+ (App Router, TypeScript) |
| Database | Supabase (PostgreSQL, Auth, RLS) |
| Hosting | Vercel |
| AI Intelligence | Claude API (Sonnet for per-page, Opus for strategy) |
| Site Crawling | Firecrawl API |
| Data Integrations | Google Search Console API (OAuth 2.0 via NextAuth.js) |
| Background Jobs | Vercel Cron |
| Email | Resend |
| Styling | Tailwind CSS |

---

## Product Architecture

### Core Loop
Connect site → Crawl (Firecrawl) → AI analyzes each page (Claude) → Generate site strategy → Show recommendations → Monitor changes → Re-analyze → Loop

### Two Questionnaire Moments

**Moment 1 — Onboarding (about the user):**
Asked once at registration. Who are you, what's the site for, who's your audience, what does success look like, budget reality, "describe your site when it's perfect."

**Moment 2 — Post-Scan (about the site):**
Generated dynamically by Claude after crawl analysis. Targeted questions about ambiguous findings. User answers feed back into the strategy layer for more accurate recommendations.

### Two-Pass AI Analysis

**Pass 1 — Per-Page:** Claude Sonnet analyzes each crawled page individually. Outputs: intent classification, content quality score, strengths/weaknesses, SEO assessment, specific recommendations with priority + effort level.

**Pass 2 — Site-Level Strategy:** Claude Opus synthesizes all page analyses + GSC data + questionnaire answers. Outputs: site health score, top priorities, content calendar, missing page suggestions.

---

## Design Identity

**Not yet defined — the product needs its own identity.** During development, use a clean, professional dark theme. No specific branding has been decided. The owner will define visual identity later.

---

## Code Principles

1. **TypeScript everywhere** — strict mode, no `any` types
2. **Server Components by default** — Client Components only when needed for interactivity
3. **Supabase RLS on every table** — users can only access their own data
4. **Environment variables for all secrets** — Firecrawl key, Claude key, Supabase keys, Google OAuth credentials
5. **Drizzle ORM** for type-safe database queries (consistent with owner's other projects)
6. **tRPC** for type-safe API layer (consistent with owner's other projects)
7. **Error handling** — never let API failures crash the UI. Show clear error states.
8. **Git push verification** — always confirm git push succeeded before moving to next task. Cloud environments don't persist between sessions.

---

## Repo & Deployment

- **GitHub repo:** TBD (owner will create and provide the repo name)
- **Vercel:** Auto-deploys from GitHub main branch
- **Supabase:** Separate project (not shared with Psychedelic Universe or HarmonySet)
- **Branch strategy:** `main` = production. Feature branches for major changes.

---

## File Structure (Target)

```
src/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   └── register/
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── page.tsx              # Dashboard home
│   │   ├── sites/
│   │   │   ├── [siteId]/
│   │   │   │   ├── page.tsx      # Site overview
│   │   │   │   ├── pages/        # Per-page analysis
│   │   │   │   ├── strategy/     # Site-level strategy
│   │   │   │   ├── recommendations/
│   │   │   │   └── settings/     # GSC connection, re-crawl
│   │   │   └── new/              # Add new site
│   │   └── onboarding/           # Moment 1 questionnaire
│   ├── api/
│   │   ├── auth/                 # NextAuth routes
│   │   ├── trpc/                 # tRPC handler
│   │   ├── crawl/                # Firecrawl webhook/polling
│   │   └── cron/                 # Vercel Cron endpoints
│   ├── layout.tsx
│   └── page.tsx                  # Landing/marketing page
├── server/
│   ├── db/
│   │   ├── schema.ts             # Drizzle schema
│   │   └── index.ts              # DB connection
│   ├── trpc/
│   │   ├── router.ts             # Root router
│   │   └── routers/
│   │       ├── sites.ts
│   │       ├── crawl.ts
│   │       ├── analysis.ts
│   │       └── gsc.ts
│   └── services/
│       ├── firecrawl.ts          # Firecrawl API wrapper
│       ├── claude.ts             # Claude API wrapper + prompts
│       ├── gsc.ts                # GSC API wrapper
│       └── change-detection.ts   # Diff engine (Phase 2)
├── components/
│   ├── ui/                       # Shared UI components
│   ├── onboarding/               # Questionnaire components
│   ├── dashboard/                # Dashboard-specific components
│   └── analysis/                 # Analysis display components
├── lib/
│   ├── utils.ts
│   └── constants.ts
└── types/
    └── index.ts                  # Shared TypeScript types
```

---

## Key Constraints

- The owner is a technical entrepreneur but NOT a programmer — code must be clean, well-commented, and self-documenting
- Consolidate work into comprehensive prompts — cloud environments don't persist between sessions
- Verify git push success before proceeding to any subsequent step
- Never guess about Firecrawl/Claude API behavior — check the docs or say "I'm not sure"
- This is a real product that will go public — build it to production standards from day one

---

## Phase Plan

### Phase 1A — Foundation
Next.js project, Supabase Auth (Google + email), onboarding questionnaire, database schema, dashboard shell

### Phase 1B — Crawl + Analyze
Firecrawl integration, Claude per-page analysis, results storage, per-page analysis display

### Phase 1C — Strategy Layer
Site-level strategy, Moment 2 questions, recommendations dashboard, status tracking

### Phase 1D — GSC Integration
Google OAuth, GSC data pull, integrate performance data into analysis

### Phase 2 — Monitoring
Vercel Cron re-crawls, change detection, re-analysis triggers, email notifications

### Phase 3 — Public Release
Multi-site support, pricing tiers, marketing site, polished onboarding
