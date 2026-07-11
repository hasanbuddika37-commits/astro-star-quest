import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getReferStats } from "@/lib/refer.functions";

type Stats = Awaited<ReturnType<typeof getReferStats>>;

export default function ReferTab({ initData }: { initData: string }) {
  const get = useServerFn(getReferStats);
  const [s, setS] = useState<Stats | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { get({ data: { initData } }).then(setS).catch(console.error); }, []);

  if (!s) return <p className="text-center text-sm text-muted-foreground">Loading…</p>;

  async function copy() {
    await navigator.clipboard.writeText(s!.share_url);
    setCopied(true);
    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
    setTimeout(() => setCopied(false), 1500);
  }
  function share() {
    const url = `https://t.me/share/url?url=${encodeURIComponent(s!.share_url)}&text=${encodeURIComponent("🚀 Join me on AstroBlitz — play games and earn crypto!")}`;
    window.Telegram?.WebApp?.openTelegramLink?.(url) ?? window.open(url, "_blank");
  }

  return (
    <div>
      <h2 className="text-xl font-extrabold">👥 Invite & Earn</h2>
      <p className="text-xs text-muted-foreground">
        3-stage rewards: <b className="text-gold">+{s.stages.r0}</b> on join, <b className="text-gold">+{s.stages.r1}</b> at {s.stages.n1} ads (Day 1), <b className="text-gold">+{s.stages.r2}</b> at {s.stages.n2} ads (Day 2). Plus <b className="text-gold">{s.commission_pct}%</b> lifetime commission.
      </p>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Mini label="Total" value={s.total_refers} />
        <Mini label="Verified" value={s.verified_refers} />
        <Mini label="Commission" value={s.earned_commission.toFixed(0)} />
      </div>

      <div className="mt-4 rounded-2xl border border-border bg-card/70 p-4">
        <p className="text-xs text-muted-foreground">Your refer link</p>
        <p className="mt-1 break-all text-xs font-mono">{s.share_url}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={copy} className="h-10 rounded-xl border border-border text-sm font-bold">
            {copied ? "✓ Copied" : "📋 Copy"}
          </button>
          <button onClick={share} className="h-10 rounded-xl text-sm font-bold text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
            📤 Share
          </button>
        </div>
      </div>

      <h3 className="mt-6 text-sm font-bold">Your invited friends</h3>
      <div className="mt-2 space-y-1">
        {s.list.length === 0 && (
          <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">No invites yet. Share your link!</p>
        )}
        {s.list.map((u) => {
          const stage = Number((u as unknown as { refer_stage?: number }).refer_stage ?? 0);
          const d1 = Number((u as unknown as { day1_ads?: number }).day1_ads ?? 0);
          const d2 = Number((u as unknown as { day2_ads?: number }).day2_ads ?? 0);
          return (
            <div key={u.tg_id} className="rounded-xl border border-border bg-card/40 px-3 py-2 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span>{u.first_name ?? "Friend"} {u.username && <span className="text-muted-foreground">@{u.username}</span>}</span>
                <span className="text-[10px] font-bold text-gold">Stage {stage}/3</span>
              </div>
              <div className="grid grid-cols-3 gap-1 text-[10px]">
                <span className={stage >= 1 ? "text-green-300" : "text-muted-foreground"}>✅ Joined (+{s.stages.r0})</span>
                <span className={stage >= 2 ? "text-green-300" : "text-muted-foreground"}>{stage >= 2 ? "✅" : "⏳"} Day1 {Math.min(d1, s.stages.n1)}/{s.stages.n1} (+{s.stages.r1})</span>
                <span className={stage >= 3 ? "text-green-300" : "text-muted-foreground"}>{stage >= 3 ? "✅" : "🔒"} Day2 {Math.min(d2, s.stages.n2)}/{s.stages.n2} (+{s.stages.r2})</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 px-2 py-2">
      <p className="text-base font-bold">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}
