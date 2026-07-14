// Client-side ad-network SDK glue. Strict: throws on SDK failure — never auto-rewards.
type SdkExtra = Record<string, unknown> | null | undefined;

const loaded = new Set<string>();

function loadScript(src: string, attrs?: Record<string, string>): Promise<void> {
  if (loaded.has(src)) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
  if (existing) {
    return new Promise<void>((resolve, reject) => {
      if (existing.dataset.loaded === "true") {
        loaded.add(src);
        resolve();
        return;
      }
      existing.addEventListener("load", () => { existing.dataset.loaded = "true"; loaded.add(src); resolve(); }, { once: true });
      existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
      if (document.readyState === "complete") {
        window.setTimeout(() => { loaded.add(src); resolve(); }, 0);
      }
    });
  }
  return new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    if (attrs) for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
    s.onload = () => { s.dataset.loaded = "true"; loaded.add(src); resolve(); };
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

declare global {
  interface Window {
    Adsgram?: { init: (opts: { blockId: string }) => { show: () => Promise<unknown> } };
    show_11115938?: () => Promise<void>;
    showGiga?: (opts?: unknown) => Promise<void>;
    Taddy?: {
      init?: (pubId: string, opts?: Record<string, unknown>) => Promise<void> | void;
      ready?: () => void;
      isInit?: boolean;
      ads?: () => { interstitial?: (opts?: { payload?: unknown; onClosed?: () => void }) => Promise<boolean> };
    };
    TowerAds?: new (opts: {
      apiKey: string;
      placementId: string;
      onRewardEarned?: (reward: unknown) => void;
      onError?: (err: unknown) => void;
    }) => { loadAndShow: () => Promise<unknown> };
  }
}


async function waitFor<T>(get: () => T | undefined, ms = 8000, step = 100): Promise<T> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = get();
    if (v !== undefined && v !== null) return v;
    await new Promise((r) => setTimeout(r, step));
  }
  throw new Error("SDK not ready");
}

async function showAdsgram(blockId: string): Promise<void> {
  await loadScript("https://sad.adsgram.ai/js/sad.min.js");
  const sdk = await waitFor(() => window.Adsgram);
  const ad = sdk.init({ blockId });
  await ad.show();
}

async function showMonetag(extra: SdkExtra): Promise<void> {
  const src = (extra?.src as string) || "//libtl.com/sdk.js";
  const fnName = (extra?.showFn as string) || "show_11115938";
  await loadScript(src.startsWith("//") ? `https:${src}` : src);
  const fn = await waitFor(
    () => (window as unknown as Record<string, (() => Promise<void>) | undefined>)[fnName],
  );
  await fn();
}

async function showGigapub(extra: SdkExtra): Promise<void> {
  const id = (extra?.id as string | number) || "6929";
  const src = (extra?.src as string) || `https://ad.gigapub.tech/script?id=${id}`;
  await loadScript(src);
  // GigaPub injects window.showGiga asynchronously.
  const fn = await waitFor(() => window.showGiga, 10000);
  await fn();
}

async function showTaddy(extra: SdkExtra): Promise<void> {
  const pubId = (extra?.pubId as string) || (extra?.pub_id as string) || "ce8790eb749918b088605145e3626fd9";
  await loadScript("https://sdk.taddy.pro/web/taddy.min.js", { "data-pub-id": pubId });
  const sdk = await waitFor(() => window.Taddy);
  if (!sdk.isInit && typeof sdk.init === "function") {
    await sdk.init(pubId, { debug: false });
  }
  sdk.ready?.();
  const ads = sdk.ads?.();
  if (!ads?.interstitial) throw new Error("Taddy SDK is not ready");
  const shown = await ads.interstitial({
    payload: (extra?.payload as unknown) ?? { placement: "watch_ads" },
  });
  if (!shown) throw new Error("No Taddy ad available");
}

async function showUslAds(extra: SdkExtra): Promise<void> {
  const apiKey = (extra?.apiKey as string) || (extra?.api_key as string) || "16613da4b1290d7c3146e4a4e08157db";
  const placementId = (extra?.placementId as string) || (extra?.placement_id as string) || "plc_42ad50715d8b8aaa";
  const src = (extra?.src as string) || "https://uslads.com/sdk/tower-ads-v4.js";
  await loadScript(src);
  const Ctor = await waitFor(() => window.TowerAds);
  await new Promise<void>((resolve, reject) => {
    try {
      const inst = new Ctor({
        apiKey,
        placementId,
        onRewardEarned: () => resolve(),
        onError: (err) => reject(err instanceof Error ? err : new Error(String(err ?? "USL Ads error"))),
      });
      inst.loadAndShow().catch((e) => reject(e instanceof Error ? e : new Error(String(e))));
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

/**
 * Show an ad. Resolves only on confirmed completion. Throws on failure.
 */
export async function showAd(
  network: string,
  extra?: SdkExtra,
  mode: "interstitial" | "reward" = "reward",
): Promise<void> {
  if (network === "adsgram") {
    let blockId: string | undefined;
    if (mode === "reward") {
      blockId = (extra?.reward_block as string) || "34543";
    } else {
      const blocks = Array.isArray(extra?.blocks) ? (extra!.blocks as string[]) : ["int-34544"];
      blockId = blocks[Math.floor(Math.random() * blocks.length)];
    }
    await showAdsgram(blockId);
    return;
  }
  if (network === "monetag") { await showMonetag(extra); return; }
  if (network === "gigapub") { await showGigapub(extra); return; }
  if (network === "taddy")   { await showTaddy(extra);   return; }
  if (network === "uslads")  { await showUslAds(extra);  return; }
  throw new Error(`Unknown ad network: ${network}`);
}

/**
 * Try to show an ad from `primary`. If it fails, try each fallback network in order.
 * Resolves with the network that actually played, or throws if none succeed.
 */
export async function showAdWithFallback(
  primary: { network: string; sdk_extra?: SdkExtra },
  fallbacks: { network: string; sdk_extra?: SdkExtra }[] = [],
  mode: "interstitial" | "reward" = "reward",
): Promise<string> {
  const seen = new Set<string>();
  const order = [primary, ...fallbacks].filter((n) => {
    if (!n?.network || seen.has(n.network)) return false;
    seen.add(n.network);
    return true;
  });
  let lastErr: unknown = null;
  for (const n of order) {
    try {
      await showAd(n.network, n.sdk_extra, mode);
      return n.network;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("No ad available");
}


export function pickRandomNetwork(
  networks: { network: string; sdk_extra?: SdkExtra }[],
): { network: string; sdk_extra?: SdkExtra } | null {
  if (!networks || networks.length === 0) return null;
  return networks[Math.floor(Math.random() * networks.length)];
}
