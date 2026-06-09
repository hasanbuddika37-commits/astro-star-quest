// Client-side ad-network SDK glue. Loads each provider's script lazily and
// exposes a single `showAd(network)` helper that resolves on completion.

type SdkExtra = Record<string, unknown> | null | undefined;

const loaded = new Set<string>();

function loadScript(src: string): Promise<void> {
  if (loaded.has(src)) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => {
      loaded.add(src);
      resolve();
    };
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

declare global {
  interface Window {
    // Adsgram
    Adsgram?: {
      init: (opts: { blockId: string }) => {
        show: () => Promise<unknown>;
      };
    };
    // Monetag injects dynamic show_<id> function names
    show_11115938?: () => Promise<void>;
    // Gigapub
    showGiga?: () => Promise<void>;
  }
}

async function showAdsgram(blockId: string): Promise<void> {
  await loadScript("https://sad.adsgram.ai/js/sad.min.js");
  if (!window.Adsgram) throw new Error("Adsgram SDK not ready");
  const ad = window.Adsgram.init({ blockId });
  await ad.show();
}

async function showMonetag(extra: SdkExtra): Promise<void> {
  const src = (extra?.src as string) || "//libtl.com/sdk.js";
  const fnName = (extra?.showFn as string) || "show_11115938";
  await loadScript(src.startsWith("//") ? `https:${src}` : src);
  const fn = (window as unknown as Record<string, (() => Promise<void>) | undefined>)[fnName];
  if (typeof fn !== "function") throw new Error("Monetag SDK not ready");
  await fn();
}

async function showGigapub(extra: SdkExtra): Promise<void> {
  const src = (extra?.src as string) || "https://ad.gigapub.tech/script?id=6929";
  await loadScript(src);
  if (typeof window.showGiga !== "function") throw new Error("GigaPub SDK not ready");
  await window.showGiga();
}

/**
 * Show an ad from the given network. Returns when the user has viewed the ad
 * (or after the placeholder timer for unknown / disabled networks).
 */
export async function showAd(
  network: string,
  extra?: SdkExtra,
  options?: { adsgramBlocks?: string[] },
): Promise<void> {
  try {
    if (network === "adsgram") {
      const blocks = options?.adsgramBlocks || (Array.isArray(extra?.blocks) ? (extra!.blocks as string[]) : ["int-34544", "int-34543"]);
      const pick = blocks[Math.floor(Math.random() * blocks.length)];
      await showAdsgram(pick);
      return;
    }
    if (network === "monetag") {
      await showMonetag(extra);
      return;
    }
    if (network === "gigapub") {
      await showGigapub(extra);
      return;
    }
  } catch (e) {
    console.warn(`[adsdk] ${network} failed, using placeholder:`, e);
  }
  // Fallback placeholder — 3 second delay
  await new Promise((r) => setTimeout(r, 3000));
}

/** Pick a random enabled network for "claim reward" ad triggers. */
export function pickRandomNetwork(networks: { network: string; sdk_extra?: SdkExtra }[]): { network: string; sdk_extra?: SdkExtra } | null {
  if (!networks || networks.length === 0) return null;
  return networks[Math.floor(Math.random() * networks.length)];
}
