// Every calculation the app shows lives here as plain SQL on the phone's SQLite copy,
// so it works offline and could move unchanged to another app (for example Flutter).
// Rules: stock is always summed from movements; deleted rows (deleted_at) are ignored;
// "?" parameters are passed in the order they appear.

/** Catalog items with their effective expiry rules (household override > item > category > parent). */
const ITEM_RULES = /* sql */ `
  SELECT
    i.id, i.name_en, i.name_ar, i.icon AS item_icon, i.tracking_mode, i.unit_kind, i.category_id,
    i.status,
    c.icon AS category_icon,
    COALESCE(c.parent_id, c.id) AS top_category_id,
    COALESCE(i.icon, c.icon, pc.icon, '📦') AS icon,
    COALESCE(i.expiry_type, c.expiry_type, pc.expiry_type, 'none') AS expiry_type,
    COALESCE(hi.shelf_life_days, i.shelf_life_days, c.shelf_life_days, pc.shelf_life_days) AS shelf_life_days,
    hi.id AS household_item_id,
    COALESCE(hi.min_quantity, 0) AS min_quantity,
    hi.current_level,
    hi.location_id
  FROM items i
  JOIN categories c ON c.id = i.category_id
  LEFT JOIN categories pc ON pc.id = c.parent_id
  LEFT JOIN household_items hi ON hi.item_id = i.id AND hi.household_id = ?1 AND hi.deleted_at IS NULL
  WHERE i.deleted_at IS NULL AND i.status <> 'rejected'
`;

/** What is left in each open batch: the sum of its movements. */
const BATCH_REMAINING = /* sql */ `
  SELECT b.id, b.item_id, b.product_id, b.purchase_date, b.expiry_date, b.expiry_is_estimated,
         b.location_id, b.quantity_initial,
         COALESCE((SELECT SUM(m.quantity) FROM stock_movements m WHERE m.batch_id = b.id), 0) AS remaining
  FROM batches b
  WHERE b.household_id = ?1 AND b.deleted_at IS NULL
`;

/** Every item with this household's stock and settings. ?1 = household id. */
export const ITEMS_WITH_STOCK = /* sql */ `
  WITH rules AS (${ITEM_RULES}),
       open_batches AS (SELECT * FROM (${BATCH_REMAINING}) WHERE remaining > 0)
  SELECT r.*,
         COALESCE((SELECT SUM(ob.remaining) FROM open_batches ob WHERE ob.item_id = r.id), 0) AS stock,
         (SELECT MIN(ob.expiry_date) FROM open_batches ob WHERE ob.item_id = r.id) AS next_expiry
  FROM rules r
`;

/** Items the household has at home right now (counted with stock, or level items not out). */
export const IN_STOCK = /* sql */ `
  SELECT * FROM (${ITEMS_WITH_STOCK})
  WHERE (tracking_mode = 'counted' AND stock > 0)
     OR (tracking_mode = 'level' AND (current_level IN ('full', 'half', 'low') OR (current_level IS NULL AND stock > 0)))
  ORDER BY top_category_id, category_id, name_en
`;

/**
 * The "need to buy" list: items below the household's minimum, level items that are low or out,
 * and anything added by hand. ?1 = household id.
 */
export const NEED_TO_BUY = /* sql */ `
  WITH s AS (${ITEMS_WITH_STOCK})
  SELECT 'auto' AS source, NULL AS entry_id, s.id AS item_id, s.name_en, s.name_ar, s.icon,
         s.top_category_id, s.stock, s.min_quantity, s.current_level, s.tracking_mode, NULL AS free_text
  FROM s
  WHERE s.household_item_id IS NOT NULL AND (
        (s.tracking_mode = 'counted' AND s.min_quantity > 0 AND s.stock < s.min_quantity)
     OR (s.tracking_mode = 'level' AND (s.current_level IN ('low', 'out')
                                       OR (s.current_level IS NULL AND s.min_quantity > 0 AND s.stock < s.min_quantity))))
    AND s.id NOT IN (SELECT e.item_id FROM shopping_list_entries e
                     WHERE e.household_id = ?1 AND e.item_id IS NOT NULL AND e.deleted_at IS NULL AND e.done = 0)
  UNION ALL
  SELECT 'manual', e.id, e.item_id, s.name_en, s.name_ar, COALESCE(s.icon, '📝'),
         s.top_category_id, s.stock, s.min_quantity, s.current_level, s.tracking_mode, e.free_text
  FROM shopping_list_entries e
  LEFT JOIN s ON s.id = e.item_id
  WHERE e.household_id = ?1 AND e.deleted_at IS NULL AND e.done = 0
  ORDER BY top_category_id, name_en
`;

/** Open batches that expire within ?2 days from today (?3, "YYYY-MM-DD"). ?1 = household id. */
export const EXPIRING_SOON = /* sql */ `
  SELECT ob.id AS batch_id, ob.item_id, ob.expiry_date, ob.expiry_is_estimated, ob.remaining,
         i.name_en, i.name_ar, COALESCE(i.icon, c.icon, '📦') AS icon,
         CAST(julianday(ob.expiry_date) - julianday(?3) AS INTEGER) AS days_left
  FROM (${BATCH_REMAINING}) ob
  JOIN items i ON i.id = ob.item_id
  JOIN categories c ON c.id = i.category_id
  WHERE ob.remaining > 0 AND ob.expiry_date IS NOT NULL
    AND julianday(ob.expiry_date) - julianday(?3) <= ?2
  ORDER BY ob.expiry_date
`;

