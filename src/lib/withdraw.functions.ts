import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function refreshUsdtPrice() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("price_cache").select("*").eq("symbol", "USDT").maybeSingle();
  const fresh = data && Date.now() - new Date(data.updated_at).getTime() < 5 * 60 * 1000;
  if (data && fresh) return { USDT: Number(data.usd) || 1 };
  await supabaseAdmin.from("price_cache").upsert([
    { symbol: "USDT", usd: 1, updated_at: new Date().toISOString() },
  ]);
  return { USDT: 1 };
}

async function todayAdCount(tgId: number): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const start = new Date(); start.setHours(0, 0, 0, 0);
  // Only count "watch ads" (per-button card claims). Slot pattern: card_<network>
  const { count } = await supabaseAdmin
    .from("ad_views")
    .select("id", { count: "exact", head: true })
    .eq("tg_id", tgId)
    .gte("created_at", start.toISOString())
    .like("slot", "card_%");
  return count ?? 0;
}

async function unfinishedMainTasks(tgId: number): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: tasks } = await supabaseAdmin
    .from("tasks").select("id").eq("is_active", true).eq("task_type", "main");
  const ids = (tasks ?? []).map((t) => t.id);
  if (ids.length === 0) return 0;
  const { data: done } = await supabaseAdmin
    .from("task_completions").select("task_id").eq("tg_id", tgId).in("task_id", ids);
  return ids.length - (done?.length ?? 0);
}

