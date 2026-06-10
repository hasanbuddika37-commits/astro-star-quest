import { useEffect, useState, useCallback } from "react";
import { initSession } from "@/lib/auth.functions";
import { showAd } from "@/lib/adsdk";
import HomeTab from "./tabs/HomeTab";
import GameTab from "./tabs/GameTab";
import WatchTab from "./tabs/WatchTab";
import TaskTab from "./tabs/TaskTab";
import ReferTab from "./tabs/ReferTab";
import WithdrawTab from "./tabs/WithdrawTab";

export type TabId = "home" | "watch" | "task" | "refer" | "withdraw" | "game";

export type Profile = Awaited<ReturnType<typeof initSession>>["profile"];

type Props = { initData: string; profile: Profile; onProfile: (p: Profile) => void };

export default function MainApp({ initData, profile, onProfile }: Props) {
  const [tab, setTab] = useState<TabId>("home");

  // First interstitial 1–3s after open, then every 60–70s while open.
  useEffect(() => {
    let cancelled = false;
    const showOnce = () => {
      showAd("adsgram", { blocks: ["int-34544"] }, "interstitial").catch(() => {});
    };
    const firstT = setTimeout(showOnce, 1000 + Math.random() * 2000);
    let loopT: ReturnType<typeof setTimeout>;
    const scheduleNext = () => {
      if (cancelled) return;
      const delay = (60 + Math.random() * 10) * 1000;
      loopT = setTimeout(() => { showOnce(); scheduleNext(); }, delay);
    };
    scheduleNext();
    return () => { cancelled = true; clearTimeout(firstT); clearTimeout(loopT!); };
  }, []);

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
      </main>
      <BottomNav tab={tab} onTab={setTab} />
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
