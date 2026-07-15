// Admin: ad-block manage, user manage, community single-post — all token-gated.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Token = z.object({ token: z.string().min(10) });

// ─── AD BLOCKS ───
export const adminListAdBlocks = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Token.parse(d))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireAdmin(data.token);
    const { data: rows } = await supabaseAdmin.from("ad_blocks").select("*").order("sort_order");
    return rows ?? [];
  });

const AdBlockSchema = Token.extend({
  id: z.string().uuid().optional(),
  network: z.string().min(1).max(64),
  label: z.string().min(1).max(120),
  logo_url: z.string().max(500).optional().or(z.literal("")),
  buttons_count: z.number().int().min(1).max(50),
  reward_min: z.number().min(0),
  reward_max: z.number().min(0),
  cooldown_seconds: z.number().int().min(60).max(7 * 24 * 3600),
  button_lock_seconds: z.number().int().min(0).max(120),
  is_enabled: z.boolean(),
  sort_order: z.number().int().default(0),
  zone_id: z.string().max(200).optional(),
  sdk_extra: z.string().optional(),
});

export const adminSaveAdBlock = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => AdBlockSchema.parse(d))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireAdmin(data.token);
    let extra: unknown = null;
    if (data.sdk_extra) { try { extra = JSON.parse(data.sdk_extra); } catch { extra = data.sdk_extra; } }
    const row = {
      network: data.network, label: data.label,
      logo_url: data.logo_url || null,
      buttons_count: data.buttons_count, reward_min: data.reward_min, reward_max: data.reward_max,
      cooldown_seconds: data.cooldown_seconds, button_lock_seconds: data.button_lock_seconds,
      is_enabled: data.is_enabled, sort_order: data.sort_order,
      zone_id: data.zone_id ?? null, sdk_extra: extra as never,
    };
    if (data.id) await supabaseAdmin.from("ad_blocks").update(row).eq("id", data.id);
    else await supabaseAdmin.from("ad_blocks").upsert(row, { onConflict: "network" });
    return { ok: true };
  });

export const adminDeleteAdBlock = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Token.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireAdmin(data.token);
    await supabaseAdmin.from("ad_blocks").delete().eq("id", data.id);
    return { ok: true };
  });

// ─── USERS ───
const ListUsersSchema = Token.extend({
  q: z.string().max(120).optional(),
  status: z.enum(["all", "active", "suspended"]).default("all"),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

export const adminListUsers = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ListUsersSchema.parse(d))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireAdmin(data.token);
    let q = supabaseAdmin
      .from("profiles")
      .select("tg_id, username, first_name, coins, ads_watched, game_level, verified_refer_count, is_suspended, suspend_reason, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (data.status === "active") q = q.eq("is_suspended", false);
    if (data.status === "suspended") q = q.eq("is_suspended", true);
    if (data.q) {
      const num = Number(data.q);
      if (!Number.isNaN(num) && num > 0) q = q.eq("tg_id", num);
      else q = q.or(`username.ilike.%${data.q}%,first_name.ilike.%${data.q}%`);
    }
    const { data: rows, count } = await q;
    return { rows: rows ?? [], total: count ?? 0 };
  });

export const adminGetUserDetail = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Token.extend({ tg_id: z.number().int() }).parse(d))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireAdmin(data.token);
    const [
      { data: profile }, { data: ledger }, { data: ads }, { data: games },
      { data: withdrawals }, { data: actions }, { data: tasksDone }, { data: refers },
      { data: challenges }, { data: tickets },
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("*").eq("tg_id", data.tg_id).maybeSingle(),
      supabaseAdmin.from("coin_ledger").select("*").eq("tg_id", data.tg_id).order("created_at", { ascending: false }).limit(200),
      supabaseAdmin.from("ad_views").select("*").eq("tg_id", data.tg_id).order("created_at", { ascending: false }).limit(100),
      supabaseAdmin.from("game_plays").select("*").eq("tg_id", data.tg_id).order("created_at", { ascending: false }).limit(100),
      supabaseAdmin.from("withdrawals").select("*").eq("tg_id", data.tg_id).order("created_at", { ascending: false }).limit(100),
      supabaseAdmin.from("user_actions").select("*").eq("tg_id", data.tg_id).order("created_at", { ascending: false }).limit(100),
      supabaseAdmin.from("task_completions").select("*, tasks(title)").eq("tg_id", data.tg_id).order("created_at", { ascending: false }).limit(100),
      supabaseAdmin.from("referral_commissions").select("*").eq("referrer_tg_id", data.tg_id).order("created_at", { ascending: false }).limit(100),
      supabaseAdmin.from("challenge_claims").select("*, challenges(title)").eq("tg_id", data.tg_id).order("claimed_at", { ascending: false }).limit(100),
      supabaseAdmin.from("support_tickets").select("*").eq("tg_id", data.tg_id).order("created_at", { ascending: false }).limit(50),
    ]);
    const expectedFromLedger = (ledger ?? []).reduce((a, r) => a + Number(r.delta), 0);
    return {
      profile, ledger: ledger ?? [], ads: ads ?? [], games: games ?? [],
      withdrawals: withdrawals ?? [], actions: actions ?? [],
      tasks: tasksDone ?? [], refers: refers ?? [],
      challenges: challenges ?? [], tickets: tickets ?? [],
      expected_balance: expectedFromLedger,
    };
  });

