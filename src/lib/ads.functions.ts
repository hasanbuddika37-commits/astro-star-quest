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

    const { data: blocks } = await supabaseAdmin
      .from("ad_blocks")
      .select("*")
      .eq("is_enabled", true)
      .order("sort_order");

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

    const rewardMin = Number(await getSetting("ad_reward_min", 3));
    const rewardMax = Number(await getSetting("ad_reward_max", 5));

    const now = Date.now();
    const cards = (blocks ?? []).map((b) => {
      const buttons = Array.from({ length: b.buttons_count }).map((_, i) => {
        const last = recentByKey.get(`${b.network}#${i}`);
        const unlocks_at = last ? new Date(last).getTime() + b.cooldown_seconds * 1000 : 0;
        return { index: i, ready: unlocks_at <= now, unlocks_in_ms: Math.max(0, unlocks_at - now) };
      });
      return {
        network: b.network,
        label: b.label,
        logo_url: b.logo_url,
        // Global 3-5 override (per-block reward_min/max shown as info only)
        reward_min: rewardMin,
        reward_max: rewardMax,
        cooldown_seconds: b.cooldown_seconds,
        button_lock_seconds: b.button_lock_seconds,
        sdk_extra: b.sdk_extra,
        buttons,
      };
    });

    const cd = Number(await getSetting("ad_cooldown_seconds", COOLDOWN_FALLBACK));
    return { cards, cooldown_seconds: cd, reward: rewardMax };
  });

const ClaimSchema = z.object({
  initData: z.string().min(10),
  slot: z.enum(["watch1", "watch2", "watch3", "revive", "task", "daily", "withdraw", "claim"]),
  network: z.string().max(64).optional(),
});

