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
