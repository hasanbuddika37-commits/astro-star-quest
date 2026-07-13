CREATE OR REPLACE FUNCTION public.validate_profile_balance(p_tg_id bigint, p_context text DEFAULT 'activity')
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_balance numeric;
  v_expected numeric;
  v_reason text;
BEGIN
  SELECT coins INTO v_balance
  FROM public.profiles
  WHERE tg_id = p_tg_id;

  IF v_balance IS NULL THEN
    RETURN false;
  END IF;

  SELECT COALESCE(SUM(delta), 0) INTO v_expected
  FROM public.coin_ledger
  WHERE tg_id = p_tg_id;

  IF abs(COALESCE(v_balance, 0) - COALESCE(v_expected, 0)) > 0.0001 THEN
    v_reason := format(
      'Auto-suspended: balance mismatch after %s. Balance=%s, activity ledger=%s',
      COALESCE(p_context, 'activity'),
      COALESCE(v_balance, 0),
      COALESCE(v_expected, 0)
    );

    UPDATE public.profiles
       SET is_suspended = true,
           suspend_reason = v_reason,
           updated_at = now()
     WHERE tg_id = p_tg_id;

    INSERT INTO public.user_actions(tg_id, action, note)
    VALUES (p_tg_id, 'auto_suspend', v_reason);

    RETURN false;
  END IF;

  RETURN true;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.validate_profile_balance(bigint,text) TO service_role;

CREATE OR REPLACE FUNCTION public.credit_coins(p_tg_id bigint, p_delta numeric, p_reason text, p_meta jsonb DEFAULT NULL::jsonb)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_new numeric;
  v_ref bigint;
  v_pct numeric;
  v_comm numeric;
  v_suspended boolean;
