import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { ar } from './ar';
import { en, type Messages } from './en';

export type Lang = 'ar' | 'en';
export type Key = keyof Messages;

const dictionaries: Record<Lang, Messages> = { ar, en };

const LangContext = createContext<Lang>('ar');

export function LangProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useLang(): Lang {
  return useContext(LangContext);
}

/** t('key') or t('key', { n: 3 }) — {n} in the text is replaced. */
export function useT() {
  const lang = useLang();
  return (key: Key, vars?: Record<string, string | number>) => translate(lang, key, vars);
}

export function translate(lang: Lang, key: Key, vars?: Record<string, string | number>): string {
  let text: string = dictionaries[lang][key] ?? en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
  return text;
}

/** Catalog names are stored per language; show the reader's, else whichever exists. */
export function nameOf(row: { name_en?: string | null; name_ar?: string | null }, lang: Lang): string {
  return (lang === 'ar' ? row.name_ar || row.name_en : row.name_en || row.name_ar) ?? '';
}

export function numberFmt(n: number, lang: Lang): string {
  return new Intl.NumberFormat(lang === 'ar' ? 'ar-PS' : 'en-GB', { maximumFractionDigits: 2 }).format(n);
}

export function dateFmt(day: string, lang: Lang, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-PS' : 'en-GB', opts).format(new Date(y, m - 1, d));
}

export function getStoredLang(): Lang {
  try {
    const v = localStorage.getItem('lang');
    if (v === 'ar' || v === 'en') return v;
  } catch {
    /* storage blocked: fall through */
  }
  return navigator.language?.startsWith('en') ? 'en' : 'ar';
}

export function storeLang(lang: Lang) {
  try {
    localStorage.setItem('lang', lang);
  } catch {
    /* ignore */
  }
}
