
-- 1. Profile columns for 3-stage refer tracking
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS refer_stage int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS day1_ads int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS day2_ads int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS day1_date date,
  ADD COLUMN IF NOT EXISTS day2_date date,
  ADD COLUMN IF NOT EXISTS joined_date date;

-- Backfill joined_date for existing users
UPDATE public.profiles SET joined_date = created_at::date WHERE joined_date IS NULL;

-- 2. App settings (upsert)
INSERT INTO public.app_settings(key,value) VALUES
  ('refer_stage0_coins', to_jsonb(25)),
  ('refer_stage1_coins', to_jsonb(50)),
  ('refer_stage1_ads',   to_jsonb(10)),
  ('refer_stage2_coins', to_jsonb(75)),
  ('refer_stage2_ads',   to_jsonb(15)),
  ('ad_reward_min',      to_jsonb(3)),
  ('ad_reward_max',      to_jsonb(5)),
  ('withdraw_min_ads_daily', to_jsonb(20)),
  ('withdraw_min_refers',    to_jsonb(2)),
  ('withdraw_require_main_tasks', to_jsonb(true))
ON CONFLICT (key) DO NOTHING;

-- 3. Enforce USDT_BEP20-only on new withdrawals (existing rows untouched)
CREATE OR REPLACE FUNCTION public.enforce_usdt_only_withdraw()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.currency <> 'USDT_BEP20' THEN
    RAISE EXCEPTION 'Only USDT_BEP20 withdrawals are supported';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_usdt_only ON public.withdrawals;
CREATE TRIGGER trg_enforce_usdt_only
BEFORE INSERT ON public.withdrawals
FOR EACH ROW EXECUTE FUNCTION public.enforce_usdt_only_withdraw();

-- 4. 3-stage referral progress. Called by auth (on join) and after each ad watch.
CREATE OR REPLACE FUNCTION public.progress_referral(p_referee_tg_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref bigint;
  v_stage int;
  v_join date;
  v_today date := current_date;
  v_d1_ads int;
  v_d2_ads int;
  v_need1 int;
  v_need2 int;
  v_reward0 numeric;
  v_reward1 numeric;
  v_reward2 numeric;
BEGIN
  SELECT referrer_tg_id, refer_stage, joined_date, day1_ads, day2_ads
    INTO v_ref, v_stage, v_join, v_d1_ads, v_d2_ads
  FROM public.profiles WHERE tg_id = p_referee_tg_id;

  IF v_ref IS NULL THEN RETURN; END IF;
  IF v_join IS NULL THEN
    v_join := v_today;
    UPDATE public.profiles SET joined_date = v_today WHERE tg_id = p_referee_tg_id;
  END IF;

  SELECT (value)::text::numeric::int INTO v_need1 FROM public.app_settings WHERE key='refer_stage1_ads';
  SELECT (value)::text::numeric::int INTO v_need2 FROM public.app_settings WHERE key='refer_stage2_ads';
  SELECT (value)::text::numeric INTO v_reward0 FROM public.app_settings WHERE key='refer_stage0_coins';
  SELECT (value)::text::numeric INTO v_reward1 FROM public.app_settings WHERE key='refer_stage1_coins';
  SELECT (value)::text::numeric INTO v_reward2 FROM public.app_settings WHERE key='refer_stage2_coins';
  v_need1 := COALESCE(v_need1, 10);
  v_need2 := COALESCE(v_need2, 15);
  v_reward0 := COALESCE(v_reward0, 25);
  v_reward1 := COALESCE(v_reward1, 50);
  v_reward2 := COALESCE(v_reward2, 75);

  -- Stage 0: instant on join
  IF v_stage < 1 THEN
    UPDATE public.profiles
       SET coins = coins + v_reward0, refer_stage = 1, updated_at = now()
     WHERE tg_id = v_ref;
    INSERT INTO public.coin_ledger(tg_id, delta, reason, meta)
      VALUES (v_ref, v_reward0, 'refer_stage0', jsonb_build_object('referee', p_referee_tg_id));
    v_stage := 1;
  END IF;

  -- Track day-1 / day-2 ad counters based on join date
  IF v_today = v_join THEN
    UPDATE public.profiles SET day1_ads = day1_ads + 1, day1_date = v_today WHERE tg_id = p_referee_tg_id;
    v_d1_ads := COALESCE(v_d1_ads,0) + 1;
  ELSIF v_today = v_join + 1 THEN
    UPDATE public.profiles SET day2_ads = day2_ads + 1, day2_date = v_today WHERE tg_id = p_referee_tg_id;
    v_d2_ads := COALESCE(v_d2_ads,0) + 1;
  END IF;

  -- Stage 1: 10 ads on join day
  IF v_stage < 2 AND v_d1_ads >= v_need1 THEN
    UPDATE public.profiles
       SET coins = coins + v_reward1, refer_stage = 2,
           verified_refer_count = verified_refer_count + 1, updated_at = now()
     WHERE tg_id = v_ref;
    INSERT INTO public.coin_ledger(tg_id, delta, reason, meta)
      VALUES (v_ref, v_reward1, 'refer_stage1', jsonb_build_object('referee', p_referee_tg_id));
    UPDATE public.profiles SET refer_stage = 2 WHERE tg_id = p_referee_tg_id;
    v_stage := 2;
  END IF;

  -- Stage 2: 15 ads on day-2
  IF v_stage < 3 AND v_d2_ads >= v_need2 THEN
    UPDATE public.profiles
       SET coins = coins + v_reward2, refer_stage = 3, updated_at = now()
     WHERE tg_id = v_ref;
    INSERT INTO public.coin_ledger(tg_id, delta, reason, meta)
      VALUES (v_ref, v_reward2, 'refer_stage2', jsonb_build_object('referee', p_referee_tg_id));
    UPDATE public.profiles SET refer_stage = 3 WHERE tg_id = p_referee_tg_id;
  END IF;
END;
$$;
