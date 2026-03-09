-- AI Site Strategist — Database Schema
-- Supabase PostgreSQL
-- Last updated: March 7, 2026

-- ============================================
-- USERS & AUTH
-- ============================================

-- Extends Supabase Auth users table
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  email TEXT,
  role TEXT DEFAULT 'solo_creator', -- 'solo_creator', 'small_team', 'agency', 'other'
  onboarding_completed BOOLEAN DEFAULT FALSE,
  onboarding_answers JSONB DEFAULT '{}',
  -- Onboarding answers structure:
  -- {
  --   "site_description": "free text",
  --   "target_audience": "free text",
  --   "success_goals": ["more_traffic", "more_subscribers", ...],
  --   "for_profit": "yes" | "no" | "not_yet",
  --   "budget_willingness": "not_now" | "small" | "moderate" | "whatever_it_takes",
  --   "perfect_vision": "free text - describe your site when it's perfect",
  --   "role": "solo_creator" | "small_team" | "agency" | "other"
  -- }
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SITES
-- ============================================

CREATE TABLE sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  name TEXT, -- user-friendly name, e.g. "My Portfolio"
  domain TEXT, -- extracted from URL, e.g. "example.com"
  status TEXT DEFAULT 'pending', -- 'pending', 'crawling', 'analyzing', 'ready', 'error'
  gsc_connected BOOLEAN DEFAULT FALSE,
  ga4_connected BOOLEAN DEFAULT FALSE,
  last_crawl_at TIMESTAMPTZ,
  last_analysis_at TIMESTAMPTZ,
  page_count INTEGER DEFAULT 0,
  health_score INTEGER, -- 0-100, from latest site strategy
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- OAUTH TOKENS (GSC, GA4)
-- ============================================

CREATE TABLE oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- 'google_search_console', 'google_analytics'
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_type TEXT DEFAULT 'Bearer',
  scope TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, site_id, provider)
);

-- ============================================
-- CRAWL SNAPSHOTS
-- ============================================

CREATE TABLE crawl_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'in_progress', -- 'in_progress', 'completed', 'failed'
  firecrawl_job_id TEXT, -- Firecrawl's async job ID for polling
  page_count INTEGER DEFAULT 0,
  pages_data JSONB DEFAULT '[]',
  -- pages_data structure: array of
  -- {
  --   "url": "https://...",
  --   "title": "Page Title",
  --   "description": "meta description",
  --   "markdown": "# full page content...",
  --   "status_code": 200,
  --   "source_url": "https://..."
  -- }
  site_map JSONB DEFAULT '[]', -- from Firecrawl /map endpoint: [{ url, title, description }]
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PAGE ANALYSES (Per-Page Claude Output)
-- ============================================

CREATE TABLE page_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crawl_snapshot_id UUID NOT NULL REFERENCES crawl_snapshots(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  page_url TEXT NOT NULL,
  page_title TEXT,
  
  -- Claude analysis output
  intent_classification TEXT, -- 'homepage', 'directory', 'content', 'landing', 'utility', etc.
  target_audience TEXT,
  content_quality_score INTEGER, -- 1-10
  
  strengths JSONB DEFAULT '[]', -- ["Good heading structure", ...]
  weaknesses JSONB DEFAULT '[]', -- ["Missing meta description", ...]
  
  seo_assessment JSONB DEFAULT '{}',
  -- {
  --   "title_tag_quality": "good" | "needs_work" | "missing",
  --   "meta_description_quality": "good" | "needs_work" | "missing",
  --   "heading_structure": "description",
  --   "internal_links_count": 5,
  --   "external_links_count": 12,
  --   "has_structured_data": false,
  --   "issues": ["Missing H1", ...]
  -- }
  
  full_analysis JSONB DEFAULT '{}', -- complete Claude response for reference
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- RECOMMENDATIONS
-- ============================================

CREATE TABLE recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  page_analysis_id UUID REFERENCES page_analyses(id) ON DELETE SET NULL,
  crawl_snapshot_id UUID REFERENCES crawl_snapshots(id) ON DELETE SET NULL,
  
  priority TEXT NOT NULL, -- 'critical', 'high', 'medium', 'low'
  category TEXT NOT NULL, -- 'content', 'seo', 'ux', 'technical', 'strategy'
  action TEXT NOT NULL, -- the specific recommendation
  reasoning TEXT, -- why this matters
  effort TEXT, -- 'quick_win', 'medium', 'major_effort'
  expected_impact TEXT, -- 'high', 'medium', 'low'
  
  page_url TEXT, -- NULL for site-level recommendations
  
  status TEXT DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'dismissed'
  status_changed_at TIMESTAMPTZ,
  
  source TEXT DEFAULT 'page_analysis', -- 'page_analysis', 'site_strategy', 'change_detection'
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SITE STRATEGIES (Site-Level Claude Output)
-- ============================================

CREATE TABLE site_strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  crawl_snapshot_id UUID NOT NULL REFERENCES crawl_snapshots(id) ON DELETE CASCADE,
  
  health_score INTEGER, -- 0-100
  
  top_priorities JSONB DEFAULT '[]', -- ["Priority 1 description", ...]
  content_calendar JSONB DEFAULT '[]',
  -- [{ "week": 1, "action": "...", "target_page": "/...", "expected_impact": "high" }]
  
  missing_pages JSONB DEFAULT '[]',
  -- [{ "suggested_url": "/...", "reasoning": "..." }]
  
  full_strategy JSONB DEFAULT '{}', -- complete Claude response
  
  -- Moment 2 questionnaire
  post_scan_questions JSONB DEFAULT '[]',
  -- [{ "id": "q1", "question": "Is your festivals page meant to be...", "options": [...] }]
  post_scan_answers JSONB DEFAULT '{}',
  -- { "q1": "comprehensive_directory", "q2": "yes" }
  post_scan_completed BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- GSC PERFORMANCE DATA
-- ============================================

CREATE TABLE gsc_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  
  page_url TEXT NOT NULL,
  date DATE NOT NULL,
  
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  ctr FLOAT DEFAULT 0,
  avg_position FLOAT DEFAULT 0,
  
  top_queries JSONB DEFAULT '[]',
  -- [{ "query": "psytrance festivals", "impressions": 500, "clicks": 25, "ctr": 0.05, "position": 3.2 }]
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(site_id, page_url, date)
);

