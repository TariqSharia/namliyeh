// Barcode lookups, in order of speed and privacy:
//   1. this phone's memory (works offline, instant);
//   2. Namliyeh's shared list on the server (barcodes any home has taught the app);
//   3. Open Food Facts, a free public product database, for a name to suggest. Only the barcode
//      number is sent there, nothing about the person or the home.
// Teaching the app a barcode saves it on the phone at once and on the server when online.
import { supabase } from './connector';

const MEMORY = 'barcode-memory';
const QUEUE = 'barcode-queue';

type Memory = Record<string, string>; // barcode -> item id
type Pending = { code: string; itemId: string; householdId: string; name?: string };

function read<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '') as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: the server still has it */
  }
}

/** Product barcodes are 8 to 14 digits (EAN-8, UPC-A, EAN-13, ITF-14). Shelf codes and QR codes are not. */
export function isProductBarcode(code: string) {
  return /^[0-9]{6,14}$/.test(code);
}

/** The item a barcode belongs to, or null when nobody has taught it yet. */
export async function lookupBarcode(code: string): Promise<string | null> {
  const known = read<Memory>(MEMORY, {})[code];
  if (known) return known;
  if (!navigator.onLine) return null;
  const { data, error } = await supabase.rpc('lookup_barcode', { p_code: code });
  if (error || !data?.length) return null;
  const itemId = (data[0] as { item_id: string }).item_id;
  write(MEMORY, { ...read<Memory>(MEMORY, {}), [code]: itemId });
  return itemId;
}

/** Remember that this barcode is this item, here and for every home. */
export async function rememberBarcode(code: string, itemId: string, householdId: string, name?: string) {
  write(MEMORY, { ...read<Memory>(MEMORY, {}), [code]: itemId });
  const pending = [...read<Pending[]>(QUEUE, []).filter((p) => p.code !== code), { code, itemId, householdId, name }];
  write(QUEUE, pending);
  await sendPendingBarcodes();
}

/** Send barcodes taught while offline. Called on start and whenever the phone comes online. */
export async function sendPendingBarcodes() {
  if (!navigator.onLine) return;
  const pending = read<Pending[]>(QUEUE, []);
  const left: Pending[] = [];
  for (const p of pending) {
    const { data, error } = await supabase.rpc('remember_barcode', {
      p_code: p.code,
      p_item: p.itemId,
      p_household: p.householdId,
      p_name: p.name ?? null
    });
    if (error) {
      // A network failure is retried later; a refusal (bad code, unknown item) is dropped.
      if (error.message?.toLowerCase().includes('fetch')) left.push(p);
      continue;
    }
    // Someone taught this barcode earlier: their answer wins, on this phone too.
    if (data && data !== p.itemId) write(MEMORY, { ...read<Memory>(MEMORY, {}), [p.code]: data as string });
  }
  write(QUEUE, left);
}

export type OffProduct = { name: string; brand: string | null; words: string };

/** A product name from Open Food Facts, to suggest which item this is. Null when unknown or offline. */
export async function openFoodFacts(code: string): Promise<OffProduct | null> {
  if (!navigator.onLine) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_ar,product_name_en,generic_name,brands,categories_tags`,
      { signal: controller.signal }
    );
    if (!res.ok) return null;
    const body = (await res.json()) as {
      status?: number;
      product?: { product_name?: string; product_name_ar?: string; product_name_en?: string; generic_name?: string; brands?: string; categories_tags?: string[] };
    };
    const p = body.product;
    if (body.status !== 1 || !p) return null;
    const name = (p.product_name_ar || p.product_name || p.product_name_en || p.generic_name || '').trim();
    if (!name) return null;
    const brand = p.brands?.split(',')[0]?.trim() || null;
    const words = [p.product_name, p.product_name_en, p.product_name_ar, p.generic_name, ...(p.categories_tags ?? [])].filter(Boolean).join(' ').toLowerCase();
    return { name, brand, words };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

type Guessable = { id: string; name_en: string | null; name_ar: string | null };

/**
 * Catalog items whose name appears in the product's name or categories ("milk" in
 * "Almarai Fresh Milk 1L" or "en:milks"), best first. Cheap and good enough to offer as choices.
 */
export function guessItems<T extends Guessable>(off: OffProduct, items: T[], max = 4): T[] {
  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    let score = 0;
    for (const name of [item.name_en, item.name_ar]) {
      if (!name) continue;
      const n = name.toLowerCase();
      if (off.words.includes(n)) score += 3;
      for (const w of n.split(/[\s-]+/)) if (w.length > 2 && off.words.includes(w)) score += 1;
    }
    if (score > 0) scored.push({ item, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, max).map((s) => s.item);
}
