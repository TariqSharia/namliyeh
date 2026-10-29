import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Connector, supabase } from '../data/connector';
import { db } from '../data/db';
import { DEMO, DEMO_USER, seedDemo } from '../demo';

type SessionState = { session: Session | null; ready: boolean };

const SessionContext = createContext<SessionState>({ session: null, ready: false });

const connector = new Connector();

/**
 * Keeps the Supabase sign-in and the PowerSync connection in step.
 * Offline, Supabase still returns the saved session, so the app opens with local data.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ session: null, ready: false });

  useEffect(() => {
    let cancelled = false;

    if (DEMO) {
      // Preview build only: a sample home on this device, no account, no internet.
      void seedDemo().then(() => {
        if (!cancelled) setState({ session: { user: { id: DEMO_USER } } as Session, ready: true });
      });
      return () => {
        cancelled = true;
      };
    }

    void db.init();

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setState({ session: data.session, ready: true });
      if (data.session) void db.connect(connector);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setState({ session, ready: true });
      if (event === 'SIGNED_IN') void db.connect(connector);
      if (event === 'SIGNED_OUT') void db.disconnectAndClear();
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);

export async function signOut() {
  await supabase.auth.signOut();
  await db.disconnectAndClear();
}
