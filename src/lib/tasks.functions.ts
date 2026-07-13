import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const listTasks = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      initData: z.string().min(10),
      category: z.enum(["main", "partner", "community"]).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { requireProfile } = await import("./tg-auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { profile } = await requireProfile(data.initData);

    let q = supabaseAdmin.from("tasks").select("*").eq("is_active", true).order("sort_order");
    if (data.category) q = q.eq("task_type", data.category);
    const { data: tasks } = await q;
    const { data: done } = await supabaseAdmin
      .from("task_completions").select("task_id").eq("tg_id", profile.tg_id);
    const doneSet = new Set((done ?? []).map((d) => d.task_id));
    const isDirectImage = (url: string) => /\.(png|jpe?g|webp|gif|avif|svg)(\?.*)?$/i.test(url);
    const resolveIconUrl = async (url: string | null): Promise<string | null> => {
      if (!url) return null;
      if (isDirectImage(url)) return url;
      try {
        const res = await fetch(url, { headers: { "user-agent": "AstroBlitzBot/1.0" } });
        const html = await res.text();
        const match = html.match(/<meta\s+(?:property|name)=["'](?:og:image|twitter:image)["']\s+content=["']([^"']+)["']/i)
          ?? html.match(/<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["'](?:og:image|twitter:image)["']/i);
        return match?.[1] ?? url;
      } catch {
        return url;
      }
    };
    return Promise.all((tasks ?? []).map(async (t) => ({
      ...t,
      icon_url: await resolveIconUrl((t as { icon_url?: string | null }).icon_url ?? null),
      completed: doneSet.has(t.id),
    })));
  });

export const completeTask = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ initData: z.string().min(10), task_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { requireProfile, creditCoins } = await import("./tg-auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { isChannelMember } = await import("./refer-progress.server");
    const { profile } = await requireProfile(data.initData);

    const { data: task, error: te } = await supabaseAdmin
      .from("tasks").select("*").eq("id", data.task_id).maybeSingle();
    if (te || !task || !task.is_active) throw new Error("Task not available");

    // Telegram channel join verification (bot must be admin in the channel)
    const t = task as unknown as { kind: string; channel_username: string | null; verify_via_join: boolean | null };
    const isChannelTask = t.kind === "telegram_channel" || t.verify_via_join === true;
    if (isChannelTask) {
      const channel = t.channel_username;
      if (!channel) throw new Error("Task misconfigured (no channel)");
      const ok = await isChannelMember(channel, profile.tg_id).catch(() => false);
      if (!ok) throw new Error("Please join the channel first, then tap again.");
    }

    const { error: ce } = await supabaseAdmin
      .from("task_completions")
      .insert({ tg_id: profile.tg_id, task_id: task.id });
    if (ce) throw new Error("Already completed");

    const new_balance = await creditCoins(profile.tg_id, Number(task.reward), "task", {
      task_id: task.id,
    });
    return { reward: Number(task.reward), new_balance };
  });
