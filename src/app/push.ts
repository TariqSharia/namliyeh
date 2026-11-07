// Expiry reminders on this phone (Web Push). The phone asks permission, subscribes with the
// server's public key, and stores its push address in Supabase; the server does the rest.
// Works on Android (Chrome) and on iPhone only once the app is added to the home screen (iOS 16.4+).
import { config, supabase } from '../data/connector';
import { detectPlatform, isStandalone } from './install';

const FUNCTION_URL = () => `${(config.supabaseUrl ?? '').replace(/\/$/, '')}/functions/v1/expiry-reminders`;

export type PushState = 'unsupported' | 'install-first' | 'denied' | 'off' | 'on';

export function pushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** Where this phone stands, so Settings can say the one thing that matters. */
export async function pushState(): Promise<PushState> {
  const ios = detectPlatform(navigator.userAgent, navigator.maxTouchPoints) === 'ios';
  if (ios && !isStandalone()) return 'install-first';
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

function keyBytes(base64url: string) {
  const padded = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

/** Turn reminders on: permission, subscription, saved on the server. Needs the internet. */
export async function enablePush(language: 'ar' | 'en'): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = (await (await fetch(FUNCTION_URL())).json()) as { publicKey: string };
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
  await savePush(sub, language);
  return 'on';
}

async function savePush(sub: PushSubscription, language: 'ar' | 'en') {
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const { error } = await supabase.rpc('save_push_subscription', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_language: language });
  if (error) throw error;
}

/** Reminders follow the person's language: re-save when it changes. */
export async function updatePushLanguage(language: 'ar' | 'en') {
  if (!pushSupported()) return;
  const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
  if (sub) await savePush(sub, language).catch(() => {});
}

export async function disablePush(): Promise<PushState> {
  const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
  if (sub) {
    await supabase.rpc('delete_push_subscription', { p_endpoint: sub.endpoint });
    await sub.unsubscribe();
  }
  return 'off';
}

/** One notification to this person's phones, to prove it works. */
export async function testPush(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(FUNCTION_URL(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: JSON.stringify({ test: true })
  });
  const body = (await res.json()) as { sent?: number };
  return (body.sent ?? 0) > 0;
}
