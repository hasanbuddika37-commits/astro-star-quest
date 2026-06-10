import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import SplashScreen from "@/components/SplashScreen";
import NotificationGate from "@/components/NotificationGate";
import MainApp from "@/components/MainApp";
import SuspendedScreen from "@/components/SuspendedScreen";
import { getDeviceFingerprint, useTelegram } from "@/lib/telegram-webapp";
import { initSession } from "@/lib/auth.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AstroBlitz — Play • Earn • Withdraw" },
      {
        name: "description",
        content: "Tap to fly, complete tasks and earn TON / USDT rewards on AstroBlitz.",
      },
    ],
  }),
  component: Index,
});

type Profile = Awaited<ReturnType<typeof initSession>>["profile"];

function Index() {
  const [splashDone, setSplashDone] = useState(false);
  return (
    <>
      {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
      {splashDone && <AppShell />}
    </>
  );
}

function AppShell() {
  const { tg, ready } = useTelegram();
  const init = useServerFn(initSession);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [suspendReason, setSuspendReason] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    const initData = tg?.initData ?? "";
    if (!initData) {
      setLoading(false);
      setError("Please open this mini app from inside Telegram.");
      return;
    }
    setLoading(true);
    init({ data: { initData, device_fingerprint: getDeviceFingerprint() } })
      .then((r) => {
        if (r.suspended || r.profile.is_suspended) {
          setSuspendReason(r.profile.suspend_reason ?? "Your account is suspended.");
          setProfile(r.profile);
          return;
        }
        setProfile(r.profile);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load profile"))
      .finally(() => setLoading(false));
  }, [ready, tg, init]);

  if (loading) {
    return (
      <div className="min-h-dvh grid place-items-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="ab-pulse-ring relative inline-block h-3 w-3 rounded-full bg-primary" />
          Loading…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-dvh grid place-items-center px-6 text-center">
        <div className="max-w-sm rounded-3xl border border-border bg-card/80 p-6 backdrop-blur">
          <div className="text-5xl mb-3">🛰️</div>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  if (suspendReason) {
    return <SuspendedScreen initData={tg!.initData} reason={suspendReason} />;
  }

  if (!profile.onboarded) {
    return (
      <NotificationGate
        initData={tg!.initData}
        onConfirmed={() =>
          setProfile({ ...profile, onboarded: true, notifications_enabled: true })
        }
      />
    );
  }

  return <MainApp initData={tg!.initData} profile={profile} onProfile={setProfile} />;
}
