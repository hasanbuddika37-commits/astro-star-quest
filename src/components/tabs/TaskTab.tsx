import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listTasks, completeTask } from "@/lib/tasks.functions";
import { listChallenges, claimChallenge } from "@/lib/challenges.functions";
import { getLeaderboard } from "@/lib/leaderboard.functions";

type Task = { id: string; title: string; description: string | null; reward: number; url: string | null; kind: string; task_type?: string | null; channel_username?: string | null; completed: boolean };
type Challenge = { id: string; title: string; description: string | null; goal: number; reward: number; progress: number; claimed: boolean; period: string; kind: string };
type Leader = { tg_id: number; first_name: string | null; username: string | null; coins: number };
type Category = "main" | "partner" | "community";

export default function TaskTab({ initData, onCoins }: { initData: string; onCoins: (c: number) => void }) {
  const [tab, setTab] = useState<"tasks" | "challenges" | "leaderboard">("tasks");
  const [cat, setCat] = useState<Category>("main");
  const lT = useServerFn(listTasks); const cT = useServerFn(completeTask);
  const lC = useServerFn(listChallenges); const cC = useServerFn(claimChallenge);
  const lL = useServerFn(getLeaderboard);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [chs, setChs] = useState<Challenge[]>([]);
  const [lb, setLb] = useState<{ top: Leader[]; me_rank: number | null; me_coins: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    lT({ data: { initData, category: cat } }).then((r) => setTasks(r as Task[])).catch(console.error);
  }, [cat]);
  useEffect(() => {
    lC({ data: { initData } }).then(setChs).catch(console.error);
    lL({ data: { initData } }).then(setLb).catch(console.error);
  }, []);

  async function doTask(t: Task) {
    setErr(null);
    if (t.url) window.Telegram?.WebApp?.openLink?.(t.url) ?? window.open(t.url, "_blank");
    const wait = t.kind === "telegram_channel" || t.channel_username ? 3500 : 1500;
    setTimeout(async () => {
      try {
        const r = await cT({ data: { initData, task_id: t.id } });
        onCoins(r.new_balance);
        setTasks((x) => x.map((y) => (y.id === t.id ? { ...y, completed: true } : y)));
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Task failed");
      }
    }, wait);
  }

  async function claimCh(c: Challenge) {
    try {
      const r = await cC({ data: { initData, challenge_id: c.id } });
      onCoins(r.new_balance);
      setChs((x) => x.map((y) => (y.id === c.id ? { ...y, claimed: true } : y)));
    } catch (e) { console.error(e); }
  }

  return (
    <div>
      <h2 className="text-xl font-extrabold">✅ Tasks & Challenges</h2>
      <div className="mt-3 grid grid-cols-3 gap-1 rounded-2xl border border-border bg-card/50 p-1">
        {(["tasks", "challenges", "leaderboard"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-xl py-2 text-xs font-bold capitalize ${tab === t ? "text-primary-foreground" : "text-muted-foreground"}`} style={tab === t ? { background: "var(--gradient-primary)" } : undefined}>
            {t}
          </button>
        ))}
      </div>

      {tab === "tasks" && (
        <>
          <div className="mt-3 grid grid-cols-3 gap-1 rounded-2xl border border-border bg-card/40 p-1">
            {(["main", "partner", "community"] as Category[]).map((c) => (
              <button key={c} onClick={() => setCat(c)} className={`rounded-xl py-1.5 text-[11px] font-bold capitalize ${cat === c ? "text-primary-foreground" : "text-muted-foreground"}`} style={cat === c ? { background: "var(--gradient-blitz)" } : undefined}>
                {c === "main" ? "🎯 Main" : c === "partner" ? "🤝 Partner" : "💬 Community"}
              </button>
            ))}
          </div>
          {err && <p className="mt-2 rounded-xl bg-destructive/15 px-3 py-2 text-xs text-destructive">{err}</p>}
          <div className="mt-3 space-y-2">
            {tasks.length === 0 && <Empty text={`No ${cat} tasks yet — check back soon.`} />}
            {tasks.map((t) => (
              <div key={t.id} className="rounded-2xl border border-border bg-card/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-bold">
                      {t.title}
                      {(t.kind === "telegram_channel" || t.channel_username) && <span className="ml-2 text-[10px] text-cyan-accent">🔗 join-verified</span>}
                    </p>
                    {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                  </div>
                  {t.completed ? (
                    <span className="rounded-lg bg-green-500/20 px-3 py-1 text-xs font-bold text-green-300">✓ Done</span>
                  ) : (
                    <button onClick={() => doTask(t)} className="rounded-xl px-3 py-1.5 text-xs font-bold text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
                      +{t.reward}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "challenges" && (
        <div className="mt-4 space-y-2">
          {chs.length === 0 && <Empty text="No challenges yet." />}
          {chs.map((c) => {
            const pct = Math.min(100, (c.progress / c.goal) * 100);
            const ready = c.progress >= c.goal && !c.claimed;
            return (
              <div key={c.id} className="rounded-2xl border border-border bg-card/70 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-bold">{c.title} <span className="text-[10px] text-muted-foreground">({c.period})</span></p>
                    <p className="text-xs text-muted-foreground">{c.description}</p>
                  </div>
                  {c.claimed ? (
                    <span className="rounded-lg bg-green-500/20 px-2 py-1 text-[10px] font-bold text-green-300">Claimed</span>
                  ) : ready ? (
                    <button onClick={() => claimCh(c)} className="rounded-xl px-3 py-1.5 text-xs font-bold text-primary-foreground" style={{ background: "var(--gradient-blitz)" }}>
                      Claim +{c.reward}
                    </button>
                  ) : (
                    <span className="text-xs font-bold text-gold">+{c.reward}</span>
                  )}
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-background">
                  <div className="h-full" style={{ width: `${pct}%`, background: "var(--gradient-primary)" }} />
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">{c.progress} / {c.goal}</p>
              </div>
            );
          })}
        </div>
      )}

      {tab === "leaderboard" && lb && (
        <div className="mt-4">
          <div className="rounded-2xl border border-border bg-card/60 p-3 text-center text-xs">
            Your rank: <b className="text-gold">#{lb.me_rank ?? "—"}</b> • <b>{Number(lb.me_coins).toLocaleString()}</b> coins
          </div>
          <div className="mt-3 space-y-1">
            {lb.top.map((u, i) => (
              <div key={u.tg_id} className="flex items-center justify-between rounded-xl border border-border bg-card/40 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className={`grid h-7 w-7 place-items-center rounded-lg text-xs font-bold ${i < 3 ? "bg-gold text-background" : "bg-card text-foreground"}`}>
                    {i + 1}
                  </span>
                  <span className="text-sm font-semibold">
                    {u.first_name ?? "Player"} {u.username && <span className="text-muted-foreground">@{u.username}</span>}
                  </span>
                </div>
                <span className="text-sm font-bold text-gold">{Number(u.coins).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">{text}</div>;
}