// Reset a user's coin balance to match the ledger (fix mismatches).
export const adminFixBalance = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Token.extend({ tg_id: z.number().int() }).parse(d))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const s = await requireAdmin(data.token);
    const { data: prof } = await supabaseAdmin.from("profiles").select("coins").eq("tg_id", data.tg_id).maybeSingle();
    if (!prof) throw new Error("Not found");
    const { data: ledger } = await supabaseAdmin.from("coin_ledger").select("delta").eq("tg_id", data.tg_id);
    const expected = (ledger ?? []).reduce((a, r) => a + Number(r.delta), 0);
    const delta = expected - Number(prof.coins);
    if (Math.abs(delta) < 0.0001) return { ok: true, adjusted: 0, new_balance: Number(prof.coins) };
    // Update directly + write a reconciliation ledger entry so future balance is verifiable.
    await supabaseAdmin.from("profiles").update({ coins: expected, is_suspended: false, suspend_reason: null, updated_at: new Date().toISOString() }).eq("tg_id", data.tg_id);
    await supabaseAdmin.from("user_actions").insert({
      tg_id: data.tg_id, admin_id: s.admin_id, action: "fix_balance", delta,
      note: `Reset to ledger sum ${expected}`,
    });
    return { ok: true, adjusted: delta, new_balance: expected };
  });

export const adminSuspendUser = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Token.extend({ tg_id: z.number().int(), suspend: z.boolean(), reason: z.string().max(500).optional() }).parse(d))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const s = await requireAdmin(data.token);
    await supabaseAdmin.from("profiles")
      .update({ is_suspended: data.suspend, suspend_reason: data.suspend ? (data.reason ?? "Suspended by admin") : null })
      .eq("tg_id", data.tg_id);
    await supabaseAdmin.from("user_actions").insert({
      tg_id: data.tg_id, admin_id: s.admin_id, action: data.suspend ? "suspend" : "unsuspend",
      note: data.reason ?? null,
    });
    return { ok: true };
  });

export const adminAdjustBalance = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Token.extend({ tg_id: z.number().int(), delta: z.number(), note: z.string().max(500).optional() }).parse(d))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const s = await requireAdmin(data.token);
    const { data: newBal, error } = await supabaseAdmin.rpc("admin_adjust_balance", {
      p_tg_id: data.tg_id, p_delta: data.delta, p_admin_id: s.admin_id as string, p_note: data.note ?? "",
    });
    if (error) throw new Error(error.message);
    return { new_balance: Number(newBal) };
  });

// ─── COMMUNITY SINGLE POST ───
const PostSchema = Token.extend({
  message: z.string().min(1).max(4000),
  image_url: z.string().url().optional().or(z.literal("")),
  button_text: z.string().max(64).optional(),
  button_url: z.string().url().optional().or(z.literal("")),
});

export const adminPostToCommunity = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => PostSchema.parse(d))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendMessage, sendPhoto } = await import("./telegram.server");
    await requireAdmin(data.token);

    const { data: setting } = await supabaseAdmin
      .from("app_settings").select("value").eq("key", "community_chat_id").maybeSingle();
    let chat = (setting?.value as string) || "";
    if (!chat) {
      const { data: urlS } = await supabaseAdmin
        .from("app_settings").select("value").eq("key", "community_url").maybeSingle();
      chat = ((urlS?.value as string) || "").replace(/^https?:\/\/t\.me\//, "@");
    }
    if (!chat) throw new Error("community_chat_id setting is not configured");

    const keyboard = data.button_text && data.button_url
      ? { inline_keyboard: [[{ text: data.button_text, url: data.button_url }]] }
      : undefined;
    if (data.image_url) {
      await sendPhoto({ chat_id: chat, photo: data.image_url, caption: data.message, parse_mode: "HTML", reply_markup: keyboard });
    } else {
      await sendMessage({ chat_id: chat, text: data.message, parse_mode: "HTML", reply_markup: keyboard });
    }
    return { ok: true };
  });

// Per-network ad counts for dashboard
export const adminAdNetworkCounts = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Token.parse(d))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireAdmin(data.token);
    const { data: rows } = await supabaseAdmin.from("ad_views").select("network");
    const counts: Record<string, number> = {};
    for (const r of rows ?? []) {
      const k = r.network ?? "unknown";
      counts[k] = (counts[k] ?? 0) + 1;
    }
    return counts;
  });
