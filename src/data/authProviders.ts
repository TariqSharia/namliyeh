// Which sign-in methods Supabase has turned on. The Google button appears by itself once
// Google is enabled in the Supabase dashboard; no rebuild needed. The last answer is kept
// so the button shows offline too.
import { useEffect, useState } from 'react';
import { config } from './connector';

const CACHE_KEY = 'auth-google-enabled';

function cached(): boolean {
  try {
    return localStorage.getItem(CACHE_KEY) === '1';
  } catch {
    return false;
  }
}

export async function fetchGoogleEnabled(): Promise<boolean | null> {
  if (!config.supabaseUrl || !config.supabaseKey) return null;
  try {
    const res = await fetch(`${config.supabaseUrl}/auth/v1/settings`, { headers: { apikey: config.supabaseKey } });
    if (!res.ok) return null;
    const body = (await res.json()) as { external?: { google?: boolean } };
    return body.external?.google === true;
  } catch {
    return null; // offline: keep the last known answer
  }
}

export function useGoogleEnabled(): boolean {
  const [enabled, setEnabled] = useState(cached);
  useEffect(() => {
    let alive = true;
    void fetchGoogleEnabled().then((on) => {
      if (!alive || on === null) return;
      setEnabled(on);
      try {
        localStorage.setItem(CACHE_KEY, on ? '1' : '0');
      } catch {
        /* ignore */
      }
    });
    return () => {
      alive = false;
    };
  }, []);
  return enabled;
}
