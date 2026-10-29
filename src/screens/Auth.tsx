import { useState } from 'react';
import { supabase } from '../data/connector';
import { useLang, useT, type Lang } from '../i18n';

/** Sign in or create an account with email and password, or with Google. */
export function Auth({ onLang }: { onLang: (l: Lang) => void }) {
  const t = useT();
  const lang = useLang();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

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
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
    if (error) setMessage({ kind: 'error', text: error.message });
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
        {/* Shown only once Google sign-in is configured in Supabase (VITE_GOOGLE_SIGN_IN=1). */}
        {import.meta.env.VITE_GOOGLE_SIGN_IN === '1' && (
          <button type="button" className="btn ghost wide" onClick={google} disabled={busy}>
            <span aria-hidden="true">G</span> {t('withGoogle')}
          </button>
        )}
        <button type="button" className="link" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
          {mode === 'signin' ? t('noAccount') : t('haveAccount')}
        </button>
      </form>
    </div>
  );
}