export const getWithdrawData = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ initData: z.string().min(10) }).parse(d))
  .handler(async ({ data }) => {
    const { requireProfile, getSetting } = await import("./tg-auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { profile } = await requireProfile(data.initData);
    const prices = await refreshUsdtPrice();
    const rate = Number(await getSetting("coin_to_usd_rate", 0.0001));
    const minUsd = Number(await getSetting("min_withdraw_usd", 0.05));
    const maxUsd = Number(await getSetting("max_withdraw_usd", 0.15));
    const feePct = Number(await getSetting("withdraw_fee_pct", 5));
    const feeFlatUsd = Number(await getSetting("withdraw_fee_flat_usd", 0.01));
    const minAdsDaily = Number(await getSetting("withdraw_min_ads_daily", 20));
    const minRefers = Number(await getSetting("withdraw_min_refers", 2));
    const minGameLevel = Number(await getSetting("withdraw_min_game_level", 5));
    const requireMain = Boolean(await getSetting("withdraw_require_main_tasks", true));

    const [{ data: history }, ads_today, main_pending] = await Promise.all([
      supabaseAdmin
        .from("withdrawals").select("*")
        .eq("tg_id", profile.tg_id)
        .order("created_at", { ascending: false }).limit(30),
      todayAdCount(profile.tg_id),
      requireMain ? unfinishedMainTasks(profile.tg_id) : Promise.resolve(0),
    ]);

    const has_pending = (history ?? []).some((w) => w.status === "pending");
    const p = profile as unknown as Record<string, string | null>;
    const met =
      ads_today >= minAdsDaily &&
      Number(profile.verified_refer_count ?? 0) >= minRefers &&
      (!requireMain || main_pending === 0);

    return {
      coins: Number(profile.coins),
      usd_balance: Number(profile.coins) * rate,
      coin_to_usd_rate: rate,
      min_withdraw_usd: minUsd,
      max_withdraw_usd: maxUsd,
      fee_pct: feePct,
      fee_flat_usd: feeFlatUsd,
      prices,
      wallet_usdt_bep20: p.wallet_usdt_bep20 ?? "",
      history: history ?? [],
      has_pending,
      requirements: {
        min_ads_daily: minAdsDaily, ads_done_today: ads_today,
        min_refers: minRefers, refers_done: Number(profile.verified_refer_count ?? 0),
        require_main_tasks: requireMain, main_tasks_pending: main_pending,
        met,
      },
    };
  });

const WalletSchema = z.object({
  initData: z.string().min(10),
  wallet_usdt_bep20: z.string().min(1).max(128),
});

export const saveWallet = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => WalletSchema.parse(d))
  .handler(async ({ data }) => {
    const { requireProfile } = await import("./tg-auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { profile } = await requireProfile(data.initData);
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ wallet_usdt_bep20: data.wallet_usdt_bep20 } as never)
      .eq("tg_id", profile.tg_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const WithdrawSchema = z.object({
  initData: z.string().min(10),
  coins: z.number().positive(),
});

export const requestWithdraw = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => WithdrawSchema.parse(d))
  .handler(async ({ data }) => {
    const { requireProfile, getSetting, creditCoins } = await import("./tg-auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendMessage } = await import("./telegram.server");
    const { profile } = await requireProfile(data.initData);

    if (Number(profile.coins) < data.coins) throw new Error("Insufficient balance");
    const p = profile as unknown as Record<string, string | null>;
    const address = p.wallet_usdt_bep20;
    if (!address) throw new Error("Set your USDT (BEP20) wallet address first");

    const { data: pendings } = await supabaseAdmin
      .from("withdrawals").select("id").eq("tg_id", profile.tg_id).eq("status", "pending").limit(1);
    if (pendings && pendings.length > 0) {
      throw new Error("⏳ Pending withdrawal exists. Wait until it's approved or rejected.");
    }

    const rate = Number(await getSetting("coin_to_usd_rate", 0.0001));
    const minUsd = Number(await getSetting("min_withdraw_usd", 0.05));
    const maxUsd = Number(await getSetting("max_withdraw_usd", 0.15));
    const feePct = Number(await getSetting("withdraw_fee_pct", 5));
    const feeFlatUsd = Number(await getSetting("withdraw_fee_flat_usd", 0.01));
    const minAdsDaily = Number(await getSetting("withdraw_min_ads_daily", 20));
    const minRefers = Number(await getSetting("withdraw_min_refers", 2));
    const requireMain = Boolean(await getSetting("withdraw_require_main_tasks", true));

    const adsToday = await todayAdCount(profile.tg_id);
    if (adsToday < minAdsDaily) {
      throw new Error(`Watch at least ${minAdsDaily} ads today first (${adsToday}/${minAdsDaily}).`);
    }
    if (Number(profile.verified_refer_count ?? 0) < minRefers) {
      throw new Error(`Refer at least ${minRefers} verified friends first.`);
    }
    if (requireMain) {
      const pend = await unfinishedMainTasks(profile.tg_id);
      if (pend > 0) throw new Error(`Complete all ${pend} pending main tasks first.`);
    }

    const amount_usd = data.coins * rate;
    if (amount_usd < minUsd) throw new Error(`Min withdraw is $${minUsd}`);
    if (amount_usd > maxUsd) throw new Error(`Max withdraw is $${maxUsd}`);
    const px = 1; // USDT
    const amount_native = amount_usd / px;
    const fee_usd = feeFlatUsd + amount_usd * (feePct / 100);
    const net_usd = Math.max(0, amount_usd - fee_usd);
    const net_amount = net_usd / px;

    await creditCoins(profile.tg_id, -data.coins, "withdraw", { currency: "USDT_BEP20" });

    const { data: w, error } = await supabaseAdmin
      .from("withdrawals")
      .insert({
        tg_id: profile.tg_id, currency: "USDT_BEP20", coins: data.coins,
        amount_usd, amount_native, fee_pct: feePct, net_amount, address,
      })
      .select("*").single();
    if (error || !w) throw new Error(error?.message ?? "Failed");

    const miniApp = await getSetting<string>("mini_app_url", "https://t.me/AstroBlitzbot/play");
    const payCh = await getSetting<string>("payment_channel_url", "https://t.me/AstroBlitzpayment");

    try {
      await sendMessage({
        chat_id: profile.tg_id, parse_mode: "HTML",
        text:
          `💸✨ <b>Withdraw request submitted</b> 🚀\n\n` +
          `💵 Currency: <b>USDT (BEP20)</b>\n` +
          `🪙 Coins: <b>${Number(data.coins).toLocaleString()}</b>\n` +
          `💵 USD: <b>$${amount_usd.toFixed(4)}</b>\n` +
          `🧾 Fee: <b>$${fee_usd.toFixed(4)}</b> ($${feeFlatUsd} + ${feePct}%)\n` +
          `📤 Net: <b>${net_amount.toFixed(6)} USDT</b>\n` +
          `⏳ Status: <b>Pending</b>\n\n` +
          `We'll notify you when admin approves it! 🎉`,
        reply_markup: { inline_keyboard: [
          [{ text: "🚀 Open AstroBlitz", url: miniApp }],
          [{ text: "💰 Payment Channel", url: payCh }],
        ]},
      });
    } catch (e) { console.error("[withdraw] user notify failed:", e); }

    try {
      let payChId = await getSetting<string>("payment_chat_id", "");
      if (!payChId && payCh) payChId = payCh.replace(/^https?:\/\/t\.me\//, "@");
      if (payChId) {
        await sendMessage({
          chat_id: payChId, parse_mode: "HTML",
          text:
            `⏳💸 <b>New withdraw pending</b>\n\n` +
            `👤 ${profile.first_name ?? ""}${profile.username ? ` (@${profile.username})` : ""}\n` +
            `💵 USDT (BEP20) • <b>${net_amount.toFixed(6)}</b>\n` +
            `💵 $${amount_usd.toFixed(4)}`,
          reply_markup: { inline_keyboard: [[{ text: "🚀 Open AstroBlitz", url: miniApp }]] },
        });
      }
    } catch (e) { console.error("[withdraw] payment channel post failed:", e); }

    try {
      const adminId = await getSetting<number | string | null>("admin_tg_id", null);
      if (adminId) {
        await sendMessage({
          chat_id: adminId, parse_mode: "HTML",
          text:
            `💸 <b>New withdraw request</b> 🔔\n\n` +
            `👤 <code>${profile.tg_id}</code> ${profile.username ? "@" + profile.username : ""}\n` +
            `🪙 ${data.coins} ($${amount_usd.toFixed(4)})\n` +
            `💵 USDT (BEP20)\n` +
            `📤 <code>${net_amount.toFixed(6)}</code>\n` +
            `📬 <code>${address}</code>`,
        });
      }
    } catch { /* ignore */ }

    return w;
  });
