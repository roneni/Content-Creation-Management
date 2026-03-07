// Onboarding answer types
export interface OnboardingAnswers {
  site_description: string;
  target_audience: string;
  success_goals: string[];
  for_profit: "yes" | "no" | "not_yet";
  budget_willingness: "not_now" | "small" | "moderate" | "whatever_it_takes";
  perfect_vision: string;
  role: "solo_creator" | "small_team" | "agency" | "other";
}

// Site status
export type SiteStatus = "pending" | "crawling" | "analyzing" | "ready" | "error";

// Recommendation types
export type RecommendationPriority = "critical" | "high" | "medium" | "low";
export type RecommendationCategory = "content" | "seo" | "ux" | "technical" | "strategy";
export type RecommendationEffort = "quick_win" | "medium" | "major_effort";
export type RecommendationStatus = "pending" | "in_progress" | "completed" | "dismissed";
