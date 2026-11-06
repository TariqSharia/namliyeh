import { useState } from 'react';
import { useGoogleEnabled } from '../data/authProviders';
import { supabase } from '../data/connector';
import { useLang, useT, type Lang } from '../i18n';
import { InstallCard } from '../ui/InstallCard';

/** Google's four-colour G, as required by Google's sign-in button guidelines. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" width="22" height="22" aria-hidden="true" focusable="false">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/** Sign in with Google (one tap, no new password) or with email and password. */
export function Auth({ onLang }: { onLang: (l: Lang) => void }) {
  const t = useT();
  const lang = useLang();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const googleOn = useGoogleEnabled();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) setMessage({ kind: 'error', text: error.message === 'Invalid login credentials' ? t('wrongLogin') : error.message });
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: name.trim(), language: lang }, emailRedirectTo: window.location.origin }
        });
        if (error) setMessage({ kind: 'error', text: error.message });
        else if (!data.session) setMessage({ kind: 'info', text: t('checkEmail') });
      }
    } catch {
      setMessage({ kind: 'error', text: t('needInternet') });
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin, queryParams: { prompt: 'select_account' } }
    });
    // On success the page leaves for Google; we only get here on an error.
    if (error) {
      setBusy(false);
      setMessage({ kind: 'error', text: navigator.onLine ? error.message : t('needInternet') });
    }
  }

  return (
    <div className="auth">
      <div className="auth-head">
        <img className="brand-icon" src="/icons/icon.svg" alt="" width="96" height="96" />
        <h1>{t('appName')}</h1>
        <p className="lede">{t('appTagline')}</p>
        <div className="lang-switch" role="group" aria-label={t('language')}>
          <button className={lang === 'ar' ? 'on' : ''} onClick={() => onLang('ar')} lang="ar">
            العربية
          </button>
          <button className={lang === 'en' ? 'on' : ''} onClick={() => onLang('en')} lang="en">
            English
          </button>
        </div>
      </div>

      <InstallCard where="welcome" />

      {googleOn && (
        <div className="google-first">
          <button type="button" className="btn google wide big" onClick={google} disabled={busy}>
            <GoogleMark /> {t('withGoogle')}
          </button>
          <p className="or">{t('orWithEmail')}</p>
        </div>
      )}

      <form className="card form" onSubmit={submit}>
        <h2>{mode === 'signin' ? t('signIn') : t('createAccount')}</h2>
        {mode === 'signup' && (
          <label className="field">
            <span>{t('yourName')}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
          </label>
        )}
        <label className="field">
          <span>{t('email')}</span>
          <input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label className="field">
          <span>{t('password')}</span>
          <input
            type="password"
            dir="ltr"
            value={password}
            minLength={8}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            required
          />
        </label>
        {message && <p className={message.kind === 'error' ? 'error' : 'info'}>{message.text}</p>}
        <button className="btn primary wide" disabled={busy}>
          {busy ? t('wait') : mode === 'signin' ? t('signIn') : t('createAccount')}
        </button>
        <button type="button" className="link" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
          {mode === 'signin' ? t('noAccount') : t('haveAccount')}
        </button>
      </form>

      <footer className="legal-links">
        <a href="/privacy">{t('privacyPolicy')}</a>
        <span aria-hidden="true">·</span>
        <a href="/terms">{t('termsOfUse')}</a>
      </footer>
    </div>
  );
}
