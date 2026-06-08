
-- Helper: updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================
-- profiles
-- =========================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_id BIGINT NOT NULL UNIQUE,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  photo_url TEXT,
  language_code TEXT,
  refer_code TEXT NOT NULL UNIQUE,
  referrer_tg_id BIGINT,
  coins NUMERIC NOT NULL DEFAULT 0,
  game_level INT NOT NULL DEFAULT 1,
  ads_watched INT NOT NULL DEFAULT 0,
  refer_count INT NOT NULL DEFAULT 0,
  verified_refer_count INT NOT NULL DEFAULT 0,
  total_withdraw NUMERIC NOT NULL DEFAULT 0,
  wallet_ton TEXT,
  wallet_usdt_aptos TEXT,
  is_suspended BOOLEAN NOT NULL DEFAULT false,
  suspend_reason TEXT,
  last_ip TEXT,
  device_fingerprint TEXT,
  notifications_enabled BOOLEAN NOT NULL DEFAULT false,
  onboarded BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_tg_id ON public.profiles(tg_id);
CREATE INDEX idx_profiles_referrer ON public.profiles(referrer_tg_id);
CREATE INDEX idx_profiles_ip ON public.profiles(last_ip);
CREATE INDEX idx_profiles_device ON public.profiles(device_fingerprint);

GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- We use Telegram initData verification on the server, so all writes go through
-- service-role server functions. Block direct client access (no policies = locked).
-- Add a permissive read policy ONLY for the public leaderboard scope later.

CREATE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- app_settings
-- =========================
CREATE TABLE public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_settings TO anon, authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settings readable by everyone"
ON public.app_settings FOR SELECT
USING (true);

CREATE TRIGGER trg_app_settings_updated_at
BEFORE UPDATE ON public.app_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.app_settings (key, value) VALUES
  ('admin_tg_id', '5419054691'::jsonb),
  ('community_url', '"https://t.me/AstroBlitzcommunity"'::jsonb),
  ('payment_url', '"https://t.me/AstroBlitzpayment"'::jsonb),
  ('bot_username', '"AstroBlitzbot"'::jsonb),
  ('mini_app_url', '"https://t.me/AstroBlitzbot/play"'::jsonb);

-- =========================
-- notification_log
-- =========================
CREATE TABLE public.notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_id BIGINT NOT NULL,
  kind TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notif_tg_kind_date
  ON public.notification_log(tg_id, kind, created_at DESC);

GRANT SELECT ON public.notification_log TO authenticated;
GRANT ALL ON public.notification_log TO service_role;

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;
-- No policies => locked to service role only.
