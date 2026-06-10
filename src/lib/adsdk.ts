// Client-side ad-network SDK glue. Strict: throws on SDK failure — never auto-rewards.
type SdkExtra = Record<string, unknown> | null | undefined;

const loaded = new Set<string>();

function loadScript(src: string): Promise<void> {
  if (loaded.has(src)) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => { loaded.add(src); resolve(); };
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

declare global {
  interface Window {
    Adsgram?: { init: (opts: { blockId: string }) => { show: () => Promise<unknown> } };
    show_11115938?: () => Promise<void>;
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
  // GigaPub injects showGiga asynchronously after script load; poll briefly.
  for (let i = 0; i < 25 && typeof window.showGiga !== "function"; i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  if (typeof window.showGiga !== "function") throw new Error("GigaPub SDK not ready");
  await window.showGiga();
}

/**
 * Show an ad. Resolves only on confirmed completion. Throws on failure or
 * unknown network. Callers MUST gate reward credit on this resolving.
 *
 * `mode`:
 *   - "interstitial": auto / background ad (Adsgram int-* block).
 *   - "reward": user-initiated reward ad (Adsgram reward block, no prefix).
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
  throw new Error(`Unknown ad network: ${network}`);
}

export function pickRandomNetwork(
  networks: { network: string; sdk_extra?: SdkExtra }[],
): { network: string; sdk_extra?: SdkExtra } | null {
  if (!networks || networks.length === 0) return null;
  return networks[Math.floor(Math.random() * networks.length)];
}
