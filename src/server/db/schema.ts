import {
  pgTable,
  uuid,
  text,
  boolean,
  jsonb,
  timestamp,
  integer,
  real,
  date,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ============================================
// USERS & AUTH
// ============================================

export const userProfiles = pgTable("user_profiles", {
  id: uuid("id").primaryKey(), // References auth.users(id) — FK managed in Supabase
  displayName: text("display_name"),
  email: text("email"),
  role: text("role").default("solo_creator").notNull(),
  onboardingCompleted: boolean("onboarding_completed").default(false).notNull(),
  onboardingAnswers: jsonb("onboarding_answers").default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ============================================
// SITES
// ============================================

export const sites = pgTable(
  "sites",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    name: text("name"),
    domain: text("domain"),
    status: text("status").default("pending").notNull(),
    gscConnected: boolean("gsc_connected").default(false).notNull(),
    ga4Connected: boolean("ga4_connected").default(false).notNull(),
    lastCrawlAt: timestamp("last_crawl_at", { withTimezone: true }),
    lastAnalysisAt: timestamp("last_analysis_at", { withTimezone: true }),
    pageCount: integer("page_count").default(0).notNull(),
    healthScore: integer("health_score"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("idx_sites_user_id").on(table.userId)]
);

// ============================================
// OAUTH TOKENS (GSC, GA4)
// ============================================

export const oauthTokens = pgTable(
  "oauth_tokens",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token").notNull(),
    tokenType: text("token_type").default("Bearer"),
    scope: text("scope"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("oauth_tokens_user_site_provider_unique").on(
      table.userId,
      table.siteId,
      table.provider
    ),
  ]
);

// ============================================
// CRAWL SNAPSHOTS
// ============================================

export const crawlSnapshots = pgTable(
  "crawl_snapshots",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    status: text("status").default("in_progress").notNull(),
    firecrawlJobId: text("firecrawl_job_id"),
    pageCount: integer("page_count").default(0).notNull(),
    pagesData: jsonb("pages_data").default([]).notNull(),
    siteMap: jsonb("site_map").default([]).notNull(),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("idx_crawl_snapshots_site_id").on(table.siteId)]
);

// ============================================
// PAGE ANALYSES
// ============================================

export const pageAnalyses = pgTable(
  "page_analyses",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    crawlSnapshotId: uuid("crawl_snapshot_id")
      .notNull()
      .references(() => crawlSnapshots.id, { onDelete: "cascade" }),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    pageUrl: text("page_url").notNull(),
    pageTitle: text("page_title"),
    intentClassification: text("intent_classification"),
    targetAudience: text("target_audience"),
    contentQualityScore: integer("content_quality_score"),
    strengths: jsonb("strengths").default([]).notNull(),
    weaknesses: jsonb("weaknesses").default([]).notNull(),
    seoAssessment: jsonb("seo_assessment").default({}).notNull(),
    fullAnalysis: jsonb("full_analysis").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_page_analyses_site_id").on(table.siteId),
    index("idx_page_analyses_crawl_snapshot").on(table.crawlSnapshotId),
  ]
);

// ============================================
// RECOMMENDATIONS
// ============================================

export const recommendations = pgTable(
  "recommendations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    pageAnalysisId: uuid("page_analysis_id").references(() => pageAnalyses.id, {
      onDelete: "set null",
    }),
    crawlSnapshotId: uuid("crawl_snapshot_id").references(() => crawlSnapshots.id, {
      onDelete: "set null",
    }),
    priority: text("priority").notNull(),
    category: text("category").notNull(),
    action: text("action").notNull(),
    reasoning: text("reasoning"),
    effort: text("effort"),
    expectedImpact: text("expected_impact"),
    pageUrl: text("page_url"),
    status: text("status").default("pending").notNull(),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }),
    source: text("source").default("page_analysis").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_recommendations_site_id").on(table.siteId),
    index("idx_recommendations_status").on(table.status),
  ]
);

// ============================================
// SITE STRATEGIES
// ============================================

export const siteStrategies = pgTable("site_strategies", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" }),
  crawlSnapshotId: uuid("crawl_snapshot_id")
    .notNull()
    .references(() => crawlSnapshots.id, { onDelete: "cascade" }),
  healthScore: integer("health_score"),
  topPriorities: jsonb("top_priorities").default([]).notNull(),
  contentCalendar: jsonb("content_calendar").default([]).notNull(),
  missingPages: jsonb("missing_pages").default([]).notNull(),
  fullStrategy: jsonb("full_strategy").default({}).notNull(),
  postScanQuestions: jsonb("post_scan_questions").default([]).notNull(),
  postScanAnswers: jsonb("post_scan_answers").default({}).notNull(),
  postScanCompleted: boolean("post_scan_completed").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ============================================
// GSC PERFORMANCE DATA
// ============================================

export const gscPerformance = pgTable(
  "gsc_performance",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    pageUrl: text("page_url").notNull(),
    date: date("date").notNull(),
    impressions: integer("impressions").default(0).notNull(),
    clicks: integer("clicks").default(0).notNull(),
    ctr: real("ctr").default(0).notNull(),
    avgPosition: real("avg_position").default(0).notNull(),
    topQueries: jsonb("top_queries").default([]).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("gsc_performance_site_page_date_unique").on(
      table.siteId,
      table.pageUrl,
      table.date
    ),
    index("idx_gsc_performance_site_date").on(table.siteId, table.date),
  ]
);

// ============================================
// CHANGE LOG (Phase 2)
// ============================================

export const changeLog = pgTable(
  "change_log",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    crawlSnapshotId: uuid("crawl_snapshot_id")
      .notNull()
      .references(() => crawlSnapshots.id, { onDelete: "cascade" }),
    previousSnapshotId: uuid("previous_snapshot_id").references(() => crawlSnapshots.id),
    changeType: text("change_type").notNull(),
    pageUrl: text("page_url"),
    severity: text("severity").default("low").notNull(),
    description: text("description"),
    details: jsonb("details").default({}).notNull(),
    triggeredReanalysis: boolean("triggered_reanalysis").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("idx_change_log_site_id").on(table.siteId)]
);

// ============================================
// TYPE EXPORTS
// ============================================

export type UserProfile = typeof userProfiles.$inferSelect;
export type NewUserProfile = typeof userProfiles.$inferInsert;
export type Site = typeof sites.$inferSelect;
export type NewSite = typeof sites.$inferInsert;
export type Recommendation = typeof recommendations.$inferSelect;
export type PageAnalysis = typeof pageAnalyses.$inferSelect;
export type SiteStrategy = typeof siteStrategies.$inferSelect;
