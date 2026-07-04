// Company letterhead used as background for invoices, purchase orders,
// agreements and other formal PDFs. The full letterhead image (A4 portrait
// aspect ~0.707) is stamped as page background; header/footer strips are
// used when a document is landscape.
import type jsPDF from "jspdf";
import letterheadAsset from "@/assets/letterhead.jpg.asset.json";
import headerStripAsset from "@/assets/letterhead-header.jpg.asset.json";
import footerStripAsset from "@/assets/letterhead-footer.jpg.asset.json";

// A4 in points
export const A4_WIDTH = 595.28;
export const A4_HEIGHT = 841.89;

// Safe content zones for A4 PORTRAIT with the full letterhead background:
// stay below the header (logo + GSTIN) and above the footer (addresses/contact).
export const PORTRAIT_CONTENT_TOP = 130;
export const PORTRAIT_CONTENT_BOTTOM = 690;

// Safe content zones for A4 LANDSCAPE with header + footer strips only.
export const LANDSCAPE_CONTENT_TOP = 70;
export const LANDSCAPE_CONTENT_BOTTOM = 520;

type CacheEntry = { dataUrl: string; width: number; height: number };
const cache = new Map<string, Promise<CacheEntry>>();

async function loadImage(url: string): Promise<CacheEntry> {
  let p = cache.get(url);
  if (p) return p;
  p = (async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`letterhead fetch failed: ${res.status}`);
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
      im.onerror = () => reject(new Error("letterhead decode failed"));
      im.src = dataUrl;
    });
    return { dataUrl, width: dims.w, height: dims.h };
  })();
  cache.set(url, p);
  return p;
}

/** Preload the full portrait letterhead + strips. Call before generating PDFs. */
export async function preloadLetterhead() {
  await Promise.all([
    loadImage(letterheadAsset.url),
    loadImage(headerStripAsset.url),
    loadImage(footerStripAsset.url),
  ]);
}

/**
 * Draw the full letterhead as the page background (A4 portrait). Content
 * should be laid out between PORTRAIT_CONTENT_TOP and PORTRAIT_CONTENT_BOTTOM.
 */
export function drawPortraitLetterhead(doc: jsPDF) {
  const cached = cache.get(letterheadAsset.url);
  // Fire-and-forget preload if caller didn't preload; skip the draw this pass
  // rather than blocking — the sync API of jsPDF doesn't allow awaiting.
  if (!cached) {
    void loadImage(letterheadAsset.url);
    return;
  }
  cached.then(({ dataUrl }) => {
    try {
      const w = doc.internal.pageSize.getWidth();
      const h = doc.internal.pageSize.getHeight();
      doc.addImage(dataUrl, "JPEG", 0, 0, w, h, undefined, "FAST");
    } catch {
      /* noop */
    }
  });
}

/**
 * Synchronous variant: assumes preloadLetterhead() has resolved. Draws the
 * background immediately so it appears behind subsequent content on this page.
 */
export function drawPortraitLetterheadSync(doc: jsPDF, cached: CacheEntry) {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  doc.addImage(cached.dataUrl, "JPEG", 0, 0, w, h, undefined, "FAST");
}

export function drawLandscapeLetterheadSync(
  doc: jsPDF,
  header: CacheEntry,
  footer: CacheEntry,
) {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  // Header strip scaled to page width, preserving aspect
  const headerH = (header.height / header.width) * w;
  doc.addImage(header.dataUrl, "JPEG", 0, 0, w, headerH, undefined, "FAST");
  const footerH = (footer.height / footer.width) * w;
  doc.addImage(footer.dataUrl, "JPEG", 0, h - footerH, w, footerH, undefined, "FAST");
}

/** Get preloaded entries synchronously (throws if not preloaded). */
export function requirePreloaded() {
  const full = cache.get(letterheadAsset.url);
  const header = cache.get(headerStripAsset.url);
  const footer = cache.get(footerStripAsset.url);
  if (!full || !header || !footer) {
    throw new Error("Letterhead not preloaded. Call preloadLetterhead() first.");
  }
  return Promise.all([full, header, footer]).then(([f, h, fo]) => ({
    full: f,
    header: h,
    footer: fo,
  }));
}
