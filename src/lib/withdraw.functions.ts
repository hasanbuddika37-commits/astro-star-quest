import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function refreshPrices() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("price_cache").select("*");
  const now = Date.now();
  const fresh = data?.every((r) => now - new Date(r.updated_at).getTime() < 5 * 60 * 1000);
  if (data && data.length >= 2 && fresh) {
    const map = Object.fromEntries(data.map((r) => [r.symbol, Number(r.usd)]));
    return { TON: map.TON ?? 3, USDT: map.USDT ?? 1 };
  }
  // Try CoinGecko first, then fallback to Binance API for TON live price
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=the-open-network,tether&vs_currencies=usd",
    );
    if (res.ok) {
      const j = (await res.json()) as Record<string, { usd: number }>;
      const ton = j["the-open-network"]?.usd;
      const usdt = j["tether"]?.usd ?? 1;
      if (ton && ton > 0) {
        await supabaseAdmin.from("price_cache").upsert([
          { symbol: "TON", usd: ton, updated_at: new Date().toISOString() },
          { symbol: "USDT", usd: usdt, updated_at: new Date().toISOString() },
        ]);
        return { TON: ton, USDT: usdt };
      }
    }
  } catch { /* ignore */ }
  try {
    const r = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=TONUSDT");
    if (r.ok) {
      const j = (await r.json()) as { price: string };
      const ton = Number(j.price);
      if (ton > 0) {
        await supabaseAdmin.from("price_cache").upsert([
          { symbol: "TON", usd: ton, updated_at: new Date().toISOString() },
          { symbol: "USDT", usd: 1, updated_at: new Date().toISOString() },
        ]);
        return { TON: ton, USDT: 1 };
      }
    }
  } catch { /* ignore */ }
  return { TON: 3, USDT: 1 };
}