BEGIN
  SELECT is_suspended INTO v_suspended FROM public.profiles WHERE tg_id = p_tg_id;
  IF v_suspended THEN
    RAISE EXCEPTION 'Account suspended';
  END IF;

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

  IF NOT public.validate_profile_balance(p_tg_id, p_reason) THEN
    RAISE EXCEPTION 'Balance mismatch detected. Account suspended.';
  END IF;

  -- Referrer commission only on positive credits and earning reasons.
  IF v_ref IS NOT NULL AND p_delta > 0 AND p_reason IN ('ad_watch','game_level','task','challenge') THEN
    SELECT (value)::text::numeric INTO v_pct FROM public.app_settings WHERE key='refer_commission_pct';
    v_comm := round((p_delta * COALESCE(v_pct,5) / 100.0)::numeric, 4);
    IF v_comm > 0 THEN
      UPDATE public.profiles SET coins = coins + v_comm, updated_at = now() WHERE tg_id = v_ref;
      INSERT INTO public.coin_ledger(tg_id, delta, reason, meta)
        VALUES (v_ref, v_comm, 'refer_commission', jsonb_build_object('from', p_tg_id, 'source', p_reason));
      INSERT INTO public.referral_commissions(referrer_tg_id, referee_tg_id, source, amount)
        VALUES (v_ref, p_tg_id, p_reason, v_comm);
      IF NOT public.validate_profile_balance(v_ref, 'refer_commission') THEN
        RAISE EXCEPTION 'Referrer balance mismatch detected. Account suspended.';
      END IF;
    END IF;
  END IF;

  RETURN v_new;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.credit_coins(bigint,numeric,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_adjust_balance(p_tg_id bigint, p_delta numeric, p_admin_id uuid, p_note text)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_new numeric;
BEGIN
  UPDATE public.profiles SET coins = coins + p_delta, updated_at = now()
    WHERE tg_id = p_tg_id RETURNING coins INTO v_new;
  IF v_new IS NULL THEN RAISE EXCEPTION 'profile not found'; END IF;
  INSERT INTO public.coin_ledger(tg_id, delta, reason, meta)
    VALUES(p_tg_id, p_delta, 'admin_adjust', jsonb_build_object('note', p_note, 'admin', p_admin_id));
  INSERT INTO public.user_actions(tg_id, admin_id, action, delta, note)
    VALUES(p_tg_id, p_admin_id, 'balance_adjust', p_delta, p_note);
  IF NOT public.validate_profile_balance(p_tg_id, 'admin_adjust') THEN
    RAISE EXCEPTION 'Balance mismatch detected. Account suspended.';
  END IF;
  RETURN v_new;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_adjust_balance(bigint,numeric,uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.progress_referral(p_referee_tg_id bigint, p_count_ad boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_already boolean;
BEGIN
  SELECT referrer_tg_id, refer_stage, joined_date, day1_ads, day2_ads
    INTO v_ref, v_stage, v_join, v_d1_ads, v_d2_ads
  FROM public.profiles WHERE tg_id = p_referee_tg_id;

  IF v_ref IS NULL THEN RETURN; END IF;

  v_stage := COALESCE(v_stage, 0);
  v_d1_ads := COALESCE(v_d1_ads, 0);
  v_d2_ads := COALESCE(v_d2_ads, 0);

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

  -- Stage 0: instant on join, paid once per referee.
  IF v_stage < 1 THEN
    SELECT EXISTS(
      SELECT 1 FROM public.coin_ledger
      WHERE tg_id = v_ref AND reason = 'refer_stage0' AND meta->>'referee' = p_referee_tg_id::text
    ) INTO v_already;

    IF NOT v_already THEN
      UPDATE public.profiles
         SET coins = coins + v_reward0, updated_at = now()
       WHERE tg_id = v_ref;
      INSERT INTO public.coin_ledger(tg_id, delta, reason, meta)
        VALUES (v_ref, v_reward0, 'refer_stage0', jsonb_build_object('referee', p_referee_tg_id));
      PERFORM public.validate_profile_balance(v_ref, 'refer_stage0');
    END IF;

    UPDATE public.profiles SET refer_stage = 1, updated_at = now() WHERE tg_id = p_referee_tg_id;
    v_stage := 1;
  END IF;

  -- Count only real completed ads, not join/init calls.
  IF p_count_ad THEN
    IF v_today = v_join THEN
      UPDATE public.profiles SET day1_ads = day1_ads + 1, day1_date = v_today, updated_at = now() WHERE tg_id = p_referee_tg_id;
      v_d1_ads := v_d1_ads + 1;
    ELSIF v_today = v_join + 1 THEN
      UPDATE public.profiles SET day2_ads = day2_ads + 1, day2_date = v_today, updated_at = now() WHERE tg_id = p_referee_tg_id;
      v_d2_ads := v_d2_ads + 1;
    END IF;
  END IF;

  -- Stage 1: 10 ads on join day, paid once per referee.
  IF v_stage < 2 AND v_d1_ads >= v_need1 THEN
    SELECT EXISTS(
      SELECT 1 FROM public.coin_ledger
      WHERE tg_id = v_ref AND reason = 'refer_stage1' AND meta->>'referee' = p_referee_tg_id::text
    ) INTO v_already;

    IF NOT v_already THEN
      UPDATE public.profiles
         SET coins = coins + v_reward1,
             verified_refer_count = verified_refer_count + 1,
             updated_at = now()
       WHERE tg_id = v_ref;
      INSERT INTO public.coin_ledger(tg_id, delta, reason, meta)
        VALUES (v_ref, v_reward1, 'refer_stage1', jsonb_build_object('referee', p_referee_tg_id));
      PERFORM public.validate_profile_balance(v_ref, 'refer_stage1');
    END IF;

    UPDATE public.profiles SET refer_stage = 2, updated_at = now() WHERE tg_id = p_referee_tg_id;
    v_stage := 2;
  END IF;

  -- Stage 2: 15 ads on day 2, paid once per referee.
  IF v_stage < 3 AND v_d2_ads >= v_need2 THEN
    SELECT EXISTS(
      SELECT 1 FROM public.coin_ledger
      WHERE tg_id = v_ref AND reason = 'refer_stage2' AND meta->>'referee' = p_referee_tg_id::text
    ) INTO v_already;

    IF NOT v_already THEN
      UPDATE public.profiles
         SET coins = coins + v_reward2, updated_at = now()
       WHERE tg_id = v_ref;
      INSERT INTO public.coin_ledger(tg_id, delta, reason, meta)
        VALUES (v_ref, v_reward2, 'refer_stage2', jsonb_build_object('referee', p_referee_tg_id));
      PERFORM public.validate_profile_balance(v_ref, 'refer_stage2');
    END IF;

    UPDATE public.profiles SET refer_stage = 3, updated_at = now() WHERE tg_id = p_referee_tg_id;
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.progress_referral(bigint,boolean) TO service_role;