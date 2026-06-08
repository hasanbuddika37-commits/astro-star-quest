// Broadcast worker — public cron endpoint. Sends pending broadcasts to all users + community channel.
// Protected by ?secret=<broadcast_cron_secret> query.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendMessage, sendPhoto } from "@/lib/telegram.server";

async function getSetting<T>(key: string, fb: T): Promise<T> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", key).maybeSingle();
  if (!data) return fb;
  return data.value as T;
}

async function runBroadcasts() {
  const { data: queue } = await supabaseAdmin
    .from("broadcasts").select("*").eq("status", "queued").order("created_at").limit(5);
  if (!queue || queue.length === 0) return { processed: 0 };
  let processed = 0;

  for (const b of queue) {
    await supabaseAdmin.from("broadcasts").update({ status: "sending" }).eq("id", b.id);
    const keyboard = b.button_text && b.button_url
      ? { inline_keyboard: [[{ text: b.button_text, url: b.button_url }]] }
      : undefined;

    // Community channel
    try {
      const community = (await getSetting<string>("community_url", "")) || "";
      const chat = community.replace(/^https?:\/\/t\.me\//, "@");
      if (chat) {
        if (b.image_url) {
          await sendPhoto({ chat_id: chat, photo: b.image_url, caption: b.message, parse_mode: "HTML", reply_markup: keyboard });
        } else {
          await sendMessage({ chat_id: chat, text: b.message, parse_mode: "HTML", reply_markup: keyboard });
        }
      }
    } catch { /* ignore community failure */ }

    // All users
    let from = 0; const page = 500; let sent = 0; let failed = 0;
    for (;;) {
      const { data: users } = await supabaseAdmin
        .from("profiles").select("tg_id")
        .eq("notifications_enabled", true).eq("is_suspended", false)
        .order("tg_id").range(from, from + page - 1);
      if (!users || users.length === 0) break;
      for (const u of users) {
        try {
          if (b.image_url) {
            await sendPhoto({ chat_id: u.tg_id, photo: b.image_url, caption: b.message, parse_mode: "HTML", reply_markup: keyboard });
          } else {
            await sendMessage({ chat_id: u.tg_id, text: b.message, parse_mode: "HTML", reply_markup: keyboard });
          }
          sent++;
          // Telegram rate limit: ~25 msg/sec global. Sleep a bit.
          await new Promise((r) => setTimeout(r, 45));
        } catch {
          failed++;
        }
      }
      if (users.length < page) break;
      from += page;
    }

    await supabaseAdmin.from("broadcasts").update({
      status: "done", sent_count: sent, failed_count: failed, finished_at: new Date().toISOString(),
    }).eq("id", b.id);
    processed++;
  }
  return { processed };
}

export const Route = createFileRoute("/api/public/cron/broadcast-worker")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const secret = url.searchParams.get("secret");
        const expected = (await getSetting<string>("broadcast_cron_secret", "")) || "";
        if (!secret || secret !== expected) return new Response("Unauthorized", { status: 401 });
        const res = await runBroadcasts();
        return Response.json(res);
      },
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const secret = url.searchParams.get("secret");
        const expected = (await getSetting<string>("broadcast_cron_secret", "")) || "";
        if (!secret || secret !== expected) return new Response("Unauthorized", { status: 401 });
        const res = await runBroadcasts();
        return Response.json(res);
      },
    },
  },
});
