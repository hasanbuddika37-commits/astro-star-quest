// Admin auth + helpers (server-only).
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SESSION_TTL_HOURS = 24 * 7;

function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pw, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(pw: string, stored: string): boolean {
  if (stored.startsWith("BOOTSTRAP:")) {
    return stored.slice("BOOTSTRAP:".length) === pw;
  }
  if (!stored.startsWith("scrypt$")) return false;
  const [, salt, hash] = stored.split("$");
  const calc = scryptSync(pw, salt, 64);
  const stored_buf = Buffer.from(hash, "hex");
  return calc.length === stored_buf.length && timingSafeEqual(calc, stored_buf);
}

export async function adminLogin(email: string, password: string): Promise<string> {
  const { data: u } = await supabaseAdmin
    .from("admin_users").select("*").eq("email", email.toLowerCase().trim()).maybeSingle();
  if (!u) throw new Error("Invalid email or password");
  if (!verifyPassword(password, u.password_hash)) throw new Error("Invalid email or password");
  // Upgrade bootstrap hash on first login
  if (u.password_hash.startsWith("BOOTSTRAP:")) {
    await supabaseAdmin.from("admin_users").update({ password_hash: hashPassword(password) }).eq("id", u.id);
  }
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000).toISOString();
  await supabaseAdmin.from("admin_sessions").insert({ token, admin_id: u.id, expires_at: expires });
  return token;
}

export async function requireAdmin(token: string | null | undefined) {
  if (!token) throw new Error("Unauthorized");
  const { data: s } = await supabaseAdmin
    .from("admin_sessions").select("*").eq("token", token).maybeSingle();
  if (!s || new Date(s.expires_at) < new Date()) throw new Error("Session expired");
  return s;
}

export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function adminChangeCreds(
  adminId: string,
  currentPassword: string,
  newEmail?: string,
  newPassword?: string,
): Promise<{ ok: true }> {
  const { data: u } = await supabaseAdmin.from("admin_users").select("*").eq("id", adminId).maybeSingle();
  if (!u) throw new Error("Admin not found");
  if (!verifyPassword(currentPassword, u.password_hash)) throw new Error("Current password is wrong");
  const upd: Record<string, string> = {};
  if (newEmail && newEmail.toLowerCase() !== u.email) upd.email = newEmail.toLowerCase().trim();
  if (newPassword) upd.password_hash = hashPassword(newPassword);
  if (Object.keys(upd).length === 0) return { ok: true };
  const { error } = await supabaseAdmin.from("admin_users").update(upd).eq("id", adminId);
  if (error) throw new Error(error.message);
  return { ok: true };
}
