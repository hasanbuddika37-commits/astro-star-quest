import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getAdSlots, claimAdButton, getAdNetworks, getVisitSites, claimVisitSite } from "@/lib/ads.functions";
import { showAdWithFallback } from "@/lib/adsdk";

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
type Site = { id: number; label: string; url: string; ready: boolean; unlocks_in_ms: number };

// Reliable icon service — works for any domain even if the site blocks direct favicon hotlinking.
const NETWORK_LOGOS: Record<string, string> = {
  adsgram: "https://www.google.com/s2/favicons?domain=adsgram.ai&sz=64",
  monetag: "https://www.google.com/s2/favicons?domain=monetag.com&sz=64",
  gigapub: "https://www.google.com/s2/favicons?domain=gigapub.tech&sz=64",
  taddy:   "https://www.google.com/s2/favicons?domain=taddy.pro&sz=64",
  uslads:  "https://www.google.com/s2/favicons?domain=uslads.com&sz=64",
};
const NETWORK_EMOJI: Record<string, string> = {
  adsgram: "🅰️", monetag: "💰", gigapub: "🎯", taddy: "🦖", uslads: "🗼",
};

export default function WatchTab({ initData, onCoins }: { initData: string; onCoins: (c: number) => void }) {
  const load = useServerFn(getAdSlots);
  const claim = useServerFn(claimAdButton);
  const listNets = useServerFn(getAdNetworks);
  const [cards, setCards] = useState<Card[]>([]);
  const [busy, setBusy] = useState<{ net: string; idx: number } | null>(null);
  const [lock, setLock] = useState<{ net: string; until: number } | null>(null);
  const [rewardPop, setRewardPop] = useState<{ amount: number; label: string } | null>(null);
  const [openCard, setOpenCard] = useState<Card | null>(null);
  const [tab, setTab] = useState<"ads" | "sites">("ads");

  async function refresh() {
    try { const r = await load({ data: { initData } }); setCards(r.cards as Card[]); }
    catch (e) { console.error(e); }
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
  // Keep the modal card in sync with refreshed cards
  useEffect(() => {
    if (!openCard) return;
    const fresh = cards.find((c) => c.network === openCard.network);
    if (fresh) setOpenCard(fresh);
  }, [cards, openCard?.network]);

  async function watchOne(card: Card, btn: CardBtn) {
    if (busy) return;
    if (lock && lock.net === card.network && lock.until > Date.now()) return;
    setBusy({ net: card.network, idx: btn.index });
    try {
      const all = await listNets({ data: { initData } }).catch(() => ({ networks: [] as { network: string; sdk_extra: unknown }[] }));
      const others = (all.networks ?? []).filter((n) => n.network !== card.network);
      const adsgram = others.find((n) => n.network === "adsgram");
      const rest = others.filter((n) => n.network !== "adsgram");
      const fallbacks = [adsgram, ...rest].filter(Boolean) as { network: string; sdk_extra: unknown }[];
      await showAdWithFallback(
        { network: card.network, sdk_extra: card.sdk_extra ?? undefined },
        fallbacks.map((n) => ({ network: n.network, sdk_extra: (n.sdk_extra as Record<string, unknown>) ?? undefined })),
        "reward",
      );
      const r = await claim({ data: { initData, network: card.network, button_index: btn.index } });
      onCoins(r.new_balance);
      setRewardPop({ amount: r.reward, label: card.label });
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
      setLock({ net: card.network, until: Date.now() + card.button_lock_seconds * 1000 });
      await refresh();
    } catch (e) {
      setRewardPop({ amount: 0, label: e instanceof Error ? e.message : "Ad failed" });
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <h2 className="text-xl font-extrabold">📺 Watch & Earn</h2>
      <p className="text-xs text-muted-foreground">Tap a card to open it. Each button gives random coins.</p>

      <div className="mt-3 grid grid-cols-2 gap-1 rounded-2xl border border-border bg-card/50 p-1">
        {(["ads", "sites"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-xl py-2 text-xs font-bold ${tab === t ? "text-primary-foreground" : "text-muted-foreground"}`}
            style={tab === t ? { background: "var(--gradient-primary)" } : undefined}>
            {t === "ads" ? "📺 Watch Ads" : "🌐 Visit Site"}
          </button>
        ))}
      </div>

      {tab === "ads" && (
        <div className="mt-4 space-y-3">
          {cards.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
              No ad networks active yet.
            </div>
          )}
          {cards.map((c) => {
            const ready = c.buttons.filter((b) => b.ready).length;
            const total = c.buttons.length;
            return (
              <button key={c.network} onClick={() => setOpenCard(c)}
                className="w-full flex items-center gap-3 p-4 text-left rounded-2xl border border-border bg-card/70">
                <NetworkIcon network={c.network} logo={c.logo_url} />
                <div className="flex-1">
                  <p className="text-sm font-bold">{c.label}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {c.reward_min}–{c.reward_max} coins / ad • {ready}/{total} ready
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">Tap ▶</span>
              </button>
            );
          })}
        </div>
      )}

      {tab === "sites" && <VisitSitesPanel initData={initData} onCoins={onCoins} onReward={setRewardPop} />}

      {openCard && (
        <AdButtonsModal
          card={openCard} lock={lock} busy={busy}
          onClose={() => setOpenCard(null)}
          onWatch={(b) => watchOne(openCard, b)}
        />
      )}
      {rewardPop && <RewardPopup data={rewardPop} onClose={() => setRewardPop(null)} />}
    </div>
  );
}

function NetworkIcon({ network, logo }: { network: string; logo: string | null }) {
  const [err, setErr] = useState(false);
  const src = logo || NETWORK_LOGOS[network];
  return (
    <div className="grid h-11 w-11 place-items-center rounded-xl bg-background overflow-hidden border border-border shrink-0">
      {src && !err ? (
        <img src={src} alt={network} onError={() => setErr(true)} className="h-9 w-9 object-contain" />
      ) : (
        <span className="text-xl">{NETWORK_EMOJI[network] ?? "📺"}</span>
      )}
    </div>
  );
}

function AdButtonsModal({
  card, lock, busy, onClose, onWatch,
}: {
  card: Card; lock: { net: string; until: number } | null; busy: { net: string; idx: number } | null;
  onClose: () => void; onWatch: (b: CardBtn) => void;
}) {
  const locked = !!(lock && lock.net === card.network && lock.until > Date.now());
  const lockLeft = locked ? Math.ceil((lock!.until - Date.now()) / 1000) : 0;
  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center bg-black/70 p-3" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl border border-border bg-card p-4 shadow-2xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center gap-3">
          <NetworkIcon network={card.network} logo={card.logo_url} />
          <div className="flex-1">
            <p className="text-base font-extrabold">{card.label}</p>
            <p className="text-[11px] text-muted-foreground">{card.reward_min}–{card.reward_max} coins per ad</p>
          </div>
          <button onClick={onClose} className="rounded-full border border-border h-8 w-8">✕</button>
        </div>
        <div className="mt-4 space-y-2">
          {card.buttons.map((b) => {
            const isBusy = busy?.net === card.network && busy.idx === b.index;
            const disabled = !b.ready || locked || isBusy;
            return (
              <button key={b.index} disabled={disabled} onClick={() => onWatch(b)}
                className="w-full flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: disabled ? "var(--card)" : "var(--gradient-primary)", color: disabled ? "hsl(var(--muted-foreground))" : undefined, border: disabled ? "1px solid hsl(var(--border))" : "none" }}>
                <span>📺 Ads {b.index + 1}</span>
                <span className="text-xs">
                  {isBusy ? "⏳ Loading…" : locked ? `🔒 ${lockLeft}s` : b.ready ? `▶ ${card.reward_min}-${card.reward_max} coins` : `⏳ ${formatTime(b.unlocks_in_ms)}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RewardPopup({ data, onClose }: { data: { amount: number; label: string }; onClose: () => void }) {
  const success = data.amount > 0;
  useEffect(() => { const t = setTimeout(onClose, success ? 2600 : 3200); return () => clearTimeout(t); }, [onClose, success]);
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-xs rounded-3xl border border-border bg-card p-6 text-center shadow-2xl animate-in fade-in zoom-in duration-200">
        <div className="text-5xl mb-2">{success ? "🎉" : "⚠️"}</div>
        {success ? (
          <>
            <p className="text-xs text-muted-foreground">Reward earned</p>
            <p className="mt-1 text-3xl font-extrabold text-gold">+{data.amount} coins</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{data.label}</p>
          </>
        ) : (
          <>
            <p className="text-sm font-bold text-destructive">Failed</p>
            <p className="mt-1 text-xs text-muted-foreground">{data.label}</p>
          </>
        )}
        <button onClick={onClose} className="mt-4 w-full h-9 rounded-xl text-xs font-bold text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>OK</button>
      </div>
    </div>
  );
}

function VisitSitesPanel({
  initData, onCoins, onReward,
}: {
  initData: string;
  onCoins: (c: number) => void;
  onReward: (r: { amount: number; label: string }) => void;
}) {
  const get = useServerFn(getVisitSites);
  const claim = useServerFn(claimVisitSite);
  const [d, setD] = useState<Awaited<ReturnType<typeof getVisitSites>> | null>(null);
  const [watching, setWatching] = useState<{ site: Site; startedAt: number; win: Window | null } | null>(null);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const winRef = useRef<Window | null>(null);

  async function refresh() { try { setD(await get({ data: { initData } })); } catch (e) { console.error(e); } }
  useEffect(() => { refresh().catch(console.error); }, []);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 500);
    return () => clearInterval(t);
  }, []);

  const need = d?.watch_seconds ?? 5;
  const reward = d?.reward ?? 5;

  async function startWatch(site: Site) {
    if (busy) return;
    const win = window.open(site.url, "_blank", "noopener,noreferrer");
    winRef.current = win;
    setWatching({ site, startedAt: Date.now(), win });
  }
  async function finish() {
    if (!watching) return;
    const elapsed = Date.now() - watching.startedAt;
    if (elapsed < need * 1000) {
      onReward({ amount: 0, label: `Watch at least ${need}s to earn` });
      setWatching(null);
      return;
    }
    setBusy(true);
    try {
      const r = await claim({ data: { initData, site_id: watching.site.id, watched_ms: elapsed } });
      onCoins(r.new_balance);
      onReward({ amount: r.reward, label: watching.site.label });
      try { winRef.current?.close(); } catch { /* ignore */ }
      setWatching(null);
      await refresh();
    } catch (e) {
      onReward({ amount: 0, label: e instanceof Error ? e.message : "Failed" });
    } finally { setBusy(false); }
  }

  if (!d) return <p className="mt-4 text-center text-xs text-muted-foreground">Loading…</p>;

  return (
    <div className="mt-4 space-y-3">
      <p className="text-[11px] text-muted-foreground">
        Open a site & keep it open for <b>{need}s</b>. Earn <b className="text-gold">+{reward} coins</b> per visit. One visit per site every 24h.
      </p>
      {d.items.map((s) => {
        const isActive = watching?.site.id === s.id;
        const elapsed = isActive ? Math.min(need, Math.floor((Date.now() - watching!.startedAt) / 1000)) : 0;
        void tick;
        return (
          <div key={s.id} className="rounded-2xl border border-border bg-card/70 p-3">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-background border border-border text-lg">🌐</div>
              <div className="flex-1">
                <p className="text-sm font-bold">{s.label}</p>
                <p className="text-[10px] text-muted-foreground">+{reward} coins • 24h cooldown</p>
              </div>
              {!s.ready && !isActive ? (
                <span className="rounded-lg border border-border px-2 py-1 text-[10px] text-muted-foreground">🔒 {formatTime(s.unlocks_in_ms)}</span>
              ) : isActive ? (
                elapsed < need ? (
                  <span className="rounded-lg bg-primary/20 px-3 py-1.5 text-[11px] font-bold">⏳ {need - elapsed}s</span>
                ) : (
                  <button onClick={finish} disabled={busy}
                    className="rounded-lg px-3 py-1.5 text-[11px] font-bold text-primary-foreground disabled:opacity-50"
                    style={{ background: "var(--gradient-primary)" }}>
                    {busy ? "…" : `🎁 Claim`}
                  </button>
                )
              ) : (
                <button onClick={() => startWatch(s)}
                  className="rounded-lg px-3 py-1.5 text-[11px] font-bold text-primary-foreground"
                  style={{ background: "var(--gradient-blitz)" }}>▶ Visit</button>
              )}
            </div>
          </div>
        );
      })}
      {watching && (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3 text-[11px] text-yellow-200">
          Keep the site open for at least {need}s, then tap 🎁 Claim.
        </div>
      )}
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
