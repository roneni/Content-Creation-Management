import Anthropic from "@anthropic-ai/sdk";
import type { OnboardingAnswers } from "@/types";
import type { CrawledPage } from "./firecrawl";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// ============================================
// TYPES — Per-Page Analysis
// ============================================

export interface PageAnalysisResult {
  pageUrl: string;
  pageTitle: string;
  intentClassification: string;
  targetAudience: string;
  contentQualityScore: number;
  strengths: string[];
  weaknesses: string[];
  seoAssessment: {
    titleTagQuality: string;
    metaDescriptionQuality: string;
    headingStructure: string;
    internalLinksCount: number;
    externalLinksCount: number;
    hasStructuredData: boolean;
    issues: string[];
  };
  recommendations: {
    priority: string;
    category: string;
    action: string;
    reasoning: string;
    effort: string;
    expectedImpact: string;
  }[];
}

// ============================================
// TYPES — Site Strategy
// ============================================

export interface SiteStrategyResult {
  healthScore: number;
  topPriorities: string[];
  contentCalendar: {
    week: number;
    action: string;
    targetPage: string;
    expectedImpact: string;
  }[];
  missingPages: {
    suggestedUrl: string;
    reasoning: string;
  }[];
  postScanQuestions: {
    id: string;
    question: string;
    options: string[];
  }[];
}

// ============================================
// HELPERS
// ============================================

function buildUserContext(onboardingAnswers: OnboardingAnswers): string {
  const goals = onboardingAnswers.success_goals?.join(", ") ?? "not specified";
  const profit = onboardingAnswers.for_profit === "yes"
    ? "This is a for-profit site."
    : onboardingAnswers.for_profit === "not_yet"
    ? "Not currently for profit, but the owner is open to it."
    : "This is not a for-profit site.";
  const budget: Record<string, string> = {
    not_now: "No budget for tools right now.",
    small: "Small budget (under $50/mo).",
    moderate: "Moderate budget ($50-500/mo).",
    whatever_it_takes: "Budget is not a constraint.",
  };
  return `## About This Website Owner
- **Site description:** ${onboardingAnswers.site_description ?? "Not provided"}
- **Target audience:** ${onboardingAnswers.target_audience ?? "Not provided"}
- **Success goals:** ${goals}
- **Profit status:** ${profit}
- **Budget:** ${budget[onboardingAnswers.budget_willingness] ?? "Budget not specified."}
- **Vision for the site:** ${onboardingAnswers.perfect_vision ?? "Not provided"}
- **Role:** ${onboardingAnswers.role ?? "Not specified"}`;
}

// ============================================
// PER-PAGE ANALYSIS (unchanged from Phase 1B)
// ============================================

function buildPageAnalysisPrompt(page: CrawledPage, onboardingAnswers: OnboardingAnswers): string {
  const truncatedMarkdown = page.markdown.length > 8000
    ? page.markdown.slice(0, 8000) + "\n\n[Content truncated for analysis]"
    : page.markdown;

  return `You are an expert website strategist, SEO consultant, and content advisor. You are analyzing a single page from a website.

${buildUserContext(onboardingAnswers)}

## Page to Analyze
- **URL:** ${page.url}
- **Title tag:** ${page.title || "MISSING"}
- **Meta description:** ${page.description || "MISSING"}
- **HTTP status:** ${page.statusCode}

### Page Content (Markdown)
\`\`\`
${truncatedMarkdown}
\`\`\`

## Your Task
Analyze this page and return ONLY valid JSON, no markdown formatting, no backticks:

{
  "page_url": "the page URL",
  "page_title": "the page title or 'Untitled'",
  "intent_classification": "one of: homepage, directory, content, landing, product, utility, about, contact, blog_post, blog_index, documentation, portfolio, other",
  "target_audience": "who this page is meant for",
  "content_quality_score": 1-10,
  "strengths": ["specific strength 1", ...],
  "weaknesses": ["specific weakness 1", ...],
  "seo_assessment": {
    "title_tag_quality": "good | needs_work | missing",
    "meta_description_quality": "good | needs_work | missing",
    "heading_structure": "description of heading hierarchy",
    "internal_links_count": estimated_number,
    "external_links_count": estimated_number,
    "has_structured_data": false,
    "issues": ["specific SEO issue 1", ...]
  },
  "recommendations": [
    {
      "priority": "critical | high | medium | low",
      "category": "content | seo | ux | technical | strategy",
      "action": "specific action to take",
      "reasoning": "why this matters for THIS site",
      "effort": "quick_win | medium | major_effort",
      "expected_impact": "high | medium | low"
    }
  ]
}

Give 3-7 recommendations per page ordered by priority. Be brutally honest about content quality.`;
}