export const getWithdrawData = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ initData: z.string().min(10) }).parse(d))
  .handler(async ({ data }) => {
    const { requireProfile, getSetting } = await import("./tg-auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { profile } = await requireProfile(data.initData);
    const prices = await refreshPrices();
    const rate = Number(await getSetting("coin_to_usd_rate", 0.0001));
    const minUsd = Number(await getSetting("min_withdraw_usd", 0.05));
    const maxUsd = Number(await getSetting("max_withdraw_usd", 0.15));
    const feePct = Number(await getSetting("withdraw_fee_pct", 5));
    const feeFlatUsd = Number(await getSetting("withdraw_fee_flat_usd", 0.01));
    const minAds = Number(await getSetting("withdraw_min_ads", 20));
    const minRefers = Number(await getSetting("withdraw_min_refers", 0));

    const { data: history } = await supabaseAdmin
      .from("withdrawals").select("*")
      .eq("tg_id", profile.tg_id)
      .order("created_at", { ascending: false }).limit(30);

    const has_pending = (history ?? []).some((w) => w.status === "pending");

    const p = profile as unknown as Record<string, string | null>;
    return {
      coins: Number(profile.coins),
      usd_balance: Number(profile.coins) * rate,
      coin_to_usd_rate: rate,
      min_withdraw_usd: minUsd,
      max_withdraw_usd: maxUsd,
      fee_pct: feePct,
      fee_flat_usd: feeFlatUsd,
      prices,
      wallet_ton: p.wallet_ton ?? "",
      wallet_usdt_bep20: p.wallet_usdt_bep20 ?? "",
      history: history ?? [],
      has_pending,
      requirements: {
        min_ads: minAds, ads_done: Number(profile.ads_watched ?? 0),
        min_refers: minRefers, refers_done: Number(profile.verified_refer_count ?? 0),
        met: Number(profile.ads_watched ?? 0) >= minAds && Number(profile.verified_refer_count ?? 0) >= minRefers,
      },
    };
  });

const WalletSchema = z.object({
  initData: z.string().min(10),
  wallet_ton: z.string().max(128).optional(),
  wallet_usdt_bep20: z.string().max(128).optional(),
});

export const saveWallet = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => WalletSchema.parse(d))
  .handler(async ({ data }) => {
    const { requireProfile } = await import("./tg-auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { profile } = await requireProfile(data.initData);
    const upd: Record<string, string> = {};
    if (data.wallet_ton !== undefined) upd.wallet_ton = data.wallet_ton;
    if (data.wallet_usdt_bep20 !== undefined) upd.wallet_usdt_bep20 = data.wallet_usdt_bep20;
    if (Object.keys(upd).length === 0) return { ok: true };
    const { error } = await supabaseAdmin.from("profiles").update(upd as never).eq("tg_id", profile.tg_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const WithdrawSchema = z.object({
  initData: z.string().min(10),
  currency: z.enum(["TON", "USDT_BEP20"]),
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
    const address = data.currency === "TON" ? p.wallet_ton : p.wallet_usdt_bep20;
    if (!address) throw new Error("Set your wallet address first");

    // Block when a pending request already exists
    const { data: pendings } = await supabaseAdmin
      .from("withdrawals").select("id").eq("tg_id", profile.tg_id).eq("status", "pending").limit(1);
    if (pendings && pendings.length > 0) {
      throw new Error("You already have a pending withdrawal. Wait until it's processed.");
    }

    const rate = Number(await getSetting("coin_to_usd_rate", 0.0001));
    const minUsd = Number(await getSetting("min_withdraw_usd", 0.05));
    const maxUsd = Number(await getSetting("max_withdraw_usd", 0.15));
    const feePct = Number(await getSetting("withdraw_fee_pct", 5));
    const feeFlatUsd = Number(await getSetting("withdraw_fee_flat_usd", 0.01));
    const minAds = Number(await getSetting("withdraw_min_ads", 20));
    const minRefers = Number(await getSetting("withdraw_min_refers", 0));
    if (Number(profile.ads_watched ?? 0) < minAds) {
      throw new Error(`Watch at least ${minAds} ads to unlock withdraw (you have ${profile.ads_watched ?? 0}).`);
    }
    if (Number(profile.verified_refer_count ?? 0) < minRefers) {
      throw new Error(`Refer at least ${minRefers} verified friends to unlock withdraw.`);
    }
    const amount_usd = data.coins * rate;
    if (amount_usd < minUsd) throw new Error(`Min withdraw is $${minUsd}`);
    if (amount_usd > maxUsd) throw new Error(`Max withdraw is $${maxUsd}`);
    const prices = await refreshPrices();
    const px = data.currency === "TON" ? prices.TON : prices.USDT;
    const amount_native = amount_usd / px;
    // Fee = flat $0.01 + 5% of gross
    const fee_usd = feeFlatUsd + amount_usd * (feePct / 100);
    const net_usd = Math.max(0, amount_usd - fee_usd);
    const net_amount = net_usd / px;

    await creditCoins(profile.tg_id, -data.coins, "withdraw", { currency: data.currency });

    const { data: w, error } = await supabaseAdmin
      .from("withdrawals")
      .insert({
        tg_id: profile.tg_id, currency: data.currency, coins: data.coins,
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
          `💎 Currency: <b>${data.currency === "TON" ? "TON" : "USDT (BEP20)"}</b>\n` +
          `🪙 Coins: <b>${Number(data.coins).toLocaleString()}</b>\n` +
          `💵 USD: <b>$${amount_usd.toFixed(4)}</b>\n` +
          `🧾 Fee: <b>$${fee_usd.toFixed(4)}</b> ($${feeFlatUsd} + ${feePct}%)\n` +
          `📤 Net: <b>${net_amount.toFixed(6)} ${data.currency === "TON" ? "TON" : "USDT"}</b>\n` +
          `⏳ Status: <b>Pending</b>\n\n` +
          `We'll notify you when admin approves it! 🎉`,
        reply_markup: { inline_keyboard: [
          [{ text: "🚀 Open AstroBlitz", url: miniApp }],
          [{ text: "💰 Payment Channel", url: payCh }],
        ]},
      });
    } catch (e) { console.error("[withdraw] user notify failed:", e); }

    // Post pending request to payment channel too
    try {
      let payChId = await getSetting<string>("payment_chat_id", "");
      if (!payChId && payCh) payChId = payCh.replace(/^https?:\/\/t\.me\//, "@");
      if (payChId) {
        await sendMessage({
          chat_id: payChId, parse_mode: "HTML",
          text:
            `⏳💸 <b>New withdraw pending</b>\n\n` +
            `👤 ${profile.first_name ?? ""}${profile.username ? ` (@${profile.username})` : ""}\n` +
            `💎 ${data.currency === "TON" ? "TON" : "USDT (BEP20)"} • <b>${net_amount.toFixed(6)}</b>\n` +
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
            `💎 ${data.currency}\n` +
            `📤 <code>${net_amount.toFixed(6)}</code>\n` +
            `📬 <code>${address}</code>`,
        });
      }
    } catch { /* ignore */ }

    return w;
  });
