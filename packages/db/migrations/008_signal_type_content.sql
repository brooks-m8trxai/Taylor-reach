-- TaylorReach — migration 008
-- Adds content_idea and monetizable_brand_deal to the signal_type CHECK constraint.
-- Required before deploying the Social Media Brain feature.
--
-- Run in Supabase SQL Editor.

ALTER TABLE signals DROP CONSTRAINT signals_signal_type_check;

ALTER TABLE signals
  ADD CONSTRAINT signals_signal_type_check CHECK (signal_type IN (
    'product_launch',
    'campaign_launch',
    'funding_round',
    'creator_partnership',
    'celebrity_moment',
    'editorial_mention',
    'hiring_signal',
    'podcast_episode',
    'seasonal_window',
    'taylor_press_hit',
    'media_opportunity',
    'monetizable_brand_deal',
    'content_idea'
  ));

-- Index for Social Brain queries (content radar signals, newest first)
CREATE INDEX IF NOT EXISTS signals_content_radar_idx
  ON signals(tenant_id, detected_at DESC)
  WHERE funnel = 'content_radar';
