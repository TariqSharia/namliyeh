import { useQuery } from '@powersync/react';
import { useState } from 'react';
import { useHousehold } from '../app/household';
import { addTransaction, setTransactionDeleted } from '../data/actions';
import { monthStart, nextMonthStart, today } from '../data/dates';
import { CURRENCIES, CURRENCY_CODES, formatMoney, isCurrency, parseAmount, type Currency } from '../data/money';
import { MONTH_BY_CATEGORY, MONTH_BY_PERSON, MONTH_TOTALS, MONTH_TRANSACTIONS, MONTH_WASTE } from '../data/queries';
import { dateFmt, useLang, useT, type Key } from '../i18n';
import { Icon } from '../ui/Icon';
import { Empty, Screen } from '../ui/Screen';
import { Sheet } from '../ui/Sheet';
import { useToast } from '../ui/Toast';

type Totals = { income: number; expense: number };
type CatRow = { id: string | null; name: string | null; icon: string | null; type: string; total: number };
type Tx = {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  currency: string;
  amount_main: number;
  date: string;
  note: string | null;
  category_name: string | null;
  category_icon: string | null;
  person: string | null;
  purchase_id: string | null;
};

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Money in and out for one month, where it went, who spent it, and what was thrown away. */
export function Money() {
  const t = useT();
  const lang = useLang();
  const toast = useToast();
  const { household, ctx } = useHousehold();
  const [month, setMonth] = useState(monthStart(today()));
  const [adding, setAdding] = useState<'income' | 'expense' | null>(null);
  const [open, setOpen] = useState<Tx | null>(null);
  const sep = lang === 'ar' ? '، ' : ', ';
  const range = [ctx.householdId, month, nextMonthStart(month)];
  const cur = household.main_currency;
  const money = (n: number) => formatMoney(n, cur, lang);

  const totals = useQuery<Totals>(MONTH_TOTALS, range).data[0] ?? { income: 0, expense: 0 };
  const { data: byCat } = useQuery<CatRow>(MONTH_BY_CATEGORY, range);
  const { data: byPerson } = useQuery<{ user_id: string; display_name: string | null; total: number }>(MONTH_BY_PERSON, range);
  const waste = useQuery<{ wasted_value: number }>(MONTH_WASTE, range).data[0]?.wasted_value ?? 0;
  const { data: recent } = useQuery<Tx>(MONTH_TRANSACTIONS, range);

  if (!household.money_enabled) {
    return (
      <Screen title={t('money')} showBack={false}>
        <Empty icon={<Icon name="wallet" size={40} />} title={t('moneyOff')}>
          <a className="btn primary" href="#/settings">
            {t('turnOnInSettings')}
          </a>
        </Empty>
      </Screen>
    );
  }

  const expenses = byCat.filter((c) => c.type === 'expense');
  const maxExpense = Math.max(1, ...expenses.map((c) => c.total));
  const left = totals.income - totals.expense;
  const titleOf = (x: Tx) => x.note || x.category_name || (x.purchase_id ? t('shoppingTrip') : t('noCategory'));

  return (
    <Screen title={t('money')} showBack={false}>
      <div className="month-switch">
        <button className="icon-btn" onClick={() => setMonth(shiftMonth(month, -1))} aria-label={t('previousMonth')}>
          <Icon name="back" />
        </button>
        <span className="month-name">{dateFmt(month, lang, { month: 'long', year: 'numeric' })}</span>
        <button className="icon-btn" onClick={() => setMonth(shiftMonth(month, 1))} aria-label={t('nextMonth')} disabled={month >= monthStart(today())}>
          <Icon name="forward" />
        </button>
      </div>

      {/* What is left is the number people look for; in and out sit under it. */}
      <div className={`money-card${left < 0 ? ' negative' : ''}`}>
        <span className="money-card-label">{left < 0 ? t('overspent') : t('moneySaved')}</span>
        <span className="money-card-value">{money(Math.abs(left))}</span>
        <div className="money-card-split">
          <span>
            <span className="money-card-small">{t('moneyIn')}</span>
            <span className="money-card-amount">{money(totals.income)}</span>
          </span>
          <span>
            <span className="money-card-small">{t('moneyOut')}</span>
            <span className="money-card-amount">{money(totals.expense)}</span>
          </span>
        </div>
      </div>

      <div className="add-row">
        <button className="btn big income" onClick={() => setAdding('income')}>
          <Icon name="plus" /> {t('moneyIn')}
        </button>
        <button className="btn big expense" onClick={() => setAdding('expense')}>
          <Icon name="minus" /> {t('moneyOut')}
        </button>
      </div>

      {expenses.length > 0 && (
        <section className="section">
          <h2 className="section-title">{t('whereItWent')}</h2>
          <ul className="bars">
            {expenses.map((c) => (
              <li key={c.id ?? 'none'} className="bar-row">
                <span className="bar-label">{c.name ?? t('noCategory')}</span>
                <span className="bar-track" aria-hidden="true">
                  <span className="bar-fill" style={{ inlineSize: `${(c.total / maxExpense) * 100}%` }} />
                </span>
                <span className="bar-value">{money(c.total)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {byPerson.length > 1 && (
        <section className="section">
          <h2 className="section-title">{t('whoSpent')}</h2>
          <ul className="rows compact">
            {byPerson.map((p) => (
              <li key={p.user_id} className="row">
                <span className="row-title">{p.display_name || t('someone')}</span>
                <span className="row-value">{money(p.total)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {waste > 0 && (
        <p className="waste-note">
          <Icon name="trash" size={20} /> {t('wasteValue', { amount: money(waste) })}
        </p>
      )}

      <section className="section">
        <h2 className="section-title">{t('entries')}</h2>
        {recent.length === 0 ? (
          <p className="hint">{t('noEntries')}</p>
        ) : (
          <ul className="rows">
            {recent.map((x) => (
              <li key={x.id} className="row">
                <button className="row-main" onClick={() => setOpen(x)}>
                  <span className="row-icon line-icon">
                    <Icon name={x.purchase_id ? 'bagCheck' : x.type === 'income' ? 'briefcase' : 'wallet'} size={22} />
                  </span>
                  <span className="row-text">
                    <span className="row-title">{titleOf(x)}</span>
                    <span className="row-sub">
                      {dateFmt(x.date, lang)}
                      {x.person ? `${sep}${x.person}` : ''}
                      {x.currency !== cur && isCurrency(x.currency) ? `${sep}${formatMoney(x.amount, x.currency, lang)}` : ''}
                    </span>
                  </span>
                  <span className={`row-value ${x.type}`} dir="ltr">
                    {x.type === 'income' ? '+' : '−'}
                    {money(x.amount_main)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {open && (
        <Sheet title={titleOf(open)} onClose={() => setOpen(null)}>
          <p className={`big-number ${open.type}`} dir="ltr">
            {open.type === 'income' ? '+' : '−'}
            {money(open.amount_main)}
          </p>
          <p className="hint">
            {dateFmt(open.date, lang)}
            {open.person ? `${sep}${open.person}` : ''}
          </p>
          <button
            className="btn danger-ghost wide"
            onClick={async () => {
              const x = open;
              setOpen(null);
              await setTransactionDeleted(ctx, x.id, true);
              toast(t('deletedNamed', { name: `${titleOf(x)} ${money(x.amount_main)}` }), () => setTransactionDeleted(ctx, x.id, false));
            }}
          >
            <Icon name="trash" size={20} /> {t('deleteEntry')}
          </button>
        </Sheet>
      )}

      {adding && <AddMoneySheet type={adding} onClose={() => setAdding(null)} />}
    </Screen>
  );
}

function AddMoneySheet({ type, onClose }: { type: 'income' | 'expense'; onClose: () => void }) {
  const t = useT();
  const toast = useToast();
  const { household, ctx } = useHousehold();
  const { data: cats } = useQuery<{ id: string; name: string; icon: string }>(
    `SELECT id, name, icon FROM money_categories WHERE household_id = ? AND type = ? AND deleted_at IS NULL ORDER BY sort_order, name`,
    [ctx.householdId, type]
  );
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>(household.main_currency);
  const [rate, setRate] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const minor = parseAmount(amount, currency);
    if (!minor) return setError(t('badAmount'));
    const r = currency === household.main_currency ? 1 : Number(rate.replace(',', '.'));
    if (!(r > 0)) return setError(t('needRate'));
    const id = await addTransaction(ctx, { type, amount: minor, currency, rateToMain: r, date, moneyCategoryId: categoryId, note });
    toast(t('entrySaved'), () => setTransactionDeleted(ctx, id, true));
    onClose();
  }

  return (
    <Sheet title={type === 'income' ? t('moneyIn') : t('moneyOut')} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <label className="field amount-field">
          <span>{t('amount')}</span>
          <span className="amount-input">
            <input inputMode="decimal" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus required />
            <span className="unit">{CURRENCIES[currency].symbol}</span>
          </span>
        </label>
        <div className="chips">
          {CURRENCY_CODES.map((c) => (
            <button type="button" key={c} className={`chip${c === currency ? ' on' : ''}`} onClick={() => setCurrency(c)} aria-pressed={c === currency}>
              {CURRENCIES[c].symbol} {t(`currency_${c}` as Key)}
            </button>
          ))}
        </div>
        {currency !== household.main_currency && (
          <label className="field inline">
            <span>{t('rateLabel', { from: CURRENCIES[currency].symbol, to: CURRENCIES[household.main_currency].symbol })}</span>
            <input inputMode="decimal" dir="ltr" value={rate} onChange={(e) => setRate(e.target.value)} required />
          </label>
        )}
        <fieldset className="field">
          <legend>{t('category')}</legend>
          <div className="chips">
            {cats.map((c) => (
              <button type="button" key={c.id} className={`chip${categoryId === c.id ? ' on' : ''}`} onClick={() => setCategoryId(c.id)} aria-pressed={categoryId === c.id}>
                {c.name}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="field inline">
          <span>{t('date')}</span>
          <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} />
        </label>
        <label className="field">
          <span>{t('note')}</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('optional')} maxLength={120} />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary wide big">{t('save')}</button>
      </form>
    </Sheet>
  );
}
