import { useQuery } from '@powersync/react';
import { useMemo, useState } from 'react';
import { useHousehold } from '../app/household';
import { go } from '../app/router';
import { addCatalogItem, addStore, recordPurchase, undoPurchase } from '../data/actions';
import { today } from '../data/dates';
import { CURRENCIES, CURRENCY_CODES, formatMoney, parseAmount, toPlain, type Currency } from '../data/money';
import { CATEGORIES, ITEMS_WITH_STOCK, LAST_PRICES, MY_STORES, NEED_TO_BUY } from '../data/queries';
import { nameOf, useLang, useT, type Key } from '../i18n';
import { ItemPicker, type Category, type PickerItem } from '../ui/ItemPicker';
import { Screen } from '../ui/Screen';
import { Sheet } from '../ui/Sheet';
import { Stepper } from '../ui/Stepper';
import { useToast } from '../ui/Toast';

type Line = {
  key: string;
  itemId: string | null;
  name: string;
  icon: string;
  quantity: number;
  price: string;
  expiryType: string;
  printedExpiry: string;
};

type ItemInfo = { id: string; expiry_type: string; icon: string; name_en: string | null; name_ar: string | null };
type StoreRow = { id: string; name_en: string | null; name_ar: string | null; nickname: string | null };
type NeedRow = { item_id: string | null; name_en: string | null; name_ar: string | null; icon: string; free_text: string | null };
type LastPrice = { item_id: string; unit_price: number; currency: string };

export const PREFILL_KEY = 'buy-prefill';

