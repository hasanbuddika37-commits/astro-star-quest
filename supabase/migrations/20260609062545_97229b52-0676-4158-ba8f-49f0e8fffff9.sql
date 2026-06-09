
-- ad_blocks: per-network ad cards configuration
CREATE TABLE IF NOT EXISTS public.ad_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network text NOT NULL UNIQUE,
  label text NOT NULL,
  logo_url text,
  buttons_count integer NOT NULL DEFAULT 10,
  reward_min numeric NOT NULL DEFAULT 5,
  reward_max numeric NOT NULL DEFAULT 10,
  cooldown_seconds integer NOT NULL DEFAULT 43200,
  button_lock_seconds integer NOT NULL DEFAULT 5,
  is_enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  zone_id text,
  sdk_extra jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_blocks TO authenticated;
GRANT ALL ON public.ad_blocks TO service_role;
GRANT SELECT ON public.ad_blocks TO anon;
ALTER TABLE public.ad_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ad_blocks readable" ON public.ad_blocks FOR SELECT USING (true);
CREATE TRIGGER trg_ad_blocks_upd BEFORE UPDATE ON public.ad_blocks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ad_button_views: per-button cooldown tracking
CREATE TABLE IF NOT EXISTS public.ad_button_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_id bigint NOT NULL,
  network text NOT NULL,
  button_index integer NOT NULL,
  reward numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_abv_user ON public.ad_button_views(tg_id, network, button_index, created_at DESC);
GRANT SELECT, INSERT ON public.ad_button_views TO authenticated;
GRANT ALL ON public.ad_button_views TO service_role;
ALTER TABLE public.ad_button_views ENABLE ROW LEVEL SECURITY;

-- user_actions: admin audit
CREATE TABLE IF NOT EXISTS public.user_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_id bigint NOT NULL,
  admin_id uuid,
  action text NOT NULL,
  delta numeric,
  note text,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_useractions_tg ON public.user_actions(tg_id, created_at DESC);
GRANT SELECT, INSERT ON public.user_actions TO authenticated;
GRANT ALL ON public.user_actions TO service_role;
ALTER TABLE public.user_actions ENABLE ROW LEVEL SECURITY;

-- task enhancements
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS task_type text NOT NULL DEFAULT 'main';
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS channel_username text;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS verify_via_join boolean NOT NULL DEFAULT false;

-- profile additions
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS best_score integer NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS refer_bonus_paid boolean NOT NULL DEFAULT false;

-- withdrawals: add cap-related columns already there. Add column for explicit rejection_reason already in admin_note. ok.

-- Update settings defaults
INSERT INTO public.app_settings(key, value) VALUES
  ('game_min_per_level', '1'::jsonb),
  ('game_max_per_level', '2'::jsonb),
  ('max_withdraw_usd', '0.15'::jsonb),
  ('refer_reward_coins', '150'::jsonb),
  ('refer_instant_coins', '50'::jsonb),
  ('refer_milestone_coins', '100'::jsonb),
  ('refer_verify_ads', '10'::jsonb),
  ('refer_milestone_game_levels', '5'::jsonb),
  ('community_chat_id', '"@AstroBlitzcommunity"'::jsonb),
  ('payment_chat_id', '"@AstroBlitzPayments"'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Seed default ad_blocks
INSERT INTO public.ad_blocks(network, label, buttons_count, reward_min, reward_max, cooldown_seconds, button_lock_seconds, is_enabled, sort_order, zone_id, sdk_extra) VALUES
  ('adsgram', 'AdsGram AI', 10, 10, 15, 43200, 5, true, 1, 'int-34544', '{"blocks":["int-34544","int-34543"]}'::jsonb),
  ('monetag', 'Monetag', 10, 5, 10, 43200, 5, true, 2, '11115938', '{"src":"//libtl.com/sdk.js","showFn":"show_11115938"}'::jsonb),
  ('gigapub', 'GigaPub', 10, 7, 10, 43200, 5, true, 3, '6929', '{"src":"https://ad.gigapub.tech/script?id=6929","showFn":"showGiga"}'::jsonb)
ON CONFLICT (network) DO UPDATE SET
  label=EXCLUDED.label, buttons_count=EXCLUDED.buttons_count,
  reward_min=EXCLUDED.reward_min, reward_max=EXCLUDED.reward_max,
  zone_id=EXCLUDED.zone_id, sdk_extra=EXCLUDED.sdk_extra;

-- Seed challenges (replace existing seeded set)
DELETE FROM public.challenges WHERE TRUE;
INSERT INTO public.challenges(title, description, kind, goal, reward, period, is_active) VALUES
  ('Play 10 games', 'Complete 10 game runs today', 'game_plays', 10, 5, 'daily', true),
  ('Reach level 25', 'Reach game level 25', 'game_level', 25, 10, 'daily', true),
  ('Reach level 50', 'Reach game level 50', 'game_level', 50, 25, 'weekly', true),
  ('Reach level 100', 'Reach game level 100', 'game_level', 100, 50, 'weekly', true),
  ('Reach level 200', 'Reach game level 200', 'game_level', 200, 150, 'weekly', true),
  ('Reach level 300', 'Reach game level 300', 'game_level', 300, 500, 'weekly', true),
  ('Reach level 500', 'Reach game level 500', 'game_level', 500, 750, 'weekly', true),
  ('Reach level 1000', 'Reach game level 1000', 'game_level', 1000, 2000, 'weekly', true),
  ('Watch 10 ads', 'Watch 10 ads today', 'ads', 10, 5, 'daily', true),
  ('Watch 30 ads', 'Watch 30 ads today', 'ads', 30, 15, 'daily', true),
  ('Watch 50 ads', 'Watch 50 ads today', 'ads', 50, 25, 'daily', true),
  ('Watch 100 ads', 'Watch 100 ads', 'ads', 100, 50, 'weekly', true),
  ('5 verified refers', 'Invite 5 verified friends', 'refers', 5, 10, 'weekly', true),
  ('10 verified refers', 'Invite 10 verified friends', 'refers', 10, 50, 'weekly', true),
  ('25 verified refers', 'Invite 25 verified friends', 'refers', 25, 150, 'weekly', true),
  ('50 verified refers', 'Invite 50 verified friends', 'refers', 50, 400, 'weekly', true),
  ('100 verified refers', 'Invite 100 verified friends', 'refers', 100, 1000, 'weekly', true);

-- Extend credit_coins to support 'game_plays' challenge kind via game_plays table count; nothing to change, kind already free-form.

-- Helper RPC: balance adjustment from admin
CREATE OR REPLACE FUNCTION public.admin_adjust_balance(
  p_tg_id bigint, p_delta numeric, p_admin_id uuid, p_note text
) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_new numeric;
BEGIN
  UPDATE public.profiles SET coins = coins + p_delta, updated_at = now()
    WHERE tg_id = p_tg_id RETURNING coins INTO v_new;
  IF v_new IS NULL THEN RAISE EXCEPTION 'profile not found'; END IF;
  INSERT INTO public.coin_ledger(tg_id, delta, reason, meta)
    VALUES(p_tg_id, p_delta, 'admin_adjust', jsonb_build_object('note', p_note, 'admin', p_admin_id));
  INSERT INTO public.user_actions(tg_id, admin_id, action, delta, note)
    VALUES(p_tg_id, p_admin_id, 'balance_adjust', p_delta, p_note);
  RETURN v_new;
END $$;
