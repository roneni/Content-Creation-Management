#!/bin/bash
# Phase 1B — Apply all new files to ai-site-strategist
# Run from the project root: bash apply-phase-1b.sh

set -e

echo "=== Applying Phase 1B: Crawl + Analyze ==="

# Install new dependencies
echo "Installing dependencies..."
npm install @mendable/firecrawl-js @anthropic-ai/sdk 2>&1 | tail -3

# Create directories
mkdir -p src/server/services
mkdir -p src/server/trpc/routers
mkdir -p "src/app/dashboard/sites/[siteId]/pages/[pageId]"
mkdir -p "src/app/dashboard/sites/[siteId]/recommendations"

# ============================================
# FILE: src/server/services/firecrawl.ts
# ============================================
echo "Creating firecrawl service..."
cat > src/server/services/firecrawl.ts << 'ENDOFFILE'
import Firecrawl from "@mendable/firecrawl-js";

const firecrawl = new Firecrawl({
  apiKey: process.env.FIRECRAWL_API_KEY!,
});

export interface CrawledPage {
  url: string;
  title: string;
  description: string;
  markdown: string;
  statusCode: number;
  sourceUrl: string;
}

export interface MapResult {
  links: string[];
}

export async function mapSite(url: string): Promise<MapResult> {
  const result = await firecrawl.map(url);
  return {
    links: result.links?.map((link) => link.url) ?? [],
  };
}

export async function crawlSite(
  url: string,
  options: { limit?: number } = {}
): Promise<CrawledPage[]> {
  const limit = options.limit ?? 50;
  const result = await firecrawl.crawl(url, {
    limit,
    scrapeOptions: { formats: ["markdown"] },
  });
  const pages: CrawledPage[] = (result.data ?? []).map((doc) => ({
    url: doc.metadata?.sourceURL ?? "",
    title: doc.metadata?.title ?? "",
    description: doc.metadata?.description ?? "",
    markdown: doc.markdown ?? "",
    statusCode: doc.metadata?.statusCode ?? 200,
    sourceUrl: doc.metadata?.sourceURL ?? "",
  }));
  return pages;
}

export async function startCrawl(
  url: string,
  options: { limit?: number } = {}
): Promise<string> {
  const limit = options.limit ?? 50;
  const result = await firecrawl.startCrawl(url, {
    limit,
    scrapeOptions: { formats: ["markdown"] },
  });
  return result.id;
}

export async function getCrawlStatus(jobId: string) {
  return await firecrawl.getCrawlStatus(jobId);
}
ENDOFFILE

# ============================================
# FILE: src/server/services/claude.ts
# ============================================
echo "Creating claude service..."
cat > src/server/services/claude.ts << 'ENDOFFILE'
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
ENDOFFILE

# ============================================
# FILE: src/server/trpc/routers/crawl.ts
# ============================================
echo "Creating crawl router..."
cat > src/server/trpc/routers/crawl.ts << 'ENDOFFILE'
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { router, protectedProcedure } from "../index";
import { sites, crawlSnapshots, pageAnalyses, recommendations, userProfiles } from "@/server/db/schema";
import { crawlSite, mapSite } from "@/server/services/firecrawl";
import { analyzePageWithClaude } from "@/server/services/claude";
import { TRPCError } from "@trpc/server";
import type { OnboardingAnswers } from "@/types";

