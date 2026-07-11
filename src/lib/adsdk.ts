// Client-side ad-network SDK glue. Strict: throws on SDK failure — never auto-rewards.
type SdkExtra = Record<string, unknown> | null | undefined;

const loaded = new Set<string>();

function loadScript(src: string, attrs?: Record<string, string>): Promise<void> {
  if (loaded.has(src)) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    if (attrs) for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
    s.onload = () => { loaded.add(src); resolve(); };
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
      showAd?: (opts?: { pubId?: string }) => Promise<void>;
      show?: (opts?: { pubId?: string }) => Promise<void>;
    };
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
  const showFn = sdk.showAd ?? sdk.show;
  if (typeof showFn !== "function") throw new Error("Taddy SDK missing showAd()");
  await showFn.call(sdk, { pubId });
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
  throw new Error(`Unknown ad network: ${network}`);
}

export function pickRandomNetwork(
  networks: { network: string; sdk_extra?: SdkExtra }[],
): { network: string; sdk_extra?: SdkExtra } | null {
  if (!networks || networks.length === 0) return null;
  return networks[Math.floor(Math.random() * networks.length)];
}
