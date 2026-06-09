import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function refreshPrices() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Cache 5 min
  const { data } = await supabaseAdmin.from("price_cache").select("*");
  const now = Date.now();
  const fresh = data?.every((r) => now - new Date(r.updated_at).getTime() < 5 * 60 * 1000);
  if (data && data.length >= 2 && fresh) {
    const map = Object.fromEntries(data.map((r) => [r.symbol, Number(r.usd)]));
    return { TON: map.TON ?? 5, USDT: map.USDT ?? 1 };
  }
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=the-open-network,tether&vs_currencies=usd",
    );
    const j = (await res.json()) as Record<string, { usd: number }>;
    const ton = j["the-open-network"]?.usd ?? 5;
    const usdt = j["tether"]?.usd ?? 1;
    await supabaseAdmin.from("price_cache").upsert([
      { symbol: "TON", usd: ton, updated_at: new Date().toISOString() },
      { symbol: "USDT", usd: usdt, updated_at: new Date().toISOString() },
    ]);
    return { TON: ton, USDT: usdt };
  } catch {
    return { TON: 5, USDT: 1 };
  }
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

    const { data: history } = await supabaseAdmin
      .from("withdrawals").select("*")
      .eq("tg_id", profile.tg_id)
      .order("created_at", { ascending: false }).limit(30);

    return {
      coins: Number(profile.coins),
      usd_balance: Number(profile.coins) * rate,
      coin_to_usd_rate: rate,
      min_withdraw_usd: minUsd,
      max_withdraw_usd: maxUsd,
      fee_pct: feePct,
      prices,
      wallet_ton: profile.wallet_ton ?? "",
      wallet_usdt_aptos: profile.wallet_usdt_aptos ?? "",
      history: history ?? [],
    };
  });

const WalletSchema = z.object({
  initData: z.string().min(10),
  wallet_ton: z.string().max(128).optional(),
  wallet_usdt_aptos: z.string().max(128).optional(),
});

export const saveWallet = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => WalletSchema.parse(d))
  .handler(async ({ data }) => {
    const { requireProfile } = await import("./tg-auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { profile } = await requireProfile(data.initData);
    const upd: { wallet_ton?: string; wallet_usdt_aptos?: string } = {};
    if (data.wallet_ton !== undefined) upd.wallet_ton = data.wallet_ton;
    if (data.wallet_usdt_aptos !== undefined) upd.wallet_usdt_aptos = data.wallet_usdt_aptos;
    if (Object.keys(upd).length === 0) return { ok: true };
    const { error } = await supabaseAdmin.from("profiles").update(upd).eq("tg_id", profile.tg_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const WithdrawSchema = z.object({
  initData: z.string().min(10),
  currency: z.enum(["TON", "USDT_APTOS"]),
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
    const address = data.currency === "TON" ? profile.wallet_ton : profile.wallet_usdt_aptos;
    if (!address) throw new Error("Set your wallet address first");

    const rate = Number(await getSetting("coin_to_usd_rate", 0.0001));
    const minUsd = Number(await getSetting("min_withdraw_usd", 0.05));
    const maxUsd = Number(await getSetting("max_withdraw_usd", 0.15));
    const feePct = Number(await getSetting("withdraw_fee_pct", 5));
    const amount_usd = data.coins * rate;
    if (amount_usd < minUsd) throw new Error(`Min withdraw is $${minUsd}`);
    if (amount_usd > maxUsd) throw new Error(`Max withdraw is $${maxUsd}`);
    const prices = await refreshPrices();
    const px = data.currency === "TON" ? prices.TON : prices.USDT;
    const amount_native = amount_usd / px;
    const net_amount = amount_native * (1 - feePct / 100);

    // Debit
    await creditCoins(profile.tg_id, -data.coins, "withdraw", { currency: data.currency });

    const { data: w, error } = await supabaseAdmin
      .from("withdrawals")
      .insert({
        tg_id: profile.tg_id, currency: data.currency, coins: data.coins,
        amount_usd, amount_native, fee_pct: feePct, net_amount, address,
      })
      .select("*").single();
    if (error || !w) throw new Error(error?.message ?? "Failed");

    // Get mini app + payment channel for buttons
    const miniApp = await getSetting<string>("mini_app_url", "https://t.me/AstroBlitzbot/play");
    const payCh = await getSetting<string>("payment_url", "https://t.me/AstroBlitzpayment");

    // Notify user
    try {
      await sendMessage({
        chat_id: profile.tg_id, parse_mode: "HTML",
        text:
          `💸 <b>Withdraw request submitted</b> ✨\n\n` +
          `💎 Currency: <b>${data.currency}</b>\n` +
          `🪙 Coins: <b>${Number(data.coins).toLocaleString()}</b>\n` +
          `💵 USD: <b>$${amount_usd.toFixed(4)}</b>\n` +
          `📤 Net: <b>${net_amount.toFixed(6)} ${data.currency === "TON" ? "TON" : "USDT"}</b>\n` +
          `⏳ Status: <b>Pending</b>\n\n` +
          `We'll notify you when admin approves it! 🚀`,
        reply_markup: { inline_keyboard: [
          [{ text: "🚀 Open AstroBlitz", url: miniApp }],
          [{ text: "💰 Payment Channel", url: payCh }],
        ]},
      });
    } catch { /* ignore */ }

    // Notify admin
    try {
      const adminId = await getSetting<number | string | null>("admin_tg_id", null);
      if (adminId) {
        await sendMessage({
          chat_id: adminId,
          parse_mode: "HTML",
          text:
            `💸 <b>New withdraw request</b> 🔔\n\n` +
            `👤 User: <code>${profile.tg_id}</code> ${profile.username ? "@" + profile.username : ""}\n` +
            `🪙 Coins: <b>${data.coins}</b> ($${amount_usd.toFixed(4)})\n` +
            `💎 Currency: <b>${data.currency}</b>\n` +
            `📤 Net: <code>${net_amount.toFixed(6)}</code>\n` +
            `📬 Addr: <code>${address}</code>`,
        });
      }
    } catch { /* ignore */ }

    return w;
  });
