import { z } from "zod";
import { eq } from "drizzle-orm";
import { router, protectedProcedure } from "../index";
import { userProfiles } from "@/server/db/schema";

const onboardingSchema = z.object({
  site_description: z.string().max(500),
  target_audience: z.string().max(500),
  success_goals: z.array(z.string()),
  for_profit: z.enum(["yes", "no", "not_yet"]),
  budget_willingness: z.enum(["not_now", "small", "moderate", "whatever_it_takes"]),
  perfect_vision: z.string().max(1000),
  role: z.enum(["solo_creator", "small_team", "agency", "other"]),
});

export const userRouter = router({
  /** Get current user's profile */
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const profile = await ctx.db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.id, ctx.user.id))
      .limit(1);

    return profile[0] ?? null;
  }),

  /** Save onboarding answers and mark as completed */
  updateOnboarding: protectedProcedure
    .input(onboardingSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.id, ctx.user.id))
        .limit(1);

      if (existing.length === 0) {
        // Create profile if it doesn't exist yet
        await ctx.db.insert(userProfiles).values({
          id: ctx.user.id,
          email: ctx.user.email,
          displayName: ctx.user.user_metadata?.full_name ?? ctx.user.email,
          role: input.role,
          onboardingAnswers: input,
          onboardingCompleted: true,
        });
      } else {
        await ctx.db
          .update(userProfiles)
          .set({
            role: input.role,
            onboardingAnswers: input,
            onboardingCompleted: true,
          })
          .where(eq(userProfiles.id, ctx.user.id));
      }

      return { success: true };
    }),
});
