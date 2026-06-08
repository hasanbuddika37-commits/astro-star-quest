// Server-only Telegram Bot helpers. Never import from client code.
import { createHmac, createHash, timingSafeEqual } from "crypto";

const API_BASE = "https://api.telegram.org";

function botToken(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  return t;
}

export function deriveWebhookSecret(): string {
  return createHash("sha256")
    .update(`telegram-webhook:${botToken()}`)
    .digest("base64url");
}

export function safeEqualString(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

type ReplyMarkup = {
  inline_keyboard?: Array<Array<{ text: string; url?: string; callback_data?: string; web_app?: { url: string } }>>;
};

export async function tgCall<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API_BASE}/bot${botToken()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!data.ok) throw new Error(`Telegram ${method} failed: ${data.description ?? res.status}`);
  return data.result as T;
}

export async function sendMessage(opts: {
  chat_id: number | string;
  text: string;
  parse_mode?: "HTML" | "MarkdownV2";
  reply_markup?: ReplyMarkup;
  disable_web_page_preview?: boolean;
}) {
  return tgCall("sendMessage", opts);
}

export async function sendPhoto(opts: {
  chat_id: number | string;
  photo: string;
  caption?: string;
  parse_mode?: "HTML";
  reply_markup?: ReplyMarkup;
}) {
  return tgCall("sendPhoto", opts);
}

// Verify Telegram WebApp initData per https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
export function verifyInitData(initData: string): { ok: true; user: TelegramUser; startParam?: string } | { ok: false; error: string } {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return { ok: false, error: "Missing hash" };
    params.delete("hash");

    const dataCheckString = [...params.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join("\n");

    const secretKey = createHmac("sha256", "WebAppData").update(botToken()).digest();
    const computed = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

    if (computed !== hash) return { ok: false, error: "Invalid hash" };

    // Optional freshness check: 1 day max
    const authDate = Number(params.get("auth_date") ?? 0);
    if (!authDate || Date.now() / 1000 - authDate > 86400) {
      return { ok: false, error: "Stale initData" };
    }

    const userJson = params.get("user");
    if (!userJson) return { ok: false, error: "Missing user" };
    const user = JSON.parse(userJson) as TelegramUser;
    const startParam = params.get("start_param") ?? undefined;
    return { ok: true, user, startParam };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "verifyInitData failed" };
  }
}

export type TelegramUser = {
  id: number;
  is_bot?: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
};
