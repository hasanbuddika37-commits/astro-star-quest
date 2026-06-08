import { createFileRoute } from "@tanstack/react-router";
import { deriveWebhookSecret, safeEqualString, sendMessage, sendPhoto } from "@/lib/telegram.server";

// Telegram bot webhook — handles /start and other commands.
export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Verify the secret token Telegram sends in headers
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
        // Always 200 so Telegram does not retry storm.
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
    return;
  }
}

async function handleStart(
  chatId: number,
  text: string,
  from?: { id: number; first_name?: string; username?: string },
) {
  // capture referral (e.g. /start ref_abc123) — used later when the user opens the mini app
  const parts = text.split(/\s+/);
  const startParam = parts[1] ?? "";

  // Notify admin of new user (best effort)
  if (from) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: existing } = await supabaseAdmin
        .from("profiles")
        .select("tg_id")
        .eq("tg_id", from.id)
        .maybeSingle();

      if (!existing) {
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

  // Logo URL — point at the published asset CDN path on this origin via env or fallback to placeholder
  const logoUrl = "https://hbbhqtcxtanzilvlhnif.supabase.co/storage/v1/object/public/public-assets/astroblitz-logo.png";
  // We'll fall back to a hosted public image. For Phase 1, use Telegram-renderable URL:
  // (We can't read /__l5e assets directly without origin). Use a simple text-only photo via emoji header instead.

  const caption =
    `🚀 <b>Welcome to AstroBlitz!</b>\n\n` +
    `Play fun rocket games and <b>earn real crypto</b> rewards — TON, USDT (Aptos) and more.\n\n` +
    `🎮 Play games\n📺 Watch ads\n👥 Invite friends\n💰 Withdraw to your wallet\n\n` +
    `Tap <b>Open AstroBlitz</b> to launch the mini app!`;

  const reply_markup = {
    inline_keyboard: [
      [{ text: "🚀 Open AstroBlitz", web_app: { url: "https://t.me/AstroBlitzbot/play" } }],
      [
        { text: "💬 Community", url: "https://t.me/AstroBlitzcommunity" },
        { text: "💸 Payments", url: "https://t.me/AstroBlitzpayment" },
      ],
    ],
  };

  // Try sendPhoto first; if logo URL not reachable by Telegram, fall back to text.
  try {
    await sendPhoto({
      chat_id: chatId,
      photo: logoUrl,
      caption,
      parse_mode: "HTML",
      reply_markup,
    });
  } catch {
    await sendMessage({
      chat_id: chatId,
      text: caption,
      parse_mode: "HTML",
      reply_markup,
      disable_web_page_preview: true,
    });
  }
}
