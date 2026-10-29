import { useQuery } from '@powersync/react';
import { useState } from 'react';
import { useHousehold } from '../app/household';
import { signOut } from '../app/session';
import { updateHousehold, updateProfile } from '../data/actions';
import { supabase } from '../data/connector';
import { db } from '../data/db';
import { CURRENCIES, CURRENCY_CODES } from '../data/money';
import { storeLang, useLang, useT, type Key, type Lang } from '../i18n';
import { Screen } from '../ui/Screen';
import { useToast } from '../ui/Toast';

const EXPORT_TABLES = [
  'households', 'household_members', 'locations', 'household_items', 'labels', 'household_item_labels', 'household_stores',
  'money_categories', 'purchases', 'purchase_lines', 'transactions', 'batches', 'stock_movements', 'level_changes', 'shopping_list_entries'
] as const;

/** Language, home details, inviting family, money on/off, price sharing, backup, sign out. */
export function Settings() {
  const t = useT();
  const lang = useLang();
  const toast = useToast();
  const { household, profile, ctx } = useHousehold();
  const { data: members } = useQuery<{ id: string; display_name: string; role: string }>(
    `SELECT id, display_name, role FROM household_members WHERE household_id = ? ORDER BY joined_at`,
    [ctx.householdId]
  );
  const { data: errors } = useQuery<{ id: string; table_name: string; message: string; created_at: string }>(
    `SELECT id, table_name, message, created_at FROM upload_errors ORDER BY created_at DESC`
  );
  const [code, setCode] = useState<string | null>(null);
  const [name, setName] = useState(profile?.display_name ?? '');
  const [homeName, setHomeName] = useState(household.name);
  const [busy, setBusy] = useState(false);

  const setLang = async (l: Lang) => {
    storeLang(l);
    await updateProfile(ctx.userId, { language: l });
  };

  async function invite() {
    if (!navigator.onLine) return toast(t('needInternet'));
    setBusy(true);
    const { data, error } = await supabase.rpc('create_invite', { p_household: ctx.householdId });
    setBusy(false);
    if (error) return toast(error.message);
    setCode(String(data));
  }

  async function share(c: string) {
    const text = t('inviteMessage', { code: c, url: window.location.origin });
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        /* closed the share sheet */
      }
    }
    await navigator.clipboard?.writeText(text);
    toast(t('copied'));
  }

  async function exportData() {
    const out: Record<string, unknown[]> = {};
    for (const table of EXPORT_TABLES) {
      out[table] = await db.getAll(
        table === 'households' ? `SELECT * FROM households WHERE id = ?` : `SELECT * FROM ${table} WHERE household_id = ?`,
        [ctx.householdId]
      );
    }
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), ...out }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `home-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  }

  return (
    <Screen title={t('settings')} showBack={false}>
      <section className="section">
        <h2 className="section-title">{t('language')}</h2>
        <div className="segmented" role="radiogroup" aria-label={t('language')}>
          <button role="radio" aria-checked={lang === 'ar'} className={lang === 'ar' ? 'on' : ''} onClick={() => void setLang('ar')} lang="ar">
            العربية
          </button>
          <button role="radio" aria-checked={lang === 'en'} className={lang === 'en' ? 'on' : ''} onClick={() => void setLang('en')} lang="en">
            English
          </button>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">{t('you')}</h2>
        <form
          className="inline-form"
          onSubmit={async (e) => {
            e.preventDefault();
            await updateProfile(ctx.userId, { display_name: name.trim() });
            toast(t('saved'));
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} aria-label={t('yourName')} placeholder={t('yourName')} />
          <button className="btn" disabled={!name.trim() || name === profile?.display_name}>
            {t('save')}
          </button>
        </form>
      </section>

      <section className="section">
        <h2 className="section-title">{t('home')}</h2>
        <form
          className="inline-form"
          onSubmit={async (e) => {
            e.preventDefault();
            await updateHousehold(ctx, { name: homeName.trim() });
            toast(t('saved'));
          }}
        >
          <input value={homeName} onChange={(e) => setHomeName(e.target.value)} aria-label={t('homeName')} maxLength={80} />
          <button className="btn" disabled={!homeName.trim() || homeName === household.name}>
            {t('save')}
          </button>
        </form>
        <ul className="rows compact">
          {members.map((m) => (
            <li key={m.id} className="row">
              <span className="row-title">👤 {m.display_name || t('someone')}</span>
              <span className="row-sub">{m.role === 'owner' ? t('owner') : t('member')}</span>
            </li>
          ))}
        </ul>
        {code ? (
          <div className="invite">
            <p className="hint">{t('inviteShow')}</p>
            <p className="code" dir="ltr">
              {code}
            </p>
            <button className="btn primary wide" onClick={() => void share(code)}>
              {t('share')}
            </button>
          </div>
        ) : (
          <button className="btn ghost wide" onClick={() => void invite()} disabled={busy}>
            ➕ {t('inviteFamily')}
          </button>
        )}
      </section>

      <section className="section">
        <h2 className="section-title">{t('money')}</h2>
        <label className="switch-row">
          <span>
            <span className="row-title">{t('trackMoney')}</span>
            <span className="row-sub">{t('trackMoneyHint')}</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={Boolean(household.money_enabled)}
            onChange={(e) => void updateHousehold(ctx, { money_enabled: e.target.checked ? 1 : 0 })}
          />
        </label>
        {Boolean(household.money_enabled) && (
          <>
            <p className="field-label">{t('mainCurrency')}</p>
            <div className="chips">
              {CURRENCY_CODES.map((c) => (
                <button
                  key={c}
                  className={`chip${c === household.main_currency ? ' on' : ''}`}
                  aria-pressed={c === household.main_currency}
                  onClick={() => void updateHousehold(ctx, { main_currency: c })}
                >
                  {CURRENCIES[c].symbol} {t(`currency_${c}` as Key)}
                </button>
              ))}
            </div>
            <p className="hint">{t('mainCurrencyChangeHint')}</p>
          </>
        )}
        <label className="switch-row">
          <span>
            <span className="row-title">{t('sharePrices')}</span>
            <span className="row-sub">{t('sharePricesHint')}</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={Boolean(household.share_prices)}
            onChange={(e) => void updateHousehold(ctx, { share_prices: e.target.checked ? 1 : 0 })}
          />
        </label>
      </section>

      {errors.length > 0 && (
        <section className="section">
          <h2 className="section-title warn">{t('notSaved')}</h2>
          <p className="hint">{t('notSavedHint')}</p>
          <ul className="rows compact">
            {errors.map((e) => (
              <li key={e.id} className="row">
                <span className="row-text">
                  <span className="row-title">{e.table_name}</span>
                  <span className="row-sub">{e.message}</span>
                </span>
              </li>
            ))}
          </ul>
          <button className="btn ghost wide" onClick={() => void db.execute('DELETE FROM upload_errors')}>
            {t('clearList')}
          </button>
        </section>
      )}

      <section className="section">
        <h2 className="section-title">{t('backup')}</h2>
        <button className="btn ghost wide" onClick={() => void exportData()}>
          💾 {t('downloadBackup')}
        </button>
      </section>

      <button className="btn danger-ghost wide" onClick={() => void signOut()}>
        {t('signOut')}
      </button>
      <p className="version">v{__APP_VERSION__}</p>
    </Screen>
  );
}