export async function analyzePageWithClaude(
  page: CrawledPage,
  onboardingAnswers: OnboardingAnswers
): Promise<PageAnalysisResult> {
  const prompt = buildPageAnalysisPrompt(page, onboardingAnswers);

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("No text response from Claude");

  const jsonText = textBlock.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(jsonText); } catch {
    console.error("Failed to parse Claude response:", jsonText.slice(0, 500));
    throw new Error("Claude returned invalid JSON");
  }

  const seo = (parsed.seo_assessment as Record<string, unknown>) ?? {};
  const recs = (parsed.recommendations as Record<string, unknown>[]) ?? [];

  return {
    pageUrl: (parsed.page_url as string) ?? page.url,
    pageTitle: (parsed.page_title as string) ?? page.title ?? "Untitled",
    intentClassification: (parsed.intent_classification as string) ?? "other",
    targetAudience: (parsed.target_audience as string) ?? "",
    contentQualityScore: Number(parsed.content_quality_score) || 5,
    strengths: (parsed.strengths as string[]) ?? [],
    weaknesses: (parsed.weaknesses as string[]) ?? [],
    seoAssessment: {
      titleTagQuality: (seo.title_tag_quality as string) ?? "needs_work",
      metaDescriptionQuality: (seo.meta_description_quality as string) ?? "needs_work",
      headingStructure: (seo.heading_structure as string) ?? "",
      internalLinksCount: Number(seo.internal_links_count) || 0,
      externalLinksCount: Number(seo.external_links_count) || 0,
      hasStructuredData: Boolean(seo.has_structured_data),
      issues: (seo.issues as string[]) ?? [],
    },
    recommendations: recs.map((rec) => ({
      priority: (rec.priority as string) ?? "medium",
      category: (rec.category as string) ?? "content",
      action: (rec.action as string) ?? "",
      reasoning: (rec.reasoning as string) ?? "",
      effort: (rec.effort as string) ?? "medium",
      expectedImpact: (rec.expected_impact as string) ?? "medium",
    })),
  };
}

// ============================================
// SITE-LEVEL STRATEGY — Grounded Generation
// The strategy MUST be derived from actual findings.
// No hallucination, no invented issues.
// ============================================

