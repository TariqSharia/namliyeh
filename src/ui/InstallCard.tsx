import { useState } from 'react';
import { dismissInstall, installDismissedRecently, useInstall } from '../app/install';
import { useT } from '../i18n';

/** Safari's share icon: a box with an arrow pointing up. */
function ShareIcon() {
  return (
    <svg className="share-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 10H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Explains how to put the app on the home screen, for the phone in hand.
 * where="welcome": on the sign-in screen, always shown when not installed (on iPhone it
 * matters most here, because a sign-in made in Safari does not carry over to the icon).
 * where="home": on the home screen, with "Not now", and back after a week.
 */
export function InstallCard({ where }: { where: 'welcome' | 'home' }) {
  const t = useT();
  const install = useInstall();
  const [hidden, setHidden] = useState(() => where === 'home' && installDismissedRecently());
  // On the home screen the card starts folded so the three daily buttons stay on top.
  const [open, setOpen] = useState(where === 'welcome');

  if (install.standalone || hidden || install.platform === 'other') return null;

  return (
    <section className="install-card" aria-labelledby="install-title">
      <div className="install-head">
        <img src="/icons/icon-192.png" alt="" width="48" height="48" />
        <div>
          <h2 id="install-title">{t('installTitle')}</h2>
          <p className="install-hint">{t('installHint')}</p>
        </div>
      </div>

      {!open && !(install.platform === 'android' && install.canPrompt) ? (
        <button className="btn wide" onClick={() => setOpen(true)} aria-expanded={false}>
          {t('installShowHow')}
        </button>
      ) : install.inAppBrowser ? (
        <p className="install-note">{t('installInAppBrowser')}</p>
      ) : install.platform === 'android' ? (
        install.canPrompt ? (
          <button className="btn primary wide big" onClick={() => void install.promptInstall()}>
            {t('installButton')}
          </button>
        ) : (
          <p className="install-note">{t('installAndroidSteps')}</p>
        )
      ) : (
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
      )}

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
    </section>
  );
}
