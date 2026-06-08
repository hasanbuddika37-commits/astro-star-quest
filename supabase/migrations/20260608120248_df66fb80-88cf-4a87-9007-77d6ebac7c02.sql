
-- =========================================================
-- Helper: shared updated_at trigger fn already exists (set_updated_at)
-- =========================================================

-- COIN LEDGER (audit of every coin movement)
CREATE TABLE public.coin_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_id bigint NOT NULL,
  delta numeric NOT NULL,
  reason text NOT NULL,           -- 'game_level','ad_watch','refer_bonus','refer_commission','withdraw','admin_adjust','task','challenge'
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ledger_tg ON public.coin_ledger(tg_id, created_at DESC);
GRANT ALL ON public.coin_ledger TO service_role;
ALTER TABLE public.coin_ledger ENABLE ROW LEVEL SECURITY;

-- GAME PLAYS
CREATE TABLE public.game_plays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_id bigint NOT NULL,
  level_reached integer NOT NULL,
  coins_earned numeric NOT NULL,
  revived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_game_plays_tg ON public.game_plays(tg_id, created_at DESC);
GRANT ALL ON public.game_plays TO service_role;
ALTER TABLE public.game_plays ENABLE ROW LEVEL SECURITY;

-- AD VIEWS (cooldown + count)
CREATE TABLE public.ad_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_id bigint NOT NULL,
  slot text NOT NULL,             -- 'watch1','watch2','watch3','revive','task','daily'
  network text,                   -- chosen ad network at view time
  reward numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ad_views_tg_slot ON public.ad_views(tg_id, slot, created_at DESC);
GRANT ALL ON public.ad_views TO service_role;
ALTER TABLE public.ad_views ENABLE ROW LEVEL SECURITY;

-- REFERRAL COMMISSIONS (lifetime 10%)
CREATE TABLE public.referral_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_tg_id bigint NOT NULL,
  referee_tg_id bigint NOT NULL,
  source text NOT NULL,           -- 'ad','game','task','challenge'
  amount numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rc_referrer ON public.referral_commissions(referrer_tg_id, created_at DESC);
GRANT ALL ON public.referral_commissions TO service_role;
ALTER TABLE public.referral_commissions ENABLE ROW LEVEL SECURITY;

-- TASKS (admin-managed)
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  reward numeric NOT NULL DEFAULT 0,
  url text,
  kind text NOT NULL DEFAULT 'link',  -- 'link','join_channel','watch_ad'
  target text,                         -- e.g. channel @handle
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
GRANT ALL ON public.tasks TO service_role;
GRANT SELECT ON public.tasks TO anon, authenticated;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tasks readable" ON public.tasks FOR SELECT USING (is_active);

CREATE TABLE public.task_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_id bigint NOT NULL,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tg_id, task_id)
);
GRANT ALL ON public.task_completions TO service_role;
ALTER TABLE public.task_completions ENABLE ROW LEVEL SECURITY;

-- CHALLENGES (daily/weekly goals)
CREATE TABLE public.challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  kind text NOT NULL,                  -- 'ads','game_level','refers'
  goal integer NOT NULL,
  reward numeric NOT NULL,
  period text NOT NULL DEFAULT 'daily',-- 'daily','weekly'
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_ch_updated BEFORE UPDATE ON public.challenges
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
GRANT ALL ON public.challenges TO service_role;
GRANT SELECT ON public.challenges TO anon, authenticated;
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "challenges readable" ON public.challenges FOR SELECT USING (is_active);

CREATE TABLE public.challenge_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_id bigint NOT NULL,
  challenge_id uuid NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  period_key text NOT NULL,            -- e.g. '2026-06-08' or '2026-W23'
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tg_id, challenge_id, period_key)
);
GRANT ALL ON public.challenge_claims TO service_role;
ALTER TABLE public.challenge_claims ENABLE ROW LEVEL SECURITY;

-- WITHDRAWALS
CREATE TABLE public.withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_id bigint NOT NULL,
  currency text NOT NULL,              -- 'TON','USDT_APTOS'
  coins numeric NOT NULL,              -- coins debited
  amount_usd numeric NOT NULL,
  amount_native numeric NOT NULL,      -- amount in TON or USDT
  fee_pct numeric NOT NULL DEFAULT 0,
  net_amount numeric NOT NULL,         -- after fee, what user receives
  address text NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- 'pending','approved','rejected','failed'
  tx_id text,
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX idx_w_tg ON public.withdrawals(tg_id, created_at DESC);
CREATE INDEX idx_w_status ON public.withdrawals(status, created_at DESC);
GRANT ALL ON public.withdrawals TO service_role;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;

-- SUPPORT TICKETS
CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_id bigint NOT NULL,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'open', -- 'open','answered','closed'
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_st_updated BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
GRANT ALL ON public.support_tickets TO service_role;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author text NOT NULL,                -- 'user' or 'admin'
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tm_ticket ON public.ticket_messages(ticket_id, created_at);
GRANT ALL ON public.ticket_messages TO service_role;
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;

-- BROADCASTS
CREATE TABLE public.broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message text NOT NULL,
  image_url text,
  button_text text,
  button_url text,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'queued', -- 'queued','sending','done','failed'
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
GRANT ALL ON public.broadcasts TO service_role;
ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;

-- ADMIN USERS (separate from telegram)
CREATE TABLE public.admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  is_super boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.admin_users TO service_role;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.admin_sessions (
  token text PRIMARY KEY,
  admin_id uuid NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
GRANT ALL ON public.admin_sessions TO service_role;
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;

-- PRICE CACHE
CREATE TABLE public.price_cache (
  symbol text PRIMARY KEY,             -- 'TON','USDT'
  usd numeric NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.price_cache TO service_role;
GRANT SELECT ON public.price_cache TO anon, authenticated;
ALTER TABLE public.price_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prices readable" ON public.price_cache FOR SELECT USING (true);

-- DEFAULT APP SETTINGS (idempotent)
INSERT INTO public.app_settings(key,value) VALUES
  ('coin_to_usd_rate', '0.0001'::jsonb),
  ('min_withdraw_usd', '0.5'::jsonb),
  ('withdraw_fee_pct', '5'::jsonb),
  ('refer_reward_coins', '500'::jsonb),
  ('refer_verify_ads', '10'::jsonb),
  ('refer_commission_pct', '10'::jsonb),
  ('game_min_per_level', '5'::jsonb),
  ('game_max_per_level', '20'::jsonb),
  ('game_revive_ad_enabled', 'true'::jsonb),
  ('ad_cooldown_seconds', '43200'::jsonb),
  ('ad_reward_coins', '50'::jsonb),
  ('ad_timer_seconds', '[17,33,25]'::jsonb),
  ('ad_networks', '{"placeholder":true,"monetag":false,"adsgram":false,"onclicka":false}'::jsonb),
  ('community_url', '"https://t.me/AstroBlitzCommunity"'::jsonb),
  ('payment_channel_url', '"https://t.me/AstroBlitzPayments"'::jsonb),
  ('bot_username', '"AstroBlitzbot"'::jsonb),
  ('mini_app_url', '"https://t.me/AstroBlitzbot/play"'::jsonb),
  ('daily_reminder_message', '"🚀 Your AstroBlitz rewards are waiting! Open the app and claim today''s coins."'::jsonb),
  ('welcome_photo_url', 'null'::jsonb),
  ('broadcast_cron_secret', '"change_me"'::jsonb)
ON CONFLICT (key) DO NOTHING;
