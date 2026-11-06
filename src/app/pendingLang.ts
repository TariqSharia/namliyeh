import type { Lang } from '../i18n';

const PENDING_LANG = 'lang-chosen-before-sign-in';

/** Remember the language on screen at sign-in, so a new account (Google or email) starts in it. */
export function setPendingLang(l: Lang) {
  try {
    localStorage.setItem(PENDING_LANG, l);
  } catch {
    /* ignore */
  }
}

export function takePendingLang(): Lang | null {
  try {
    const v = localStorage.getItem(PENDING_LANG);
    if (v !== 'ar' && v !== 'en') return null;
    localStorage.removeItem(PENDING_LANG);
    return v;
  } catch {
    return null;
  }
}
