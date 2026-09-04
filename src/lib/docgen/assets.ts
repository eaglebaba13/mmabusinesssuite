// Master document assets: the official MMA letterhead (converted from
// MMA_Letter_Head.docx, unmodified) and the official company seal/signature
// (company_seal_sign.png, used exactly as supplied — never redrawn or restyled).
import letterheadAsset from "@/assets/mma-letterhead.jpg.asset.json";
import sealAsset from "@/assets/company-seal-sign.png.asset.json";

export type ImageEntry = { dataUrl: string; width: number; height: number };

// A4 in points
export const A4_WIDTH = 595.28;
export const A4_HEIGHT = 841.89;

// Safe content zone inside the master letterhead (below header, above footer).
export const CONTENT_TOP = 148;
export const CONTENT_BOTTOM = 700;
export const CONTENT_LEFT = 56;

const cache = new Map<string, Promise<ImageEntry>>();

async function load(url: string): Promise<ImageEntry> {
  let p = cache.get(url);
  if (p) return p;
  p = (async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`document asset fetch failed: ${res.status}`);
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
    const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve({ w: im.naturalWidth, h: im.naturalHeight });
      im.onerror = () => reject(new Error("document asset decode failed"));
      im.src = dataUrl;
    });
    return { dataUrl, width: dims.w, height: dims.h };
  })();
  cache.set(url, p);
  return p;
}

/** Preload master letterhead + company seal. Must resolve before rendering. */
export async function loadDocAssets(): Promise<{ letterhead: ImageEntry; seal: ImageEntry }> {
  const [letterhead, seal] = await Promise.all([load(letterheadAsset.url), load(sealAsset.url)]);
  return { letterhead, seal };
}

export const LETTERHEAD_URL = letterheadAsset.url;
export const SEAL_URL = sealAsset.url;
