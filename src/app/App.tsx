import { useStatus } from '@powersync/react';
import { useState } from 'react';
import { isConfigured } from '../data/connector';
import { DEMO } from '../demo';
import { getStoredLang, LangProvider, storeLang, useT, type Lang } from '../i18n';
import { Auth } from '../screens/Auth';
import { Buy } from '../screens/Buy';
import { Home } from '../screens/Home';
import { ItemDetail } from '../screens/ItemDetail';
import { Money } from '../screens/Money';
import { Need } from '../screens/Need';
import { Onboarding } from '../screens/Onboarding';
import { Settings } from '../screens/Settings';
import { Stock } from '../screens/Stock';
import { Use } from '../screens/Use';
import { ToastProvider } from '../ui/Toast';
import { HouseholdProvider, useMyHouseholds } from './household';
import { href, useRoute, type Route } from './router';
import { useSession } from './session';

export function App() {
  const { session, ready } = useSession();
  const [lang, setLang] = useState<Lang>(getStoredLang);

  if (!isConfigured) {
    return (
      <LangProvider lang={lang}>
        <Message icon="🔧" titleKey="notConfigured" hintKey="notConfiguredHint" />
      </LangProvider>
    );
  }
  if (!ready) return null;
  if (!session) {
    return (
      <LangProvider lang={lang}>
        <Auth
          onLang={(l) => {
            storeLang(l);
            setLang(l);
          }}
        />
      </LangProvider>
    );
  }
  return <SignedIn userId={session.user.id} fallbackLang={lang} />;
}

function SignedIn({ userId, fallbackLang }: { userId: string; fallbackLang: Lang }) {
  const status = useStatus();
  const { households, profile } = useMyHouseholds(userId);
  const lang: Lang = profile?.language ?? fallbackLang;
  const household = households[0];

  if (!household) {
    return (
      <LangProvider lang={lang}>
        {/* Wait for the first download before deciding this user has no home yet. */}
        {status.hasSynced || DEMO ? <Onboarding /> : <Message icon="⏳" titleKey="loading" hintKey={status.connected ? 'loadingHint' : 'firstTimeOnline'} />}
      </LangProvider>
    );
  }

  return (
    <LangProvider lang={lang}>
      <HouseholdProvider household={household} profile={profile} userId={userId}>
        <ToastProvider>
          <Routes />
        </ToastProvider>
      </HouseholdProvider>
    </LangProvider>
  );
}

function Routes() {
  const route = useRoute();
  return (
    <>
      <Page route={route} />
      <BottomNav route={route} />
    </>
  );
}

function Page({ route }: { route: Route }) {
  switch (route.name) {
    case 'buy':
      return <Buy />;
    case 'use':
      return <Use />;
    case 'need':
      return <Need />;
    case 'stock':
      return <Stock categoryId={route.categoryId} />;
    case 'item':
      return <ItemDetail key={route.id} id={route.id} />;
    case 'money':
      return <Money />;
    case 'settings':
      return <Settings />;
    default:
      return <Home />;
  }
}

function BottomNav({ route }: { route: Route }) {
  const t = useT();
  const tabs: { route: Route; icon: string; label: string; match: Route['name'][] }[] = [
    { route: { name: 'home' }, icon: '🏠', label: t('tabHome'), match: ['home', 'buy', 'use', 'need'] },
    { route: { name: 'stock' }, icon: '🧺', label: t('tabStock'), match: ['stock', 'item'] },
    { route: { name: 'money' }, icon: '💰', label: t('tabMoney'), match: ['money'] },
    { route: { name: 'settings' }, icon: '⚙️', label: t('tabSettings'), match: ['settings'] }
  ];
  return (
    <nav className="bottom-nav" aria-label={t('mainMenu')}>
      {tabs.map((tab) => {
        const active = tab.match.includes(route.name);
        return (
          <a key={tab.label} href={href(tab.route)} className={active ? 'on' : ''} aria-current={active ? 'page' : undefined}>
            <span className="nav-icon" aria-hidden="true">
              {tab.icon}
            </span>
            <span className="nav-label">{tab.label}</span>
          </a>
        );
      })}
    </nav>
  );
}

function Message({ icon, titleKey, hintKey }: { icon: string; titleKey: 'notConfigured' | 'loading'; hintKey: 'notConfiguredHint' | 'loadingHint' | 'firstTimeOnline' }) {
  const t = useT();
  return (
    <div className="auth">
      <div className="auth-head">
        <div className="brand-mark" aria-hidden="true">
          {icon}
        </div>
        <h1>{t(titleKey)}</h1>
        <p className="lede">{t(hintKey)}</p>
      </div>
    </div>
  );
}
