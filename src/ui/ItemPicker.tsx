import { useQuery } from '@powersync/react';
import { useMemo, useState } from 'react';
import { CATEGORIES } from '../data/queries';
import { Icon } from './Icon';
import { ItemArt } from './ItemArt';
import { nameOf, useLang, useT } from '../i18n';
import { matches } from './search';

export type PickerItem = {
  id: string;
  name_en: string | null;
  name_ar: string | null;
  icon: string;
  category_id: string;
  top_category_id: string;
  tracking_mode: 'counted' | 'level';
};

export type Category = {
  id: string;
  parent_id: string | null;
  icon: string;
  name_en: string | null;
  name_ar: string | null;
};

export const PICKER_ITEMS = /* sql */ `
  SELECT i.id, i.name_en, i.name_ar, COALESCE(i.icon, c.icon, '📦') AS icon, i.category_id,
         COALESCE(c.parent_id, c.id) AS top_category_id, i.tracking_mode
  FROM items i JOIN categories c ON c.id = i.category_id
  WHERE i.deleted_at IS NULL AND i.status <> 'rejected'
`;

/**
 * Browse by picture first (categories, then items), or type to search in Arabic or English.
 * When nothing matches, offers to add the typed name.
 */
export function ItemPicker({
  onPick,
  onNew,
  selectedIds = [],
  autoFocus = false
}: {
  onPick: (item: PickerItem) => void;
  onNew?: (name: string) => void;
  selectedIds?: string[];
  autoFocus?: boolean;
}) {
  const t = useT();
  const lang = useLang();
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const { data: categories } = useQuery<Category>(CATEGORIES);
  const { data: items } = useQuery<PickerItem>(PICKER_ITEMS);

  const sortByName = (a: PickerItem, b: PickerItem) => nameOf(a, lang).localeCompare(nameOf(b, lang), lang);
  const tops = categories.filter((c) => !c.parent_id);
  const current = categories.find((c) => c.id === categoryId) ?? null;

  const visible = useMemo(() => {
    if (query.trim()) return items.filter((i) => matches(query, i.name_ar, i.name_en)).sort(sortByName).slice(0, 40);
    if (!categoryId) return [];
    return items.filter((i) => i.top_category_id === categoryId || i.category_id === categoryId).sort(sortByName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, query, categoryId, lang]);

  const subcategories = current ? categories.filter((c) => c.parent_id === current.id) : [];

  return (
    <div className="picker">
      <label className="search">
        <Icon name="search" size={22} />
        <input
          type="search"
          value={query}
          autoFocus={autoFocus}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('search')}
          enterKeyHint="search"
        />
      </label>

      {!query.trim() && !current && (
        <div className="tile-grid">
          {tops.map((c) => (
            <button key={c.id} className="tile" onClick={() => setCategoryId(c.id)}>
              <ItemArt nameEn={c.name_en} icon={c.icon} name={nameOf(c, lang)} size={52} />
              <span className="tile-label">{nameOf(c, lang)}</span>
            </button>
          ))}
        </div>
      )}

      {!query.trim() && current && (
        <>
          <button className="crumb" onClick={() => setCategoryId(current.parent_id)}>
            <Icon name="back" size={20} /> {nameOf(current, lang)}
          </button>
          {subcategories.length > 0 && (
            <div className="chips">
              {subcategories.map((s) => (
                <button key={s.id} className="chip" onClick={() => setCategoryId(s.id)}>
                  {nameOf(s, lang)}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {visible.length > 0 && (
        <div className="tile-grid">
          {visible.map((i) => {
            const picked = selectedIds.includes(i.id);
            return (
              <button key={i.id} className={`tile${picked ? ' picked' : ''}`} onClick={() => onPick(i)} aria-pressed={picked}>
                <ItemArt nameEn={i.name_en} icon={i.icon} name={nameOf(i, lang)} size={52} />
                <span className="tile-label">{nameOf(i, lang)}</span>
                {picked && (
                  <span className="tile-check" aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {query.trim() && onNew && (
        <button className="btn ghost wide" onClick={() => onNew(query.trim())}>
          <Icon name="plus" size={20} /> {t('addNew', { name: query.trim() })}
        </button>
      )}
      {query.trim() && visible.length === 0 && !onNew && <p className="hint">{t('noMatch')}</p>}
    </div>
  );
}
