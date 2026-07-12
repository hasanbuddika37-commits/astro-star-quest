import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const adminLoginFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ email: z.string().email(), password: z.string().min(4).max(200) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { adminLogin } = await import("./admin.server");
    const token = await adminLogin(data.email, data.password);
    return { token };
  });

// Auto-login: only the Telegram user whose tg_id matches app_settings.admin_tg_id
// can mint a session. Replaces the legacy email/password login for mini-app admin.
export const adminLoginByTgId = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ initData: z.string().min(10).max(8192) }).parse(d))
  .handler(async ({ data }) => {
    const { verifyInitData } = await import("./telegram.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { randomBytes } = await import("crypto");

    const v = verifyInitData(data.initData);
    if (!v.ok) throw new Error("Telegram verification failed");

    const { data: row } = await supabaseAdmin
      .from("app_settings").select("value").eq("key", "admin_tg_id").maybeSingle();
    const adminTgId = Number(row?.value);
    if (!adminTgId || adminTgId !== v.user.id) throw new Error("Not authorized");

    // Find or auto-create admin row keyed by tg_id email-shape
    const adminEmail = `tg-${adminTgId}@astroblitz.local`;
    let { data: u } = await supabaseAdmin
      .from("admin_users").select("*").eq("email", adminEmail).maybeSingle();
    if (!u) {
      const ins = await supabaseAdmin.from("admin_users").insert({
        email: adminEmail,
        password_hash: `BOOTSTRAP:${randomBytes(16).toString("hex")}`,
      }).select("*").single();
      u = ins.data;
    }
    if (!u) throw new Error("Admin provisioning failed");

    const token = randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    await supabaseAdmin.from("admin_sessions").insert({ token, admin_id: u.id, expires_at: expires });
    return { token, is_admin: true as const };
  });

const TokenSchema = z.object({ token: z.string().min(10) });

export const adminStats = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => TokenSchema.parse(d))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireAdmin(data.token);
    const [{ count: users }, { count: ads }, { count: pendW }, { data: paid }] = await Promise.all([
      supabaseAdmin.from("profiles").select("tg_id", { count: "exact", head: true }),
      supabaseAdmin.from("ad_views").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("withdrawals").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabaseAdmin.from("withdrawals").select("amount_usd").eq("status", "approved"),
    ]);
    const total_paid_usd = (paid ?? []).reduce((a, r) => a + Number(r.amount_usd), 0);
    return { users: users ?? 0, ads: ads ?? 0, pending_withdrawals: pendW ?? 0, total_paid_usd };
  });

export const adminListWithdrawals = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => TokenSchema.extend({ status: z.string().default("pending") }).parse(d))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireAdmin(data.token);
    const { data: rows } = await supabaseAdmin
      .from("withdrawals").select("*")
      .eq("status", data.status)
      .order("created_at", { ascending: false }).limit(100);
    return rows ?? [];
  });

const ApproveSchema = TokenSchema.extend({
  id: z.string().uuid(),
  tx_id: z.string().min(2).max(200),
  admin_note: z.string().max(500).optional(),
});

