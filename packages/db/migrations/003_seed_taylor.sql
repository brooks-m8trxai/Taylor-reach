-- TaylorReach — seed Taylor Humphrey's tenant row
-- Run this ONCE after 001 and 002 migrations.
-- Update physical_address in Settings before any live sends (CAN-SPAM requirement).

insert into tenants (
  name,
  data_tier,
  niche_pillars,
  physical_address,
  unsubscribe_url,
  from_address,
  domain,
  daily_send_cap,
  sender_reputation,
  warmup_started_at,
  brand_voice_doc,
  cal_links,
  credibility
) values (
  'What''s in a Baby Name — Taylor Humphrey',
  'bootstrap',
  ARRAY[
    'baby naming',
    'pregnancy + expecting',
    'new parenthood (0-2 years)',
    'modern parenting culture',
    'family identity'
  ],
  'San Francisco, CA — UPDATE BEFORE FIRST SEND',
  'https://whatsinababyname.com/unsubscribe',
  'taylor@whatsinababyname.com',
  'whatsinababyname.com',
  20,
  'new',
  now(),
  'See docs/taylor-voice.md',
  '{"intro_call": "https://cal.com/taylorhumphrey/intro"}',
  '{
    "press": [
      "The New Yorker",
      "San Francisco Chronicle",
      "New York Post",
      "NZ Herald",
      "Cosmopolitan",
      "The Guardian",
      "People",
      "The Independent",
      "Yahoo Lifestyle",
      "Tamron Hall Show",
      "KTLA",
      "KPIX",
      "Access Hollywood",
      "CBC Documentary"
    ],
    "ig_handle": "@whatsinababyname",
    "ig_followers": 32000,
    "ig_followers_stale": false,
    "tiktok_handle": "@whatsinababynamedoula",
    "tiktok_followers": 46000,
    "tiktok_followers_stale": true,
    "newsletter_subscribers": 0,
    "current_partners": [],
    "past_press_features": [
      "The New Yorker (2022)",
      "San Francisco Chronicle (2025)",
      "New York Post (2025)",
      "NZ Herald (2025)"
    ],
    "babies_named": 500,
    "business_founded": 2015,
    "website": "https://www.whatsinababyname.com",
    "service_tiers": [
      {"name": "Personalized Recommendations", "price_usd": 200},
      {"name": "One-on-One Consultation", "price_usd": 1500},
      {"name": "Concierge Naming", "price_usd": 30000}
    ]
  }'
);