export const crawlRouter = router({
  startAnalysis: protectedProcedure
    .input(z.object({ siteId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [site] = await ctx.db.select().from(sites)
        .where(and(eq(sites.id, input.siteId), eq(sites.userId, ctx.user.id))).limit(1);
      if (!site) throw new TRPCError({ code: "NOT_FOUND", message: "Site not found" });

      const [profile] = await ctx.db.select().from(userProfiles)
        .where(eq(userProfiles.id, ctx.user.id)).limit(1);
      if (!profile?.onboardingAnswers) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Please complete onboarding first" });
      }
      const onboardingAnswers = profile.onboardingAnswers as OnboardingAnswers;

      await ctx.db.update(sites).set({ status: "crawling" }).where(eq(sites.id, site.id));

      try {
        const crawledPages = await crawlSite(site.url, { limit: 30 });
        if (crawledPages.length === 0) throw new Error("Crawl returned no pages");

        const [snapshot] = await ctx.db.insert(crawlSnapshots).values({
          siteId: site.id, status: "completed", pageCount: crawledPages.length,
          pagesData: crawledPages.map((p) => ({
            url: p.url, title: p.title, description: p.description,
            markdown: p.markdown.slice(0, 50000), status_code: p.statusCode, source_url: p.sourceUrl,
          })),
          completedAt: new Date(),
        }).returning();

        try {
          const mapResult = await mapSite(site.url);
          await ctx.db.update(crawlSnapshots).set({
            siteMap: mapResult.links.map((link) => ({ url: link })),
          }).where(eq(crawlSnapshots.id, snapshot.id));
        } catch { console.warn("Site map failed, continuing"); }

        await ctx.db.update(sites).set({ status: "analyzing" }).where(eq(sites.id, site.id));

        const analysisResults = [];
        for (const page of crawledPages) {
          try {
            const analysis = await analyzePageWithClaude(page, onboardingAnswers);
            const [pageAnalysis] = await ctx.db.insert(pageAnalyses).values({
              crawlSnapshotId: snapshot.id, siteId: site.id,
              pageUrl: analysis.pageUrl, pageTitle: analysis.pageTitle,
              intentClassification: analysis.intentClassification,
              targetAudience: analysis.targetAudience,
              contentQualityScore: analysis.contentQualityScore,
              strengths: analysis.strengths, weaknesses: analysis.weaknesses,
              seoAssessment: {
                title_tag_quality: analysis.seoAssessment.titleTagQuality,
                meta_description_quality: analysis.seoAssessment.metaDescriptionQuality,
                heading_structure: analysis.seoAssessment.headingStructure,
                internal_links_count: analysis.seoAssessment.internalLinksCount,
                external_links_count: analysis.seoAssessment.externalLinksCount,
                has_structured_data: analysis.seoAssessment.hasStructuredData,
                issues: analysis.seoAssessment.issues,
              },
              fullAnalysis: analysis,
            }).returning();

            for (const rec of analysis.recommendations) {
              await ctx.db.insert(recommendations).values({
                siteId: site.id, pageAnalysisId: pageAnalysis.id,
                crawlSnapshotId: snapshot.id, priority: rec.priority,
                category: rec.category, action: rec.action, reasoning: rec.reasoning,
                effort: rec.effort, expectedImpact: rec.expectedImpact,
                pageUrl: analysis.pageUrl, source: "page_analysis",
              });
            }
            analysisResults.push(analysis);
          } catch (error) { console.error("Failed to analyze " + page.url + ":", error); }
        }

        await ctx.db.update(sites).set({
          status: "ready", pageCount: crawledPages.length,
          lastCrawlAt: new Date(), lastAnalysisAt: new Date(),
        }).where(eq(sites.id, site.id));

        return { success: true, pagesAnalyzed: analysisResults.length, pagesCrawled: crawledPages.length, snapshotId: snapshot.id };
      } catch (error) {
        await ctx.db.update(sites).set({ status: "error" }).where(eq(sites.id, site.id));
        console.error("Analysis pipeline failed:", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error instanceof Error ? error.message : "Analysis failed" });
      }
    }),

  getLatestSnapshot: protectedProcedure
    .input(z.object({ siteId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [snapshot] = await ctx.db.select().from(crawlSnapshots)
        .where(eq(crawlSnapshots.siteId, input.siteId))
        .orderBy(crawlSnapshots.createdAt).limit(1);
      return snapshot ?? null;
    }),
});
ENDOFFILE

# ============================================
# FILE: src/server/trpc/routers/analysis.ts
# ============================================
echo "Creating analysis router..."
cat > src/server/trpc/routers/analysis.ts << 'ENDOFFILE'
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { router, protectedProcedure } from "../index";
import { pageAnalyses, recommendations, sites } from "@/server/db/schema";
import { TRPCError } from "@trpc/server";

