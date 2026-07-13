// Server-only helper: advance a referee's 3-stage refer progress and
// notify the referrer via bot for each stage crossed.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendMessage } from "./telegram.server";

async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const { data } = await supabaseAdmin
    .from("app_settings").select("value").eq("key", key).maybeSingle();
  if (!data) return fallback;
  return data.value as T;
}

type ProfileLite = { tg_id: number; referrer_tg_id: number | null; refer_stage: number; first_name: string | null; username: string | null };

async function loadProfile(tgId: number): Promise<ProfileLite | null> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("tg_id, referrer_tg_id, refer_stage, first_name, username")
    .eq("tg_id", tgId).maybeSingle();
  return (data as unknown as ProfileLite) ?? null;
}

/**
 * Call `progress_referral(p_referee)`, detect any stage transitions,
 * and send the referrer a bot message with an Open Mini App button.
 *
 * Safe to call from any server function — errors are swallowed.
 */
export async function progressReferralAndNotify(refereeTgId: number): Promise<void> {
  return progressReferralAndNotify(refereeTgId, false);
}

export async function progressReferralAdAndNotify(refereeTgId: number): Promise<void> {
  return progressReferralAndNotify(refereeTgId, true);
}

async function progressReferralAndNotify(refereeTgId: number, countAd: boolean): Promise<void> {
  try {
    const before = await loadProfile(refereeTgId);
    if (!before?.referrer_tg_id) {
      // Even without a referrer we call the RPC so stage settles.
      await supabaseAdmin.rpc("progress_referral", { p_referee_tg_id: refereeTgId, p_count_ad: countAd });
      return;
    }
    const prevStage = Number(before.refer_stage ?? 0);
    await supabaseAdmin.rpc("progress_referral", { p_referee_tg_id: refereeTgId, p_count_ad: countAd });
    const after = await loadProfile(refereeTgId);
    if (!after) return;
    const newStage = Number(after.refer_stage ?? 0);
    if (newStage <= prevStage) return;

    const miniApp = await getSetting<string>("mini_app_url", "https://t.me/AstroBlitzbot/play");
    const r0 = Number(await getSetting("refer_stage0_coins", 25));
    const r1 = Number(await getSetting("refer_stage1_coins", 50));
    const r2 = Number(await getSetting("refer_stage2_coins", 75));
    const n1 = Number(await getSetting("refer_stage1_ads", 10));
    const n2 = Number(await getSetting("refer_stage2_ads", 15));
    const who = `${after.first_name ?? "Friend"}${after.username ? ` (@${after.username})` : ""}`;

    for (let s = prevStage + 1; s <= newStage; s++) {
      let text = "";
      if (s === 1) {
        text =
          `🎉 <b>New referral joined!</b> ✨\n\n` +
          `👤 ${who}\n` +
          `💰 You earned <b>+${r0} coins</b> instantly!\n\n` +
          `🔓 Next: <b>+${r1} coins</b> when they watch <b>${n1} ads on Day 1</b>.`;
      } else if (s === 2) {
        text =
          `🚀 <b>Referral Stage 2 complete!</b> ✨\n\n` +
          `👤 ${who} watched ${n1} ads on Day 1\n` +
          `💰 You earned <b>+${r1} coins</b>!\n\n` +
          `🔓 Final: <b>+${r2} coins</b> when they watch <b>${n2} ads on Day 2</b>.`;
      } else if (s === 3) {
        text =
          `🏆 <b>Referral fully verified!</b> 🎊\n\n` +
          `👤 ${who} completed Day 2 (${n2} ads)\n` +
          `💰 You earned <b>+${r2} coins</b>!\n\n` +
          `💎 You'll also earn <b>lifetime commission</b> on their future earnings.`;
      }
      if (!text) continue;
      try {
        await sendMessage({
          chat_id: after.referrer_tg_id as number, parse_mode: "HTML", text,
          reply_markup: { inline_keyboard: [[{ text: "🎮 Open Mini App", url: miniApp }]] },
        });
      } catch (e) { console.error("[refer-progress] notify failed:", e); }
    }
  } catch (e) {
    console.error("[refer-progress] failed:", e);
  }
}

/**
 * Verify Telegram channel membership via getChatMember.
 * `channel` may be "@name" or a numeric chat id string.
 * Bot must be admin in the channel.
 */
export async function isChannelMember(channel: string, userId: number): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN missing");
  const chat = channel.startsWith("@") || channel.startsWith("-") ? channel : `@${channel}`;
  const url = `https://api.telegram.org/bot${token}/getChatMember?chat_id=${encodeURIComponent(chat)}&user_id=${userId}`;
  const r = await fetch(url);
  const j = (await r.json()) as { ok: boolean; result?: { status: string }; description?: string };
  if (!j.ok) throw new Error(`Channel membership check failed: ${j.description ?? r.status}`);
  const st = j.result?.status;
  return st === "member" || st === "administrator" || st === "creator";
}
