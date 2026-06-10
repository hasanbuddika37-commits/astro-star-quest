import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { finishGame } from "@/lib/game.functions";
import { claimAd, getRandomAdNetwork } from "@/lib/ads.functions";
import { showAd } from "@/lib/adsdk";
import type { Profile } from "../MainApp";

type Props = { initData: string; profile: Profile; onCoins: (c: number) => void };

type Obstacle = { x: number; gapY: number; gap: number; passed?: boolean };

const GRAVITY = 0.35;
const FLAP = -6.5;
const PIPE_W = 60;
const ROCKET_X = 70;

export default function GameTab({ initData, profile, onCoins }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<"idle" | "playing" | "dead">("idle");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => Number(localStorage.getItem("ab_best") ?? 0));
  const [reward, setReward] = useState<number | null>(null);
  const finish = useServerFn(finishGame);
  const watchAd = useServerFn(claimAd);
  const pickAd = useServerFn(getRandomAdNetwork);
  const [reviveUsed, setReviveUsed] = useState(false);
  const [reviveBusy, setReviveBusy] = useState(false);

  const stateRef = useRef({
    y: 0, v: 0, obstacles: [] as Obstacle[], frame: 0, score: 0, alive: false,
  });

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
    };

    const spawn = () => {
      const gap = 160;
      const gapY = 60 + Math.random() * (H - 120 - gap);
      stateRef.current.obstacles.push({ x: W, gapY, gap });
    };

    const tick = () => {
      const s = stateRef.current;
      ctx.fillStyle = "#0f0820";
      ctx.fillRect(0, 0, W, H);
      // stars
      for (const st of stars) {
        st.x -= 0.4;
        if (st.x < 0) st.x = W;
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = "#fff";
        ctx.fillRect(st.x, st.y, st.s, st.s);
        ctx.globalAlpha = 1;
      }
      if (s.alive) {
        s.v += GRAVITY; s.y += s.v; s.frame++;
        if (s.frame % 90 === 0) spawn();
        for (const o of s.obstacles) o.x -= 2.6;
        s.obstacles = s.obstacles.filter((o) => o.x + PIPE_W > -10);
        // collisions / scoring
        for (const o of s.obstacles) {
          if (!o.passed && o.x + PIPE_W < ROCKET_X) {
            o.passed = true; s.score++;
            setScore(s.score);
          }
          if (ROCKET_X + 16 > o.x && ROCKET_X - 16 < o.x + PIPE_W) {
            if (s.y - 14 < o.gapY || s.y + 14 > o.gapY + o.gap) {
              die();
            }
          }
        }
        if (s.y > H - 8 || s.y < 8) die();
      }
      // pipes
      ctx.fillStyle = "rgba(168,85,247,0.85)";
      for (const o of s.obstacles) {
        ctx.fillRect(o.x, 0, PIPE_W, o.gapY);
        ctx.fillRect(o.x, o.gapY + o.gap, PIPE_W, H - (o.gapY + o.gap));
      }
      // rocket
      ctx.save();
      ctx.translate(ROCKET_X, s.y);
      ctx.rotate(Math.min(0.6, Math.max(-0.6, s.v / 12)));
      ctx.font = "32px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("🚀", 0, 0);
      ctx.restore();
      raf = requestAnimationFrame(tick);
    };

    const die = () => {
      if (!stateRef.current.alive) return;
      stateRef.current.alive = false;
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("error");
      setStatus("dead");
    };

    const flap = () => {
      if (status === "playing") {
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
      // freeze last frame; show overlay via state
      ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(0, 0, W, H);
    }

    c.addEventListener("pointerdown", flap);
    return () => {
      c.removeEventListener("pointerdown", flap);
      cancelAnimationFrame(raf);
    };
  }, [status]);

  async function settle(s: number, revived: boolean) {
    try {
      const r = await finish({ data: { initData, level_reached: Math.max(1, s), revived } });
      setReward(r.reward);
      onCoins(r.new_balance);
      if (s > best) { setBest(s); localStorage.setItem("ab_best", String(s)); }
    } catch (e) {
      console.error(e);
    }
  }

  async function onGameOver(action: "claim" | "revive") {
    if (action === "claim") {
      await settle(score, false);
    } else {
      if (reviveBusy) return;
      setReviveBusy(true);
      try {
        // Ad MUST play. If it fails, do NOT revive.
        const net = await pickAd({ data: { initData } });
        if (!net?.network) throw new Error("No ad network available");
        await showAd(net.network, net.sdk_extra as never, "reward");
        await watchAd({ data: { initData, slot: "revive", network: net.network } });
        setReviveUsed(true);
        stateRef.current.alive = true;
        stateRef.current.v = FLAP;
        setStatus("playing");
      } catch (e) {
        console.error(e);
        alert("Ad failed — please try again.");
      } finally {
        setReviveBusy(false);
      }
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
        {status !== "playing" && (
          <div className="absolute inset-0 grid place-items-center bg-background/40 backdrop-blur-sm">
            <div className="w-72 rounded-2xl border border-border bg-card/95 p-5 text-center">
              {status === "idle" && (
                <>
                  <p className="text-3xl">🚀</p>
                  <h3 className="mt-2 text-lg font-extrabold">Ready, Astronaut?</h3>
                  <p className="text-xs text-muted-foreground">Tap to flap. Avoid the nebulas.</p>
                </>
              )}
              {status === "dead" && reward === null && (
                <>
                  <p className="text-3xl">💥</p>
                  <h3 className="mt-2 text-lg font-extrabold">Crash!</h3>
                  <p className="text-xs text-muted-foreground">Score {score} • Best {best}</p>
                </>
              )}
              {status === "dead" && reward !== null && (
                <>
                  <p className="text-3xl">🪙</p>
                  <h3 className="mt-2 text-lg font-extrabold">+{reward} coins</h3>
                </>
              )}
              <div className="mt-4 flex flex-col gap-2">
                {status === "dead" && reward === null && !reviveUsed && (
                  <button onClick={() => onGameOver("revive")} disabled={reviveBusy} className="h-11 rounded-xl text-sm font-bold text-primary-foreground disabled:opacity-60" style={{ background: "var(--gradient-blitz)" }}>
                    {reviveBusy ? "Loading ad…" : "📺 Watch ad to revive"}
                  </button>
                )}
                {status === "dead" && reward === null && (
                  <button onClick={() => onGameOver("claim")} className="h-11 rounded-xl border border-border text-sm font-bold">
                    Claim coins
                  </button>
                )}
                {(status === "idle" || reward !== null) && (
                  <button onClick={() => { setReward(null); setScore(0); setReviveUsed(false); setStatus("playing"); }} className="h-11 rounded-xl text-sm font-bold text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
                    ▶️ Play
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        {status === "playing" && (
          <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-background/60 px-3 py-1 text-sm font-extrabold">
            {score}
          </div>
        )}
      </div>
      <p className="text-center text-xs text-muted-foreground">
        Reward: 1–2 coins per run. Crash? Watch an ad to revive and keep going.
      </p>
    </div>
  );
}
