INSERT INTO public.ad_blocks(network, label, logo_url, buttons_count, reward_min, reward_max, cooldown_seconds, button_lock_seconds, is_enabled, sort_order, sdk_extra)
VALUES (
  'uslads',
  'USL Ads',
  'https://uslads.com/favicon.ico',
  10,
  3,
  5,
  86400,
  5,
  true,
  50,
  jsonb_build_object(
    'apiKey', '16613da4b1290d7c3146e4a4e08157db',
    'placementId', 'plc_42ad50715d8b8aaa'
  )
)
ON CONFLICT (network) DO UPDATE SET
  label = EXCLUDED.label,
  logo_url = EXCLUDED.logo_url,
  buttons_count = EXCLUDED.buttons_count,
  reward_min = EXCLUDED.reward_min,
  reward_max = EXCLUDED.reward_max,
  cooldown_seconds = EXCLUDED.cooldown_seconds,
  button_lock_seconds = EXCLUDED.button_lock_seconds,
  is_enabled = EXCLUDED.is_enabled,
  sdk_extra = EXCLUDED.sdk_extra;