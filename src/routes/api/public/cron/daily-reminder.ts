// Daily reminder cron — sends a photo + emoji-rich caption with "Open" button.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPhoto, sendMessage } from "@/lib/telegram.server";

async function getSetting<T>(key: string, fb: T): Promise<T> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", key).maybeSingle();
  if (!data) return fb;
  return data.value as T;
}

const VARIANTS = [
  {
    emoji: "🌅",
    caption: (m: string) =>
      `${m || "🚀 <b>Good morning, astronaut!</b>"}\n\n` +
      `💎 Daily coins are waiting in orbit.\n` +
      `📺 Watch ads • 🎮 Play games • 👥 Invite friends\n` +
      `💸 Real crypto rewards (TON & USDT BEP20)!\n\n` +
      `🪐 Tap below to blast off!`,
  },
  {
    emoji: "☀️",
    caption: () =>
      `☀️ <b>Mid-day mission update</b>\n\n` +
      `🎯 Have you claimed today's challenges yet?\n` +
      `🪙 Big coin bonuses are still up for grabs.\n` +
      `🚀 Don't let your refers out-earn you!`,
  },
  {
    emoji: "🌌",
    caption: () =>
      `🌌 <b>Night shift bonus!</b>\n\n` +
      `🔥 Last call to top up your coins today.\n` +
      `📺 1 minute of ads = real crypto.\n` +
      `💎 Withdraw any time you reach $0.05.\n\n` +
      `🛸 See you in the stars!`,
  },
];

async function run() {
  const photoUrl = await getSetting<string>(
    "banner_photo_url",
    "https://astro-star-quest.lovable.app/__l5e/assets-v1/b520ff03-9118-40bc-9b0e-818c851e1180/promo-banner.png",
  );
  const customMsg = await getSetting<string>("daily_reminder_message", "");
  const miniApp = await getSetting<string>("mini_app_url", "https://t.me/AstroBlitzbot/play");
  const variant = VARIANTS[Math.floor(Math.random() * VARIANTS.length)];
  const caption = variant.caption(customMsg);

  const buttons = { inline_keyboard: [[{ text: "🚀 Open AstroBlitz", url: miniApp }]] };

  let from = 0; const page = 500; let sent = 0; let failed = 0;
  for (;;) {
    const { data: users } = await supabaseAdmin
      .from("profiles").select("tg_id")
      .eq("notifications_enabled", true).eq("is_suspended", false)
      .order("tg_id").range(from, from + page - 1);
    if (!users || users.length === 0) break;
    for (const u of users) {
      try {
        if (photoUrl) {
          await sendPhoto({
            chat_id: u.tg_id, photo: photoUrl, caption,
            parse_mode: "HTML", reply_markup: buttons,
          });
        } else {
          await sendMessage({
            chat_id: u.tg_id, text: caption,
            parse_mode: "HTML", reply_markup: buttons,
          });
        }
        sent++;
        await new Promise((r) => setTimeout(r, 45));
      } catch { failed++; }
    }
    if (users.length < page) break;
    from += page;
  }
  await supabaseAdmin.from("notification_log").insert({
    tg_id: 0, kind: "daily_reminder",
    payload: { sent, failed, variant: variant.emoji, ts: new Date().toISOString() } as never,
  });
  return { sent, failed, variant: variant.emoji };
}

export const Route = createFileRoute("/api/public/cron/daily-reminder")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const secret = url.searchParams.get("secret");
        const expected = (await getSetting<string>("broadcast_cron_secret", "")) || "";
        if (!secret || secret !== expected) return new Response("Unauthorized", { status: 401 });
        return Response.json(await run());
      },
    },
  },
});
