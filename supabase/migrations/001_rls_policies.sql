-- ============================================
-- ROW LEVEL SECURITY POLICIES
-- Run this in Supabase SQL Editor after Drizzle push
-- ============================================

-- Enable RLS on all tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE crawl_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE gsc_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_log ENABLE ROW LEVEL SECURITY;

-- Users can only access their own profile
CREATE POLICY "Users access own profile" ON user_profiles
  FOR ALL USING (auth.uid() = id);

-- Users can only access their own sites
CREATE POLICY "Users access own sites" ON sites
  FOR ALL USING (auth.uid() = user_id);

-- Users can only access their own OAuth tokens
CREATE POLICY "Users access own tokens" ON oauth_tokens
  FOR ALL USING (auth.uid() = user_id);

-- Users can only access crawl snapshots for their own sites
CREATE POLICY "Users access own crawl snapshots" ON crawl_snapshots
  FOR ALL USING (site_id IN (SELECT id FROM sites WHERE user_id = auth.uid()));

-- Users can only access page analyses for their own sites
CREATE POLICY "Users access own page analyses" ON page_analyses
  FOR ALL USING (site_id IN (SELECT id FROM sites WHERE user_id = auth.uid()));

-- Users can only access recommendations for their own sites
CREATE POLICY "Users access own recommendations" ON recommendations
  FOR ALL USING (site_id IN (SELECT id FROM sites WHERE user_id = auth.uid()));

-- Users can only access strategies for their own sites
CREATE POLICY "Users access own strategies" ON site_strategies
  FOR ALL USING (site_id IN (SELECT id FROM sites WHERE user_id = auth.uid()));

-- Users can only access GSC data for their own sites
CREATE POLICY "Users access own GSC data" ON gsc_performance
  FOR ALL USING (site_id IN (SELECT id FROM sites WHERE user_id = auth.uid()));

-- Users can only access change logs for their own sites
CREATE POLICY "Users access own change log" ON change_log
  FOR ALL USING (site_id IN (SELECT id FROM sites WHERE user_id = auth.uid()));

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