export const adminApproveWithdrawal = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ApproveSchema.parse(d))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendMessage } = await import("./telegram.server");
    await requireAdmin(data.token);
    const { data: w } = await supabaseAdmin.from("withdrawals").select("*").eq("id", data.id).maybeSingle();
    if (!w || w.status !== "pending") throw new Error("Not a pending withdrawal");
    await supabaseAdmin.from("withdrawals").update({
      status: "approved", tx_id: data.tx_id, admin_note: data.admin_note ?? null,
      processed_at: new Date().toISOString(),
    }).eq("id", data.id);
    const { data: prof } = await supabaseAdmin
      .from("profiles").select("coins, total_withdraw").eq("tg_id", w.tg_id).maybeSingle();
    if (prof) {
      await supabaseAdmin.from("profiles").update({
        total_withdraw: Number(prof.total_withdraw ?? 0) + Number(w.amount_usd),
      }).eq("tg_id", w.tg_id);
    }
    const { data: settings } = await supabaseAdmin
      .from("app_settings").select("key,value")
      .in("key", ["payment_channel_url", "payment_chat_id", "mini_app_url"]);
    const sm = Object.fromEntries((settings ?? []).map((s) => [s.key, s.value]));
    const payCh = (sm.payment_channel_url as string) ?? "";
    let payChId = (sm.payment_chat_id as string) ?? "";
    if (!payChId && payCh) payChId = payCh.replace(/^https?:\/\/t\.me\//, "@");
    const miniApp = (sm.mini_app_url as string) ?? "";
    const txUrl = w.currency === "TON"
      ? `https://tonscan.org/tx/${data.tx_id}`
      : `https://bscscan.com/tx/${data.tx_id}`;
    try {
      await sendMessage({
        chat_id: w.tg_id, parse_mode: "HTML",
        text:
          `✅🎉 <b>Withdraw approved!</b> 🚀\n\n` +
          `💎 Currency: <b>${w.currency === "TON" ? "TON" : "USDT (BEP20)"}</b>\n` +
          `📤 Net sent: <code>${Number(w.net_amount).toFixed(6)}</code>\n` +
          `🪙 New balance: <code>${Number(prof?.coins ?? 0).toLocaleString()}</code> coins\n` +
          `📊 Status: <b>success</b> ✨\n` +
          `🔗 TX: <code>${data.tx_id}</code>`,
        reply_markup: { inline_keyboard: [[
          { text: "🔎 View transaction", url: txUrl },
          { text: "🚀 Open app", url: miniApp || "https://t.me" },
        ]]},
      });
    } catch (e) { console.error("[admin approve] user notify failed:", e); }
    try {
      if (payChId) {
        await sendMessage({
          chat_id: payChId,
          parse_mode: "HTML",
          text:
            `💸✅ <b>Payment processed</b> 🎉\n\n` +
            `👤 User: <code>${w.tg_id}</code>\n` +
            `💰 Amount: <b>${Number(w.net_amount).toFixed(6)} ${w.currency === "TON" ? "TON" : "USDT (BEP20)"}</b>\n` +
            `🔗 TX: <code>${data.tx_id}</code>`,
          reply_markup: { inline_keyboard: [[
            { text: "🔎 View transaction", url: txUrl },
            { text: "🚀 Open mini app", url: miniApp || "https://t.me" },
          ]]},
        });
      }
    } catch (e) { console.error("[admin approve] channel post failed:", e); }
    return { ok: true };
  });

const RejectSchema = TokenSchema.extend({
  id: z.string().uuid(), reason: z.string().min(1).max(500),
});

export const adminRejectWithdrawal = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => RejectSchema.parse(d))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendMessage } = await import("./telegram.server");
    const { creditCoins } = await import("./tg-auth.server");
    await requireAdmin(data.token);
    const { data: w } = await supabaseAdmin.from("withdrawals").select("*").eq("id", data.id).maybeSingle();
    if (!w || w.status !== "pending") throw new Error("Not a pending withdrawal");
    // refund coins
    await creditCoins(w.tg_id, Number(w.coins), "admin_adjust", { reason: "withdraw_reject", id: w.id });
    await supabaseAdmin.from("withdrawals").update({
      status: "rejected", admin_note: data.reason, processed_at: new Date().toISOString(),
    }).eq("id", data.id);
    try {
      await sendMessage({
        chat_id: w.tg_id, parse_mode: "HTML",
        text: `❌ <b>Withdraw rejected</b>\nReason: ${data.reason}\nYour <b>${Number(w.coins).toLocaleString()}</b> coins were refunded.`,
      });
    } catch { /* ignore */ }
    return { ok: true };
  });

export const adminListTasks = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => TokenSchema.parse(d))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireAdmin(data.token);
    const { data: rows } = await supabaseAdmin.from("tasks").select("*").order("sort_order");
    return rows ?? [];
  });

const TaskSaveSchema = TokenSchema.extend({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  reward: z.number().min(0),
  url: z.string().url().optional().or(z.literal("")),
  kind: z.string().default("link"),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
  task_type: z.enum(["main", "partner", "community"]).default("main"),
  channel_username: z.string().max(120).optional().or(z.literal("")),
  verify_via_join: z.boolean().default(false),
  icon_url: z.string().url().optional().or(z.literal("")),
});

export const adminSaveTask = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => TaskSaveSchema.parse(d))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireAdmin(data.token);
    const row = {
      title: data.title, description: data.description ?? null,
      reward: data.reward, url: data.url || null, kind: data.kind,
      is_active: data.is_active, sort_order: data.sort_order,
      task_type: data.task_type,
      channel_username: data.channel_username || null,
      verify_via_join: data.verify_via_join,
      icon_url: data.icon_url || null,
    };
    if (data.id) {
      await supabaseAdmin.from("tasks").update(row as never).eq("id", data.id);
    } else {
      await supabaseAdmin.from("tasks").insert(row as never);
    }
    return { ok: true };
  });