export const analysisRouter = router({
  getPageAnalyses: protectedProcedure
    .input(z.object({ siteId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [site] = await ctx.db.select().from(sites)
        .where(and(eq(sites.id, input.siteId), eq(sites.userId, ctx.user.id))).limit(1);
      if (!site) throw new TRPCError({ code: "NOT_FOUND", message: "Site not found" });
      return ctx.db.select().from(pageAnalyses)
        .where(eq(pageAnalyses.siteId, input.siteId))
        .orderBy(pageAnalyses.contentQualityScore);
    }),

  getPageAnalysis: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [analysis] = await ctx.db.select().from(pageAnalyses)
        .where(eq(pageAnalyses.id, input.id)).limit(1);
      if (!analysis) throw new TRPCError({ code: "NOT_FOUND", message: "Analysis not found" });
      const [site] = await ctx.db.select().from(sites)
        .where(and(eq(sites.id, analysis.siteId), eq(sites.userId, ctx.user.id))).limit(1);
      if (!site) throw new TRPCError({ code: "NOT_FOUND", message: "Analysis not found" });
      return analysis;
    }),

  getRecommendations: protectedProcedure
    .input(z.object({
      siteId: z.string().uuid(),
      status: z.string().optional(),
      priority: z.string().optional(),
      category: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const [site] = await ctx.db.select().from(sites)
        .where(and(eq(sites.id, input.siteId), eq(sites.userId, ctx.user.id))).limit(1);
      if (!site) throw new TRPCError({ code: "NOT_FOUND", message: "Site not found" });
      const allRecs = await ctx.db.select().from(recommendations)
        .where(eq(recommendations.siteId, input.siteId))
        .orderBy(desc(recommendations.createdAt));
      return allRecs.filter((rec) => {
        if (input.status && rec.status !== input.status) return false;
        if (input.priority && rec.priority !== input.priority) return false;
        if (input.category && rec.category !== input.category) return false;
        return true;
      });
    }),

  updateRecommendationStatus: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      status: z.enum(["pending", "in_progress", "completed", "dismissed"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const [rec] = await ctx.db.select().from(recommendations)
        .where(eq(recommendations.id, input.id)).limit(1);
      if (!rec) throw new TRPCError({ code: "NOT_FOUND" });
      const [site] = await ctx.db.select().from(sites)
        .where(and(eq(sites.id, rec.siteId), eq(sites.userId, ctx.user.id))).limit(1);
      if (!site) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.db.update(recommendations)
        .set({ status: input.status, statusChangedAt: new Date() })
        .where(eq(recommendations.id, input.id));
      return { success: true };
    }),
});
ENDOFFILE

# ============================================
# FILE: src/server/trpc/router.ts (updated)
# ============================================
echo "Updating root router..."
cat > src/server/trpc/router.ts << 'ENDOFFILE'
import { router } from "./index";
import { userRouter } from "./routers/user";
import { sitesRouter } from "./routers/sites";
import { crawlRouter } from "./routers/crawl";
import { analysisRouter } from "./routers/analysis";

export const appRouter = router({
  user: userRouter,
  sites: sitesRouter,
  crawl: crawlRouter,
  analysis: analysisRouter,
});

export type AppRouter = typeof appRouter;
ENDOFFILE

# ============================================
# FILE: src/app/dashboard/sites/[siteId]/page.tsx (updated)
# ============================================
echo "Updating site detail page..."
cat > "src/app/dashboard/sites/[siteId]/page.tsx" << 'ENDOFFILE'
"use client";

import { trpc } from "@/lib/trpc/client";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Globe, Loader2, Trash2, ExternalLink, Zap, FileText, AlertTriangle, Clock, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { SiteStatus } from "@/types";

