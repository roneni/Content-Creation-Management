import Anthropic from "@anthropic-ai/sdk";
import type { OnboardingAnswers } from "@/types";
import type { CrawledPage } from "./firecrawl";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

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
- **Role:** ${onboardingAnswers.role ?? "Not specified"}

Use this context to tailor your recommendations. A solo creator with no budget gets different advice than an agency with unlimited resources.`;
}

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
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  const jsonText = textBlock.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
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
