import { useQuery } from '@powersync/react';
import { useMemo, useState } from 'react';
import { useHousehold } from '../app/household';
import { go } from '../app/router';
import { setLevel, takeFromStock, undoLevel, undoMovements } from '../data/actions';
import { CATEGORIES, IN_STOCK } from '../data/queries';
import { nameOf, numberFmt, useLang, useT } from '../i18n';
import type { Category } from '../ui/ItemPicker';
import { Icon } from '../ui/Icon';
import { ItemArt } from '../ui/ItemArt';
import { Scanner } from '../ui/Scanner';
import { UnknownBarcode } from '../ui/UnknownBarcode';
import { lookupBarcode } from '../data/barcodes';
import { Empty, Screen } from '../ui/Screen';
import { matches } from '../ui/search';
import { useToast } from '../ui/Toast';

export type StockRow = {
  id: string;
  name_en: string | null;
  name_ar: string | null;
  icon: string;
  tracking_mode: 'counted' | 'level';
  top_category_id: string;
  stock: number;
  current_level: 'full' | 'half' | 'low' | 'out' | null;
  next_expiry: string | null;
};

const LEVELS = ['full', 'half', 'low', 'out'] as const;
export type Level = (typeof LEVELS)[number];

/** What we have at home, grouped like the pantry. One tap per thing used; Undo for mistakes. */
export function Use() {
  const t = useT();
  const lang = useLang();
  const toast = useToast();
  const { ctx } = useHousehold();
  const { data: rows } = useQuery<StockRow>(IN_STOCK, [ctx.householdId]);
  const { data: categories } = useQuery<Category>(CATEGORIES);
  const [mode, setMode] = useState<'use' | 'waste'>('use');
  const [query, setQuery] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [unknownCode, setUnknownCode] = useState<string | null>(null);
  const [justTaught, setJustTaught] = useState<string | null>(null);

  // A scanned barcode takes one of that item out, like tapping it. Not at home: say so.
  async function scannedItem(itemId: string, name: string) {
    const r = rows.find((x) => x.id === itemId);
    if (!r || (r.tracking_mode === 'counted' && r.stock <= 0)) return setScanStatus(t('notAtHomeName', { name }));
    if (r.tracking_mode === 'level') return setScanStatus(t('levelItemHint', { name }));
    await takeOne(r);
    setScanStatus(mode === 'use' ? t('markedUsed', { name }) : t('markedWasted', { name }));
  }

  async function scanned(code: string) {
    const itemId = await lookupBarcode(code);
    if (!itemId) {
      setScanning(false);
      return setUnknownCode(code);
    }
    const r = rows.find((x) => x.id === itemId);
    await scannedItem(itemId, r ? nameOf(r, lang) : t('someone'));
  }

  const groups = useMemo(() => {
    const filtered = rows.filter((r) => matches(query, r.name_ar, r.name_en));
    return categories
      .filter((c) => !c.parent_id)
      .map((c) => ({ category: c, rows: filtered.filter((r) => r.top_category_id === c.id) }))
      .filter((g) => g.rows.length);
  }, [rows, categories, query]);

  async function takeOne(r: StockRow) {
    const ids = await takeFromStock(ctx, r.id, Math.min(1, r.stock), mode);
    const msg = mode === 'use' ? t('markedUsed', { name: nameOf(r, lang) }) : t('markedWasted', { name: nameOf(r, lang) });
    toast(msg, () => undoMovements(ctx, ids));
  }

  async function level(r: StockRow, l: (typeof LEVELS)[number]) {
    const res = await setLevel(ctx, r.id, l);
    toast(t('levelSet', { name: nameOf(r, lang), level: t(`level_${l}`) }), () => undoLevel(ctx, r.id, res.previous, res.movementIds));
  }

  const scanLayer = (
    <>
      {scanning && (
        <Scanner
          title={mode === 'use' ? t('used') : t('thrownAway')}
          status={scanStatus}
          skip={justTaught}
          onCode={(c) => void scanned(c)}
          onClose={() => {
            setScanning(false);
            setScanStatus(null);
          }}
        />
      )}
      {unknownCode && (
        <UnknownBarcode
          code={unknownCode}
          onClose={() => setUnknownCode(null)}
          onPicked={(item) => {
            setJustTaught(unknownCode);
            setUnknownCode(null);
            void scannedItem(item.id, nameOf(item, lang));
            setScanning(true);
          }}
        />
      )}
    </>
  );

  return (
    <Screen title={t('iUsed')}>
      {scanLayer}
      <div className="segmented" role="radiogroup" aria-label={t('whatHappened')}>
        <button role="radio" aria-checked={mode === 'use'} className={mode === 'use' ? 'on' : ''} onClick={() => setMode('use')}>
          <Icon name="bagMinus" size={20} /> {t('used')}
        </button>
        <button role="radio" aria-checked={mode === 'waste'} className={mode === 'waste' ? 'on waste' : ''} onClick={() => setMode('waste')}>
          <Icon name="trash" size={20} /> {t('thrownAway')}
        </button>
      </div>

      {rows.length > 0 && (
        <button className="btn scan-btn wide" onClick={() => setScanning(true)}>
          <Icon name="scan" /> {t('scanBarcode')}
        </button>
      )}

      {rows.length > 8 && (
        <label className="search">
          <Icon name="search" size={22} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('searchPlaceholder')} aria-label={t('search')} />
        </label>
      )}

      {rows.length === 0 && (
        <Empty icon={<Icon name="box" size={40} />} title={t('nothingAtHome')}>
          <a className="btn primary" href="#/buy">
            {t('iBought')}
          </a>
        </Empty>
      )}

      {groups.map((g) => (
        <section key={g.category.id} className="section">
          <h2 className="section-title">
            {nameOf(g.category, lang)}
          </h2>
          <ul className="rows">
            {g.rows.map((r) => (
              <li key={r.id} className="row">
                <button className="row-main" onClick={() => go({ name: 'item', id: r.id })}>
                  <ItemArt nameEn={r.name_en} icon={r.icon} name={nameOf(r, lang)} size={44} />
                  <span className="row-text">
                    <span className="row-title">{nameOf(r, lang)}</span>
                    <span className="row-sub">
                      {r.tracking_mode === 'level' && r.current_level ? t(`level_${r.current_level}`) : t('left', { n: numberFmt(r.stock, lang) })}
                    </span>
                  </span>
                </button>
                {r.tracking_mode === 'counted' ? (
                  <button
                    className={`btn take${mode === 'waste' ? ' waste' : ''}`}
                    onClick={() => void takeOne(r)}
                    aria-label={`${mode === 'use' ? t('used') : t('thrownAway')}: ${nameOf(r, lang)}`}
                  >
                    −1
                  </button>
                ) : (
                  <div className="levels" role="radiogroup" aria-label={nameOf(r, lang)}>
                    {LEVELS.map((l) => (
                      <button
                        key={l}
                        role="radio"
                        aria-checked={r.current_level === l}
                        className={`level-btn${r.current_level === l ? ' on' : ''}`}
                        onClick={() => void level(r, l)}
                        title={t(`level_${l}`)}
                      >
                        <span className="level-text">{t(`level_${l}`)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Screen>
  );
}