-- ============================================
-- CHANGE DETECTION LOG (Phase 2)
-- ============================================

CREATE TABLE change_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  crawl_snapshot_id UUID NOT NULL REFERENCES crawl_snapshots(id) ON DELETE CASCADE,
  previous_snapshot_id UUID REFERENCES crawl_snapshots(id),
  
  change_type TEXT NOT NULL, -- 'page_added', 'page_removed', 'content_changed', 'meta_changed', 'structure_changed'
  page_url TEXT,
  severity TEXT DEFAULT 'low', -- 'critical', 'high', 'medium', 'low'
  description TEXT,
  details JSONB DEFAULT '{}',
  
  triggered_reanalysis BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE crawl_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE gsc_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_log ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data
CREATE POLICY "Users access own profile" ON user_profiles
  FOR ALL USING (auth.uid() = id);

CREATE POLICY "Users access own sites" ON sites
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users access own tokens" ON oauth_tokens
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users access own crawl snapshots" ON crawl_snapshots
  FOR ALL USING (site_id IN (SELECT id FROM sites WHERE user_id = auth.uid()));

CREATE POLICY "Users access own page analyses" ON page_analyses
  FOR ALL USING (site_id IN (SELECT id FROM sites WHERE user_id = auth.uid()));

CREATE POLICY "Users access own recommendations" ON recommendations
  FOR ALL USING (site_id IN (SELECT id FROM sites WHERE user_id = auth.uid()));

CREATE POLICY "Users access own strategies" ON site_strategies
  FOR ALL USING (site_id IN (SELECT id FROM sites WHERE user_id = auth.uid()));

CREATE POLICY "Users access own GSC data" ON gsc_performance
  FOR ALL USING (site_id IN (SELECT id FROM sites WHERE user_id = auth.uid()));

CREATE POLICY "Users access own change log" ON change_log
  FOR ALL USING (site_id IN (SELECT id FROM sites WHERE user_id = auth.uid()));

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_sites_user_id ON sites(user_id);
CREATE INDEX idx_crawl_snapshots_site_id ON crawl_snapshots(site_id);
CREATE INDEX idx_page_analyses_site_id ON page_analyses(site_id);
CREATE INDEX idx_page_analyses_crawl_snapshot ON page_analyses(crawl_snapshot_id);
CREATE INDEX idx_recommendations_site_id ON recommendations(site_id);
CREATE INDEX idx_recommendations_status ON recommendations(status);
CREATE INDEX idx_gsc_performance_site_date ON gsc_performance(site_id, date);
CREATE INDEX idx_change_log_site_id ON change_log(site_id);

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER sites_updated_at
  BEFORE UPDATE ON sites
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER oauth_tokens_updated_at
  BEFORE UPDATE ON oauth_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
