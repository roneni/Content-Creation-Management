import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { router, protectedProcedure } from "../index";
import { sites } from "@/server/db/schema";
import { extractDomain, normalizeUrl } from "@/lib/utils";
import { TRPCError } from "@trpc/server";

export const sitesRouter = router({
  /** Create a new site */
  create: protectedProcedure
    .input(
      z.object({
        url: z.string().min(1, "URL is required"),
        name: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const normalizedUrl = normalizeUrl(input.url);
      const domain = extractDomain(normalizedUrl);

      const [site] = await ctx.db
        .insert(sites)
        .values({
          userId: ctx.user.id,
          url: normalizedUrl,
          name: input.name || domain,
          domain,
          status: "pending",
        })
        .returning();

      return site;
    }),

  /** List all sites for the current user */
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(sites)
      .where(eq(sites.userId, ctx.user.id))
      .orderBy(sites.createdAt);
  }),

  /** Get a single site by ID */
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [site] = await ctx.db
        .select()
        .from(sites)
        .where(and(eq(sites.id, input.id), eq(sites.userId, ctx.user.id)))
        .limit(1);

      if (!site) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Site not found",
        });
      }

      return site;
    }),

  /** Delete a site */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db
        .delete(sites)
        .where(and(eq(sites.id, input.id), eq(sites.userId, ctx.user.id)))
        .returning();

      if (!deleted) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Site not found",
        });
      }

      return { success: true };
    }),
});
