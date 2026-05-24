export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type SignalType =
  | 'product_launch'
  | 'campaign_launch'
  | 'funding_round'
  | 'creator_partnership'
  | 'celebrity_moment'
  | 'editorial_mention'
  | 'hiring_signal'
  | 'podcast_episode'
  | 'seasonal_window'
  | 'taylor_press_hit'
  | 'media_opportunity'
  // Channel A — Brand-deal signals
  | 'monetizable_brand_deal'
  // Channel B — Content radar signals
  | 'content_idea'

export type SignalFunnel = 'brand_deal' | 'media_opportunity' | 'content_radar'

export type BrandKind = 'brand' | 'publisher' | 'creator'

export type BrandStatus =
  | 'new'
  | 'scoring'
  | 'enriched'
  | 'queued'
  | 'pitched'
  | 'replied_warm'
  | 'replied_send_more'
  | 'call_booked'
  | 'negotiating'
  | 'deal_won'
  | 'deal_live'
  | 'closed_lost'
  | 'nurture'
  | 'opted_out'
  | 'blocked'

export type DealType =
  | 'sponsorship'
  | 'partnership'
  | 'podcast_guest'
  | 'speaking'
  | 'media'
  | 'gifted'
  | 'ambassadorship'

export type AngleUsed =
  | 'launch'
  | 'campaign_echo'
  | 'competitor'
  | 'seasonal'
  | 'cultural'
  | 'earned'
  | 'podcast'

export type PitchStatus = 'awaiting_approval' | 'approved' | 'rejected' | 'edited' | 'sent' | 'expired'

export type OutreachStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'replied'
  | 'bounced'
  | 'failed'
  | 'complained'

export type ReplyIntent =
  | 'warm_interested'
  | 'warm_send_more'
  | 'request_intro_call'
  | 'not_now'
  | 'not_a_fit'
  | 'wrong_person'
  | 'auto_reply'
  | 'unsubscribe'
  | 'unclear'

export type DealStatus = 'discussion' | 'negotiation' | 'agreed' | 'live' | 'completed' | 'cancelled'

export type CreatorTier = 'micro' | 'mid' | 'macro' | 'celebrity' | 'unknown'

export type SizeBand = 'startup' | 'small' | 'mid' | 'large' | 'enterprise'

export type DataTier = 'bootstrap' | 'paid'

export type SenderReputation = 'new' | 'warming' | 'warm' | 'established'

export type TaskStatus = 'pending' | 'approved' | 'dismissed' | 'completed'

export interface Tenant {
  id: string
  name: string
  owner_user_id: string | null
  data_tier: DataTier
  niche_pillars: string[]
  physical_address: string
  unsubscribe_url: string
  from_address: string
  domain: string
  daily_send_cap: number
  warmup_started_at: string | null
  sender_reputation: SenderReputation
  brand_voice_doc: string | null
  cal_links: Json
  credibility: Json
  created_at: string
}

export interface Signal {
  id: string
  tenant_id: string
  source: string
  source_url: string | null
  signal_type: SignalType
  funnel: SignalFunnel | null
  brand_name: string
  brand_handle: string | null
  brand_domain: string | null
  brand_id: string | null
  headline: string
  raw_excerpt: string | null
  niche_fit_score: number | null
  needs_review: boolean
  detected_at: string
  source_published_at: string | null
  metadata: Json
  raw_payload: Json
}

export interface Brand {
  id: string
  tenant_id: string
  brand_name: string
  brand_kind: BrandKind
  domain: string | null
  ig_handle: string | null
  tiktok_handle: string | null
  description: string | null
  brand_category: string | null
  categories: string[]
  founded_year: number | null
  hq_city: string | null
  hq_country: string | null
  size_band: SizeBand | null
  funding_signal: Json | null
  funding_event: Json | null
  voice_samples: string[]
  past_creator_tier: CreatorTier | null
  budget_signal_score: number | null
  fit_score: number | null
  conflict_flag: { is_competitor_of: string[]; blocked_until: string | null }
  status: BrandStatus
  last_signal_at: string | null
  last_enriched_at: string | null
  last_contacted_at: string | null
  next_recheck_at: string | null
  notes: string | null
  about_summary: string | null
  opportunity_summary: string | null
  suggested_angles_json: Json | null
  intelligence_generated_at: string | null
  created_at: string
  updated_at: string
}