export async function generateSiteStrategy(
  pageAnalyses: PageAnalysisResult[],
  onboardingAnswers: OnboardingAnswers,
  siteUrl: string
): Promise<SiteStrategyResult> {
  // Pre-sort pages: worst scores first — this drives priority ordering
  const sorted = [...pageAnalyses].sort((a, b) => a.contentQualityScore - b.contentQualityScore);

  // Compute health score from data — weighted average, not a guess
  const avgScore = sorted.reduce((sum, p) => sum + p.contentQualityScore, 0) / sorted.length;
  const computedHealth = Math.round(avgScore * 10); // 1-10 scale → 10-100

  // Build COMPLETE data for each page — no truncation
  const pageData = sorted.map((p) => ({
    url: p.pageUrl,
    title: p.pageTitle,
    type: p.intentClassification,
    score: p.contentQualityScore,
    strengths: p.strengths,
    weaknesses: p.weaknesses,
    seo: {
      title: p.seoAssessment.titleTagQuality,
      description: p.seoAssessment.metaDescriptionQuality,
      structured_data: p.seoAssessment.hasStructuredData,
      issues: p.seoAssessment.issues,
    },
    recommendations: p.recommendations.map((r) => ({
      action: r.action,
      priority: r.priority,
      category: r.category,
      effort: r.effort,
      impact: r.expectedImpact,
    })),
  }));

  const prompt = `You are creating a strategy for a website. You have COMPLETE per-page analysis data below. Your strategy must be STRICTLY GROUNDED in this data.

${buildUserContext(onboardingAnswers)}

## Site: ${siteUrl}
## Computed Health Score: ${computedHealth}/100 (based on average page quality of ${avgScore.toFixed(1)}/10 across ${pageAnalyses.length} pages)

## Complete Page Analysis Data (sorted worst to best):
${JSON.stringify(pageData, null, 2)}

## STRICT RULES — VIOLATION OF ANY RULE INVALIDATES YOUR OUTPUT:

1. **DATA GROUNDING:** Every priority, calendar item, and claim MUST reference a specific finding from the data above. You cannot invent issues, features, or problems that don't appear in the weaknesses, SEO issues, or recommendations above.

2. **PRIORITY BY SCORE:** Top priorities MUST address the lowest-scoring pages first. A page scoring 3/10 gets attention before a page scoring 7/10. The only exception is if a high-scoring page has a critical-priority recommendation.

3. **NO FABRICATION:** Do not describe page content that isn't reflected in the data. If the data says a page has "good" title tag quality, do not claim it has title issues. If the data shows a page has external links to multiple platforms, do not claim it only links to one.

4. **HEALTH SCORE:** Use the computed health score (${computedHealth}) as your baseline. You may adjust by ±10 points based on the pattern of issues, but you must explain why.

5. **CONTENT CALENDAR:** Each week's action must map to a specific recommendation from a specific page's analysis. Include the page URL and the original recommendation it's based on.

6. **MISSING PAGES:** Only suggest pages that logically follow from the site's stated goals and current content gaps — not generic suggestions that would apply to any website.

7. **QUESTIONS:** Only ask questions about genuine ambiguities in the data — things where the answer would materially change a recommendation.

Return ONLY valid JSON, no markdown, no backticks:

{
  "health_score": number (${computedHealth} ± 10, explain adjustment),
  "health_score_reasoning": "brief explanation of the score",
  "top_priorities": [
    "Priority 1 — must reference a specific page and specific finding from the data",
    "Priority 2 — ...",
    "Priority 3 — ...",
    "Priority 4 — ...",
    "Priority 5 — ..."
  ],
  "content_calendar": [
    {
      "week": 1,
      "action": "specific action derived from a page's recommendation",
      "target_page": "/url",
      "based_on": "which weakness or recommendation this addresses",
      "expected_impact": "high | medium | low"
    }
  ],
  "missing_pages": [
    {
      "suggested_url": "/path",
      "reasoning": "why this page should exist based on site goals and content analysis"
    }
  ],
  "post_scan_questions": [
    {
      "id": "q1",
      "question": "a genuine ambiguity from the data",
      "options": ["Specific option A", "Specific option B", "Specific option C"]
    }
  ]
}`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 3000,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("No text response from Claude");

  const jsonText = textBlock.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(jsonText); } catch {
    console.error("Failed to parse strategy response:", jsonText.slice(0, 500));
    throw new Error("Claude returned invalid JSON for strategy");
  }

  const calendar = (parsed.content_calendar as Record<string, unknown>[]) ?? [];
  const missing = (parsed.missing_pages as Record<string, unknown>[]) ?? [];
  const questions = (parsed.post_scan_questions as Record<string, unknown>[]) ?? [];

  return {
    healthScore: Number(parsed.health_score) || computedHealth,
    topPriorities: (parsed.top_priorities as string[]) ?? [],
    contentCalendar: calendar.map((c) => ({
      week: Number(c.week) || 1,
      action: (c.action as string) ?? "",
      targetPage: (c.target_page as string) ?? "",
      expectedImpact: (c.expected_impact as string) ?? "medium",
    })),
    missingPages: missing.map((m) => ({
      suggestedUrl: (m.suggested_url as string) ?? "",
      reasoning: (m.reasoning as string) ?? "",
    })),
    postScanQuestions: questions.map((q) => ({
      id: (q.id as string) ?? "",
      question: (q.question as string) ?? "",
      options: (q.options as string[]) ?? [],
    })),
  };
}

