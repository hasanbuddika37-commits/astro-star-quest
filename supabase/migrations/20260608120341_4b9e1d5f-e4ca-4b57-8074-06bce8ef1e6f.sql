
CREATE OR REPLACE FUNCTION public.credit_coins(
  p_tg_id bigint,
  p_delta numeric,
  p_reason text,
  p_meta jsonb DEFAULT NULL
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new numeric;
  v_ref bigint;
  v_pct numeric;
  v_comm numeric;
BEGIN
  UPDATE public.profiles
     SET coins = coins + p_delta,
         updated_at = now()
   WHERE tg_id = p_tg_id
  RETURNING coins, referrer_tg_id INTO v_new, v_ref;

  IF v_new IS NULL THEN
    RAISE EXCEPTION 'profile not found: %', p_tg_id;
  END IF;

  INSERT INTO public.coin_ledger(tg_id, delta, reason, meta)
  VALUES (p_tg_id, p_delta, p_reason, p_meta);

  -- Referrer commission only on positive credits and earning reasons
  IF v_ref IS NOT NULL AND p_delta > 0 AND p_reason IN ('ad_watch','game_level','task','challenge') THEN
    SELECT (value)::text::numeric INTO v_pct FROM public.app_settings WHERE key='refer_commission_pct';
    v_comm := round((p_delta * COALESCE(v_pct,10) / 100.0)::numeric, 4);
    IF v_comm > 0 THEN
      UPDATE public.profiles SET coins = coins + v_comm, updated_at = now() WHERE tg_id = v_ref;
      INSERT INTO public.coin_ledger(tg_id, delta, reason, meta)
        VALUES (v_ref, v_comm, 'refer_commission', jsonb_build_object('from', p_tg_id, 'source', p_reason));
      INSERT INTO public.referral_commissions(referrer_tg_id, referee_tg_id, source, amount)
        VALUES (v_ref, p_tg_id, p_reason, v_comm);
    END IF;
  END IF;

  RETURN v_new;
END;
$$;

GRANT EXECUTE ON FUNCTION public.credit_coins(bigint,numeric,text,jsonb) TO service_role;

-- Mark a referrer as verified when referee crosses the ad threshold
CREATE OR REPLACE FUNCTION public.maybe_verify_referral(p_referee_tg_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref bigint;
  v_ads integer;
  v_need integer;
  v_reward numeric;
  v_already boolean;
BEGIN
  SELECT referrer_tg_id, ads_watched INTO v_ref, v_ads
  FROM public.profiles WHERE tg_id = p_referee_tg_id;
  IF v_ref IS NULL THEN RETURN; END IF;

  SELECT (value)::text::numeric::int INTO v_need FROM public.app_settings WHERE key='refer_verify_ads';
  IF v_ads < COALESCE(v_need,10) THEN RETURN; END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.coin_ledger
    WHERE tg_id = v_ref AND reason='refer_bonus' AND meta->>'referee' = p_referee_tg_id::text
  ) INTO v_already;
  IF v_already THEN RETURN; END IF;

  SELECT (value)::text::numeric INTO v_reward FROM public.app_settings WHERE key='refer_reward_coins';
  UPDATE public.profiles
     SET coins = coins + COALESCE(v_reward,500),
         verified_refer_count = verified_refer_count + 1,
         updated_at = now()
   WHERE tg_id = v_ref;
  INSERT INTO public.coin_ledger(tg_id, delta, reason, meta)
    VALUES (v_ref, COALESCE(v_reward,500), 'refer_bonus', jsonb_build_object('referee', p_referee_tg_id));
END;
$$;
GRANT EXECUTE ON FUNCTION public.maybe_verify_referral(bigint) TO service_role;

-- Seed admin user (password: Aabbcc.123) using scrypt-ready bcrypt-style not available; store sha256+salt as fallback
-- We'll instead store a marker that the app code will rehash on first login.
INSERT INTO public.admin_users(email, password_hash)
  VALUES ('athapaththubuddika1@gmail.com', 'BOOTSTRAP:Aabbcc.123')
ON CONFLICT (email) DO NOTHING;
