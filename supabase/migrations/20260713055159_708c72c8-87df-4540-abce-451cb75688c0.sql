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

  PERFORM public.validate_profile_balance(p_tg_id, p_reason);

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
      PERFORM public.validate_profile_balance(v_ref, 'refer_commission');
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
  PERFORM public.validate_profile_balance(p_tg_id, 'admin_adjust');
  RETURN v_new;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_adjust_balance(bigint,numeric,uuid,text) TO service_role;