/** One shopping trip: tap what you bought, adjust amounts, optionally add prices, save. */
export function Buy() {
  const t = useT();
  const lang = useLang();
  const toast = useToast();
  const { household, ctx } = useHousehold();
  const moneyOn = Boolean(household.money_enabled);

  const { data: itemInfo } = useQuery<ItemInfo>(ITEMS_WITH_STOCK, [ctx.householdId]);
  const { data: stores } = useQuery<StoreRow>(MY_STORES, [ctx.householdId]);
  const { data: need } = useQuery<NeedRow>(NEED_TO_BUY, [ctx.householdId]);
  const { data: lastPrices } = useQuery<LastPrice>(LAST_PRICES, [ctx.householdId]);
  const { data: moneyCats } = useQuery<{ id: string }>(
    `SELECT id FROM money_categories WHERE household_id = ? AND type = 'expense' AND deleted_at IS NULL ORDER BY sort_order LIMIT 1`,
    [ctx.householdId]
  );

  const info = useMemo(() => new Map(itemInfo.map((i) => [i.id, i])), [itemInfo]);
  const [lines, setLines] = useState<Line[]>(() => {
    // Lines handed over from the "need to buy" screen.
    try {
      const raw = sessionStorage.getItem(PREFILL_KEY);
      sessionStorage.removeItem(PREFILL_KEY);
      return raw ? (JSON.parse(raw) as Line[]) : [];
    } catch {
      return [];
    }
  });
  const [storeId, setStoreId] = useState<string | null>(null);
  const [currency, setCurrency] = useState<Currency>(household.main_currency);
  const [rate, setRate] = useState('');
  const [total, setTotal] = useState('');
  const [newName, setNewName] = useState<string | null>(null);
  const [addingStore, setAddingStore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastPrice = (itemId: string) => lastPrices.find((p) => p.item_id === itemId && p.currency === currency);

  function addItem(item: { id: string; name_en: string | null; name_ar: string | null; icon: string }) {
    setLines((ls) => {
      const existing = ls.find((l) => l.itemId === item.id);
      if (existing) return ls.map((l) => (l === existing ? { ...l, quantity: l.quantity + 1 } : l));
      const lp = lastPrice(item.id);
      return [
        ...ls,
        {
          key: crypto.randomUUID(),
          itemId: item.id,
          name: nameOf(item, lang),
          icon: item.icon,
          quantity: 1,
          price: lp ? toPlain(lp.unit_price, currency) : '',
          expiryType: info.get(item.id)?.expiry_type ?? 'none',
          printedExpiry: ''
        }
      ];
    });
  }

  function addOneOff(name: string) {
    setLines((ls) => [
      ...ls,
      { key: crypto.randomUUID(), itemId: null, name, icon: '🧾', quantity: 1, price: '', expiryType: 'none', printedExpiry: '' }
    ]);
  }

  const update = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key));

  const pricedSum = lines.reduce((sum, l) => {
    const p = parseAmount(l.price, currency);
    return p == null ? sum : sum + Math.round(p * l.quantity);
  }, 0);

  const needTiles = need.filter((n) => n.item_id && !lines.some((l) => l.itemId === n.item_id));

  async function save() {
    setError(null);
    const parsedTotal = total.trim() ? parseAmount(total, currency) : null;
    if (total.trim() && parsedTotal == null) return setError(t('badAmount'));
    const badPrice = lines.find((l) => l.price.trim() && parseAmount(l.price, currency) == null);
    if (badPrice) return setError(t('badPriceFor', { name: badPrice.name }));
    const rateNum = currency === household.main_currency ? 1 : Number(rate.replace(',', '.'));
    if (moneyOn && currency !== household.main_currency && !(rateNum > 0)) return setError(t('needRate'));

    setSaving(true);
    try {
      const id = await recordPurchase(ctx, {
        storeId,
        date: today(),
        currency,
        rateToMain: rateNum > 0 ? rateNum : 1,
        total: parsedTotal,
        moneyCategoryId: moneyCats[0]?.id ?? null,
        lines: lines.map((l) => ({
          itemId: l.itemId,
          description: l.itemId ? null : l.name,
          quantity: l.quantity,
          unitPrice: l.price.trim() ? parseAmount(l.price, currency) : null,
          printedExpiry: l.printedExpiry || null
        }))
      });
      toast(t('savedTrip', { n: lines.length }), () => undoPurchase(ctx, id));
      go({ name: 'home' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen
      title={t('iBought')}
      footer={
        <div className="buy-footer">
          <label className="total-field">
            <span>{t('total')}</span>
            <input
              inputMode="decimal"
              dir="ltr"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              placeholder={pricedSum ? toPlain(pricedSum, currency) : t('optional')}
              aria-label={t('total')}
            />
            <span className="unit">{CURRENCIES[currency].symbol}</span>
          </label>
          <button className="btn primary big" disabled={!lines.length || saving} onClick={save}>
            {saving ? t('wait') : t('saveTrip')}
          </button>
        </div>
      }
    >
      {lines.length > 0 && (
        <section className="section" aria-labelledby="cart-h">
          <h2 id="cart-h" className="section-title">
            {t('inThisTrip')}
          </h2>
          <ul className="rows">
            {lines.map((l) => (
              <li key={l.key} className="row line">
                <div className="row-main static">
                  <span className="row-icon" aria-hidden="true">
                    {l.icon}
                  </span>
                  <span className="row-title">{l.name}</span>
                  <button className="icon-btn quiet" onClick={() => remove(l.key)} aria-label={t('removeName', { name: l.name })}>
                    ✕
                  </button>
                </div>
                <div className="line-controls">
                  <Stepper value={l.quantity} min={0.5} step={l.quantity < 1 ? 0.5 : 1} onChange={(v) => update(l.key, { quantity: v })} label={t('quantityOf', { name: l.name })} />
                  <label className="mini-field">
                    <span>{t('priceEach')}</span>
                    <input
                      inputMode="decimal"
                      dir="ltr"
                      value={l.price}
                      onChange={(e) => update(l.key, { price: e.target.value })}
                      placeholder={t('optional')}
                    />
                  </label>
                  {(l.itemId ? (info.get(l.itemId)?.expiry_type ?? l.expiryType) : l.expiryType) === 'printed' && (
                    <label className="mini-field">
                      <span>{t('expiryDate')}</span>
                      <input type="date" value={l.printedExpiry} min={today()} onChange={(e) => update(l.key, { printedExpiry: e.target.value })} />
                    </label>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="section" aria-labelledby="where-h">
        <h2 id="where-h" className="section-title">
          {t('where')}
        </h2>
        <div className="chips">
          <button className={`chip${storeId === null ? ' on' : ''}`} onClick={() => setStoreId(null)} aria-pressed={storeId === null}>
            {t('noShop')}
          </button>
          {stores.map((s) => (
            <button key={s.id} className={`chip${storeId === s.id ? ' on' : ''}`} onClick={() => setStoreId(s.id)} aria-pressed={storeId === s.id}>
              🏪 {s.nickname || nameOf(s, lang)}
            </button>
          ))}
          <button className="chip add" onClick={() => setAddingStore(true)}>
            ➕ {t('addShop')}
          </button>
        </div>
        {moneyOn && (
          <div className="chips currency-row">
            {CURRENCY_CODES.map((c) => (
              <button key={c} className={`chip${c === currency ? ' on' : ''}`} onClick={() => setCurrency(c)} aria-pressed={c === currency}>
                {CURRENCIES[c].symbol} {t(`currency_${c}` as Key)}
              </button>
            ))}
          </div>
        )}
        {moneyOn && currency !== household.main_currency && (
          <label className="field inline">
            <span>{t('rateLabel', { from: CURRENCIES[currency].symbol, to: CURRENCIES[household.main_currency].symbol })}</span>
            <input inputMode="decimal" dir="ltr" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="5.2" />
          </label>
        )}
      </section>

      {needTiles.length > 0 && (
        <section className="section" aria-labelledby="need-h">
          <h2 id="need-h" className="section-title">
            {t('fromYourList')}
          </h2>
          <div className="tile-grid">
            {needTiles.map((n) => (
              <button
                key={n.item_id}
               
                className="tile need-tile"
                onClick={() => addItem({ id: n.item_id!, name_en: n.name_en, name_ar: n.name_ar, icon: n.icon })}
              >
                <span className="tile-icon" aria-hidden="true">
                  {n.icon}
                </span>
                <span className="tile-label">{nameOf(n, lang)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="section" aria-labelledby="add-h">
        <h2 id="add-h" className="section-title">
          {t('addSomething')}
        </h2>
        <ItemPicker onPick={(i) => addItem(i)} onNew={setNewName} selectedIds={lines.map((l) => l.itemId ?? '')} />
      </section>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {moneyOn && lines.length > 0 && !total && pricedSum > 0 && <p className="hint">{t('totalFromPrices', { amount: formatMoney(pricedSum, currency, lang) })}</p>}

      {newName !== null && (
        <NewItemSheet
          name={newName}
          onClose={() => setNewName(null)}
          onOneOff={(name) => {
            addOneOff(name);
            setNewName(null);
          }}
          onCreated={(item) => {
            addItem(item);
            setNewName(null);
          }}
        />
      )}
      {addingStore && (
        <AddStoreSheet
          onClose={() => setAddingStore(false)}
          onAdded={(id) => {
            setStoreId(id);
            setAddingStore(false);
          }}
        />
      )}
    </Screen>
  );
}

/** Something not in the catalog: buy it just this once, or add it as a new item of this home. */
export function NewItemSheet({
  name,
  onClose,
  onOneOff,
  onCreated
}: {
  name: string;
  onClose: () => void;
  onOneOff?: (name: string) => void;
  onCreated: (item: PickerItem) => void;
}) {
  const t = useT();
  const lang = useLang();
  const { ctx } = useHousehold();
  const { data: categories } = useQuery<Category>(CATEGORIES);
  const [value, setValue] = useState(name);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [mode, setMode] = useState<'counted' | 'level'>('counted');

  const tops = categories.filter((c) => !c.parent_id);
  const chosen = categories.find((c) => c.id === categoryId);
  const subs = chosen ? categories.filter((c) => c.parent_id === (chosen.parent_id ?? chosen.id)) : [];
  const topId = chosen ? (chosen.parent_id ?? chosen.id) : null;

  return (
    <Sheet title={t('newItem')} onClose={onClose}>
      <label className="field">
        <span>{t('itemName')}</span>
        <input value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      {onOneOff && (
        <button className="btn ghost wide" onClick={() => onOneOff(value.trim())} disabled={!value.trim()}>
          🧾 {t('justThisOnce')}
        </button>
      )}
      <p className="hint">{t('orAddToHome')}</p>
      <fieldset className="field">
        <legend>{t('whichCategory')}</legend>
        <div className="chips">
          {tops.map((c) => (
            <button key={c.id} className={`chip${topId === c.id ? ' on' : ''}`} onClick={() => setCategoryId(c.id)} aria-pressed={topId === c.id}>
              {c.icon} {nameOf(c, lang)}
            </button>
          ))}
        </div>
        {subs.length > 0 && (
          <div className="chips sub">
            {subs.map((c) => (
              <button key={c.id} className={`chip${categoryId === c.id ? ' on' : ''}`} onClick={() => setCategoryId(c.id)} aria-pressed={categoryId === c.id}>
                {c.icon} {nameOf(c, lang)}
              </button>
            ))}
          </div>
        )}
      </fieldset>
      <fieldset className="field">
        <legend>{t('howToTrack')}</legend>
        <div className="chips">
          <button className={`chip${mode === 'counted' ? ' on' : ''}`} onClick={() => setMode('counted')} aria-pressed={mode === 'counted'}>
            🔢 {t('trackCount')}
          </button>
          <button className={`chip${mode === 'level' ? ' on' : ''}`} onClick={() => setMode('level')} aria-pressed={mode === 'level'}>
            🫙 {t('trackLevel')}
          </button>
        </div>
      </fieldset>
      <button
        className="btn primary wide"
        disabled={!value.trim() || !categoryId}
        onClick={async () => {
          const cat = categories.find((c) => c.id === categoryId)!;
          const id = await addCatalogItem(ctx, { categoryId: cat.id, name: value, language: lang, trackingMode: mode });
          onCreated({
            id,
            name_en: lang === 'en' ? value.trim() : null,
            name_ar: lang === 'ar' ? value.trim() : null,
            icon: cat.icon,
            category_id: cat.id,
            top_category_id: cat.parent_id ?? cat.id,
            tracking_mode: mode
          });
        }}
      >
        {t('addToMyItems')}
      </button>
    </Sheet>
  );
}

function AddStoreSheet({ onClose, onAdded }: { onClose: () => void; onAdded: (id: string) => void }) {
  const t = useT();
  const lang = useLang();
  const { ctx } = useHousehold();
  const [name, setName] = useState('');
  return (
    <Sheet title={t('addShop')} onClose={onClose}>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          onAdded(await addStore(ctx, name, lang));
        }}
      >
        <label className="field">
          <span>{t('shopName')}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
        </label>
        <button className="btn primary wide" disabled={!name.trim()}>
          {t('save')}
        </button>
      </form>
    </Sheet>
  );
}
