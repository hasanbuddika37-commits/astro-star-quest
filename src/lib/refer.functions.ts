import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getReferStats = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ initData: z.string().min(10) }).parse(d))
  .handler(async ({ data }) => {
    const { requireProfile, getSetting } = await import("./tg-auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { profile } = await requireProfile(data.initData);

    const bot = (await getSetting("bot_username", "AstroBlitzbot")) as string;
    const r0 = Number(await getSetting("refer_stage0_coins", 25));
    const r1 = Number(await getSetting("refer_stage1_coins", 50));
    const r2 = Number(await getSetting("refer_stage2_coins", 75));
    const n1 = Number(await getSetting("refer_stage1_ads", 10));
    const n2 = Number(await getSetting("refer_stage2_ads", 15));
    const pct = Number(await getSetting("refer_commission_pct", 5));

    const { count: total } = await supabaseAdmin
      .from("profiles")
      .select("tg_id", { count: "exact", head: true })
      .eq("referrer_tg_id", profile.tg_id);

    const { data: comm } = await supabaseAdmin
      .from("referral_commissions")
      .select("amount")
      .eq("referrer_tg_id", profile.tg_id);
    const earned_commission = (comm ?? []).reduce((a, r) => a + Number(r.amount), 0);

    const { data: list } = await supabaseAdmin
      .from("profiles")
      .select("tg_id, first_name, username, ads_watched, day1_ads, day2_ads, refer_stage, created_at")
      .eq("referrer_tg_id", profile.tg_id)
      .order("created_at", { ascending: false })
      .limit(50);

    return {
      refer_code: profile.refer_code,
      share_url: `https://t.me/${bot}/play?startapp=${profile.refer_code}`,
      total_refers: total ?? 0,
      verified_refers: profile.verified_refer_count ?? 0,
      stages: { r0, r1, r2, n1, n2 },
      commission_pct: pct,
      earned_commission,
      list: list ?? [],
    };
  });
