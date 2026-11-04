// Helping people put the app on their home screen. Most people have never heard of
// "Add to Home Screen", so the app explains it itself, for the phone and browser in hand.
//   - Android Chrome: offers a real one-tap install (the beforeinstallprompt event).
//   - iPhone: there is no install API, so the app shows the three taps in Safari.
//   - Links opened inside WhatsApp, Instagram or Facebook: those browsers cannot install,
//     so the app asks to open the page in the phone's browser first.
import { useEffect, useState } from 'react';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Call once at startup, before React renders: Chrome may fire the event very early. */
export function listenForInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // we show our own, clearer button instead of Chrome's small bar
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    notify();
  });
}

export type Platform = 'ios' | 'android' | 'other';

export function detectPlatform(ua: string, maxTouchPoints = 0): Platform {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  // iPadOS reports itself as a Mac; a touch screen gives it away.
  if (/Macintosh/i.test(ua) && maxTouchPoints > 1) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

/** Browsers built into other apps, which cannot install a web app. */
export function isInAppBrowser(ua: string): boolean {
  return /FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|TikTok|musical_ly|Twitter|LinkedInApp/i.test(ua) || /; wv\)/.test(ua);
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export type InstallState = {
  /** Already running from the home-screen icon (nothing to show). */
  standalone: boolean;
  platform: Platform;
  inAppBrowser: boolean;
  /** Android Chrome offered a one-tap install. */
  canPrompt: boolean;
  promptInstall: () => Promise<void>;
};

export function useInstall(): InstallState {
  const [, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  const ua = navigator.userAgent;
  return {
    standalone: installed || isStandalone(),
    platform: detectPlatform(ua, navigator.maxTouchPoints),
    inAppBrowser: isInAppBrowser(ua),
    canPrompt: deferred !== null,
    promptInstall: async () => {
      if (!deferred) return;
      const e = deferred;
      await e.prompt();
      await e.userChoice;
      deferred = null;
      notify();
    }
  };
}

const DISMISS_KEY = 'install-dismissed-at';
const DISMISS_DAYS = 7;

export function installDismissedRecently(now = Date.now()): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return at > 0 && now - at < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

export function dismissInstall() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* storage blocked: the card just shows again next time */
  }
}