export const adminDeleteTask = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => TokenSchema.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireAdmin(data.token);
    await supabaseAdmin.from("tasks").delete().eq("id", data.id);
    return { ok: true };
  });

export const adminListChallenges = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => TokenSchema.parse(d))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireAdmin(data.token);
    const { data: rows } = await supabaseAdmin.from("challenges").select("*").order("created_at");
    return rows ?? [];
  });

const ChSaveSchema = TokenSchema.extend({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  kind: z.enum(["ads", "game_level", "refers"]),
  goal: z.number().int().min(1),
  reward: z.number().min(0),
  period: z.enum(["daily", "weekly"]).default("daily"),
  is_active: z.boolean().default(true),
});

export const adminSaveChallenge = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ChSaveSchema.parse(d))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireAdmin(data.token);
    const row = {
      title: data.title, description: data.description ?? null, kind: data.kind,
      goal: data.goal, reward: data.reward, period: data.period, is_active: data.is_active,
    };
    if (data.id) await supabaseAdmin.from("challenges").update(row).eq("id", data.id);
    else await supabaseAdmin.from("challenges").insert(row);
    return { ok: true };
  });

export const adminDeleteChallenge = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => TokenSchema.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireAdmin(data.token);
    await supabaseAdmin.from("challenges").delete().eq("id", data.id);
    return { ok: true };
  });

export const adminGetSettings = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => TokenSchema.parse(d))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireAdmin(data.token);
    const { data: rows } = await supabaseAdmin.from("app_settings").select("*").order("key");
    return rows ?? [];
  });

export const adminSaveSetting = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    TokenSchema.extend({ key: z.string().min(1).max(120), value: z.string().max(8000) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireAdmin(data.token);
    let parsed: unknown;
    try { parsed = JSON.parse(data.value); } catch { parsed = data.value; }
    await supabaseAdmin.from("app_settings").upsert({
      key: data.key, value: parsed as never, updated_at: new Date().toISOString(),
    }, { onConflict: "key" });
    return { ok: true };
  });

const BroadcastSchema = TokenSchema.extend({
  message: z.string().min(1).max(4000),
  image_url: z.string().url().optional().or(z.literal("")),
  button_text: z.string().max(64).optional(),
  button_url: z.string().url().optional().or(z.literal("")),
});

export const adminCreateBroadcast = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => BroadcastSchema.parse(d))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireAdmin(data.token);
    const { data: b, error } = await supabaseAdmin.from("broadcasts").insert({
      message: data.message, image_url: data.image_url || null,
      button_text: data.button_text || null, button_url: data.button_url || null,
      status: "queued",
    }).select("*").single();
    if (error || !b) throw new Error(error?.message ?? "Failed");
    return b;
  });

export const adminListTickets = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => TokenSchema.parse(d))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireAdmin(data.token);
    const { data: rows } = await supabaseAdmin
      .from("support_tickets").select("*").order("updated_at", { ascending: false }).limit(100);
    return rows ?? [];
  });

export const adminReplyTicket = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    TokenSchema.extend({ ticket_id: z.string().uuid(), body: z.string().min(1).max(2000) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendMessage } = await import("./telegram.server");
    await requireAdmin(data.token);
    const { data: t } = await supabaseAdmin
      .from("support_tickets").select("*").eq("id", data.ticket_id).maybeSingle();
    if (!t) throw new Error("Not found");
    await supabaseAdmin.from("ticket_messages").insert({ ticket_id: t.id, author: "admin", body: data.body });
    await supabaseAdmin.from("support_tickets").update({ status: "answered" }).eq("id", t.id);
    try {
      await sendMessage({
        chat_id: t.tg_id, parse_mode: "HTML",
        text: `📨 <b>Support reply</b>\n#${t.id.slice(0,8)}\n${data.body}`,
      });
    } catch { /* ignore */ }
    return { ok: true };
  });

// Change admin email / password from the panel (requires current password).
const ChangeCredsSchema = TokenSchema.extend({
  current_password: z.string().min(1).max(200),
  new_email: z.string().email().optional(),
  new_password: z.string().min(6).max(200).optional(),
});

export const adminChangeCredentials = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ChangeCredsSchema.parse(d))
  .handler(async ({ data }) => {
    const { requireAdmin, adminChangeCreds } = await import("./admin.server");
    const session = await requireAdmin(data.token);
    return await adminChangeCreds(
      session.admin_id as string,
      data.current_password,
      data.new_email,
      data.new_password,
    );
  });
