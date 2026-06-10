-- USDT BEP20 rename
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='wallet_usdt_aptos')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='wallet_usdt_bep20')
  THEN
    ALTER TABLE public.profiles RENAME COLUMN wallet_usdt_aptos TO wallet_usdt_bep20;
  END IF;
END $$;

UPDATE public.withdrawals SET currency='USDT_BEP20' WHERE currency='USDT_APTOS';

INSERT INTO public.app_settings(key, value) VALUES
  ('min_withdraw_usd', '0.01'::jsonb),
  ('max_withdraw_usd', '0.15'::jsonb),
  ('withdraw_fee_pct', '5'::jsonb),
  ('auto_ad_min_seconds', '60'::jsonb),
  ('auto_ad_max_seconds', '70'::jsonb),
  ('adsgram_interstitial_block', '"int-34544"'::jsonb),
  ('adsgram_reward_block', '"34543"'::jsonb)
ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value;

UPDATE public.app_settings SET value='"https://t.me/AstroBlitzPayments"'::jsonb WHERE key='payment_url';

UPDATE public.ad_blocks
   SET sdk_extra = '{"blocks": ["int-34544"], "reward_block": "34543"}'::jsonb
 WHERE network = 'adsgram';

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  v_secret text;
  v_base text := 'https://project--1441f38c-c668-45e2-b6bb-6c92dfd1ac3e.lovable.app';
BEGIN
  SELECT trim(both '"' from value::text) INTO v_secret FROM public.app_settings WHERE key='broadcast_cron_secret';
  v_secret := coalesce(v_secret, 'change_me');

  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN
    ('astroblitz_broadcast_worker','astroblitz_daily_reminder_morning','astroblitz_daily_reminder_noon','astroblitz_daily_reminder_evening');

  PERFORM cron.schedule(
    'astroblitz_broadcast_worker', '*/2 * * * *',
    format($f$select net.http_get(url:='%s/api/public/cron/broadcast-worker?secret=%s')$f$, v_base, v_secret)
  );

  PERFORM cron.schedule('astroblitz_daily_reminder_morning', '0 9 * * *',
    format($f$select net.http_get(url:='%s/api/public/cron/daily-reminder?secret=%s')$f$, v_base, v_secret));
  PERFORM cron.schedule('astroblitz_daily_reminder_noon', '0 15 * * *',
    format($f$select net.http_get(url:='%s/api/public/cron/daily-reminder?secret=%s')$f$, v_base, v_secret));
  PERFORM cron.schedule('astroblitz_daily_reminder_evening', '0 21 * * *',
    format($f$select net.http_get(url:='%s/api/public/cron/daily-reminder?secret=%s')$f$, v_base, v_secret));
END $$;