import { createFileRoute } from "@tanstack/react-router";
import { deriveWebhookSecret, safeEqualString, sendMessage, sendPhoto } from "@/lib/telegram.server";

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = deriveWebhookSecret();
        const got = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqualString(got, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }
        let update: TelegramUpdate;
        try {
          update = (await request.json()) as TelegramUpdate;
        } catch {
          return Response.json({ ok: true, ignored: "bad-json" });
        }
        try {
          await handleUpdate(update);
        } catch (e) {
          console.error("[telegram-webhook] error:", e);
        }
        return Response.json({ ok: true });
      },
    },
  },
});

type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string };
    from?: { id: number; first_name?: string; username?: string };
    text?: string;
  };
};

async function handleUpdate(update: TelegramUpdate) {
  const msg = update.message;
  if (!msg?.text) return;
  const text = msg.text.trim();
  const chatId = msg.chat.id;
  if (text.startsWith("/start")) {
    await handleStart(chatId, text, msg.from);
  }
}

async function getSetting<T>(key: string, fb: T): Promise<T> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", key).maybeSingle();
  if (!data) return fb;
  return data.value as T;
}

async function handleStart(
  chatId: number,
  text: string,
  from?: { id: number; first_name?: string; username?: string },
) {
  const parts = text.split(/\s+/);
  const startParam = parts[1] ?? "";

  // Notify admin on new user (best effort)
  if (from) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: existing } = await supabaseAdmin
        .from("profiles").select("tg_id").eq("tg_id", from.id).maybeSingle();
      if (!existing) {
        const adminId = await getSetting<number | string | null>("admin_tg_id", null);
        if (adminId) {
          await sendMessage({
            chat_id: adminId,
            parse_mode: "HTML",
            text:
              `🆕 <b>New user joined AstroBlitz</b>\n\n` +
              `👤 ${from.first_name ?? ""} ${from.username ? `(@${from.username})` : ""}\n` +
              `🆔 <code>${from.id}</code>\n` +
              `🎟 ref: <code>${startParam || "—"}</code>`,
          }).catch(() => {});
        }
      }
    } catch (e) {
      console.error("[telegram-webhook] admin notify failed:", e);
    }
  }

  const logoUrl = await getSetting<string | null>("welcome_photo_url", null);
  const miniApp = (await getSetting<string>("mini_app_url", "https://t.me/AstroBlitzbot/play"));
  const community = (await getSetting<string>("community_url", "https://t.me/AstroBlitzcommunity"));
  const payment = (await getSetting<string>("payment_url", "https://t.me/AstroBlitzpayment"));
  const botUsername = (await getSetting<string>("bot_username", "AstroBlitzbot"));
  const refSuffix = startParam ? `?startapp=${encodeURIComponent(startParam)}` : "";

  const name = from?.first_name ? from.first_name : "Astronaut";
  const caption =
    `🚀✨ <b>Welcome ${name}!</b> 🪐\n\n` +
    `🎮 Welcome to <b>AstroBlitz</b> — the rocket-runner Telegram mini-app where you <b>play and earn real crypto</b> 💎\n\n` +
    `🌟 <b>What you can do:</b>\n` +
    `🚀 Play fun rocket games\n` +
    `📺 Watch ads & earn coins\n` +
    `👥 Invite friends — earn up to 150 coins per verified refer\n` +
    `💵 Withdraw to USDT (BEP20)\n\n` +
    `🔥 Tap <b>Open AstroBlitz</b> to launch! 👇`;

  // Inline keyboard — use url for t.me/<bot>/<short_app> so it opens the mini app
  const reply_markup = {
    inline_keyboard: [
      [{ text: "🚀 Open AstroBlitz", url: `https://t.me/${botUsername}/play${refSuffix}` }],
      [{ text: "💬 Community", url: community }],
      [{ text: "💸 Payments", url: payment }],
    ],
  };

  // Try with photo first
  if (logoUrl) {
    try {
      await sendPhoto({ chat_id: chatId, photo: logoUrl, caption, parse_mode: "HTML", reply_markup });
      return;
    } catch (e) {
      console.error("[telegram-webhook] sendPhoto failed, falling back to text:", e);
    }
  }
  await sendMessage({
    chat_id: chatId,
    text: caption,
    parse_mode: "HTML",
    reply_markup,
    disable_web_page_preview: true,
  });
}
