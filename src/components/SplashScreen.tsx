import { ASTROBLITZ_LOGO_URL } from "@/lib/assets";
import { useEffect, useState } from "react";

type Props = { onDone: () => void };

export default function SplashScreen({ onDone }: Props) {
  const [phase, setPhase] = useState<"intro" | "outro">("intro");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("outro"), 2200);
    const t2 = setTimeout(onDone, 2700);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [onDone]);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center overflow-hidden transition-opacity duration-500 ${
        phase === "outro" ? "opacity-0" : "opacity-100"
      }`}
      style={{ background: "var(--gradient-space)" }}
    >
      {/* Twinkling stars */}
      <Stars count={60} />

      {/* Orbiting glow ring */}
      <div className="pointer-events-none absolute" style={{ width: 360, height: 360 }}>
        <div
          className="ab-spin-slow absolute inset-0 rounded-full"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0%, color-mix(in oklab, var(--primary) 60%, transparent) 25%, transparent 50%, color-mix(in oklab, var(--cyan-accent) 50%, transparent) 75%, transparent 100%)",
            filter: "blur(24px)",
            opacity: 0.55,
          }}
        />
      </div>

      <div className="relative flex flex-col items-center gap-6 ab-rocket-launch">
        <div
          className="relative grid h-56 w-56 place-items-center rounded-full overflow-hidden border-4"
          style={{
            borderColor: "color-mix(in oklab, var(--primary) 50%, transparent)",
            boxShadow: "0 0 60px rgba(168,85,247,0.6), inset 0 0 40px rgba(168,85,247,0.25)",
          }}
        >
          <span className="ab-pulse-ring" />
          <img
            src={ASTROBLITZ_LOGO_URL}
            alt="AstroBlitz"
            className="ab-float relative h-full w-full object-cover"
            draggable={false}
          />
        </div>

        <div className="flex flex-col items-center gap-2">
          <p className="ab-shimmer-text text-2xl font-extrabold tracking-wider">
            ASTROBLITZ
          </p>
          <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
            Earn Crypto Rewards
          </p>
        </div>

        <div className="mt-2 flex gap-1.5">
          <span className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="h-2 w-2 rounded-full bg-gold animate-bounce" style={{ animationDelay: "120ms" }} />
          <span className="h-2 w-2 rounded-full bg-cyan-accent animate-bounce" style={{ animationDelay: "240ms" }} />
        </div>
      </div>
    </div>
  );
}

function Stars({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => {
        const top = Math.random() * 100;
        const left = Math.random() * 100;
        const delay = Math.random() * 2;
        const size = 1 + Math.random() * 2.5;
        return (
          <span
            key={i}
            className="ab-star"
            style={{
              top: `${top}%`,
              left: `${left}%`,
              width: size,
              height: size,
              animationDelay: `${delay}s`,
            }}
          />
        );
      })}
    </>
  );
}
