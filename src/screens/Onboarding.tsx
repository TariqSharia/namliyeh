import { useEffect, useState } from 'react';
import { signOut } from '../app/session';
import { supabase } from '../data/connector';
import { CURRENCIES, CURRENCY_CODES, type Currency } from '../data/money';
import { useLang, useT } from '../i18n';
import { SyncWait } from '../ui/SyncWait';
import { Icon } from '../ui/Icon';

/** First time only: make a new home, or join one with the code a family member shares. */
export function Onboarding() {
  const t = useT();
  const lang = useLang();
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose');
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState<Currency>('ILS');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);

  // If the server already has a home for this user (made a moment ago, or on another phone),
  // wait for it to arrive instead of offering to make a second one.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase.from('household_members').select('household_id').eq('user_id', auth.user.id).limit(1);
      if (!cancelled && data && data.length > 0) setWaiting(true);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    if (!navigator.onLine) {
      setError(t('needInternet'));
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await fn();
    setBusy(false);
    if (error) setError(error.message.includes('expired') ? t('badCode') : error.message);
    else setWaiting(true); // the new home arrives through sync in a moment
  }

  if (waiting) return <SyncWait titleKey="settingUp" hintKey="settingUpHint" />;

  return (
    <div className="auth">
      <div className="auth-head">
        <img className="brand-icon" src="/icons/icon.svg" alt="" width="80" height="80" />
        <h1>{t('welcome')}</h1>
        <p className="lede">{t('onboardingLede')}</p>
      </div>

      {mode === 'choose' && (
        <div className="stack">
          <button className="big-tile bought" onClick={() => setMode('create')}>
            <span className="big-icon">
              <Icon name="home" size={28} />
            </span>
            <span className="big-label">{t('newHome')}</span>
          </button>
          <button className="big-tile used" onClick={() => setMode('join')}>
            <span className="big-icon">
              <Icon name="key" size={28} />
            </span>
            <span className="big-label">{t('joinHome')}</span>
          </button>
        </div>
      )}

      {mode === 'create' && (
        <form
          className="card form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => supabase.rpc('create_household', { p_name: name.trim(), p_currency: currency, p_language: lang }));
          }}
        >
          <label className="field">
            <span>{t('homeName')}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('homeNameExample')} required maxLength={80} />
          </label>
          <fieldset className="field">
            <legend>{t('mainCurrency')}</legend>
            <div className="chips">
              {CURRENCY_CODES.map((c) => (
                <button type="button" key={c} className={`chip${c === currency ? ' on' : ''}`} onClick={() => setCurrency(c)} aria-pressed={c === currency}>
                  {CURRENCIES[c].symbol} {t(`currency_${c}`)}
                </button>
              ))}
            </div>
            <p className="hint">{t('mainCurrencyHint')}</p>
          </fieldset>
          {error && <p className="error">{error}</p>}
          <button className="btn primary wide" disabled={busy}>
            {busy ? t('wait') : t('createHome')}
          </button>
          <button type="button" className="link" onClick={() => setMode('choose')}>
            {t('back')}
          </button>
        </form>
      )}

      {mode === 'join' && (
        <form
          className="card form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => supabase.rpc('join_household', { p_code: code.trim() }));
          }}
        >
          <label className="field">
            <span>{t('inviteCode')}</span>
            <input
              className="code-input"
              dir="ltr"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={6}
              autoCapitalize="characters"
              autoComplete="one-time-code"
              required
            />
          </label>
          <p className="hint">{t('inviteCodeHint')}</p>
          {error && <p className="error">{error}</p>}
          <button className="btn primary wide" disabled={busy}>
            {busy ? t('wait') : t('join')}
          </button>
          <button type="button" className="link" onClick={() => setMode('choose')}>
            {t('back')}
          </button>
        </form>
      )}

      <button className="link quiet" onClick={() => void signOut()}>
        {t('signOut')}
      </button>
    </div>
  );
}
