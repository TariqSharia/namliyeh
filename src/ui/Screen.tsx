import { Icon } from './Icon';
import { useStatus } from '@powersync/react';
import type { ReactNode } from 'react';
import { back } from '../app/router';
import { useT } from '../i18n';

/** Page frame: back button, title, and a small dot that says whether entries are sent. */
export function Screen({
  title,
  children,
  showBack = true,
  footer,
  action
}: {
  title: string;
  children: ReactNode;
  showBack?: boolean;
  footer?: ReactNode;
  action?: ReactNode;
}) {
  const t = useT();
  return (
    <div className={`screen${footer ? ' has-footer' : ''}`}>
      <header className="topbar">
        {showBack ? (
          <button className="icon-btn back" onClick={back} aria-label={t('back')}>
            <Icon name="back" />
          </button>
        ) : (
          <span className="topbar-spacer" />
        )}
        <h1>{title}</h1>
        {action ?? <SyncDot />}
      </header>
      <main className="content">{children}</main>
      {footer && <div className="footer-bar">{footer}</div>}
    </div>
  );
}

export function SyncDot() {
  const status = useStatus();
  const t = useT();
  const uploading = status.dataFlowStatus?.uploading;
  const state = !status.connected ? 'offline' : uploading ? 'sending' : 'synced';
  const label = state === 'offline' ? t('syncOffline') : state === 'sending' ? t('syncSending') : t('syncDone');
  return (
    <span className={`sync-dot ${state}`} role="status" aria-label={label} title={label}>
      <span className="sync-text">{state === 'offline' ? t('syncOfflineShort') : ''}</span>
    </span>
  );
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden="true">
        {icon}
      </div>
      <p className="empty-title">{title}</p>
      {children}
    </div>
  );
}
