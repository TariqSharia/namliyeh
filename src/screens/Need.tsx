import { useQuery } from '@powersync/react';
import { useState } from 'react';
import { useHousehold } from '../app/household';
import { go } from '../app/router';
import { addToList, removeFromList } from '../data/actions';
import { NEED_TO_BUY } from '../data/queries';
import { nameOf, numberFmt, useLang, useT } from '../i18n';
import { ItemPicker } from '../ui/ItemPicker';
import { Empty, Screen } from '../ui/Screen';
import { Sheet } from '../ui/Sheet';
import { useToast } from '../ui/Toast';
import { PREFILL_KEY } from './Buy';
import { LEVEL_ICON } from './Use';

type NeedRow = {
  source: 'auto' | 'manual';
  entry_id: string | null;
  item_id: string | null;
  name_en: string | null;
  name_ar: string | null;
  icon: string;
  stock: number | null;
  min_quantity: number | null;
  current_level: keyof typeof LEVEL_ICON | null;
  tracking_mode: 'counted' | 'level' | null;
  free_text: string | null;
};

/** The list to take to the shop. Ran-out items appear by themselves; anything else can be added. */
export function Need() {
  const t = useT();
  const lang = useLang();
  const toast = useToast();
  const { ctx } = useHousehold();
  const { data: rows } = useQuery<NeedRow>(NEED_TO_BUY, [ctx.householdId]);
  const [adding, setAdding] = useState(false);
  const [freeText, setFreeText] = useState('');

  const label = (r: NeedRow) => (r.item_id ? nameOf(r, lang) : r.free_text ?? '');

  function startTrip() {
    const lines = rows
      .filter((r) => r.item_id)
      .map((r) => ({
        key: crypto.randomUUID(),
        itemId: r.item_id,
        name: nameOf(r, lang),
        icon: r.icon,
        quantity: Math.max(1, (r.min_quantity ?? 1) - (r.stock ?? 0)),
        price: '',
        expiryType: 'none',
        printedExpiry: ''
      }));
    sessionStorage.setItem(PREFILL_KEY, JSON.stringify(lines));
    go({ name: 'buy' });
  }

  return (
    <Screen
      title={t('needToBuy')}
      footer={
        rows.some((r) => r.item_id) ? (
          <button className="btn primary big wide" onClick={startTrip}>
            🛒 {t('iBoughtThese')}
          </button>
        ) : undefined
      }
    >
      <button className="btn ghost wide" onClick={() => setAdding(true)}>
        ➕ {t('addToList')}
      </button>

      {rows.length === 0 ? (
        <Empty icon="✅" title={t('needNone')} />
      ) : (
        <ul className="rows checklist">
          {rows.map((r) => (
            <li key={r.entry_id ?? r.item_id} className="row">
              <button className="row-main" onClick={() => r.item_id && go({ name: 'item', id: r.item_id })}>
                <span className="row-icon" aria-hidden="true">
                  {r.icon}
                </span>
                <span className="row-text">
                  <span className="row-title">{label(r)}</span>
                  <span className="row-sub">
                    {r.source === 'manual'
                      ? t('addedByHand')
                      : r.tracking_mode === 'level' && r.current_level
                        ? `${LEVEL_ICON[r.current_level]} ${t(`level_${r.current_level}`)}`
                        : t('haveOfMin', { n: numberFmt(r.stock ?? 0, lang), min: numberFmt(r.min_quantity ?? 0, lang) })}
                  </span>
                </span>
              </button>
              {r.entry_id && (
                <button
                  className="icon-btn quiet"
                  aria-label={t('removeName', { name: label(r) })}
                  onClick={async () => {
                    await removeFromList(ctx, r.entry_id!);
                    toast(t('removedFromList'));
                  }}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <Sheet title={t('addToList')} onClose={() => setAdding(false)}>
          <form
            className="inline-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!freeText.trim()) return;
              await addToList(ctx, { freeText });
              setFreeText('');
              toast(t('addedToList'));
            }}
          >
            <input value={freeText} onChange={(e) => setFreeText(e.target.value)} placeholder={t('writeAnything')} aria-label={t('writeAnything')} />
            <button className="btn primary" disabled={!freeText.trim()}>
              {t('add')}
            </button>
          </form>
          <ItemPicker
            onPick={async (i) => {
              await addToList(ctx, { itemId: i.id });
              toast(t('addedNameToList', { name: nameOf(i, lang) }));
            }}
          />
        </Sheet>
      )}
    </Screen>
  );
}