/** Open batches of one item, the one to use first on top (earliest expiry, then oldest). ?1 household, ?2 item. */
export const BATCHES_FOR_ITEM = /* sql */ `
  SELECT * FROM (${BATCH_REMAINING})
  WHERE item_id = ?2 AND remaining > 0
  ORDER BY expiry_date IS NULL, expiry_date, purchase_date, id
`;

/** Top-level categories, then subcategories. */
export const CATEGORIES = /* sql */ `
  SELECT id, parent_id, icon, name_en, name_ar, sort_order, expiry_type, default_location_type
  FROM categories
  WHERE deleted_at IS NULL AND status <> 'rejected'
  ORDER BY sort_order, name_en
`;

/** Last price paid for each item at any store by this household (prefills the buy screen). ?1 household. */
export const LAST_PRICES = /* sql */ `
  SELECT pl.item_id, pl.unit_price, p.currency, p.store_id
  FROM purchase_lines pl
  JOIN purchases p ON p.id = pl.purchase_id
  WHERE pl.household_id = ?1 AND pl.unit_price IS NOT NULL AND p.deleted_at IS NULL
    AND pl.id = (SELECT pl2.id FROM purchase_lines pl2 JOIN purchases p2 ON p2.id = pl2.purchase_id
                    WHERE pl2.household_id = ?1 AND pl2.item_id = pl.item_id AND pl2.unit_price IS NOT NULL
                    ORDER BY p2.purchased_at DESC, pl2.created_at DESC LIMIT 1)
`;

/** The household's shops, favourites first. ?1 household. */
export const MY_STORES = /* sql */ `
  SELECT s.id, s.name_en, s.name_ar, s.type, hs.id AS link_id, hs.nickname, hs.is_favorite
  FROM household_stores hs
  JOIN stores s ON s.id = hs.store_id
  WHERE hs.household_id = ?1 AND hs.deleted_at IS NULL AND s.deleted_at IS NULL
  ORDER BY hs.is_favorite DESC, COALESCE(hs.nickname, s.name_ar, s.name_en)
`;

/** Money in and out between ?2 (inclusive) and ?3 (exclusive), in the main currency. ?1 household. */
export const MONTH_TOTALS = /* sql */ `
  SELECT
    COALESCE(SUM(CASE WHEN type = 'income' THEN amount_main END), 0) AS income,
    COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_main END), 0) AS expense
  FROM transactions
  WHERE household_id = ?1 AND deleted_at IS NULL AND date >= ?2 AND date < ?3
`;

/** Spending by money category for the same period. */
export const MONTH_BY_CATEGORY = /* sql */ `
  SELECT mc.id, mc.name, mc.icon, t.type, SUM(t.amount_main) AS total, COUNT(*) AS entries
  FROM transactions t
  LEFT JOIN money_categories mc ON mc.id = t.money_category_id
  WHERE t.household_id = ?1 AND t.deleted_at IS NULL AND t.date >= ?2 AND t.date < ?3
  GROUP BY mc.id, t.type
  ORDER BY t.type DESC, total DESC
`;

/** Spending by person for the same period. */
export const MONTH_BY_PERSON = /* sql */ `
  SELECT t.user_id, hm.display_name, SUM(t.amount_main) AS total
  FROM transactions t
  LEFT JOIN household_members hm ON hm.user_id = t.user_id AND hm.household_id = t.household_id
  WHERE t.household_id = ?1 AND t.deleted_at IS NULL AND t.type = 'expense' AND t.date >= ?2 AND t.date < ?3
  GROUP BY t.user_id
  ORDER BY total DESC
`;

/** Value of what was thrown away in the period, priced at what was paid for that batch. */
export const MONTH_WASTE = /* sql */ `
  SELECT COALESCE(SUM(-m.quantity * pl.unit_price), 0) AS wasted_value, COUNT(*) AS entries
  FROM stock_movements m
  JOIN batches b ON b.id = m.batch_id
  LEFT JOIN purchase_lines pl ON pl.id = b.purchase_line_id
  WHERE m.household_id = ?1 AND m.type = 'waste' AND substr(m.created_at, 1, 10) >= ?2 AND substr(m.created_at, 1, 10) < ?3
    AND m.id NOT IN (SELECT reverses_id FROM stock_movements WHERE reverses_id IS NOT NULL)
`;

/** Recent transactions, newest first. ?1 household, ?2 limit. */
export const RECENT_TRANSACTIONS = /* sql */ `
  SELECT t.*, mc.name AS category_name, mc.icon AS category_icon, hm.display_name AS person
  FROM transactions t
  LEFT JOIN money_categories mc ON mc.id = t.money_category_id
  LEFT JOIN household_members hm ON hm.user_id = t.user_id AND hm.household_id = t.household_id
  WHERE t.household_id = ?1 AND t.deleted_at IS NULL
  ORDER BY t.date DESC, t.created_at DESC
  LIMIT ?2
`;

/** All entries of one month, newest first. ?1 household, ?2 month start, ?3 next month start. */
export const MONTH_TRANSACTIONS = /* sql */ `
  SELECT t.*, mc.name AS category_name, mc.icon AS category_icon, hm.display_name AS person
  FROM transactions t
  LEFT JOIN money_categories mc ON mc.id = t.money_category_id
  LEFT JOIN household_members hm ON hm.user_id = t.user_id AND hm.household_id = t.household_id
  WHERE t.household_id = ?1 AND t.deleted_at IS NULL AND t.date >= ?2 AND t.date < ?3
  ORDER BY t.date DESC, t.created_at DESC
`;