export const claimAd = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ClaimSchema.parse(d))
  .handler(async ({ data }) => {
    const { requireProfile } = await import("./tg-auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { progressReferralAndNotify } = await import("./refer-progress.server");
    const { profile } = await requireProfile(data.initData);
    // Trigger ads (revive/task/daily/withdraw/claim) give NO coins directly.
    const reward = 0;
    await supabaseAdmin.from("ad_views").insert({
      tg_id: profile.tg_id, slot: data.slot, network: data.network ?? null, reward,
    });
    await supabaseAdmin.from("profiles")
      .update({ ads_watched: (profile.ads_watched ?? 0) + 1 })
      .eq("tg_id", profile.tg_id);
    await progressReferralAndNotify(profile.tg_id);
    return { reward, new_balance: Number(profile.coins) };
  });

// ─── Per-button card ad claim (Watch Ads tab) ───
const ButtonClaimSchema = z.object({
  initData: z.string().min(10),
  network: z.string().min(1).max(64),
  button_index: z.number().int().min(0).max(50),
});

export const claimAdButton = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ButtonClaimSchema.parse(d))
  .handler(async ({ data }) => {
    const { requireProfile, creditCoins, getSetting } = await import("./tg-auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { progressReferralAdAndNotify } = await import("./refer-progress.server");
    const { profile } = await requireProfile(data.initData);

    const { data: block } = await supabaseAdmin
      .from("ad_blocks").select("*").eq("network", data.network).maybeSingle();
    if (!block || !block.is_enabled) throw new Error("Ad block disabled");
    if (data.button_index >= block.buttons_count) throw new Error("Invalid button");

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

    // Random 3–5 coin reward (global setting overrides per-block config)
    const min = Number(await getSetting("ad_reward_min", 3));
    const max = Number(await getSetting("ad_reward_max", 5));
    const reward = Math.floor(min + Math.random() * (max - min + 1));

    await supabaseAdmin.from("ad_button_views").insert({
      tg_id: profile.tg_id, network: data.network, button_index: data.button_index, reward,
    });
    await supabaseAdmin.from("ad_views").insert({
      tg_id: profile.tg_id, slot: `card_${data.network}`, network: data.network, reward,
    });
    await supabaseAdmin.from("profiles")
      .update({ ads_watched: (profile.ads_watched ?? 0) + 1 })
      .eq("tg_id", profile.tg_id);

    const new_balance = await creditCoins(profile.tg_id, reward, "ad_watch",
      { network: data.network, button: data.button_index });
    await progressReferralAdAndNotify(profile.tg_id);
    return { reward, new_balance };
  });

// Random enabled ad-network name (for "reward claim" ads — includes Taddy if enabled)
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

// All enabled ad networks (for client-side fallback + game weighting)
export const getAdNetworks = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ initData: z.string().min(10) }).parse(d))
  .handler(async ({ data }) => {
    const { requireProfile } = await import("./tg-auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireProfile(data.initData);
    const { data: rows } = await supabaseAdmin
      .from("ad_blocks").select("network, sdk_extra").eq("is_enabled", true);
    return { networks: (rows ?? []).map((r) => ({ network: r.network, sdk_extra: r.sdk_extra })) };
  });


// ─── Visit Site (new Watch-Ads sub-tab) ───
type SiteRow = { id: number; label: string; url: string };

export const getVisitSites = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ initData: z.string().min(10) }).parse(d))
  .handler(async ({ data }) => {
    const { requireProfile, getSetting } = await import("./tg-auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { profile } = await requireProfile(data.initData);
    const sites = (await getSetting<SiteRow[]>("visit_sites", [])) ?? [];
    const reward = Number(await getSetting("visit_site_reward", 5));
    const watch_seconds = Number(await getSetting("visit_site_watch_seconds", 5));
    const cd = Number(await getSetting("visit_site_cooldown_seconds", 86400));
    const since = new Date(Date.now() - cd * 1000).toISOString();
    const { data: recent } = await supabaseAdmin
      .from("ad_views").select("slot, created_at")
      .eq("tg_id", profile.tg_id).like("slot", "visit_%").gte("created_at", since);
    const last = new Map<string, string>();
    for (const r of recent ?? []) {
      const cur = last.get(r.slot); if (!cur || r.created_at > cur) last.set(r.slot, r.created_at);
    }
    const now = Date.now();
    const items = sites.map((s) => {
      const slot = `visit_${s.id}`;
      const l = last.get(slot);
      const unlocks_at = l ? new Date(l).getTime() + cd * 1000 : 0;
      return { ...s, ready: unlocks_at <= now, unlocks_in_ms: Math.max(0, unlocks_at - now) };
    });
    return { items, reward, watch_seconds, cooldown_seconds: cd };
  });

export const claimVisitSite = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    initData: z.string().min(10),
    site_id: z.number().int().min(1).max(999),
    watched_ms: z.number().int().min(0).max(600000),
  }).parse(d))
  .handler(async ({ data }) => {
    const { requireProfile, creditCoins, getSetting } = await import("./tg-auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sites = (await getSetting<SiteRow[]>("visit_sites", [])) ?? [];
    const site = sites.find((s) => s.id === data.site_id);
    if (!site) throw new Error("Unknown site");
    const reward = Number(await getSetting("visit_site_reward", 5));
    const need = Number(await getSetting("visit_site_watch_seconds", 5));
    const cd = Number(await getSetting("visit_site_cooldown_seconds", 86400));
    if (data.watched_ms < need * 1000) throw new Error(`Watch at least ${need}s to earn`);
    const { profile } = await requireProfile(data.initData);
    const slot = `visit_${site.id}`;
    const since = new Date(Date.now() - cd * 1000).toISOString();
    const { data: rec } = await supabaseAdmin.from("ad_views")
      .select("id").eq("tg_id", profile.tg_id).eq("slot", slot).gte("created_at", since).limit(1);
    if (rec && rec.length) throw new Error("On cooldown");
    await supabaseAdmin.from("ad_views").insert({
      tg_id: profile.tg_id, slot, network: "visit_site", reward,
    });
    const new_balance = await creditCoins(profile.tg_id, reward, "visit_site", { site_id: site.id });
    return { reward, new_balance };
  });
