import { useQuery } from '@powersync/react';
import { useMemo, useState } from 'react';
import { useHousehold } from '../app/household';
import { go } from '../app/router';
import { CATEGORIES, ITEMS_WITH_STOCK } from '../data/queries';
import { nameOf, numberFmt, useLang, useT } from '../i18n';
import type { Category } from '../ui/ItemPicker';
import { Screen } from '../ui/Screen';
import { matches } from '../ui/search';
import { NewItemSheet } from './Buy';
import { LEVEL_ICON, type StockRow } from './Use';

/** Everything in the catalog by category, with what this home has. Tap an item for its settings. */
export function Stock({ categoryId }: { categoryId?: string }) {
  const t = useT();
  const lang = useLang();
  const { ctx } = useHousehold();
  const { data: categories } = useQuery<Category>(CATEGORIES);
  const { data: rows } = useQuery<StockRow & { category_id: string; household_item_id: string | null }>(ITEMS_WITH_STOCK, [ctx.householdId]);
  const [query, setQuery] = useState('');
  const [onlyMine, setOnlyMine] = useState(true);
  const [newName, setNewName] = useState<string | null>(null);

  const current = categories.find((c) => c.id === categoryId);
  const tops = categories.filter((c) => !c.parent_id);

  const visible = useMemo(() => {
    let list = rows;
    if (onlyMine) list = list.filter((r) => r.household_item_id || r.stock > 0);
    if (query.trim()) list = list.filter((r) => matches(query, r.name_ar, r.name_en));
    else if (current) list = list.filter((r) => r.top_category_id === current.id || r.category_id === current.id);
    return [...list].sort((a, b) => nameOf(a, lang).localeCompare(nameOf(b, lang), lang));
  }, [rows, onlyMine, query, current, lang]);

  const countFor = (catId: string) => rows.filter((r) => r.top_category_id === catId && r.stock > 0).length;

  const status = (r: StockRow) =>
    r.tracking_mode === 'level' && r.current_level
      ? `${LEVEL_ICON[r.current_level]} ${t(`level_${r.current_level}`)}`
      : r.stock > 0
        ? t('left', { n: numberFmt(r.stock, lang) })
        : t('none');

  return (
    <Screen title={current ? `${current.icon} ${nameOf(current, lang)}` : t('atHome')} showBack={Boolean(current)}>
      <label className="search">
        <span aria-hidden="true">🔎</span>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('searchPlaceholder')} aria-label={t('search')} />
      </label>

      <div className="segmented" role="radiogroup" aria-label={t('show')}>
        <button role="radio" aria-checked={onlyMine} className={onlyMine ? 'on' : ''} onClick={() => setOnlyMine(true)}>
          {t('myItems')}
        </button>
        <button role="radio" aria-checked={!onlyMine} className={!onlyMine ? 'on' : ''} onClick={() => setOnlyMine(false)}>
          {t('allItems')}
        </button>
      </div>

      {!query.trim() && !current && (
        <div className="tile-grid">
          {tops.map((c) => {
            const n = countFor(c.id);
            return (
              <a key={c.id} className="tile" href={`#/stock/${c.id}`}>
                <span className="tile-icon" aria-hidden="true">
                  {c.icon}
                </span>
                <span className="tile-label">{nameOf(c, lang)}</span>
                {n > 0 && <span className="tile-count">{numberFmt(n, lang)}</span>}
              </a>
            );
          })}
        </div>
      )}

      {(query.trim() || current) && (
        <ul className="rows">
          {visible.map((r) => (
            <li key={r.id} className="row">
              <button className="row-main" onClick={() => go({ name: 'item', id: r.id })}>
                <span className="row-icon" aria-hidden="true">
                  {r.icon}
                </span>
                <span className="row-text">
                  <span className="row-title">{nameOf(r, lang)}</span>
                  <span className={`row-sub${r.stock > 0 || r.current_level ? '' : ' quiet'}`}>{status(r)}</span>
                </span>
                <span className="chev flip" aria-hidden="true">
                  ›
                </span>
              </button>
            </li>
          ))}
          {visible.length === 0 && <li className="hint">{onlyMine ? t('noneHereTryAll') : t('noMatch')}</li>}
        </ul>
      )}

      {(query.trim() || current) && (
        <button className="btn ghost wide" onClick={() => setNewName(query.trim())}>
          ➕ {t('newItem')}
        </button>
      )}

      {newName !== null && (
        <NewItemSheet
          name={newName}
          onClose={() => setNewName(null)}
          onCreated={(item) => {
            setNewName(null);
            go({ name: 'item', id: item.id });
          }}
        />
      )}
    </Screen>
  );
}
