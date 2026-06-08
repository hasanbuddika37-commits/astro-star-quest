import { useEffect, useState } from "react";

export type TelegramWebApp = {
  initData: string;
  initDataUnsafe: {
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
      photo_url?: string;
      language_code?: string;
    };
    start_param?: string;
  };
  ready: () => void;
  expand: () => void;
  enableClosingConfirmation?: () => void;
  setHeaderColor?: (c: string) => void;
  setBackgroundColor?: (c: string) => void;
  HapticFeedback?: {
    impactOccurred: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
    notificationOccurred: (type: "success" | "warning" | "error") => void;
    selectionChanged: () => void;
  };
  openTelegramLink?: (url: string) => void;
  openLink?: (url: string) => void;
  themeParams?: Record<string, string>;
  colorScheme?: "light" | "dark";
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

/** Read Telegram WebApp once, call ready/expand. */
export function useTelegram() {
  const [tg, setTg] = useState<TelegramWebApp | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const tryInit = () => {
      const wa = window.Telegram?.WebApp;
      if (!wa) return false;
      try {
        wa.ready();
        wa.expand();
        wa.setHeaderColor?.("#1a0f2e");
        wa.setBackgroundColor?.("#0f0820");
      } catch {
        /* ignore */
      }
      if (!cancelled) {
        setTg(wa);
        setReady(true);
      }
      return true;
    };
    if (!tryInit()) {
      const interval = setInterval(() => {
        if (tryInit()) clearInterval(interval);
      }, 100);
      const timeout = setTimeout(() => {
        clearInterval(interval);
        if (!cancelled) setReady(true); // give up — show UI anyway (browser preview mode)
      }, 2500);
      return () => {
        cancelled = true;
        clearInterval(interval);
        clearTimeout(timeout);
      };
    }
    return () => {
      cancelled = true;
    };
  }, []);

  return { tg, ready };
}

/** Compute a stable-ish device fingerprint. Cheap; intended as a hint, not a security boundary. */
export function getDeviceFingerprint(): string {
  if (typeof window === "undefined") return "ssr";
  const parts = [
    navigator.userAgent,
    navigator.language,
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    new Date().getTimezoneOffset().toString(),
    (navigator as Navigator & { hardwareConcurrency?: number }).hardwareConcurrency?.toString() ?? "",
  ];
  // Simple hash (FNV-1a)
  let h = 2166136261;
  for (const p of parts) {
    for (let i = 0; i < p.length; i++) {
      h ^= p.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return `fp_${(h >>> 0).toString(36)}`;
}
