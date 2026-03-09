# AI Site Strategist — Problem Report & Lessons Learned
### Date: March 8, 2026
### Scope: Phase 1B (Crawl + Analyze) through Phase 1C (Strategy Layer)

---

## The Core Problem

After successfully building and running the crawl + analysis pipeline on psychedelic-universe.com, the AI analysis produced **false positives** that cascaded through every downstream layer of the product. Specifically, a global site component (the PersistentPlayer — a hidden 1x1px YouTube iframe that provides background music playback on every page) was misidentified as a broken YouTube embed on 7+ individual pages.

This single false positive:
- Inflated the weakness count on 7+ pages
- Dragged down content quality scores across those pages
- Generated ~7 duplicate recommendations about a non-existent problem
- Made "Fix broken YouTube embeds" the #1 priority in the site strategy
- Produced a health score of 42/100 (artificially low)
- Generated Moment 2 questions asking about a problem that doesn't exist
- Made the entire strategy output unreliable

---

## Timeline of Discovery & Fixes

### 1. Initial Discovery

**What happened:** After the first successful crawl + analysis of 15 pages (83 recommendations generated), the user reviewed the strategy output and noticed Priority #1 was about broken YouTube embeds across 7 pages. The user consulted Claude Code, which identified that:

- The PersistentPlayer component mounts globally in App.tsx on every page
- It creates a hidden 1x1px YouTube iframe using the YouTube IFrame API
- Firecrawl's headless browser sees the iframe's fallback/error state as visible garbled code
- Claude AI then interprets this as a "broken YouTube embed" on every page it appears
- Only the `/genre/*` pages actually have real YouTube embeds

**User's key insight:** The user pointed out that if section 1 of the strategy already had a false diagnosis, it raised concerns about all other sections. This turned out to be a focused issue (only Priority #1 was affected), but the user's instinct to question data integrity was correct.

### 2. Fix Attempt #1 — Prompt Patch (Failed)

**What I did:** Added a line to the strategy prompt telling Claude to ignore issues that appear on 3+ pages as they're likely global components.

**Why it failed:** The per-page analyses were already stored in the database with the false positives baked in. The strategy prompt was trying to override what Claude could plainly see in the data it was reading. Prompt-level instructions cannot reliably override data-level evidence.

**My mistake:** This was a band-aid, not a fix. I should have identified that the problem was in the data pipeline, not in the strategy generation.

### 3. Fix Attempt #2 — Verification Pass (Partially Worked)

**What I did:** Added a new step between per-page analysis and data storage. After all pages are analyzed individually, a verification pass sends ALL analyses to Claude at once and asks it to:
- Identify issues appearing on multiple pages (likely global components)
- Remove false positives
- Adjust quality scores upward for pages with removed false weaknesses
- Deduplicate recommendations

**What worked:** The per-page analysis data in the UI showed clean results — no YouTube false positives, no duplicates in the page list, scores appeared more accurate.

**What didn't work:** The verification corrected the `weaknesses`, `seoAssessment.issues`, `contentQualityScore`, and filtered `recommendations` — but the `fullAnalysis` JSON blob stored the ORIGINAL uncorrected data. The strategy generator was reading from `fullAnalysis` instead of the corrected columns.

**My mistake:** I didn't trace the full data flow. The verification pass wrote corrected data to specific columns but left the raw `fullAnalysis` blob untouched. The strategy router was reading from the wrong source.

### 4. Fix Attempt #3 — Strategy Reads From Corrected Data (Partially Worked)

**What I did:** Changed the strategy router to read from the corrected database columns (`weaknesses`, `seoAssessment`, `contentQualityScore`) and from the `recommendations` table (which only contains verified recommendations), instead of from `fullAnalysis`.

**What worked:** The data source was correct now.

**What didn't work:** The YouTube false positive STILL appeared in the strategy output. Even though the recommendations table was clean, the per-page analysis columns (`weaknesses`, `strengths`) still contained references to the YouTube issue because the verification pass's corrections weren't being stored back to the correct columns comprehensively enough. The `fullAnalysis` blob was still being stored with raw data, and some parts of the code still referenced it.

**My mistake:** The verification pass architecture was flawed. It attempted to patch data after-the-fact through a complex correction mapping, but the mapping was lossy — not all corrections made it back to the stored data cleanly.

### 5. Fix Attempt #4 — Grounded Strategy Generation (Still Failed)

**What I did:** Completely rebuilt the strategy prompt with 7 structural constraints:
1. Health score computed from actual data (average score × 10)
2. Pages sorted worst-first to drive priority ordering
3. Complete data sent — no truncation
4. Every claim must reference actual findings
5. No fabrication rule
6. Calendar items must map to specific recommendations
7. Questions grounded to actual ambiguities

**What didn't work:** Despite all these constraints, Claude STILL flagged the YouTube embeds because the raw crawl data (markdown content) contains the PersistentPlayer's HTML/JavaScript on every page. The per-page analyses were seeing it, flagging it in weaknesses, and even though the verification pass tried to remove it, the underlying data still carried traces of it.

**My mistake:** I was fighting the symptom at every layer (analysis, verification, strategy) instead of fixing the root cause at the data layer. The user explicitly suggested this approach earlier in the conversation ("What about instead of making an assumption based on scanned raw data, statistics, and guesswork, the AI will do a physical check?") and then later suggested stripping repeated content before analysis. I should have implemented the data-level fix first.

---

## Additional Issues Found

### Duplicate Pages After Re-Analysis
**Problem:** Re-analyzing a site added new page analysis records without deleting the old ones, resulting in every page appearing twice in the UI.
**Fix:** Added cleanup step at the start of re-analysis that deletes old recommendations, page analyses, and strategies before running new analysis.
**Status:** Fixed.

