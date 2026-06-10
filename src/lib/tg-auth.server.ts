// Server helper: validate Telegram initData and return verified user + profile.
import { verifyInitData, type TelegramUser } from "./telegram.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function requireTgUser(initData: string): Promise<TelegramUser> {
  const v = verifyInitData(initData);
  if (!v.ok) throw new Error(`Telegram verification failed: ${v.error}`);
  return v.user;
}

export async function requireProfile(initData: string, opts?: { allowSuspended?: boolean }) {
  const user = await requireTgUser(initData);
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("tg_id", user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Profile not found — open the app from Telegram first.");
  if (data.is_suspended && !opts?.allowSuspended) throw new Error("Account suspended");
  return { user, profile: data };
}

export async function getSetting<T = unknown>(key: string, fallback: T): Promise<T> {
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (!data) return fallback;
  return data.value as T;
}

export async function creditCoins(tgId: number, delta: number, reason: string, meta?: Record<string, unknown>) {
  const { data, error } = await supabaseAdmin.rpc("credit_coins", {
    p_tg_id: tgId,
    p_delta: delta,
    p_reason: reason,
    p_meta: (meta ?? null) as never,
  });
  if (error) throw new Error(error.message);
  return data as unknown as number;
}
