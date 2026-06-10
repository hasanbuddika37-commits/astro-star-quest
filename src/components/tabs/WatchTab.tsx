import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getAdSlots, claimAdButton } from "@/lib/ads.functions";
import { showAd } from "@/lib/adsdk";

type CardBtn = { index: number; ready: boolean; unlocks_in_ms: number };
type Card = {
  network: string;
  label: string;
  logo_url: string | null;
  reward_min: number;
  reward_max: number;
  cooldown_seconds: number;
  button_lock_seconds: number;
  sdk_extra: Record<string, unknown> | null;
  buttons: CardBtn[];
};

const NETWORK_LOGOS: Record<string, string> = {
  adsgram: "https://adsgram.ai/favicon.ico",
  monetag: "https://monetag.com/favicon.ico",
  gigapub: "https://gigapub.tech/favicon.ico",
};

export default function WatchTab({ initData, onCoins }: { initData: string; onCoins: (c: number) => void }) {
  const load = useServerFn(getAdSlots);
  const claim = useServerFn(claimAdButton);
  const [cards, setCards] = useState<Card[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<{ net: string; idx: number } | null>(null);
  const [lock, setLock] = useState<{ net: string; until: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    try {
      const r = await load({ data: { initData } });
      setCards(r.cards as Card[]);
    } catch (e) {
      console.error(e);
    }
  }
  useEffect(() => { refresh().catch(console.error); }, []);
  useEffect(() => {
    const t = setInterval(() => {
      setCards((cs) => cs.map((c) => ({
        ...c,
        buttons: c.buttons.map((b) => ({
          ...b,
          unlocks_in_ms: Math.max(0, b.unlocks_in_ms - 1000),
          ready: b.unlocks_in_ms <= 1000,
        })),
      })));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  async function watchOne(card: Card, btn: CardBtn) {
    if (busy) return;
    if (lock && lock.net === card.network && lock.until > Date.now()) return;
    setBusy({ net: card.network, idx: btn.index });
    setMsg(null);
    try {
      // Ad MUST play (strict). If it throws, do NOT claim.
      await showAd(card.network, card.sdk_extra, "reward");
      const r = await claim({ data: { initData, network: card.network, button_index: btn.index } });
      onCoins(r.new_balance);
      setMsg(`+${r.reward} coins 🎉`);
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
      setLock({ net: card.network, until: Date.now() + card.button_lock_seconds * 1000 });
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? `Ad failed: ${e.message}` : "Ad failed");
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <h2 className="text-xl font-extrabold">📺 Watch & Earn</h2>
      <p className="text-xs text-muted-foreground">
        Tap a card to expand. Each button gives <b>random coins</b>, then locks for 12h.
      </p>
      {msg && (
        <p className="mt-2 rounded-xl bg-card/70 border border-border px-3 py-2 text-xs text-center">{msg}</p>
      )}

      <div className="mt-4 space-y-3">
        {cards.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            No ad networks active yet.
          </div>
        )}
        {cards.map((c) => {
          const ready = c.buttons.filter((b) => b.ready).length;
          const total = c.buttons.length;
          const isOpen = open === c.network;
          const locked = !!(lock && lock.net === c.network && lock.until > Date.now());
          const lockLeft = locked ? Math.ceil((lock!.until - Date.now()) / 1000) : 0;
          return (
            <div key={c.network} className="rounded-2xl border border-border bg-card/70 overflow-hidden">
              <button
                onClick={() => setOpen(isOpen ? null : c.network)}
                className="w-full flex items-center gap-3 p-4 text-left"
              >
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-background overflow-hidden border border-border">
                  <img
                    src={c.logo_url || NETWORK_LOGOS[c.network] || ""}
                    alt={c.label}
                    onError={(e) => ((e.currentTarget.style.display = "none"))}
                    className="h-9 w-9 object-contain"
                  />
                  {!c.logo_url && !NETWORK_LOGOS[c.network] && <span className="text-xl">📺</span>}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold">{c.label}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {c.reward_min}–{c.reward_max} coins / ad • {ready}/{total} ready
                  </p>
                </div>
                <span className="text-xs">{isOpen ? "▲" : "▼"}</span>
              </button>
              {isOpen && (
                <div className="border-t border-border p-3 grid grid-cols-5 gap-2">
                  {c.buttons.map((b) => {
                    const isBusy = busy?.net === c.network && busy.idx === b.index;
                    if (isBusy) {
                      return (
                        <div key={b.index} className="rounded-xl bg-primary/20 px-2 py-3 text-center text-[10px] font-bold">
                          ⏳
                        </div>
                      );
                    }
                    if (!b.ready) {
                      return (
                        <div key={b.index} className="rounded-xl border border-border px-1 py-3 text-center text-[9px] text-muted-foreground">
                          {formatTime(b.unlocks_in_ms)}
                        </div>
                      );
                    }
                    if (locked) {
                      return (
                        <div key={b.index} className="rounded-xl border border-border px-1 py-3 text-center text-[10px] text-muted-foreground">
                          🔒 {lockLeft}s
                        </div>
                      );
                    }
                    return (
                      <button
                        key={b.index}
                        onClick={() => watchOne(c, b)}
                        className="rounded-xl px-2 py-3 text-center text-[10px] font-bold text-primary-foreground"
                        style={{ background: "var(--gradient-primary)" }}
                      >
                        ▶
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatTime(ms: number) {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60);
  if (h) return `${h}h${m ? ` ${m}m` : ""}`;
  if (m) return `${m}m`;
  return `${s}s`;
}
