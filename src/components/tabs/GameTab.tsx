import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { finishGame } from "@/lib/game.functions";
import { claimAd, getRandomAdNetwork, getAdNetworks } from "@/lib/ads.functions";
import { showAdWithFallback } from "@/lib/adsdk";
import type { Profile } from "../MainApp";


type Props = { initData: string; profile: Profile; onCoins: (c: number) => void };
type Obstacle = { x: number; gapY: number; gap: number; passed?: boolean };

const GRAVITY = 0.35;
const FLAP = -6.5;
const PIPE_W = 60;
const ROCKET_X = 70;
const AD_MIN = 5;
const AD_MAX = 10;
const nextAdGap = () => AD_MIN + Math.floor(Math.random() * (AD_MAX - AD_MIN + 1));

export default function GameTab({ initData, profile, onCoins }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<"idle" | "playing" | "dead">("idle");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => Number(localStorage.getItem("ab_best") ?? 0));
  const [reward, setReward] = useState<number | null>(null);
  const [adPlaying, setAdPlaying] = useState(false);
  const [waitingResume, setWaitingResume] = useState(false);
  const finish = useServerFn(finishGame);
  const watchAdFn = useServerFn(claimAd);
  const pickAd = useServerFn(getRandomAdNetwork);
  const listNets = useServerFn(getAdNetworks);

  const [reviveUsed, setReviveUsed] = useState(false);
  const [busy, setBusy] = useState<null | "play" | "revive" | "claim">(null);
  const [error, setError] = useState<string | null>(null);

  const pausedRef = useRef(false);
  const lastAdScoreRef = useRef(0);
  const nextAdAtRef = useRef(nextAdGap());
  const stateRef = useRef({
    y: 0, v: 0, obstacles: [] as Obstacle[], frame: 0, score: 0, alive: false,
  });

  // Build an ad chain that STRONGLY prefers Adsgram interstitial, then falls back to others.
  async function playAdsgramPreferred(mode: "interstitial" | "reward" = "interstitial"): Promise<boolean> {
    try {
      const all = await listNets({ data: { initData } }).catch(() => ({ networks: [] as { network: string; sdk_extra: unknown }[] }));
      const nets = all.networks ?? [];
      if (nets.length === 0) return false;
      const adsgram = nets.find((n) => n.network === "adsgram");
      const others = nets.filter((n) => n.network !== "adsgram");
      others.sort(() => Math.random() - 0.5);
      const primary = adsgram ?? others[0];
      const fallbacks = adsgram ? others : others.slice(1);
      await showAdWithFallback(
        { network: primary.network, sdk_extra: primary.sdk_extra as never },
        fallbacks.map((f) => ({ network: f.network, sdk_extra: f.sdk_extra as never })),
        mode,
      );
      return true;
    } catch { return false; }
  }

  // Pause game, show ad, then wait for user to tap Resume before continuing.
  async function triggerMidGameAd() {
    if (pausedRef.current) return;
    pausedRef.current = true;
    setAdPlaying(true);
    try {
      await playAdsgramPreferred("interstitial");
    } finally {
      setAdPlaying(false);
      setWaitingResume(true);
      // stays paused until user taps Resume
    }
  }

  function resumeAfterAd() {
    setWaitingResume(false);
    // schedule next ad gap
    nextAdAtRef.current = stateRef.current.score + nextAdGap();
    pausedRef.current = false;
  }


  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth; const H = c.clientHeight;
    c.width = W * dpr; c.height = H * dpr; ctx.scale(dpr, dpr);

    let raf = 0;
    const stars = Array.from({ length: 40 }).map(() => ({
      x: Math.random() * W, y: Math.random() * H, s: 0.5 + Math.random() * 1.5,
    }));

    const reset = () => {
      stateRef.current = { y: H / 2, v: 0, obstacles: [], frame: 0, score: 0, alive: true };
      lastAdScoreRef.current = 0;
      nextAdAtRef.current = nextAdGap();
      pausedRef.current = false;
    };
    const spawn = () => {
      const gap = 160;
      const gapY = 60 + Math.random() * (H - 120 - gap);
      stateRef.current.obstacles.push({ x: W, gapY, gap });
    };
    const die = () => {
      if (!stateRef.current.alive) return;
      stateRef.current.alive = false;
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("error");
      setStatus("dead");
    };
    const tick = () => {
      const s = stateRef.current;
      ctx.fillStyle = "#0f0820"; ctx.fillRect(0, 0, W, H);
      for (const st of stars) {
        if (!pausedRef.current) { st.x -= 0.4; if (st.x < 0) st.x = W; }
        ctx.globalAlpha = 0.6; ctx.fillStyle = "#fff";
        ctx.fillRect(st.x, st.y, st.s, st.s); ctx.globalAlpha = 1;
      }
      if (s.alive && !pausedRef.current) {
        s.v += GRAVITY; s.y += s.v; s.frame++;
        if (s.frame % 90 === 0) spawn();
        for (const o of s.obstacles) o.x -= 2.6;
        s.obstacles = s.obstacles.filter((o) => o.x + PIPE_W > -10);
        for (const o of s.obstacles) {
          if (!o.passed && o.x + PIPE_W < ROCKET_X) {
            o.passed = true; s.score++; setScore(s.score);
            // Every 5-10 coins earned (random), pause & play Adsgram interstitial.
            if (s.score >= nextAdAtRef.current) {
              lastAdScoreRef.current = s.score;
              triggerMidGameAd();
            }
          }

          if (ROCKET_X + 16 > o.x && ROCKET_X - 16 < o.x + PIPE_W) {
            if (s.y - 14 < o.gapY || s.y + 14 > o.gapY + o.gap) die();
          }
        }
        if (s.y > H - 8 || s.y < 8) die();
      }
      ctx.fillStyle = "rgba(168,85,247,0.85)";
      for (const o of s.obstacles) {
        ctx.fillRect(o.x, 0, PIPE_W, o.gapY);
        ctx.fillRect(o.x, o.gapY + o.gap, PIPE_W, H - (o.gapY + o.gap));
      }
      ctx.save();
      ctx.translate(ROCKET_X, s.y);
      ctx.rotate(Math.min(0.6, Math.max(-0.6, s.v / 12)));
      ctx.font = "32px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("🚀", 0, 0);
      ctx.restore();
      raf = requestAnimationFrame(tick);
    };
    const flap = () => {
      if (status === "playing" && !pausedRef.current) {
        stateRef.current.v = FLAP;
        window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("light");
      }
    };

    if (status === "idle") {
      ctx.fillStyle = "#0f0820"; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#fff"; ctx.font = "bold 16px ui-rounded";
      ctx.textAlign = "center"; ctx.fillText("Tap PLAY to start", W / 2, H / 2);
    }
    if (status === "playing") { reset(); tick(); }
    if (status === "dead") {
      ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(0, 0, W, H);
    }

    c.addEventListener("pointerdown", flap);
    return () => { c.removeEventListener("pointerdown", flap); cancelAnimationFrame(raf); };
  }, [status]);

  async function tryShowRewardAd(): Promise<boolean> {
    return playAdsgramPreferred();
  }

  async function onPlay() {
    if (busy) return;
    setError(null);
    setBusy("play");
    try {
      setReward(null);
      setScore(0);
      setReviveUsed(false);
      setStatus("playing");
    } finally {
      setBusy(null);
    }
  }

  async function onClaim() {
    if (busy) return;
    setError(null);
    setBusy("claim");
    try {
      const ok = await tryShowRewardAd();
      if (!ok) { setError("Ad didn't play. Try again to claim your coins."); return; }
      const net = await pickAd({ data: { initData } });
      await watchAdFn({ data: { initData, slot: "claim", network: net?.network ?? undefined } });
      const r = await finish({
        data: { initData, level_reached: Math.max(0, score), revived: reviveUsed, ad_verified: true },
      });
      setReward(r.reward);
      onCoins(r.new_balance);
      if (score > best) { setBest(score); localStorage.setItem("ab_best", String(score)); }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function onRevive() {
    if (busy) return;
    setError(null);
    setBusy("revive");
    try {
      const ok = await tryShowRewardAd();
      if (!ok) { setError("Ad didn't play — try again."); return; }
      const net = await pickAd({ data: { initData } });
      await watchAdFn({ data: { initData, slot: "revive", network: net?.network ?? undefined } });
      setReviveUsed(true);
      stateRef.current.alive = true;
      stateRef.current.v = FLAP;
      setStatus("playing");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">🚀 Rocket Runner</p>
          <p className="text-lg font-extrabold">Level {Math.max(profile.game_level, score)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card/70 px-3 py-1.5 text-xs">
          Best: <b className="text-gold">{best}</b>
        </div>
      </div>

      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-3xl border border-border bg-card/40" style={{ boxShadow: "var(--shadow-glow-purple)" }}>
        <canvas ref={canvasRef} className="h-full w-full touch-none" />
        {status === "playing" && adPlaying && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-background/70 backdrop-blur-sm">
            <div className="rounded-2xl border border-border bg-card/95 px-5 py-4 text-center">
              <p className="text-2xl">📺</p>
              <p className="mt-1 text-sm font-bold">Short ad playing…</p>
              <p className="text-[11px] text-muted-foreground">Game paused.</p>
            </div>
          </div>
        )}
        {status === "playing" && !adPlaying && waitingResume && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-background/70 backdrop-blur-sm">
            <div className="w-64 rounded-2xl border border-border bg-card/95 p-5 text-center">
              <p className="text-3xl">🚀</p>
              <h3 className="mt-2 text-base font-extrabold">Ready to continue?</h3>
              <p className="text-[11px] text-muted-foreground">Score {score} • Tap Play to resume from here.</p>
              <button
                onClick={resumeAfterAd}
                className="mt-4 h-11 w-full rounded-xl text-sm font-bold text-primary-foreground"
                style={{ background: "var(--gradient-primary)" }}
              >
                ▶️ Play
              </button>
            </div>
          </div>
        )}

        {status !== "playing" && (
          <div className="absolute inset-0 grid place-items-center bg-background/40 backdrop-blur-sm">
            <div className="w-72 rounded-2xl border border-border bg-card/95 p-5 text-center">
              {status === "idle" && (
                <>
                  <p className="text-3xl">🚀</p>
                  <h3 className="mt-2 text-lg font-extrabold">Ready, Astronaut?</h3>
                  <p className="text-xs text-muted-foreground">Tap to flap. Avoid the nebulas.</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">Reward: <b className="text-gold">1 coin per level</b></p>
                  <p className="mt-1 text-[11px] text-muted-foreground">A short ad plays every {AD_MIN}–{AD_MAX} coins.</p>
                </>
              )}
              {status === "dead" && reward === null && (
                <>
                  <p className="text-3xl">💥</p>
                  <h3 className="mt-2 text-lg font-extrabold">Crash!</h3>
                  <p className="text-xs text-muted-foreground">Score {score} • Best {best}</p>
                  <p className="mt-2 rounded-lg bg-card/60 px-3 py-2 text-[11px] text-muted-foreground">
                    📺 Watch a short ad to <b className="text-foreground">claim {Math.max(0, score)} coin{score === 1 ? "" : "s"}</b>.
                  </p>
                </>
              )}
              {status === "dead" && reward !== null && (
                <>
                  <p className="text-3xl">🪙</p>
                  <h3 className="mt-2 text-lg font-extrabold text-gold">+{reward} coins claimed!</h3>
                  <p className="text-xs text-muted-foreground">Score {score} • Best {best}</p>
                </>
              )}

              {error && <p className="mt-3 rounded-lg bg-destructive/15 px-2 py-1.5 text-[11px] text-destructive">{error}</p>}

              <div className="mt-4 flex flex-col gap-2">
                {status === "dead" && reward === null && !reviveUsed && (
                  <button onClick={onRevive} disabled={!!busy} className="h-11 rounded-xl text-sm font-bold text-primary-foreground disabled:opacity-60" style={{ background: "var(--gradient-blitz)" }}>
                    {busy === "revive" ? "Loading ad…" : "📺 Watch ad to revive"}
                  </button>
                )}
                {status === "dead" && reward === null && (
                  <button onClick={onClaim} disabled={!!busy} className="h-11 rounded-xl text-sm font-bold text-primary-foreground disabled:opacity-60" style={{ background: "var(--gradient-primary)" }}>
                    {busy === "claim" ? "Loading ad…" : `🎁 Watch ad & claim ${Math.max(0, score)}c`}
                  </button>
                )}
                {(status === "idle" || reward !== null) && (
                  <button onClick={onPlay} disabled={!!busy} className="h-11 rounded-xl text-sm font-bold text-primary-foreground disabled:opacity-60" style={{ background: "var(--gradient-primary)" }}>
                    {busy === "play" ? "Loading…" : "▶️ Play"}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        {status === "playing" && !adPlaying && (
          <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-background/60 px-3 py-1 text-sm font-extrabold">
            {score}
          </div>
        )}
      </div>
      <p className="text-center text-xs text-muted-foreground">
        Earn 1 coin per level. Short ad every {AD_EVERY} coins — game pauses so you don't crash. 🚀
      </p>
    </div>
  );
}
