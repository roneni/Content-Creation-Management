import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { router, protectedProcedure } from "../index";
import { sites, siteStrategies, pageAnalyses, recommendations, userProfiles } from "@/server/db/schema";
import { generateSiteStrategy } from "@/server/services/claude";
import { TRPCError } from "@trpc/server";
import type { OnboardingAnswers } from "@/types";
import type { PageAnalysisResult } from "@/server/services/claude";

export const strategyRouter = router({
  generate: protectedProcedure
    .input(z.object({ siteId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [site] = await ctx.db.select().from(sites)
        .where(and(eq(sites.id, input.siteId), eq(sites.userId, ctx.user.id))).limit(1);
      if (!site) throw new TRPCError({ code: "NOT_FOUND", message: "Site not found" });

      const [profile] = await ctx.db.select().from(userProfiles)
        .where(eq(userProfiles.id, ctx.user.id)).limit(1);
      if (!profile?.onboardingAnswers) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Complete onboarding first" });
      }

      // Get page analyses — read from CORRECTED columns, not fullAnalysis
      const analyses = await ctx.db.select().from(pageAnalyses)
        .where(eq(pageAnalyses.siteId, input.siteId));
      if (analyses.length === 0) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Run a site analysis first" });
      }

      // Get verified recommendations from DB (these went through verification pass)
      const allRecs = await ctx.db.select().from(recommendations)
        .where(eq(recommendations.siteId, input.siteId));

      // Build analysis results from corrected DB columns + verified recommendations
      const analysisResults: PageAnalysisResult[] = analyses.map((a) => {
        const seo = (a.seoAssessment ?? {}) as Record<string, unknown>;
        // Get recommendations for THIS page from the recommendations table (verified)
        const pageRecs = allRecs.filter((r) => r.pageUrl === a.pageUrl);

        return {
          pageUrl: a.pageUrl,
          pageTitle: a.pageTitle ?? "",
          intentClassification: a.intentClassification ?? "other",
          targetAudience: String(a.targetAudience ?? ""),
          contentQualityScore: a.contentQualityScore ?? 5,
          strengths: (a.strengths ?? []) as string[],
          weaknesses: (a.weaknesses ?? []) as string[],
          seoAssessment: {
            titleTagQuality: String(seo.title_tag_quality ?? "needs_work"),
            metaDescriptionQuality: String(seo.meta_description_quality ?? "needs_work"),
            headingStructure: String(seo.heading_structure ?? ""),
            internalLinksCount: Number(seo.internal_links_count ?? 0),
            externalLinksCount: Number(seo.external_links_count ?? 0),
            hasStructuredData: Boolean(seo.has_structured_data),
            issues: (seo.issues ?? []) as string[],
          },
          recommendations: pageRecs.map((r) => ({
            priority: r.priority,
            category: r.category,
            action: r.action,
            reasoning: r.reasoning ?? "",
            effort: r.effort ?? "medium",
            expectedImpact: r.expectedImpact ?? "medium",
          })),
        };
      });

      const onboardingAnswers = profile.onboardingAnswers as OnboardingAnswers;
      const strategy = await generateSiteStrategy(analysisResults, onboardingAnswers, site.url);

      const latestAnalysis = analyses[0];
      const crawlSnapshotId = latestAnalysis?.crawlSnapshotId;
      if (!crawlSnapshotId) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No crawl snapshot found" });
      }

      // Delete old strategies for this site
      await ctx.db.delete(siteStrategies).where(eq(siteStrategies.siteId, input.siteId));

      const [saved] = await ctx.db.insert(siteStrategies).values({
        siteId: input.siteId,
        crawlSnapshotId,
        healthScore: strategy.healthScore,
        topPriorities: strategy.topPriorities,
        contentCalendar: strategy.contentCalendar,
        missingPages: strategy.missingPages,
        fullStrategy: strategy,
        postScanQuestions: strategy.postScanQuestions,
      }).returning();

      await ctx.db.update(sites)
        .set({ healthScore: strategy.healthScore })
        .where(eq(sites.id, input.siteId));

      return saved;
    }),

  getLatest: protectedProcedure
    .input(z.object({ siteId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [site] = await ctx.db.select().from(sites)
        .where(and(eq(sites.id, input.siteId), eq(sites.userId, ctx.user.id))).limit(1);
      if (!site) throw new TRPCError({ code: "NOT_FOUND" });

      const [strategy] = await ctx.db.select().from(siteStrategies)
        .where(eq(siteStrategies.siteId, input.siteId))
        .orderBy(desc(siteStrategies.createdAt)).limit(1);

      return strategy ?? null;
    }),

  savePostScanAnswers: protectedProcedure
    .input(z.object({
      strategyId: z.string().uuid(),
      answers: z.record(z.string(), z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      const [strategy] = await ctx.db.select().from(siteStrategies)
        .where(eq(siteStrategies.id, input.strategyId)).limit(1);
      if (!strategy) throw new TRPCError({ code: "NOT_FOUND" });

      const [site] = await ctx.db.select().from(sites)
        .where(and(eq(sites.id, strategy.siteId), eq(sites.userId, ctx.user.id))).limit(1);
      if (!site) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.db.update(siteStrategies).set({
        postScanAnswers: input.answers,
        postScanCompleted: true,
      }).where(eq(siteStrategies.id, input.strategyId));

      return { success: true };
    }),
});
