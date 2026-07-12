import { useEffect, useState, useCallback } from "react";
import { initSession } from "@/lib/auth.functions";
import { showAd } from "@/lib/adsdk";
import HomeTab from "./tabs/HomeTab";
import GameTab from "./tabs/GameTab";
import WatchTab from "./tabs/WatchTab";
import TaskTab from "./tabs/TaskTab";
import ReferTab from "./tabs/ReferTab";
import WithdrawTab from "./tabs/WithdrawTab";

export type TabId = "home" | "watch" | "task" | "refer" | "withdraw" | "game" | "admin";

export type Profile = Awaited<ReturnType<typeof initSession>>["profile"];

type Props = { initData: string; profile: Profile; onProfile: (p: Profile) => void; isAdmin?: boolean };

export default function MainApp({ initData, profile, onProfile, isAdmin = false }: Props) {
  const [tab, setTab] = useState<TabId>("home");
  const [showVpnHint, setShowVpnHint] = useState(false);

  // Auto interstitial (Adsgram only) — runs ONLY while Home tab is open.
  useEffect(() => {
    if (tab !== "home") return;
    let cancelled = false;
    let vpnHinted = false;
    const showOnce = () => {
      showAd("adsgram", { blocks: ["int-34544"] }, "interstitial").catch(() => {
        if (!vpnHinted) { vpnHinted = true; setShowVpnHint(true); }
      });
    };
    const firstT = setTimeout(showOnce, 1500 + Math.random() * 1500);
    let loopT: ReturnType<typeof setTimeout>;
    const scheduleNext = () => {
      if (cancelled) return;
      const delay = (60 + Math.random() * 10) * 1000;
      loopT = setTimeout(() => { showOnce(); scheduleNext(); }, delay);
    };
    scheduleNext();
    return () => { cancelled = true; clearTimeout(firstT); clearTimeout(loopT!); };
  }, [tab]);

  const refresh = useCallback(
    async (newCoins?: number) => {
      if (typeof newCoins === "number") {
        onProfile({ ...profile, coins: newCoins });
      }
    },
    [profile, onProfile],
  );

  return (
    <div className="relative min-h-dvh ab-safe-top">
      <BgStars />
      <main className="px-3 pb-28 pt-3">
        {tab === "home" && <HomeTab profile={profile} go={setTab} />}
        {tab === "game" && <GameTab initData={initData} profile={profile} onCoins={refresh} />}
        {tab === "watch" && <WatchTab initData={initData} onCoins={refresh} />}
        {tab === "task" && <TaskTab initData={initData} onCoins={refresh} />}
        {tab === "refer" && <ReferTab initData={initData} />}
        {tab === "withdraw" && <WithdrawTab initData={initData} profile={profile} onCoins={refresh} />}
        {tab === "admin" && isAdmin && <AdminLauncher />}
      </main>
      <BottomNav tab={tab} onTab={setTab} isAdmin={isAdmin} />
      {showVpnHint && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => setShowVpnHint(false)}>
          <div className="max-w-sm rounded-2xl border border-border bg-card p-5 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="text-4xl">🌐</div>
            <h3 className="mt-2 text-lg font-extrabold">No ads available</h3>
            <p className="mt-2 text-xs text-muted-foreground">
              Ads not loading in your region. Please <b>turn on a VPN</b> (try Singapore, USA or Germany) and reopen the app to keep earning.
            </p>
            <button onClick={() => setShowVpnHint(false)} className="mt-4 w-full rounded-xl px-4 py-2 text-sm font-bold text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminLauncher() {
  return (
    <div className="ab-card-in rounded-3xl border border-border bg-card/80 p-6 text-center ab-aurora-border">
      <div className="text-5xl mb-3">🛰️</div>
      <h2 className="text-xl font-extrabold">Admin Panel</h2>
      <p className="mt-1 text-xs text-muted-foreground">Full control center — opens in a new view.</p>
      <a href="/admin" className="mt-4 inline-flex h-11 items-center justify-center rounded-xl px-6 text-sm font-bold text-primary-foreground ab-glow-pulse" style={{ background: "var(--gradient-primary)" }}>
        🚀 Open Admin
      </a>
    </div>
  );
}

function BgStars() {
  const [stars] = useState(() =>
    Array.from({ length: 35 }).map(() => ({
      top: Math.random() * 100,
      left: Math.random() * 100,
      delay: Math.random() * 2,
    })),
  );
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {stars.map((s, i) => (
        <span
          key={i}
          className="ab-star"
          style={{ top: `${s.top}%`, left: `${s.left}%`, animationDelay: `${s.delay}s` }}
        />
      ))}
    </div>
  );
}

function BottomNav({ tab, onTab, isAdmin }: { tab: TabId; onTab: (t: TabId) => void; isAdmin?: boolean }) {
  const items: { id: TabId; i: string; l: string }[] = [
    { id: "home", i: "🏠", l: "Home" },
    { id: "watch", i: "📺", l: "Watch" },
    { id: "task", i: "✅", l: "Task" },
    { id: "refer", i: "👥", l: "Refer" },
    { id: "withdraw", i: "💸", l: "Withdraw" },
    ...(isAdmin ? [{ id: "admin" as const, i: "🛠️", l: "Admin" }] : []),
  ];
  useEffect(() => {
    window.Telegram?.WebApp?.HapticFeedback?.selectionChanged();
  }, [tab]);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 ab-safe-bottom">
      <div className={`mx-3 mb-3 grid ${isAdmin ? "grid-cols-6" : "grid-cols-5"} gap-1 rounded-2xl border border-border bg-card/90 p-1.5 backdrop-blur-xl`}>

        {items.map((t) => {
          const active = tab === t.id || (t.id === "home" && tab === "game");
          return (
            <button
              key={t.id}
              onClick={() => onTab(t.id)}
              className={`flex flex-col items-center justify-center gap-0.5 rounded-xl py-2 text-[11px] font-semibold transition ${active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              style={
                active
                  ? { background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow-purple)" }
                  : undefined
              }
            >
              <span className="text-lg leading-none">{t.i}</span>
              {t.l}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
