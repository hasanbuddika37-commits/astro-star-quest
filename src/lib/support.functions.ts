import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const listTickets = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ initData: z.string().min(10) }).parse(d))
  .handler(async ({ data }) => {
    const { requireProfile } = await import("./tg-auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { profile } = await requireProfile(data.initData, { allowSuspended: true });
    const { data: list } = await supabaseAdmin
      .from("support_tickets").select("*")
      .eq("tg_id", profile.tg_id).order("created_at", { ascending: false });
    return list ?? [];
  });

export const ticketDetail = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ initData: z.string().min(10), ticket_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { requireProfile } = await import("./tg-auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { profile } = await requireProfile(data.initData);
    const { data: t } = await supabaseAdmin
      .from("support_tickets").select("*").eq("id", data.ticket_id).maybeSingle();
    if (!t || t.tg_id !== profile.tg_id) throw new Error("Not found");
    const { data: msgs } = await supabaseAdmin
      .from("ticket_messages").select("*").eq("ticket_id", t.id).order("created_at");
    return { ticket: t, messages: msgs ?? [] };
  });

export const createTicket = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      initData: z.string().min(10),
      subject: z.string().min(2).max(120),
      body: z.string().min(2).max(2000),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { requireProfile, getSetting } = await import("./tg-auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendMessage } = await import("./telegram.server");
    const { profile } = await requireProfile(data.initData, { allowSuspended: true });
    const { data: t, error } = await supabaseAdmin
      .from("support_tickets").insert({ tg_id: profile.tg_id, subject: data.subject })
      .select("*").single();
    if (error || !t) throw new Error(error?.message ?? "Failed");
    await supabaseAdmin.from("ticket_messages").insert({
      ticket_id: t.id, author: "user", body: data.body,
    });
    try {
      const adminId = await getSetting<number | string | null>("admin_tg_id", null);
      if (adminId) {
        await sendMessage({
          chat_id: adminId, parse_mode: "HTML",
          text: `🆘 <b>New support ticket</b>\n#${t.id.slice(0,8)} from <code>${profile.tg_id}</code>\n<b>${data.subject}</b>\n${data.body.slice(0,400)}`,
        });
      }
    } catch { /* ignore */ }
    return t;
  });

export const postTicketMessage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      initData: z.string().min(10),
      ticket_id: z.string().uuid(),
      body: z.string().min(1).max(2000),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { requireProfile } = await import("./tg-auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { profile } = await requireProfile(data.initData);
    const { data: t } = await supabaseAdmin
      .from("support_tickets").select("tg_id").eq("id", data.ticket_id).maybeSingle();
    if (!t || t.tg_id !== profile.tg_id) throw new Error("Not found");
    await supabaseAdmin.from("ticket_messages").insert({
      ticket_id: data.ticket_id, author: "user", body: data.body,
    });
    await supabaseAdmin.from("support_tickets")
      .update({ status: "open", updated_at: new Date().toISOString() })
      .eq("id", data.ticket_id);
    return { ok: true };
  });
