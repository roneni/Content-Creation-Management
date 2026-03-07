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
