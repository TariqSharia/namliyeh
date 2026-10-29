// Dates are plain local calendar days ("2026-10-29"), never shifted by time zones.

export function today(now: Date = new Date()): string {
  return toDay(now);
}

export function toDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return toDay(new Date(y, m - 1, d + days));
}

export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number) as [number, number, number];
  const [y2, m2, d2] = to.split('-').map(Number) as [number, number, number];
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

export function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

export function nextMonthStart(day: string): string {
  const [y, m] = day.split('-').map(Number) as [number, number];
  return toDay(new Date(y, m, 1));
}

export type ExpiryType = 'printed' | 'estimated' | 'none';

/**
 * Expiry for a new batch.
 * printed: the date the user typed, or unknown (never guessed: the shop may have kept it for months).
 * estimated: purchase date + shelf life (household override, then item, then category).
 * none: never expires.
 */
export function expiryFor(
  type: ExpiryType,
  purchaseDate: string,
  shelfLifeDays: number | null,
  printedDate: string | null
): { expiry_date: string | null; expiry_is_estimated: 0 | 1 } {
  if (type === 'printed') return { expiry_date: printedDate || null, expiry_is_estimated: 0 };
  if (type === 'estimated' && shelfLifeDays && shelfLifeDays > 0) {
    return { expiry_date: addDays(purchaseDate, shelfLifeDays), expiry_is_estimated: 1 };
  }
  return { expiry_date: null, expiry_is_estimated: 0 };
}
