import { useQuery } from '@powersync/react';
import { useMemo, useState } from 'react';
import { useHousehold } from '../app/household';
import { go } from '../app/router';
import { daysBetween, today } from '../data/dates';
import { ITEMS_WITH_STOCK, LOCATIONS } from '../data/queries';
import { nameOf, numberFmt, useLang, useT } from '../i18n';
import { Icon } from '../ui/Icon';
import { ItemArt } from '../ui/ItemArt';
import { Screen } from '../ui/Screen';
import { matches } from '../ui/search';
import { NewItemSheet } from './Buy';
import type { StockRow } from './Use';

type Row = StockRow & {
  category_id: string;
  household_item_id: string | null;
  location_id: string | null;
  default_location_type: string;
  min_quantity: number;
};
type Place = { id: string; name: string; type: string };

const OTHER = 'other-place';

/**
 * What the home has, grouped by where it is kept (fridge, pantry, bathroom), with the number
 * beside each item. The number, not a fill bar: "full" changes from month to month.
 * Search looks through the whole catalog, so new things can be found and added here too.
 */
export function Stock({ categoryId }: { categoryId?: string }) {
  const t = useT();
  const lang = useLang();
  const { ctx } = useHousehold();
  const { data: rows } = useQuery<Row>(ITEMS_WITH_STOCK, [ctx.householdId]);
  const { data: places } = useQuery<Place>(LOCATIONS, [ctx.householdId]);
  const [query, setQuery] = useState('');
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [newName, setNewName] = useState<string | null>(null);
  const day = today();

  // Where each item lives: the household's choice, else the first place of its category's usual type.
  const placeOf = useMemo(() => {
    const byType = new Map<string, string>();
    for (const p of places) if (!byType.has(p.type)) byType.set(p.type, p.id);
    const known = new Set(places.map((p) => p.id));
    return (r: Row) => (r.location_id && known.has(r.location_id) ? r.location_id : (byType.get(r.default_location_type) ?? OTHER));
  }, [places]);

  const searching = query.trim().length > 0;
  const mine = useMemo(() => rows.filter((r) => r.household_item_id || r.stock > 0 || r.current_level), [rows]);

  const groups = useMemo(() => {
    const list = (categoryId ? mine.filter((r) => r.top_category_id === categoryId || r.category_id === categoryId) : mine).sort((a, b) =>
      nameOf(a, lang).localeCompare(nameOf(b, lang), lang)
    );
    const all = [...places, { id: OTHER, name: t('otherPlace'), type: 'other' }];
    return all
      .map((p) => ({ place: p, items: list.filter((r) => placeOf(r) === p.id) }))
      .filter((g) => g.items.length > 0);
  }, [mine, places, placeOf, categoryId, lang, t]);

  const found = useMemo(
    () =>
      searching
        ? rows.filter((r) => matches(query, r.name_ar, r.name_en)).sort((a, b) => Number(b.stock > 0) - Number(a.stock > 0) || nameOf(a, lang).localeCompare(nameOf(b, lang), lang))
        : [],
    [rows, query, searching, lang]
  );

  const shown = placeId ? groups.filter((g) => g.place.id === placeId) : groups;

  return (
    <Screen title={t('atHome')} showBack={Boolean(categoryId)}>
      <label className="search">
        <Icon name="search" size={22} />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('searchPlaceholder')} aria-label={t('search')} />
      </label>

      {!searching && groups.length > 1 && (
        <div className="chips scroll" role="radiogroup" aria-label={t('keptIn')}>
          <button role="radio" aria-checked={!placeId} className={`chip${!placeId ? ' on' : ''}`} onClick={() => setPlaceId(null)}>
            {t('allPlaces')}
          </button>
          {groups.map((g) => (
            <button key={g.place.id} role="radio" aria-checked={placeId === g.place.id} className={`chip${placeId === g.place.id ? ' on' : ''}`} onClick={() => setPlaceId(g.place.id)}>
              {g.place.name}
            </button>
          ))}
        </div>
      )}

      {searching ? (
        <>
          <ul className="rows">
            {found.map((r) => (
              <ItemRow key={r.id} r={r} day={day} />
            ))}
            {found.length === 0 && <li className="hint">{t('noMatch')}</li>}
          </ul>
          <button className="btn ghost wide" onClick={() => setNewName(query.trim())}>
            <Icon name="plus" size={20} /> {t('newItem')}
          </button>
        </>
      ) : groups.length === 0 ? (
        <p className="hint">{t('nothingAtHome')}</p>
      ) : (
        shown.map((g) => (
          <section key={g.place.id} className="place-group" aria-labelledby={`place-${g.place.id}`}>
            <h2 id={`place-${g.place.id}`} className="section-title">
              {g.place.name}
            </h2>
            <ul className="rows">
              {g.items.map((r) => (
                <ItemRow key={r.id} r={r} day={day} />
              ))}
            </ul>
          </section>
        ))
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

/** One item: picture, name, the one thing worth knowing (expiry or "on the list"), and how many. */
function ItemRow({ r, day }: { r: Row; day: string }) {
  const t = useT();
  const lang = useLang();
  const name = nameOf(r, lang);
  const days = r.next_expiry && r.stock > 0 ? daysBetween(day, r.next_expiry) : null;
  const low = r.tracking_mode === 'counted' ? r.household_item_id !== null && r.min_quantity > 0 && r.stock < r.min_quantity : r.current_level === 'low' || r.current_level === 'out';

  const sub =
    days !== null && days <= 7
      ? { text: days < 0 ? t('expiredAgo', { n: numberFmt(-days, lang) }) : days === 0 ? t('expiresToday') : days === 1 ? t('expiresTomorrow') : t('expiresInDays', { n: numberFmt(days, lang) }), cls: days <= 1 ? ' danger' : '' }
      : low
        ? { text: t('belowMinimum'), cls: '' }
        : null;

  const count =
    r.tracking_mode === 'level' && r.current_level ? (
      <span className={`row-count word${low ? ' low' : ''}`}>{t(`level_${r.current_level}`)}</span>
    ) : r.stock > 0 ? (
      <span className="row-count">{numberFmt(r.stock, lang)}</span>
    ) : (
      <span className="row-count none">{numberFmt(0, lang)}</span>
    );

  return (
    <li className="row">
      <button className="row-main" onClick={() => go({ name: 'item', id: r.id })}>
        <ItemArt nameEn={r.name_en} icon={r.icon} name={name} size={48} />
        <span className="row-text">
          <span className="row-title">{name}</span>
          {sub && <span className={`row-sub${sub.cls}`}>{sub.text}</span>}
        </span>
        {count}
      </button>
    </li>
  );
}
