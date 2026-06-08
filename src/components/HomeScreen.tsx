import { ASTROBLITZ_LOGO_URL } from "@/lib/assets";

type Profile = {
  tg_id: number;
  first_name: string | null;
  username: string | null;
  coins: number;
  game_level: number;
  ads_watched: number;
  refer_count: number;
  verified_refer_count: number;
  total_withdraw: number;
  refer_code: string;
};

type Props = { profile: Profile };

export default function HomeScreen({ profile }: Props) {
  return (
    <div className="relative min-h-dvh ab-safe-top ab-safe-bottom px-4 pb-28 pt-4">
      {/* Decorative stars */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        {Array.from({ length: 30 }).map((_, i) => (
          <span
            key={i}
            className="ab-star"
            style={{
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 2}s`,
            }}
          />
        ))}
      </div>

      {/* Header */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center overflow-hidden rounded-2xl bg-card border border-border">
            <img src={ASTROBLITZ_LOGO_URL} alt="" className="h-9 w-9 object-contain" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Pilot</p>
            <p className="text-sm font-bold truncate max-w-[160px]">
              {profile.first_name ?? "Astronaut"}
              {profile.username ? <span className="text-muted-foreground"> @{profile.username}</span> : null}
            </p>
          </div>
        </div>
        <div
          className="rounded-2xl border border-border bg-card/60 px-3 py-1.5 text-xs font-bold"
          style={{ boxShadow: "var(--shadow-glow-cyan)" }}
        >
          🆔 <span className="text-cyan-accent">{profile.tg_id}</span>
        </div>
      </header>

      {/* Balance */}
      <section
        className="mt-5 rounded-3xl border border-border p-5"
        style={{
          background:
            "linear-gradient(160deg, color-mix(in oklab, var(--primary) 22%, var(--card)) 0%, var(--card) 100%)",
          boxShadow: "var(--shadow-glow-purple)",
        }}
      >
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Balance</p>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-4xl font-black ab-shimmer-text">
            {Number(profile.coins).toLocaleString()}
          </span>
          <span className="text-sm font-bold text-gold">coins</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          ≈ ${(Number(profile.coins) * 0.0001).toFixed(4)} USD
        </p>

        <div className="mt-4 grid grid-cols-4 gap-2 text-center">
          <Stat label="Level" value={profile.game_level} />
          <Stat label="Ads" value={profile.ads_watched} />
          <Stat label="Refers" value={profile.verified_refer_count} />
          <Stat label="Withdrawn" value={profile.total_withdraw} />
        </div>
      </section>

      {/* Coming-soon game placeholder */}
      <section className="mt-5 rounded-3xl border border-border bg-card/70 p-5 text-center">
        <div className="text-5xl ab-float">🚀</div>
        <p className="mt-3 font-bold">Tap-to-fly Rocket</p>
        <p className="text-xs text-muted-foreground">
          Game launching in the next update. Stay tuned!
        </p>
      </section>

      {/* Bottom Tabs */}
      <nav className="fixed inset-x-0 bottom-0 z-40 ab-safe-bottom">
        <div className="mx-3 mb-3 grid grid-cols-5 gap-1 rounded-2xl border border-border bg-card/85 p-1.5 backdrop-blur-xl">
          {[
            { i: "🏠", l: "Home", active: true },
            { i: "📺", l: "Watch" },
            { i: "✅", l: "Task" },
            { i: "👥", l: "Refer" },
            { i: "💸", l: "Withdraw" },
          ].map((t) => (
            <button
              key={t.l}
              className={`flex flex-col items-center justify-center gap-0.5 rounded-xl py-2 text-[11px] font-semibold transition ${
                t.active
                  ? "text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              style={
                t.active
                  ? { background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow-purple)" }
                  : undefined
              }
            >
              <span className="text-lg">{t.i}</span>
              {t.l}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl bg-background/40 px-2 py-2 border border-border">
      <p className="text-base font-bold">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}
