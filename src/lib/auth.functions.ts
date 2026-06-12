import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InitDataSchema = z.object({
  initData: z.string().min(10).max(8192),
  device_fingerprint: z.string().max(256).optional(),
});

function generateReferCode(tgId: number): string {
  // Short stable code based on tg id (base36)
  return `AB${tgId.toString(36).toUpperCase()}`;
}

/**
 * Verify Telegram WebApp initData and upsert profile.
 * Returns the profile row (plus whether the user is brand new).
 */
export const initSession = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => InitDataSchema.parse(d))
  .handler(async ({ data }) => {
    const { verifyInitData, sendMessage } = await import("@/lib/telegram.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const verified = verifyInitData(data.initData);
    if (!verified.ok) {
      throw new Error(`Telegram verification failed: ${verified.error}`);
    }
    const tg = verified.user;
    const startParam = verified.startParam;

    // Extract requester IP (best-effort) from common Cloudflare/edge headers
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const ip =
      getRequestHeader("cf-connecting-ip") ||
      getRequestHeader("x-real-ip") ||
      (getRequestHeader("x-forwarded-for") ?? "").split(",")[0].trim() ||
      null;

    // Look up existing
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("tg_id", tg.id)
      .maybeSingle();

    // Anti-abuse: if NEW user + same IP or device already exists on a different account, suspend.
    let isNew = false;
    let suspended = false;
    let suspendReason: string | null = null;

    if (!existing) {
      isNew = true;
      if (ip || data.device_fingerprint) {
        const orFilter = [
          ip ? `last_ip.eq.${ip}` : null,
          data.device_fingerprint ? `device_fingerprint.eq.${data.device_fingerprint}` : null,
        ]
          .filter(Boolean)
          .join(",");
        if (orFilter) {
          const { data: dupes } = await supabaseAdmin
            .from("profiles")
            .select("tg_id")
            .or(orFilter)
            .limit(1);
          if (dupes && dupes.length > 0) {
            suspended = true;
            suspendReason = "Duplicate device/IP detected";
          }
        }
      }
    }

    // Resolve referrer from start_param (e.g. "ABXYZ")
    let referrerTgId: number | null = existing?.referrer_tg_id ?? null;
    if (!existing && startParam && startParam !== generateReferCode(tg.id)) {
      const { data: ref } = await supabaseAdmin
        .from("profiles")
        .select("tg_id")
        .eq("refer_code", startParam)
        .maybeSingle();
      if (ref) referrerTgId = ref.tg_id as number;
    }

    const upsertPayload = {
      tg_id: tg.id,
      username: tg.username ?? null,
      first_name: tg.first_name,
      last_name: tg.last_name ?? null,
      photo_url: tg.photo_url ?? null,
      language_code: tg.language_code ?? null,
      refer_code: existing?.refer_code ?? generateReferCode(tg.id),
      referrer_tg_id: referrerTgId,
      last_ip: ip,
      device_fingerprint: data.device_fingerprint ?? existing?.device_fingerprint ?? null,
      is_suspended: existing?.is_suspended || suspended,
      suspend_reason: existing?.suspend_reason ?? suspendReason,
    };

    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .upsert(upsertPayload, { onConflict: "tg_id" })
      .select("*")
      .single();

    if (error || !profile) {
      throw new Error(`Profile upsert failed: ${error?.message ?? "unknown"}`);
    }

    // On brand-new signup with referrer, pay 50 instant coins to inviter and notify them.
    if (isNew && referrerTgId && !suspended) {
      try {
        const { data: settings } = await supabaseAdmin
          .from("app_settings").select("key,value")
          .in("key", ["refer_instant_coins", "mini_app_url"]);
        const map = Object.fromEntries((settings ?? []).map((s) => [s.key, s.value]));
        const instant = Number(map.refer_instant_coins ?? 50);
        const miniApp = (map.mini_app_url as string) ?? "https://t.me/AstroBlitzbot/play";
        await supabaseAdmin.rpc("credit_coins", {
          p_tg_id: referrerTgId, p_delta: instant,
          p_reason: "refer_instant", p_meta: { referee: tg.id } as never,
        });
        await sendMessage({
          chat_id: referrerTgId, parse_mode: "HTML",
          text:
            `🎉 <b>New friend joined!</b> ✨\n\n` +
            `👤 ${tg.first_name}${tg.username ? ` (@${tg.username})` : ""}\n` +
            `💰 You earned <b>+${instant} coins</b> instantly!\n` +
            `🚀 Earn <b>100 more</b> when they finish all main tasks, 5 game levels & 10 ads.`,
          reply_markup: { inline_keyboard: [[{ text: "🚀 Open AstroBlitz", url: miniApp }]] },
        }).catch(() => {});
      } catch { /* ignore */ }
    }

    // Notify admin on truly new user (best effort)
    if (isNew) {
      try {
        const { data: adminRow } = await supabaseAdmin
          .from("app_settings")
          .select("value")
          .eq("key", "admin_tg_id")
          .maybeSingle();
        const adminId = adminRow?.value as number | string | undefined;
        if (adminId) {
          await sendMessage({
            chat_id: adminId,
            parse_mode: "HTML",
            text:
              `🆕 <b>New mini-app user</b>\n\n` +
              `👤 ${tg.first_name}${tg.username ? ` (@${tg.username})` : ""}\n` +
              `🆔 <code>${tg.id}</code>\n` +
              `🌐 IP: <code>${ip ?? "—"}</code>\n` +
              (suspended ? `🚫 Auto-suspended: ${suspendReason}\n` : ``) +
              (referrerTgId ? `🎟 Referred by: <code>${referrerTgId}</code>` : ``),
          }).catch(() => {});
        }
      } catch {
        /* ignore */
      }
    }

    // Check admin flag
    let isAdmin = false;
    try {
      const { data: adminSetting } = await supabaseAdmin
        .from("app_settings").select("value").eq("key", "admin_tg_id").maybeSingle();
      if (adminSetting && Number(adminSetting.value) === tg.id) isAdmin = true;
    } catch { /* ignore */ }

    return { profile, isNew, suspended, is_admin: isAdmin };
  });

/**
 * Mark notifications confirmed for this user.
 * Requires verified Telegram initData on every call.
 */
const NotifSchema = z.object({
  initData: z.string().min(10).max(8192),
  enabled: z.boolean(),
});

export const setNotificationsEnabled = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => NotifSchema.parse(d))
  .handler(async ({ data }) => {
    const { verifyInitData, sendMessage } = await import("@/lib/telegram.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const verified = verifyInitData(data.initData);
    if (!verified.ok) throw new Error(`Telegram verification failed: ${verified.error}`);

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ notifications_enabled: data.enabled, onboarded: true })
      .eq("tg_id", verified.user.id);
    if (error) throw new Error(error.message);

    // Send a confirmation message via the bot (this is what "opens" the bot dialog)
    if (data.enabled) {
      try {
        const { data: setting } = await supabaseAdmin
          .from("app_settings").select("value").eq("key", "mini_app_url").maybeSingle();
        const miniApp = (setting?.value as string) ?? "https://t.me/AstroBlitzbot/play";
        await sendMessage({
          chat_id: verified.user.id,
          parse_mode: "HTML",
          text:
            `🔔 <b>Notifications enabled!</b> ✨\n\n` +
            `🎉 You're all set. We'll ping you for daily rewards, refer alerts and withdraw updates.\n\n` +
            `🚀 Tap below to keep playing!`,
          reply_markup: { inline_keyboard: [[{ text: "🚀 Open AstroBlitz", url: miniApp }]] },
        });
      } catch { /* ignore */ }
    }
    return { ok: true };
  });
