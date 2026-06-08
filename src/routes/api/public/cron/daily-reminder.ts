// Daily reminder cron — sends one notification per user per day.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendMessage } from "@/lib/telegram.server";

async function getSetting<T>(key: string, fb: T): Promise<T> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", key).maybeSingle();
  if (!data) return fb;
  return data.value as T;
}

async function run() {
  const message = await getSetting<string>("daily_reminder_message", "🚀 Open AstroBlitz now!");
  const miniApp = await getSetting<string>("mini_app_url", "https://t.me");
  let from = 0; const page = 500; let sent = 0; let failed = 0;
  for (;;) {
    const { data: users } = await supabaseAdmin
      .from("profiles").select("tg_id")
      .eq("notifications_enabled", true).eq("is_suspended", false)
      .order("tg_id").range(from, from + page - 1);
    if (!users || users.length === 0) break;
    for (const u of users) {
      try {
        await sendMessage({
          chat_id: u.tg_id, text: message, parse_mode: "HTML",
          reply_markup: { inline_keyboard: [[{ text: "🚀 Open AstroBlitz", url: miniApp }]] },
        });
        sent++;
        await new Promise((r) => setTimeout(r, 45));
      } catch { failed++; }
    }
    if (users.length < page) break;
    from += page;
  }
  await supabaseAdmin.from("notification_log").insert({
    tg_id: 0, kind: "daily_reminder",
    payload: { sent, failed, ts: new Date().toISOString() } as never,
  });
  return { sent, failed };
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
