import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const FinishSchema = z.object({
  initData: z.string().min(10).max(8192),
  level_reached: z.number().int().min(1).max(10000),
  revived: z.boolean().optional(),
});

export const finishGame = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => FinishSchema.parse(d))
  .handler(async ({ data }) => {
    const { requireProfile, creditCoins, getSetting } = await import("./tg-auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { profile } = await requireProfile(data.initData);

    const minPer = Number(await getSetting("game_min_per_level", 1));
    const maxPer = Number(await getSetting("game_max_per_level", 2));
    // Flat reward per game run (not multiplied by level) — keeps balance fair.
    const reward = Math.floor(minPer + Math.random() * (maxPer - minPer + 1));

    await supabaseAdmin.from("game_plays").insert({
      tg_id: profile.tg_id,
      level_reached: data.level_reached,
      coins_earned: reward,
      revived: !!data.revived,
    });

    // Bump game_level only if higher than current max
    const nextLevel = Math.max(profile.game_level ?? 1, data.level_reached + 1);
    if (nextLevel !== profile.game_level) {
      await supabaseAdmin.from("profiles").update({ game_level: nextLevel }).eq("tg_id", profile.tg_id);
    }

    const new_balance = await creditCoins(profile.tg_id, reward, "game_level", {
      level: data.level_reached,
      revived: !!data.revived,
    });

    return { reward, new_balance, next_level: nextLevel };
  });