// ============================================
// VERIFICATION PASS (Phase 1C Fix)
// Audits all per-page analyses before storage.
// Catches: false positives from global components,
// misattributed issues, inflated weakness counts,
// and score distortions.
// ============================================

export interface VerifiedAnalyses {
  analyses: PageAnalysisResult[];
  corrections: string[];
}

export async function verifyAnalyses(
  analyses: PageAnalysisResult[]
): Promise<VerifiedAnalyses> {
  // Build a compact summary of all analyses for review
  const summary = analyses.map((a) => ({
    url: a.pageUrl,
    title: a.pageTitle,
    score: a.contentQualityScore,
    weaknesses: a.weaknesses,
    seoIssues: a.seoAssessment.issues,
    recommendations: a.recommendations.map((r) => ({
      action: r.action,
      priority: r.priority,
      category: r.category,
    })),
  }));

  const prompt = `You are a quality assurance reviewer for a website analysis tool. You have the results of per-page analyses for an entire website. Your job is to audit these results for accuracy.

## All Page Analyses
${JSON.stringify(summary, null, 2)}

## What to Check

1. **Global component false positives:** If the same issue (e.g., "broken YouTube embed", "missing element", "garbled code") appears on 3+ pages, it is almost certainly a GLOBAL site component (nav bar, footer, persistent player, chat widget, cookie banner) being misidentified as a per-page issue. These must be removed from EACH page's weaknesses, SEO issues, and recommendations.

2. **Score corrections:** If a page's weaknesses list includes false positives from global components, its content_quality_score was likely dragged down unfairly. Adjust the score upward by 1 point for every 2 false positive weaknesses removed.

3. **Recommendation deduplication:** If the same recommendation appears for multiple pages and it's about a global component, remove it from all pages. If it's a legitimate site-wide issue, keep it on ONE page only (the most relevant one) and note it's site-wide.

4. **Misclassifications:** Check if any page's intent_classification seems wrong based on its title and URL.

## Return ONLY valid JSON, no markdown, no backticks:

{
  "corrections": [
    "Human-readable description of each correction made"
  ],
  "corrected_analyses": [
    {
      "page_url": "the url",
      "content_quality_score": adjusted_score,
      "weaknesses": ["only real weaknesses"],
      "seo_issues": ["only real SEO issues"],
      "removed_recommendations": ["action text of recommendations that were false positives"],
      "kept_recommendations": ["action text of recommendations that are legitimate"]
    }
  ]
}

If an analysis has no corrections needed, still include it with its original values. Every page URL must appear in corrected_analyses.`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 3000,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    console.error("Verification pass returned no text — using original analyses");
    return { analyses, corrections: [] };
  }

  const jsonText = textBlock.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    console.error("Verification pass returned invalid JSON — using original analyses");
    return { analyses, corrections: [] };
  }

  const corrections = (parsed.corrections as string[]) ?? [];
  const corrected = (parsed.corrected_analyses as Record<string, unknown>[]) ?? [];

  // Apply corrections to original analyses
  const verifiedAnalyses = analyses.map((original) => {
    const correction = corrected.find(
      (c) => (c.page_url as string) === original.pageUrl
    );

    if (!correction) return original;

    const removedRecs = new Set((correction.removed_recommendations as string[]) ?? []);
    const newScore = Number(correction.content_quality_score) || original.contentQualityScore;
    const newWeaknesses = (correction.weaknesses as string[]) ?? original.weaknesses;
    const newSeoIssues = (correction.seo_issues as string[]) ?? original.seoAssessment.issues;

    return {
      ...original,
      contentQualityScore: newScore,
      weaknesses: newWeaknesses,
      seoAssessment: {
        ...original.seoAssessment,
        issues: newSeoIssues,
      },
      recommendations: original.recommendations.filter(
        (r) => !removedRecs.has(r.action)
      ),
    };
  });

  if (corrections.length > 0) {
    console.log("Verification corrections applied:", corrections);
  }

  return { analyses: verifiedAnalyses, corrections };
}