const STATUS_STYLES: Record<SiteStatus, { bg: string; text: string; label: string }> = {
  pending: { bg: "bg-yellow-500/10", text: "text-yellow-400", label: "Pending" },
  crawling: { bg: "bg-blue-500/10", text: "text-blue-400", label: "Crawling..." },
  analyzing: { bg: "bg-purple-500/10", text: "text-purple-400", label: "Analyzing..." },
  ready: { bg: "bg-green-500/10", text: "text-green-400", label: "Ready" },
  error: { bg: "bg-red-500/10", text: "text-red-400", label: "Error" },
};

function scoreColor(score: number): string {
  if (score >= 7) return "text-green-400";
  if (score >= 5) return "text-yellow-400";
  return "text-red-400";
}

function priorityStyle(priority: string) {
  switch (priority) {
    case "critical": return { bg: "bg-red-500/10", text: "text-red-400" };
    case "high": return { bg: "bg-orange-500/10", text: "text-orange-400" };
    case "medium": return { bg: "bg-yellow-500/10", text: "text-yellow-400" };
    default: return { bg: "bg-gray-500/10", text: "text-gray-400" };
  }
}

export default function SiteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const siteId = params.siteId as string;
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const utils = trpc.useUtils();

  const { data: site, isLoading } = trpc.sites.get.useQuery(
    { id: siteId },
    { refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "crawling" || status === "analyzing" ? 3000 : false;
    }}
  );
  const { data: pageAnalysisData } = trpc.analysis.getPageAnalyses.useQuery(
    { siteId }, { enabled: !!site && site.status === "ready" }
  );
  const { data: recsData } = trpc.analysis.getRecommendations.useQuery(
    { siteId }, { enabled: !!site && site.status === "ready" }
  );

  const startAnalysis = trpc.crawl.startAnalysis.useMutation({
    onSuccess: () => {
      utils.sites.get.invalidate({ id: siteId });
      utils.analysis.getPageAnalyses.invalidate({ siteId });
      utils.analysis.getRecommendations.invalidate({ siteId });
    },
    onError: () => { utils.sites.get.invalidate({ id: siteId }); },
  });

  const deleteSite = trpc.sites.delete.useMutation({
    onSuccess: () => router.push("/dashboard"),
  });

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 text-gray-500 animate-spin" /></div>;
  if (!site) return <div className="text-center mt-20"><p className="text-gray-400">Site not found.</p><Link href="/dashboard" className="text-blue-400 text-sm mt-2 inline-block">Back to dashboard</Link></div>;

  const status = STATUS_STYLES[(site.status as SiteStatus) ?? "pending"];
  const isProcessing = site.status === "crawling" || site.status === "analyzing";
  const analyses = pageAnalysisData ?? [];
  const recs = recsData ?? [];
  const criticalRecs = recs.filter((r) => r.priority === "critical" || r.priority === "high");

  return (
    <div className="max-w-4xl">
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mb-6">
        <ArrowLeft className="w-4 h-4" />Dashboard
      </Link>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gray-800 flex items-center justify-center"><Globe className="w-6 h-6 text-gray-400" /></div>
            <div>
              <h1 className="text-xl font-semibold text-white">{site.name}</h1>
              <a href={site.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-blue-400 transition-colors">
                {site.domain}<ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
          <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium ${status.bg} ${status.text}`}>
            {isProcessing && <Loader2 className="w-3 h-3 animate-spin mr-1.5" />}{status.label}
          </span>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-800 flex flex-wrap items-center gap-3">
          <button onClick={() => startAnalysis.mutate({ siteId })} disabled={isProcessing || startAnalysis.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {isProcessing || startAnalysis.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" />{site.status === "crawling" ? "Crawling..." : site.status === "analyzing" ? "Analyzing..." : "Starting..."}</>
            ) : (<><Zap className="w-4 h-4" />{site.status === "ready" ? "Re-analyze" : "Start Analysis"}</>)}
          </button>
          {site.pageCount > 0 && <span className="text-sm text-gray-500">{site.pageCount} pages</span>}
          {site.lastAnalysisAt && <span className="text-sm text-gray-500">Analyzed {new Date(site.lastAnalysisAt).toLocaleDateString()}</span>}
        </div>
        {startAnalysis.isError && <p className="text-red-400 text-sm mt-3">{startAnalysis.error.message}</p>}
      </div>

      {isProcessing && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 mb-6 text-center">
          <Loader2 className="w-10 h-10 text-blue-400 animate-spin mx-auto mb-4" />
          <h2 className="text-lg font-medium text-white mb-2">{site.status === "crawling" ? "Crawling your site..." : "AI is analyzing your pages..."}</h2>
          <p className="text-sm text-gray-400">{site.status === "crawling" ? "Discovering and fetching all pages. This can take a minute." : "Claude is reviewing each page. This takes a few minutes."}</p>
        </div>
      )}

      {site.status === "pending" && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 mb-6 text-center">
          <Zap className="w-10 h-10 text-yellow-400 mx-auto mb-4" />
          <h2 className="text-lg font-medium text-white mb-2">Ready to analyze</h2>
          <p className="text-sm text-gray-400 max-w-md mx-auto">Click &quot;Start Analysis&quot; to crawl your site and get AI-powered recommendations.</p>
        </div>
      )}

      {site.status === "error" && (
        <div className="bg-red-900/10 border border-red-800/30 rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <div><h3 className="text-white font-medium">Analysis failed</h3><p className="text-sm text-gray-400 mt-1">Something went wrong. Try again.</p></div>
          </div>
        </div>
      )}

      {site.status === "ready" && analyses.length > 0 && (
        <>
          {criticalRecs.length > 0 && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-white mb-3">Top Priorities</h2>
              <div className="space-y-3">
                {criticalRecs.slice(0, 5).map((rec) => {
                  const style = priorityStyle(rec.priority);
                  return (
                    <div key={rec.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                      <div className="flex items-start gap-3">
                        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium shrink-0 ${style.bg} ${style.text}`}>{rec.priority}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm">{rec.action}</p>
                          {rec.reasoning && <p className="text-gray-400 text-xs mt-1.5">{rec.reasoning}</p>}
                          <div className="flex items-center gap-3 mt-2">
                            <span className="text-xs text-gray-500">{rec.category}</span>
                            {rec.effort && <span className="text-xs text-gray-500">{rec.effort === "quick_win" ? "Quick win" : rec.effort}</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {recs.length > 5 && (
                <Link href={`/dashboard/sites/${siteId}/recommendations`} className="inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 mt-3">
                  View all {recs.length} recommendations<ArrowRight className="w-3 h-3" />
                </Link>
              )}
            </div>
          )}

          <div className="mb-6">
            <h2 className="text-lg font-semibold text-white mb-3">Page Analysis ({analyses.length} pages)</h2>
            <div className="space-y-2">
              {analyses.map((analysis) => (
                <Link key={analysis.id} href={`/dashboard/sites/${siteId}/pages/${analysis.id}`}
                  className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors group">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="w-4 h-4 text-gray-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate">{analysis.pageTitle || analysis.pageUrl}</p>
                      <p className="text-xs text-gray-500 truncate">{analysis.pageUrl}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 ml-4">
                    {analysis.intentClassification && <span className="text-xs text-gray-500 hidden sm:block">{analysis.intentClassification}</span>}
                    <span className={`text-sm font-semibold ${scoreColor(analysis.contentQualityScore ?? 0)}`}>{analysis.contentQualityScore}/10</span>
                    <ArrowRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="mt-8 pt-6 border-t border-gray-800">
        {!showDeleteConfirm ? (
          <button onClick={() => setShowDeleteConfirm(true)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-red-400 transition-colors">
            <Trash2 className="w-4 h-4" />Delete this site
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <p className="text-sm text-red-400">Delete this site and all data?</p>
            <button onClick={() => deleteSite.mutate({ id: siteId })} disabled={deleteSite.isPending}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-sm rounded-lg disabled:opacity-50">
              {deleteSite.isPending ? "Deleting..." : "Yes, delete"}
            </button>
            <button onClick={() => setShowDeleteConfirm(false)} className="px-3 py-1.5 text-gray-400 hover:text-white text-sm">Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}
ENDOFFILE

# ============================================
# FILE: page detail view
# ============================================
echo "Creating page analysis detail..."
cat > "src/app/dashboard/sites/[siteId]/pages/[pageId]/page.tsx" << 'ENDOFFILE'
"use client";

import { trpc } from "@/lib/trpc/client";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2, CheckCircle, XCircle, AlertTriangle, ExternalLink } from "lucide-react";
import Link from "next/link";

function scoreColor(score: number): string {
  if (score >= 7) return "text-green-400";
  if (score >= 5) return "text-yellow-400";
  return "text-red-400";
}
function scoreBg(score: number): string {
  if (score >= 7) return "bg-green-500/10 border-green-500/20";
  if (score >= 5) return "bg-yellow-500/10 border-yellow-500/20";
  return "bg-red-500/10 border-red-500/20";
}
function seoQualityIcon(quality: string) {
  if (quality === "good") return <CheckCircle className="w-4 h-4 text-green-400" />;
  if (quality === "missing") return <XCircle className="w-4 h-4 text-red-400" />;
  return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
}

export default function PageAnalysisDetailPage() {
  const params = useParams();
  const siteId = params.siteId as string;
  const pageId = params.pageId as string;
  const { data: analysis, isLoading } = trpc.analysis.getPageAnalysis.useQuery({ id: pageId });

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 text-gray-500 animate-spin" /></div>;
  if (!analysis) return <div className="text-center mt-20"><p className="text-gray-400">Analysis not found.</p></div>;

  const seo = (analysis.seoAssessment ?? {}) as Record<string, unknown>;
  const strengths = (analysis.strengths ?? []) as string[];
  const weaknesses = (analysis.weaknesses ?? []) as string[];
  const fullAnalysis = (analysis.fullAnalysis ?? {}) as Record<string, unknown>;
  const recs = ((fullAnalysis.recommendations ?? []) as Record<string, unknown>[]);

  return (
    <div className="max-w-3xl">
      <Link href={"/dashboard/sites/" + siteId} className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mb-6">
        <ArrowLeft className="w-4 h-4" />Back to site
      </Link>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white">{analysis.pageTitle || "Untitled Page"}</h1>
            <a href={analysis.pageUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-blue-400 mt-1">
              {analysis.pageUrl}<ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div className={"text-center px-4 py-3 rounded-xl border " + scoreBg(analysis.contentQualityScore ?? 0)}>
            <div className={"text-2xl font-bold " + scoreColor(analysis.contentQualityScore ?? 0)}>{analysis.contentQualityScore}</div>
            <div className="text-xs text-gray-400">Quality</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-gray-800">
          {analysis.intentClassification && <span className="px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 text-xs font-medium">{analysis.intentClassification}</span>}
          {analysis.targetAudience && <span className="px-3 py-1 rounded-full bg-gray-800 text-gray-300 text-xs">Audience: {String(analysis.targetAudience)}</span>}
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
        <h2 className="text-base font-semibold text-white mb-4">SEO Assessment</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between"><span className="text-sm text-gray-400">Title Tag</span>
            <div className="flex items-center gap-2">{seoQualityIcon(String(seo.title_tag_quality ?? "needs_work"))}<span className="text-sm text-white capitalize">{String(seo.title_tag_quality ?? "Unknown").replace("_", " ")}</span></div>
          </div>
          <div className="flex items-center justify-between"><span className="text-sm text-gray-400">Meta Description</span>
            <div className="flex items-center gap-2">{seoQualityIcon(String(seo.meta_description_quality ?? "needs_work"))}<span className="text-sm text-white capitalize">{String(seo.meta_description_quality ?? "Unknown").replace("_", " ")}</span></div>
          </div>
          {typeof seo.heading_structure === "string" && seo.heading_structure && (
            <div className="flex items-start justify-between"><span className="text-sm text-gray-400">Headings</span><span className="text-sm text-white text-right max-w-xs">{seo.heading_structure}</span></div>
          )}
          <div className="flex items-center justify-between"><span className="text-sm text-gray-400">Internal Links</span><span className="text-sm text-white">{String(seo.internal_links_count ?? 0)}</span></div>
          <div className="flex items-center justify-between"><span className="text-sm text-gray-400">External Links</span><span className="text-sm text-white">{String(seo.external_links_count ?? 0)}</span></div>
          <div className="flex items-center justify-between"><span className="text-sm text-gray-400">Structured Data</span><span className="text-sm text-white">{seo.has_structured_data ? "Yes" : "No"}</span></div>
        </div>
        {Array.isArray(seo.issues) && seo.issues.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-800">
            <p className="text-sm text-gray-400 mb-2">Issues Found:</p>
            <div className="space-y-1.5">{seo.issues.map((issue: string, i: number) => (
              <div key={i} className="flex items-start gap-2"><XCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" /><span className="text-sm text-gray-300">{issue}</span></div>
            ))}</div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-green-400 mb-3">Strengths</h3>
          <div className="space-y-2">{strengths.length > 0 ? strengths.map((s, i) => (
            <div key={i} className="flex items-start gap-2"><CheckCircle className="w-3.5 h-3.5 text-green-400 mt-0.5 shrink-0" /><span className="text-sm text-gray-300">{s}</span></div>
          )) : <p className="text-sm text-gray-500">None identified</p>}</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-red-400 mb-3">Weaknesses</h3>
          <div className="space-y-2">{weaknesses.length > 0 ? weaknesses.map((w, i) => (
            <div key={i} className="flex items-start gap-2"><XCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" /><span className="text-sm text-gray-300">{w}</span></div>
          )) : <p className="text-sm text-gray-500">None identified</p>}</div>
        </div>
      </div>

      {recs.length > 0 && (
        <div className="mb-6">
          <h2 className="text-base font-semibold text-white mb-3">Recommendations</h2>
          <div className="space-y-3">{recs.map((rec, i) => {
            const p = String(rec.priority);
            const pStyle = p === "critical" || p === "high" ? "bg-orange-500/10 text-orange-400" : p === "medium" ? "bg-yellow-500/10 text-yellow-400" : "bg-gray-500/10 text-gray-400";
            return (
              <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <span className={"inline-flex items-center px-2 py-1 rounded text-xs font-medium shrink-0 " + pStyle}>{String(rec.priority)}</span>
                  <div>
                    <p className="text-sm text-white">{String(rec.action)}</p>
                    {typeof rec.reasoning === "string" && rec.reasoning && <p className="text-xs text-gray-400 mt-1.5">{rec.reasoning}</p>}
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-gray-500">{String(rec.category)}</span>
                      <span className="text-xs text-gray-500">{rec.effort === "quick_win" ? "Quick win" : String(rec.effort)}</span>
                      <span className="text-xs text-gray-500">Impact: {String(rec.expected_impact)}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}</div>
        </div>
      )}
    </div>
  );
}
ENDOFFILE

# ============================================
# FILE: recommendations page
# ============================================
echo "Creating recommendations page..."
cat > "src/app/dashboard/sites/[siteId]/recommendations/page.tsx" << 'ENDOFFILE'
"use client";

import { trpc } from "@/lib/trpc/client";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2, Check, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type FP = "all" | "critical" | "high" | "medium" | "low";
type FC = "all" | "content" | "seo" | "ux" | "technical" | "strategy";

function priorityStyle(p: string) {
  if (p === "critical") return "bg-red-500/10 text-red-400";
  if (p === "high") return "bg-orange-500/10 text-orange-400";
  if (p === "medium") return "bg-yellow-500/10 text-yellow-400";
  return "bg-gray-500/10 text-gray-400";
}

export default function RecommendationsPage() {
  const params = useParams();
  const siteId = params.siteId as string;
  const [pf, setPf] = useState<FP>("all");
  const [cf, setCf] = useState<FC>("all");
  const utils = trpc.useUtils();

  const { data: recs, isLoading } = trpc.analysis.getRecommendations.useQuery({ siteId });
  const updateStatus = trpc.analysis.updateRecommendationStatus.useMutation({
    onSuccess: () => { utils.analysis.getRecommendations.invalidate({ siteId }); },
  });

  const filtered = (recs ?? []).filter((r) => {
    if (pf !== "all" && r.priority !== pf) return false;
    if (cf !== "all" && r.category !== cf) return false;
    return true;
  });

  const po: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const so: Record<string, number> = { pending: 0, in_progress: 1, completed: 2, dismissed: 3 };
  const sorted = [...filtered].sort((a, b) => {
    const sd = (so[a.status] ?? 9) - (so[b.status] ?? 9);
    return sd !== 0 ? sd : (po[a.priority] ?? 9) - (po[b.priority] ?? 9);
  });

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 text-gray-500 animate-spin" /></div>;

  return (
    <div className="max-w-4xl">
      <Link href={"/dashboard/sites/" + siteId} className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mb-6">
        <ArrowLeft className="w-4 h-4" />Back to site
      </Link>
      <h1 className="text-xl font-semibold text-white mb-4">Recommendations ({recs?.length ?? 0})</h1>

      <div className="flex flex-wrap items-center gap-2 mb-6">
        <span className="text-xs text-gray-500 mr-1">Priority:</span>
        {(["all","critical","high","medium","low"] as FP[]).map((p) => (
          <button key={p} onClick={() => setPf(p)} className={"px-2.5 py-1 rounded-lg text-xs font-medium transition-colors " + (pf === p ? "bg-gray-700 text-white" : "bg-gray-800/50 text-gray-400 hover:text-white")}>{p === "all" ? "All" : p}</button>
        ))}
        <span className="text-xs text-gray-500 mr-1 ml-3">Category:</span>
        {(["all","content","seo","ux","technical","strategy"] as FC[]).map((c) => (
          <button key={c} onClick={() => setCf(c)} className={"px-2.5 py-1 rounded-lg text-xs font-medium transition-colors " + (cf === c ? "bg-gray-700 text-white" : "bg-gray-800/50 text-gray-400 hover:text-white")}>{c === "all" ? "All" : c}</button>
        ))}
      </div>

      <div className="space-y-3">
        {sorted.map((rec) => (
          <div key={rec.id} className={"bg-gray-900 border border-gray-800 rounded-xl p-4 " + (rec.status === "completed" || rec.status === "dismissed" ? "opacity-60" : "")}>
            <div className="flex items-start gap-3">
              <span className={"inline-flex items-center px-2 py-1 rounded text-xs font-medium shrink-0 " + priorityStyle(rec.priority)}>{rec.priority}</span>
              <div className="flex-1 min-w-0">
                <p className={"text-sm " + (rec.status === "completed" ? "line-through text-gray-400" : "text-white")}>{rec.action}</p>
                {rec.reasoning && <p className="text-xs text-gray-400 mt-1.5">{rec.reasoning}</p>}
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  <span className="text-xs text-gray-500">{rec.category}</span>
                  {rec.effort && <span className="text-xs text-gray-500">{rec.effort === "quick_win" ? "Quick win" : rec.effort}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => updateStatus.mutate({ id: rec.id, status: rec.status === "completed" ? "pending" : "completed" })}
                  className={"p-1.5 rounded-lg transition-colors " + (rec.status === "completed" ? "bg-green-500/10 text-green-400" : "hover:bg-gray-800 text-gray-500 hover:text-green-400")}>
                  <Check className="w-4 h-4" />
                </button>
                <button onClick={() => updateStatus.mutate({ id: rec.id, status: rec.status === "dismissed" ? "pending" : "dismissed" })}
                  className={"p-1.5 rounded-lg transition-colors " + (rec.status === "dismissed" ? "bg-gray-500/10 text-gray-400" : "hover:bg-gray-800 text-gray-500 hover:text-gray-300")}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {sorted.length === 0 && <p className="text-gray-500 text-sm text-center py-8">No recommendations match your filters.</p>}
      </div>
    </div>
  );
}
ENDOFFILE

echo ""
echo "=== Phase 1B applied successfully ==="
echo "Run: cp .env.local .env && npm run dev"
