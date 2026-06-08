import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { setNotificationsEnabled } from "@/lib/auth.functions";

type Props = {
  initData: string;
  onConfirmed: () => void;
};

export default function NotificationGate({ initData, onConfirmed }: Props) {
  const setNotif = useServerFn(setNotificationsEnabled);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function confirm() {
    setLoading(true);
    setErr(null);
    try {
      await setNotif({ data: { initData, enabled: true } });
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
      onConfirmed();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-6 py-10 ab-safe-top ab-safe-bottom">
      <div
        className="w-full max-w-md rounded-3xl border border-border bg-card/80 p-6 backdrop-blur-xl"
        style={{ boxShadow: "var(--shadow-glow-purple)" }}
      >
        <div className="flex flex-col items-center text-center gap-4">
          <div
            className="grid h-20 w-20 place-items-center rounded-2xl text-4xl"
            style={{ background: "var(--gradient-primary)" }}
          >
            🔔
          </div>
          <h2 className="text-xl font-extrabold tracking-tight">
            Enable notifications
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We send you reminders, daily rewards, refer updates and withdraw alerts
            through the AstroBlitz bot. <br />
            <span className="text-foreground/90">
              Tap <b>Allow</b> to continue.
            </span>
          </p>

          {err && (
            <p className="rounded-lg bg-destructive/15 px-3 py-2 text-xs text-destructive">
              {err}
            </p>
          )}

          <button
            onClick={confirm}
            disabled={loading}
            className="mt-2 inline-flex h-12 w-full items-center justify-center rounded-2xl px-6 font-bold text-primary-foreground transition active:scale-[0.98] disabled:opacity-60"
            style={{
              background: "var(--gradient-primary)",
              boxShadow: "var(--shadow-glow-purple)",
            }}
          >
            {loading ? "Confirming…" : "✅ Allow Notifications"}
          </button>

          <p className="text-[11px] text-muted-foreground">
            You can change this any time from the Profile menu.
          </p>
        </div>
      </div>
    </div>
  );
}