export interface BrandContact {
  id: string
  brand_id: string
  name: string | null
  title: string | null
  email: string | null
  linkedin_url: string | null
  role_priority: number | null
  source: string | null
  verified: boolean
  created_at: string
}

export interface BrandRecentCampaign {
  id: string
  brand_id: string
  campaign_name: string | null
  launched_at: string | null
  tagline: string | null
  creator_partners: Json
  source_url: string | null
  captured_at: string
}

export interface PitchDraft {
  id: string
  tenant_id: string
  brand_id: string
  contact_id: string | null
  selected_signal_id: string | null
  deal_type: DealType
  angle_used: AngleUsed
  alternate_angles: { angle: string; hook_sentence: string }[]
  subject: string
  body_text: string
  body_html: string | null
  recommended_send_at: string | null
  one_sheet_url: string | null
  draft_quality_score: number | null
  reasoning: string | null
  status: PitchStatus
  approved_by: string | null
  approved_at: string | null
  sent_at: string | null
  created_at: string
}

export interface OutreachEvent {
  id: string
  tenant_id: string
  brand_id: string
  pitch_draft_id: string | null
  thread_id: string | null
  message_id: string | null
  audit_token: string | null
  channel: 'email'
  direction: 'outbound' | 'inbound'
  touch_number: number | null
  subject: string | null
  body_text: string | null
  status: OutreachStatus | null
  sent_at: string | null
  scheduled_next_touch_at: string | null
  created_at: string
}

export interface Reply {
  id: string
  tenant_id: string
  brand_id: string
  outreach_event_id: string | null
  raw_content: string
  from_email: string | null
  received_at: string
  intent: ReplyIntent | null
  intent_confidence: number | null
  draft_response: Json | null
  needs_operator_review: boolean
  resolved: boolean
  resolved_at: string | null
}

export interface OptOut {
  id: string
  tenant_id: string
  brand_id: string | null
  contact_email: string
  recorded_at: string
}

export interface Deal {
  id: string
  tenant_id: string
  brand_id: string
  deal_type: string
  estimated_value_usd: number | null
  actual_value_usd: number | null
  status: DealStatus
  deliverables: Json
  go_live_date: string | null
  ftc_disclosure_reminded: boolean
  exclusivity_categories: string[]
  exclusivity_end_date: string | null
  notes: string | null
  created_at: string
}

export interface NurtureQueue {
  id: string
  tenant_id: string
  brand_id: string
  reason: string | null
  recheck_at: string
  resolved: boolean
  created_at: string
}

export interface Task {
  id: string
  tenant_id: string
  brand_id: string | null
  title: string
  description: string | null
  recommended_action: string | null
  draft_content: string | null
  priority: number
  estimated_value_usd: number | null
  due_at: string | null
  status: TaskStatus
  created_at: string
  resolved_at: string | null
}

export interface AuditLog {
  id: string
  tenant_id: string | null
  brand_id: string | null
  decision: string | null
  reasons: string[] | null
  rules_applied: string[] | null
  action_type: string | null
  channel: string | null
  model_version: string | null
  payload: Json | null
  created_at: string
}

export interface BrandWatchlist {
  id: string
  tenant_id: string
  brand_name: string
  domain: string | null
  ig_handle: string | null
  category_hint: string | null
  notes: string | null
  last_checked_at: string | null
  created_at: string
}

export interface ContentCalendar {
  id: string
  tenant_id: string
  signal_id: string | null
  title: string
  status: 'idea' | 'drafted' | 'scheduled' | 'posted' | 'passed'
  platform: 'instagram' | 'tiktok' | 'newsletter' | 'podcast' | 'x' | null
  suggested_angles: Json | null
  scheduled_for: string | null
  posted_at: string | null
  notes: string | null
  created_at: string
}
