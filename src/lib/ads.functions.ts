import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// ─── Legacy slot-based (kept for game revive / task / daily) ───
const COOLDOWN_FALLBACK = 12 * 60 * 60;

export const getAdSlots = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ initData: z.string().min(10) }).parse(d))
  .handler(async ({ data }) => {
    const { requireProfile, getSetting } = await import("./tg-auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { profile } = await requireProfile(data.initData);

    // Load network ad-blocks
    const { data: blocks } = await supabaseAdmin
      .from("ad_blocks")
      .select("*")
      .eq("is_enabled", true)
      .order("sort_order");

    // Recent button views (last 12h max — driven per-block)
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: recent } = await supabaseAdmin
      .from("ad_button_views")
      .select("network, button_index, created_at")
      .eq("tg_id", profile.tg_id)
      .gte("created_at", cutoff);

    const recentByKey = new Map<string, string>();
    for (const r of recent ?? []) {
      const k = `${r.network}#${r.button_index}`;
      const prev = recentByKey.get(k);
      if (!prev || new Date(r.created_at) > new Date(prev)) recentByKey.set(k, r.created_at);
    }

    const now = Date.now();
    const cards = (blocks ?? []).map((b) => {
      const buttons = Array.from({ length: b.buttons_count }).map((_, i) => {
        const last = recentByKey.get(`${b.network}#${i}`);
        const unlocks_at = last ? new Date(last).getTime() + b.cooldown_seconds * 1000 : 0;
        return {
          index: i,
          ready: unlocks_at <= now,
          unlocks_in_ms: Math.max(0, unlocks_at - now),
        };
      });
      return {
        network: b.network,
        label: b.label,
        logo_url: b.logo_url,
        reward_min: Number(b.reward_min),
        reward_max: Number(b.reward_max),
        cooldown_seconds: b.cooldown_seconds,
        button_lock_seconds: b.button_lock_seconds,
        sdk_extra: b.sdk_extra,
        buttons,
      };
    });

    const cd = Number(await getSetting("ad_cooldown_seconds", COOLDOWN_FALLBACK));
    const reward = Number(await getSetting("ad_reward_coins", 50));
    return { cards, cooldown_seconds: cd, reward };
  });

const ClaimSchema = z.object({
  initData: z.string().min(10),
  slot: z.enum(["watch1", "watch2", "watch3", "revive", "task", "daily", "withdraw", "claim"]),
  network: z.string().max(64).optional(),
});

export const claimAd = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ClaimSchema.parse(d))
  .handler(async ({ data }) => {
    const { requireProfile, creditCoins } = await import("./tg-auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { profile } = await requireProfile(data.initData);
    // Small fixed reward for non-watch slots (revive/task/daily). No coins for "withdraw"/"claim" trigger ads.
    const reward = ["withdraw", "claim", "revive", "task", "daily"].includes(data.slot) ? 0 : 0;
    await supabaseAdmin.from("ad_views").insert({
      tg_id: profile.tg_id, slot: data.slot, network: data.network ?? null, reward,
    });
    await supabaseAdmin.from("profiles")
      .update({ ads_watched: (profile.ads_watched ?? 0) + 1 })
      .eq("tg_id", profile.tg_id);
    if (reward > 0) await creditCoins(profile.tg_id, reward, "ad_watch", { slot: data.slot });
    await supabaseAdmin.rpc("maybe_verify_referral", { p_referee_tg_id: profile.tg_id });
    return { reward, new_balance: Number(profile.coins) + reward };
  });

// ─── Per-button card ad claim ───
const ButtonClaimSchema = z.object({
  initData: z.string().min(10),
  network: z.string().min(1).max(64),
  button_index: z.number().int().min(0).max(50),
});

export const claimAdButton = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ButtonClaimSchema.parse(d))
  .handler(async ({ data }) => {
    const { requireProfile, creditCoins } = await import("./tg-auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { profile } = await requireProfile(data.initData);

    const { data: block } = await supabaseAdmin
      .from("ad_blocks").select("*").eq("network", data.network).maybeSingle();
    if (!block || !block.is_enabled) throw new Error("Ad block disabled");
    if (data.button_index >= block.buttons_count) throw new Error("Invalid button");

    // Per-button 12h cooldown check
    const since = new Date(Date.now() - block.cooldown_seconds * 1000).toISOString();
    const { data: recent } = await supabaseAdmin
      .from("ad_button_views")
      .select("id")
      .eq("tg_id", profile.tg_id)
      .eq("network", data.network)
      .eq("button_index", data.button_index)
      .gte("created_at", since)
      .limit(1);
    if (recent && recent.length) throw new Error("Button on cooldown");

    const min = Number(block.reward_min);
    const max = Number(block.reward_max);
    const reward = Math.floor(min + Math.random() * (max - min + 1));

    await supabaseAdmin.from("ad_button_views").insert({
      tg_id: profile.tg_id,
      network: data.network,
      button_index: data.button_index,
      reward,
    });
    await supabaseAdmin.from("ad_views").insert({
      tg_id: profile.tg_id, slot: `card_${data.network}`, network: data.network, reward,
    });
    await supabaseAdmin.from("profiles")
      .update({ ads_watched: (profile.ads_watched ?? 0) + 1 })
      .eq("tg_id", profile.tg_id);

    const new_balance = await creditCoins(profile.tg_id, reward, "ad_watch",
      { network: data.network, button: data.button_index });
    await supabaseAdmin.rpc("maybe_verify_referral", { p_referee_tg_id: profile.tg_id });
    return { reward, new_balance };
  });

// Get a random enabled ad-network name (for "reward claim" ads)
export const getRandomAdNetwork = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ initData: z.string().min(10) }).parse(d))
  .handler(async ({ data }) => {
    const { requireProfile } = await import("./tg-auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireProfile(data.initData);
    const { data: rows } = await supabaseAdmin
      .from("ad_blocks").select("network, sdk_extra").eq("is_enabled", true);
    if (!rows || rows.length === 0) return { network: null, sdk_extra: null };
    const pick = rows[Math.floor(Math.random() * rows.length)];
    return { network: pick.network, sdk_extra: pick.sdk_extra };
  });
