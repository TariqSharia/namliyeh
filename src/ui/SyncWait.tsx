import { useStatus } from '@powersync/react';
import { useEffect, useState } from 'react';
import { db } from '../data/db';
import { reconnect, signOut } from '../app/session';
import { useT } from '../i18n';

/**
 * Waiting for data from the sync server (first download, or a new home arriving). If the sync server refuses the connection, say so and show its
 * error, instead of asking for internet the phone already has; and always offer a way out.
 */
export function SyncWait({ titleKey, hintKey = 'loadingHint' }: { titleKey: 'loading' | 'settingUp'; hintKey?: 'loadingHint' | 'settingUpHint' }) {
  const t = useT();
  const status = useStatus();
  const [retrying, setRetrying] = useState(false);
  const [local, setLocal] = useState('');

  // What is actually on this phone: row counts, and the sync buckets it was given.
  useEffect(() => {
    let cancelled = false;
    const read = async () => {
      const parts: string[] = [];
      for (const table of ['profiles', 'households', 'household_members', 'items', 'categories']) {
        try {
          const row = await db.get<{ n: number }>(`SELECT count(*) AS n FROM ${table}`);
          parts.push(`${table}=${row.n}`);
        } catch (e) {
          parts.push(`${table}=error`);
        }
      }
      try {
        const buckets = await db.getAll<{ name: string }>(`SELECT name FROM ps_buckets ORDER BY name`);
        parts.push(`buckets=${buckets.map((b) => b.name).join(', ') || 'none'}`);
      } catch {
        parts.push('buckets=unknown');
      }
      if (!cancelled) setLocal(parts.join('\n'));
    };
    void read();
    const timer = setInterval(() => void read(), 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);
  const error = status.dataFlowStatus?.downloadError;
  const online = typeof navigator === 'undefined' || navigator.onLine;
  const progress = status.downloadProgress;
  const hint = !online ? t('firstTimeOnline') : error ? t('syncProblem') : t(hintKey);
  // One plain line a person can read out or copy when asking for help.
  const facts = [
    `online=${online}`,
    `connecting=${status.connecting}`,
    `connected=${status.connected}`,
    `downloading=${Boolean(status.dataFlowStatus?.downloading)}`,
    progress ? `progress=${progress.downloadedOperations}/${progress.totalOperations}` : 'progress=none',
    `streams=${(status.syncStreams ?? []).map((st) => `${st.subscription.name}:${st.subscription.hasSynced ? 'synced' : 'waiting'}`).join(',') || 'none'}`,
    `v${__APP_VERSION__}`
  ].join(' ');
  return (
    <main className="auth">
      <div className="auth-head">
        <div className="brand-mark" aria-hidden="true">
          ⏳
        </div>
        <h1>{t(titleKey)}</h1>
        <p className="lede" role="status">
          {hint}
        </p>
        {progress && progress.totalOperations > 0 && (
          <progress className="sync-progress" max={progress.totalOperations} value={progress.downloadedOperations} />
        )}
      </div>
      <button
        className="btn wide"
        disabled={retrying}
        onClick={async () => {
          setRetrying(true);
          await reconnect().catch(() => {});
          setRetrying(false);
        }}
      >
        {retrying ? t('wait') : t('tryAgain')}
      </button>
      <details className="error-details" open={Boolean(error)}>
        <summary>{t('details')}</summary>
        <pre dir="ltr">
          {error ? String(error.message || error) + '\n\n' : ''}
          {facts}
          {'\n'}
          {local}
        </pre>
      </details>
      <button className="btn danger-ghost wide" onClick={() => void signOut()}>
        {t('signOut')}
      </button>
    </main>
  );
}
