// Money is stored as whole numbers in the currency's smallest unit (agorot, fils, cents),
// so 12.50 ₪ is 1250 and 3.250 JD is 3250. These helpers convert to and from what people type.

export const CURRENCIES = {
  ILS: { decimals: 2, symbol: '₪' },
  JOD: { decimals: 3, symbol: 'JD' },
  USD: { decimals: 2, symbol: '$' },
  EUR: { decimals: 2, symbol: '€' }
} as const;

export type Currency = keyof typeof CURRENCIES;
export const CURRENCY_CODES = Object.keys(CURRENCIES) as Currency[];

export function isCurrency(code: string): code is Currency {
  return code in CURRENCIES;
}

/** "12.5" or "12,5" or Arabic digits "١٢٫٥" in ILS -> 1250. Returns null when it is not a valid amount. */
export function parseAmount(input: string, currency: Currency): number | null {
  const normalized = toLatinDigits(input).trim().replace(/[٫,]/g, '.').replace(/\s/g, '');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const decimals = CURRENCIES[currency].decimals;
  const [whole = '0', fraction = ''] = normalized.split('.');
  if (fraction.length > decimals) return null;
  return Number(whole) * 10 ** decimals + Number(fraction.padEnd(decimals, '0') || '0');
}

/** 1250 in ILS -> "12.50" (no symbol). */
export function toPlain(minor: number, currency: Currency): string {
  const decimals = CURRENCIES[currency].decimals;
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(Math.round(minor));
  const whole = Math.floor(abs / 10 ** decimals);
  const fraction = String(abs % 10 ** decimals).padStart(decimals, '0');
  return decimals ? `${sign}${whole}.${fraction}` : `${sign}${whole}`;
}

/** 1250 in ILS -> "12.50 ₪", using the reader's language for digits and grouping. */
export function formatMoney(minor: number, currency: Currency, language: 'ar' | 'en'): string {
  const decimals = CURRENCIES[currency].decimals;
  const value = minor / 10 ** decimals;
  const number = new Intl.NumberFormat(language === 'ar' ? 'ar-PS' : 'en-GB', {
    minimumFractionDigits: value % 1 === 0 ? 0 : decimals,
    maximumFractionDigits: decimals
  }).format(value);
  return `${number} ${CURRENCIES[currency].symbol}`;
}

/** Converts an amount to the household's main currency using the rate saved with the entry. */
export function toMain(minor: number, from: Currency, to: Currency, rate: number): number {
  const scale = 10 ** (CURRENCIES[to].decimals - CURRENCIES[from].decimals);
  return Math.round(minor * rate * scale);
}

export function toLatinDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}
