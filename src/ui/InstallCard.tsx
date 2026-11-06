import { useState } from 'react';
import { dismissInstall, installDismissedRecently, useInstall } from '../app/install';
import { useT } from '../i18n';
import { Sheet } from './Sheet';

/** Safari's share icon: a box with an arrow pointing up. */
function ShareIcon() {
  return (
    <svg className="share-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 10H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** The steps for the phone in hand. */
function InstallSteps({ where }: { where: 'welcome' | 'home' }) {
  const t = useT();
  const install = useInstall();
  if (install.inAppBrowser) return <p className="install-note">{t('installInAppBrowser')}</p>;
  if (install.platform === 'android') return <p className="install-note">{t('installAndroidSteps')}</p>;
  return (
    <>
      <ol className="install-steps">
        <li>
          {t('installIosStep1')} <ShareIcon />
        </li>
        <li>{t('installIosStep2')}</li>
        <li>{t('installIosStep3')}</li>
      </ol>
      {where === 'welcome' && <p className="install-note strong">{t('installIosFirst')}</p>}
    </>
  );
}

/**
 * Explains how to put the app on the home screen, for the phone in hand.
 * One slim row: the icon, a short line, and one button. On Android with an install prompt the
 * button installs directly; otherwise it opens the steps in a bottom sheet, so the sign-in
 * screen still fits on one screen.
 * where="home": also offers "Not now", and comes back after a week.
 */
export function InstallCard({ where }: { where: 'welcome' | 'home' }) {
  const t = useT();
  const install = useInstall();
  const [hidden, setHidden] = useState(() => where === 'home' && installDismissedRecently());
  const [open, setOpen] = useState(false);

  if (install.standalone || hidden || install.platform === 'other') return null;

  const direct = install.platform === 'android' && install.canPrompt && !install.inAppBrowser;
  const hint = install.platform === 'ios' && where === 'welcome' && !install.inAppBrowser ? t('installIosFirstShort') : t('installHint');

  return (
    <section className="install-card" aria-labelledby="install-title">
      <div className="install-text">
        <h2 id="install-title">{t('installTitle')}</h2>
        <p className="install-hint">{hint}</p>
      </div>
      <div className="install-actions">
        <button className={`btn small${where === 'home' ? ' primary' : ''}`} onClick={() => (direct ? void install.promptInstall() : setOpen(true))}>
          {direct ? t('installShort') : t('installShowHow')}
        </button>
        {where === 'home' && (
          <button
            className="link quiet-inline"
            onClick={() => {
              dismissInstall();
              setHidden(true);
            }}
          >
            {t('notNow')}
          </button>
        )}
      </div>
      {open && (
        <Sheet title={t('installTitle')} onClose={() => setOpen(false)}>
          <InstallSteps where={where} />
        </Sheet>
      )}
    </section>
  );
}