### Sitemap.xml Crawled as a Page
**Problem:** Firecrawl returned sitemap.xml as one of the crawled "pages," and Claude analyzed it as if it were a content page (scored 3/10, classified as "utility").
**Fix:** Added a filter after crawling to exclude URLs ending in .xml, .txt, .rss, .json, and /feed paths.
**Status:** Fixed.

### Strategy Shows Old Data After Re-Analysis
**Problem:** After re-analyzing, clicking "Generate Strategy" still showed the old strategy because it was cached. Users had to know to click "Regenerate" specifically.
**Status:** Partially fixed — re-analysis now deletes old strategies, forcing a fresh generation.

### Strategy Priorities Don't Match Page Scores
**Problem (User-identified):** The strategy listed Priority #4 and #5 as improvements for the festivals and artists pages — but those pages scored 7/10 (highest on the site). The strategy was suggesting polishing high-performing pages before fixing 3/10 pages.
**Problem (User-identified):** Priority #5 claimed the artist directory "links to YouTube searches" — factually wrong. The directory links to artists' profiles across multiple platforms.
**Root cause:** The strategy prompt wasn't constrained to prioritize by score, and it was allowed to make claims about page content without grounding in the actual analysis data.
**Fix attempted:** Grounded strategy prompt with score-based ordering and no-fabrication rules.
**Status:** Partially fixed by grounded prompt, but undermined by the persistent YouTube false positive in the source data.

---

## The Root Cause (Still Unfixed)

The fundamental problem remains: **Firecrawl's markdown output contains global site components (specifically the PersistentPlayer's YouTube iframe HTML) on every page.** As long as Claude sees this content in the per-page markdown, it will flag it — regardless of prompt instructions, verification passes, or grounding rules.

### Why Prompt-Level Fixes Can't Solve This

Claude is an AI that reads text and draws conclusions. If the text says "here's a YouTube iframe with error state HTML" on 7 pages, Claude will correctly identify it as a problem. Telling Claude "ignore things that appear on multiple pages" is unreliable because:
- It's asking the model to override its own analysis
- The instruction competes with the evidence in the data
- It may suppress legitimate issues that genuinely affect multiple pages

### The Correct Fix

**Pre-analysis content deduplication at the data layer.** After crawling all pages but BEFORE any Claude analysis:

1. Split each page's markdown into content blocks
2. Hash each block
3. Any block hash appearing on 70%+ of pages = global component
4. Strip those blocks from each page's markdown
5. Send only the page-specific content to Claude for analysis

This is deterministic, works for any site (not just this one), and eliminates the problem at its source rather than trying to patch it downstream.

### User's Input on Architecture

The user proposed a more sophisticated approach: a multi-agent system where specialized sub-agents handle different analysis domains (SEO, content, UX, technical) and a super-agent orchestrates and cross-checks their findings. This would provide deeper analysis quality but adds significant complexity and API cost. This has been noted as a Phase 3 initiative.

---

## My Mistakes — Summary

1. **Prompt patch instead of data fix:** Tried to solve a data quality problem with prompt engineering. Wasted 3 fix attempts before identifying the root cause was in the data pipeline.

2. **Not tracing the full data flow:** The verification pass wrote corrections but the strategy read from a different data source (`fullAnalysis` vs corrected columns). I should have mapped the complete data flow before building the fix.

3. **Not listening to the user early enough:** The user suggested a data-level approach ("physical check" analogy, content deduplication) before I started on prompt patches. I should have weighted that input more seriously.

4. **Going along with user's claim without checking:** When the user said there were "8 sections" with problems, I agreed and started planning for 7 more sections of issues. The data in the conversation clearly showed only 5 top priorities. I should have verified this before escalating concern. (The user correctly called this out and asked me to always verify claims against available data going forward.)

5. **Repeated patching instead of stepping back:** Each fix was a reaction to the previous fix's failure, creating a cycle. I should have stopped after Fix #2 failed, mapped the entire problem, and built one comprehensive solution.

6. **Writing a bad initial prompt:** The strategy prompt sent thin data (2 strengths, 2 weaknesses, 1 recommendation per page) and asked Claude to "freestyle" a strategy. This practically invited the model to fill gaps with its own assumptions. The prompt architecture was fundamentally wrong, not just missing a constraint.

---

## Current State

- **Phase 1A (Foundation):** Complete, working, deployed to GitHub
- **Phase 1B (Crawl + Analyze):** Working, verification pass active, per-page results clean in UI
- **Phase 1C (Strategy):** Functional but strategy output still unreliable due to YouTube false positive surviving in source data
- **Next step needed:** Pre-analysis content deduplication to strip global components from crawl data before any Claude analysis runs

---

## Files Modified During Fix Attempts

| File | Changes |
|------|---------|
| `src/server/services/claude.ts` | Added verification pass function, rebuilt strategy prompt 3 times, added grounding constraints |
| `src/server/trpc/routers/crawl.ts` | Added verification step to pipeline, added data cleanup on re-analysis, added non-HTML page filtering |
| `src/server/trpc/routers/strategy.ts` | Changed data source from `fullAnalysis` to corrected columns + recommendations table, added old strategy cleanup |
| `src/server/trpc/router.ts` | Added strategy router |
| `src/app/dashboard/sites/[siteId]/page.tsx` | Added strategy link, health score display |
| `src/app/dashboard/sites/[siteId]/strategy/page.tsx` | New — strategy display page |
| `src/app/dashboard/sites/[siteId]/questions/page.tsx` | New — Moment 2 questionnaire |
