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

  // Interstitial loop every 60–70s, but NEVER while the Game tab is open.
  useEffect(() => {
    if (tab === "game") return;
    let cancelled = false;
    const showOnce = () => {
      showAd("adsgram", { blocks: ["int-34544"] }, "interstitial").catch(() => {});
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

function BottomNav({ tab, onTab }: { tab: TabId; onTab: (t: TabId) => void }) {
  const items: { id: TabId; i: string; l: string }[] = [
    { id: "home", i: "🏠", l: "Home" },
    { id: "watch", i: "📺", l: "Watch" },
    { id: "task", i: "✅", l: "Task" },
    { id: "refer", i: "👥", l: "Refer" },
    { id: "withdraw", i: "💸", l: "Withdraw" },
  ];
  useEffect(() => {
    window.Telegram?.WebApp?.HapticFeedback?.selectionChanged();
  }, [tab]);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 ab-safe-bottom">
      <div className="mx-3 mb-3 grid grid-cols-5 gap-1 rounded-2xl border border-border bg-card/90 p-1.5 backdrop-blur-xl">
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
