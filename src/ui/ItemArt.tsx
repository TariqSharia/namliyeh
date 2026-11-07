import type { ReactNode } from 'react';

// Drawn pictures for catalog items, in one style: white shapes, a dark green outline and one
// saffron band, on a 48 px grid. Looked up by the item's English catalog name, so they work for
// every household. Items without a drawing yet show their catalog picture; typed-in items
// (no catalog picture) show their first letter.

const O = { fill: '#fff', stroke: 'var(--art-line)', strokeWidth: 2.4, strokeLinejoin: 'round' as const };
const BAND = 'var(--art-band)';

const carton = (
  <>
    <rect x="21" y="3.5" width="6" height="4" rx="1" fill="var(--art-line)" />
    <path d="M15 16 19 8h10l4 8z" {...O} />
    <rect x="15" y="16" width="18" height="27" rx="2" {...O} />
    <rect x="15" y="24" width="18" height="11" fill={BAND} />
    <path d="M24 26.5c-1.8 2.2-2.8 3.7-2.8 5a2.8 2.8 0 0 0 5.6 0c0-1.3-1-2.8-2.8-5z" fill="#fff" />
    <rect x="15" y="16" width="18" height="27" rx="2" {...O} fill="none" />
  </>
);

const sack = (
  <>
    <path d="M14 14c0-3 2-5 4-6l2 3 4-3 4 3 2-3c2 1 4 3 4 6v24a5 5 0 0 1-5 5H19a5 5 0 0 1-5-5z" {...O} />
    <rect x="14" y="22" width="20" height="11" fill={BAND} />
    <path d="M14 14c0-3 2-5 4-6l2 3 4-3 4 3 2-3c2 1 4 3 4 6v24a5 5 0 0 1-5 5H19a5 5 0 0 1-5-5z" {...O} fill="none" />
  </>
);

const bottle = (
  <>
    <rect x="16" y="18" width="16" height="25" rx="3" {...O} />
    <rect x="21" y="10" width="6" height="8" {...O} />
    <rect x="20" y="5" width="8" height="5" rx="1" fill="var(--art-line)" />
    <rect x="16" y="26" width="16" height="10" fill={BAND} />
    <circle cx="24" cy="31" r="2.5" fill="#fff" />
    <rect x="16" y="18" width="16" height="25" rx="3" {...O} fill="none" />
  </>
);

const egg = (
  <>
    <path d="M24 6c-7 0-12 12-12 21a12 12 0 0 0 24 0C36 18 31 6 24 6z" {...O} />
    <path d="M18 22c1-4 3-7 5-8" fill="none" stroke={BAND} strokeWidth="2.4" strokeLinecap="round" />
  </>
);

const DRAWINGS: Record<string, ReactNode> = {
  Milk: carton,
  Eggs: egg,
  'Long-grain rice': sack,
  'Short-grain rice': sack,
  'Dish soap': bottle
};

export function hasDrawing(nameEn: string | null | undefined) {
  return Boolean(nameEn && DRAWINGS[nameEn]);
}

/** The square picture shown beside an item everywhere in the app. */
export function ItemArt({ nameEn, icon, name, size = 48 }: { nameEn?: string | null; icon?: string | null; name: string; size?: number }) {
  const drawing = nameEn ? DRAWINGS[nameEn] : undefined;
  const isTyped = !icon || icon === '📝';
  return (
    <span className="item-art" style={{ inlineSize: size, blockSize: size }} aria-hidden="true">
      {drawing ? (
        <svg viewBox="0 0 48 48" width={size * 0.72} height={size * 0.72} focusable="false">
          {drawing}
        </svg>
      ) : isTyped ? (
        <span className="item-art-letter" style={{ fontSize: size * 0.42 }}>
          {name.trim().charAt(0)}
        </span>
      ) : (
        <span style={{ fontSize: size * 0.52 }}>{icon}</span>
      )}
    </span>
  );
}
