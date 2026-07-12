
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS icon_url text;

INSERT INTO public.ad_blocks (network, label, logo_url, buttons_count, reward_min, reward_max, cooldown_seconds, button_lock_seconds, is_enabled, sort_order, sdk_extra)
SELECT 'taddy', 'Taddy Network', 'https://taddy.pro/favicon.ico', 10, 3, 5, 43200, 5, true, 40,
       jsonb_build_object('pubId','ce8790eb749918b088605145e3626fd9')
WHERE NOT EXISTS (SELECT 1 FROM public.ad_blocks WHERE network = 'taddy');
