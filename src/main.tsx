import '@fontsource/ibm-plex-sans-arabic/arabic-400.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-600.css';
import '@fontsource/ibm-plex-sans-arabic/latin-400.css';
import '@fontsource/ibm-plex-sans-arabic/latin-600.css';
import './styles.css';

import { PowerSyncContext } from '@powersync/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';
import { SessionProvider } from './app/session';
import { db } from './data/db';

// Installs the offline copy of the app and updates it quietly when a new version is published.
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PowerSyncContext.Provider value={db}>
      <SessionProvider>
        <App />
      </SessionProvider>
    </PowerSyncContext.Provider>
  </StrictMode>
);
