import { useQuery } from '@powersync/react';
import { useEffect, useState } from 'react';
import { useHousehold } from '../app/household';
import { addLabel, addToList, correctStock, setLevel, setLocation, setMinimum, toggleLabel, undoLevel } from '../data/actions';
import { today } from '../data/dates';
import { BATCHES_FOR_ITEM, ITEMS_WITH_STOCK } from '../data/queries';
import { dateFmt, nameOf, numberFmt, useLang, useT } from '../i18n';
import { Icon } from '../ui/Icon';
import { ItemArt } from '../ui/ItemArt';
import { Screen } from '../ui/Screen';
import { Stepper } from '../ui/Stepper';
import { useToast } from '../ui/Toast';
import { PREFILL_KEY } from './Buy';
import type { StockRow } from './Use';

type Detail = StockRow & {
  expiry_type: string;
  shelf_life_days: number | null;
  household_item_id: string | null;
  min_quantity: number;
  location_id: string | null;
  status: string;
};
type Batch = { id: string; purchase_date: string; expiry_date: string | null; expiry_is_estimated: number; remaining: number };
type Label = { id: string; name: string; color: string; on: number };
type Location = { id: string; name: string; type: string };

const LEVELS = ['full', 'half', 'low', 'out'] as const;

/** One item: how much we have, when to remind us, labels, where it is kept, and each purchase's dates. */
export function ItemDetail({ id }: { id: string }) {
  const t = useT();
  const lang = useLang();
  const toast = useToast();
  const { ctx } = useHousehold();
  const { data: items } = useQuery<Detail>(`SELECT * FROM (${ITEMS_WITH_STOCK}) WHERE id = ?2`, [ctx.householdId, id]);
  const { data: batches } = useQuery<Batch>(BATCHES_FOR_ITEM, [ctx.householdId, id]);
  const { data: labels } = useQuery<Label>(
    `SELECT l.id, l.name, l.color,
            EXISTS (SELECT 1 FROM household_item_labels hil
                    JOIN household_items hi ON hi.id = hil.household_item_id
                    WHERE hil.label_id = l.id AND hi.item_id = ?2 AND hi.household_id = ?1 AND hil.deleted_at IS NULL) AS "on"
     FROM labels l WHERE l.household_id = ?1 AND l.deleted_at IS NULL
     ORDER BY l.is_default DESC, l.name`,
    [ctx.householdId, id]
  );
  const { data: locations } = useQuery<Location>(
    `SELECT id, name, type FROM locations WHERE household_id = ? AND deleted_at IS NULL ORDER BY name`,
    [ctx.householdId]
  );

  const item = items[0];
  const [actual, setActual] = useState<number | null>(null);
  const [newLabel, setNewLabel] = useState('');

  useEffect(() => setActual(null), [item?.stock]);

  if (!item) return <Screen title="…">{null}</Screen>;

  const name = nameOf(item, lang);
  const counted = item.tracking_mode === 'counted';

  return (
    <Screen title={name}>
      <div className="item-hero">
        <ItemArt nameEn={item.name_en} icon={item.icon} name={name} size={96} />
      </div>
      {item.status === 'pending' && <p className="hint">{t('pendingItem')}</p>}

      <section className="section card">
        <h2 className="section-title">{t('howMuchWeHave')}</h2>
        {counted ? (
          <>
            <p className="big-number">{numberFmt(actual ?? item.stock, lang)}</p>
            <Stepper value={actual ?? item.stock} onChange={setActual} label={t('iActuallyHave')} />
            {actual !== null && actual !== item.stock && (
              <button
                className="btn primary wide"
                onClick={async () => {
                  await correctStock(ctx, id, actual);
                  toast(t('corrected'));
                }}
              >
                {t('saveCorrection', { n: numberFmt(actual, lang) })}
              </button>
            )}
          </>
        ) : (
          <div className="levels wide" role="radiogroup" aria-label={name}>
            {LEVELS.map((l) => (
              <button
                key={l}
                role="radio"
                aria-checked={item.current_level === l}
                className={`level-btn${item.current_level === l ? ' on' : ''}`}
                onClick={async () => {
                  const res = await setLevel(ctx, id, l);
                  toast(t('levelSet', { name, level: t(`level_${l}`) }), () => undoLevel(ctx, id, res.previous, res.movementIds));
                }}
              >
                <span className="level-text">{t(`level_${l}`)}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {counted && (
        <section className="section card">
          <h2 className="section-title">{t('remindWhenBelow')}</h2>
          <Stepper value={item.min_quantity} onChange={(v) => void setMinimum(ctx, id, v)} label={t('remindWhenBelow')} />
          <p className="hint">{item.min_quantity > 0 ? t('remindHint', { n: numberFmt(item.min_quantity, lang) }) : t('remindOff')}</p>
        </section>
      )}

      <section className="section">
        <h2 className="section-title">{t('labels')}</h2>
        <div className="chips">
          {labels.map((l) => (
            <button key={l.id} className={`chip label-${l.color}${l.on ? ' on' : ''}`} aria-pressed={Boolean(l.on)} onClick={() => void toggleLabel(ctx, id, l.id)}>
              {l.on ? '✓ ' : ''}
              {l.name}
            </button>
          ))}
        </div>
        <form
          className="inline-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newLabel.trim()) return;
            await addLabel(ctx, newLabel);
            setNewLabel('');
          }}
        >
          <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder={t('newLabel')} aria-label={t('newLabel')} maxLength={30} />
          <button className="btn" disabled={!newLabel.trim()}>
            {t('add')}
          </button>
        </form>
      </section>

      <section className="section">
        <h2 className="section-title">{t('keptIn')}</h2>
        <div className="chips">
          {locations.map((l) => (
            <button key={l.id} className={`chip${item.location_id === l.id ? ' on' : ''}`} aria-pressed={item.location_id === l.id} onClick={() => void setLocation(ctx, id, l.id)}>
              {l.name}
            </button>
          ))}
        </div>
      </section>

      {batches.length > 0 && (
        <section className="section">
          <h2 className="section-title">{t('purchases')}</h2>
          <ul className="rows">
            {batches.map((b) => (
              <li key={b.id} className="row">
                <div className="row-main static">
                  <span className="row-text">
                    <span className="row-title">
                      {t('boughtOn', { date: dateFmt(b.purchase_date, lang) })} · {t('left', { n: numberFmt(b.remaining, lang) })}
                    </span>
                    <span className={`row-sub${b.expiry_date && b.expiry_date < today() ? ' danger' : ''}`}>
                      {b.expiry_date
                        ? `${t('expiresOn', { date: dateFmt(b.expiry_date, lang) })}${b.expiry_is_estimated ? ` · ${t('estimated')}` : ''}`
                        : item.expiry_type === 'none'
                          ? t('noExpiry')
                          : t('expiryUnknown')}
                    </span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="stack">
        <button
          className="btn ghost wide"
          onClick={async () => {
            await addToList(ctx, { itemId: id });
            toast(t('addedNameToList', { name }));
          }}
        >
          <Icon name="list" size={20} /> {t('addToList')}
        </button>
        <button
          className="btn ghost wide"
          onClick={() => {
            sessionStorage.setItem(
              PREFILL_KEY,
              JSON.stringify([{ key: crypto.randomUUID(), itemId: id, name, icon: item.icon, nameEn: item.name_en, quantity: 1, price: '', expiryType: item.expiry_type, printedExpiry: '' }])
            );
            window.location.hash = '#/buy';
          }}
        >
          <Icon name="bagPlus" size={20} /> {t('iBoughtThis')}
        </button>
      </div>
    </Screen>
  );
}
