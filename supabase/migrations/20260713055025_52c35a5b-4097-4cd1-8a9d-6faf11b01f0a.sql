DROP FUNCTION IF EXISTS public.progress_referral(bigint);

GRANT EXECUTE ON FUNCTION public.progress_referral(bigint,boolean) TO service_role;