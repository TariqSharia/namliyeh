// Every change the app makes goes through these functions. Each one runs in a single local
// transaction, works offline, and is uploaded in order when the phone is online.
// Nothing is hard-deleted: stock changes are reversed with new rows; other rows get deleted_at.
import type { Transaction } from '@powersync/web';
import { db } from './db';
import { today, expiryFor, type ExpiryType } from './dates';
import { toMain, type Currency } from './money';
import { BATCHES_FOR_ITEM } from './queries';

export type Ctx = {
  householdId: string;
  userId: string;
  mainCurrency: Currency;
  moneyEnabled: boolean;
};

type Level = 'full' | 'half' | 'low' | 'out';

const newId = () => crypto.randomUUID();
const now = () => new Date().toISOString();

type ItemRules = {
  tracking_mode: 'counted' | 'level';
  expiry_type: ExpiryType;
  shelf_life_days: number | null;
  default_location_type: string | null;
};

async function itemRules(tx: Transaction, householdId: string, itemId: string): Promise<ItemRules> {
  const row = await tx.get<ItemRules>(
    `SELECT i.tracking_mode,
            COALESCE(i.expiry_type, c.expiry_type, pc.expiry_type, 'none') AS expiry_type,
            COALESCE(hi.shelf_life_days, i.shelf_life_days, c.shelf_life_days, pc.shelf_life_days) AS shelf_life_days,
            COALESCE(c.default_location_type, pc.default_location_type) AS default_location_type
     FROM items i
     JOIN categories c ON c.id = i.category_id
     LEFT JOIN categories pc ON pc.id = c.parent_id
     LEFT JOIN household_items hi ON hi.item_id = i.id AND hi.household_id = ? AND hi.deleted_at IS NULL
     WHERE i.id = ?`,
    [householdId, itemId]
  );
  return row;
}

/** The household's own row for an item; created the first time the item is bought or set. */
async function ensureHouseholdItem(tx: Transaction, ctx: Ctx, itemId: string): Promise<string> {
  const existing = await tx.getOptional<{ id: string }>(
    `SELECT id FROM household_items WHERE household_id = ? AND item_id = ? AND deleted_at IS NULL`,
    [ctx.householdId, itemId]
  );
  if (existing) return existing.id;
  const rules = await itemRules(tx, ctx.householdId, itemId);
  const location = rules.default_location_type
    ? await tx.getOptional<{ id: string }>(
        `SELECT id FROM locations WHERE household_id = ? AND type = ? AND deleted_at IS NULL LIMIT 1`,
        [ctx.householdId, rules.default_location_type]
      )
    : null;
  const id = newId();
  // Minimum 1 by default: anything you buy goes on the list when it runs out.
  await tx.execute(
    `INSERT INTO household_items (id, household_id, item_id, min_quantity, location_id, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?, ?)`,
    [id, ctx.householdId, itemId, location?.id ?? null, now(), now()]
  );
  return id;
}

// ---------------------------------------------------------------------------
// Buying
// ---------------------------------------------------------------------------

export type PurchaseLineInput = {
  itemId: string | null;
  productId?: string | null;
  description?: string | null;
  quantity: number;
  unitPrice?: number | null; // minor units
  printedExpiry?: string | null; // "YYYY-MM-DD" typed by the user
};

export type PurchaseInput = {
  storeId: string | null;
  date?: string;
  currency: Currency;
  rateToMain: number;
  total: number | null; // minor units; null when unknown
  moneyCategoryId: string | null;
  lines: PurchaseLineInput[];
};

/** One shopping trip: raises stock, and logs one expense when money is switched on. */
export async function recordPurchase(ctx: Ctx, input: PurchaseInput): Promise<string> {
  const purchaseId = newId();
  const date = input.date ?? today();
  const lines = input.lines.filter((l) => l.quantity > 0 && (l.itemId || l.description?.trim()));
  if (!lines.length) throw new Error('empty purchase');

  const linesTotal = lines.reduce((sum, l) => sum + (l.unitPrice != null ? Math.round(l.unitPrice * l.quantity) : 0), 0);
  const total = input.total ?? (linesTotal > 0 ? linesTotal : null);

  await db.writeTransaction(async (tx) => {
    await tx.execute(
      `INSERT INTO purchases (id, household_id, store_id, purchased_at, total_amount, currency, user_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [purchaseId, ctx.householdId, input.storeId, date, total, input.currency, ctx.userId, now()]
    );

    for (const line of lines) {
      const lineId = newId();
      const lineTotal = line.unitPrice != null ? Math.round(line.unitPrice * line.quantity) : null;
      await tx.execute(
        `INSERT INTO purchase_lines (id, household_id, purchase_id, item_id, product_id, description, quantity, unit_price, line_total, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          lineId,
          ctx.householdId,
          purchaseId,
          line.itemId,
          line.productId ?? null,
          line.description?.trim() || null,
          line.quantity,
          line.unitPrice ?? null,
          lineTotal,
          now()
        ]
      );
      if (!line.itemId) continue; // one-off things are money only, not stock

      await ensureHouseholdItem(tx, ctx, line.itemId);
      const rules = await itemRules(tx, ctx.householdId, line.itemId);
      const expiry = expiryFor(rules.expiry_type, date, rules.shelf_life_days, line.printedExpiry ?? null);
      const location = await tx.getOptional<{ location_id: string | null }>(
        `SELECT location_id FROM household_items WHERE household_id = ? AND item_id = ? AND deleted_at IS NULL`,
        [ctx.householdId, line.itemId]
      );
      const batchId = newId();
      await tx.execute(
        `INSERT INTO batches (id, household_id, item_id, product_id, purchase_line_id, purchase_date, expiry_date,
                              expiry_is_estimated, location_id, quantity_initial, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          batchId,
          ctx.householdId,
          line.itemId,
          line.productId ?? null,
          lineId,
          date,
          expiry.expiry_date,
          expiry.expiry_is_estimated,
          location?.location_id ?? null,
          line.quantity,
          ctx.userId,
          now()
        ]
      );
      await tx.execute(
        `INSERT INTO stock_movements (id, household_id, batch_id, type, quantity, user_id, created_at)
         VALUES (?, ?, ?, 'purchase', ?, ?, ?)`,
        [newId(), ctx.householdId, batchId, line.quantity, ctx.userId, now()]
      );
      if (rules.tracking_mode === 'level') {
        await writeLevel(tx, ctx, line.itemId, 'full');
      }
      // Bought, so it leaves the hand-made list.
      await tx.execute(
        `UPDATE shopping_list_entries SET done = 1, done_at = ?
         WHERE household_id = ? AND item_id = ? AND done = 0 AND deleted_at IS NULL`,
        [now(), ctx.householdId, line.itemId]
      );
    }

    if (ctx.moneyEnabled && total && total > 0) {
      await tx.execute(
        `INSERT INTO transactions (id, household_id, type, amount, currency, rate_to_main, amount_main, date,
                                   money_category_id, user_id, purchase_id, created_at, updated_at)
         VALUES (?, ?, 'expense', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId(),
          ctx.householdId,
          total,
          input.currency,
          input.rateToMain,
          toMain(total, input.currency, ctx.mainCurrency, input.rateToMain),
          date,
          input.moneyCategoryId,
          ctx.userId,
          purchaseId,
          now(),
          now()
        ]
      );
    }
  });
  return purchaseId;
}

/** Undo a whole trip: its batches and expense are marked deleted, stock returns to what it was. */
export async function undoPurchase(ctx: Ctx, purchaseId: string): Promise<void> {
  await db.writeTransaction(async (tx) => {
    const stamp = now();
    await tx.execute(`UPDATE purchases SET deleted_at = ? WHERE id = ? AND household_id = ?`, [stamp, purchaseId, ctx.householdId]);
    await tx.execute(
      `UPDATE batches SET deleted_at = ?
       WHERE household_id = ? AND purchase_line_id IN (SELECT id FROM purchase_lines WHERE purchase_id = ?)`,
      [stamp, ctx.householdId, purchaseId]
    );
    await tx.execute(
      `UPDATE transactions SET deleted_at = ?, updated_at = ? WHERE household_id = ? AND purchase_id = ?`,
      [stamp, stamp, ctx.householdId, purchaseId]
    );
  });
}

// ---------------------------------------------------------------------------
// Using and throwing away
// ---------------------------------------------------------------------------

/**
 * Takes `quantity` from the item's batches, the one that expires first going first.
 * Returns the movement ids so the action can be undone.
 */
export async function takeFromStock(
  ctx: Ctx,
  itemId: string,
  quantity: number,
  type: 'use' | 'waste' = 'use'
): Promise<string[]> {
  const ids: string[] = [];
  await db.writeTransaction(async (tx) => {
    const batches = await tx.getAll<{ id: string; remaining: number }>(BATCHES_FOR_ITEM, [ctx.householdId, itemId]);
    let left = quantity;
    for (const b of batches) {
      if (left <= 0) break;
      const take = Math.min(b.remaining, left);
      const id = newId();
      await tx.execute(
        `INSERT INTO stock_movements (id, household_id, batch_id, type, quantity, user_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, ctx.householdId, b.id, type, -take, ctx.userId, now()]
      );
      ids.push(id);
      left -= take;
    }
  });
  return ids;
}

/** Throw away one specific batch (from the "expiring soon" list). */
export async function wasteBatch(ctx: Ctx, batchId: string, quantity: number): Promise<string> {
  const id = newId();
  await db.execute(
    `INSERT INTO stock_movements (id, household_id, batch_id, type, quantity, user_id, created_at)
     VALUES (?, ?, ?, 'waste', ?, ?, ?)`,
    [id, ctx.householdId, batchId, -quantity, ctx.userId, now()]
  );
  return id;
}

/** Reverses earlier movements by adding opposite ones (history stays complete). */
export async function undoMovements(ctx: Ctx, movementIds: string[]): Promise<void> {
  await db.writeTransaction(async (tx) => {
    for (const id of movementIds) {
      const m = await tx.getOptional<{ batch_id: string; quantity: number }>(
        `SELECT batch_id, quantity FROM stock_movements WHERE id = ? AND household_id = ?`,
        [id, ctx.householdId]
      );
      if (!m) continue;
      await tx.execute(
        `INSERT INTO stock_movements (id, household_id, batch_id, type, quantity, user_id, reverses_id, created_at)
         VALUES (?, ?, ?, 'undo', ?, ?, ?, ?)`,
        [newId(), ctx.householdId, m.batch_id, -m.quantity, ctx.userId, id, now()]
      );
    }
  });
}

/** "The app says 3 but I have 1": writes the difference as a correction. */
export async function correctStock(ctx: Ctx, itemId: string, actual: number): Promise<void> {
  await db.writeTransaction(async (tx) => {
    const batches = await tx.getAll<{ id: string; remaining: number }>(BATCHES_FOR_ITEM, [ctx.householdId, itemId]);
    const current = batches.reduce((s, b) => s + b.remaining, 0);
    let diff = actual - current;
    if (diff === 0) return;
    if (diff < 0) {
      for (const b of batches) {
        if (diff >= 0) break;
        const take = Math.min(b.remaining, -diff);
        await tx.execute(
          `INSERT INTO stock_movements (id, household_id, batch_id, type, quantity, user_id, created_at)
           VALUES (?, ?, ?, 'correction', ?, ?, ?)`,
          [newId(), ctx.householdId, b.id, -take, ctx.userId, now()]
        );
        diff += take;
      }
      return;
    }
    // More than the app knew about: a new batch with no purchase behind it.
    await ensureHouseholdItem(tx, ctx, itemId);
    const rules = await itemRules(tx, ctx.householdId, itemId);
    const date = today();
    const expiry = expiryFor(rules.expiry_type, date, rules.shelf_life_days, null);
    const batchId = newId();
    await tx.execute(
      `INSERT INTO batches (id, household_id, item_id, purchase_date, expiry_date, expiry_is_estimated, quantity_initial, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [batchId, ctx.householdId, itemId, date, expiry.expiry_date, expiry.expiry_is_estimated, diff, ctx.userId, now()]
    );
    await tx.execute(
      `INSERT INTO stock_movements (id, household_id, batch_id, type, quantity, user_id, created_at)
       VALUES (?, ?, ?, 'correction', ?, ?, ?)`,
      [newId(), ctx.householdId, batchId, diff, ctx.userId, now()]
    );
  });
}

// ---------------------------------------------------------------------------
// Level items (rice, oil): full, half, low, out
// ---------------------------------------------------------------------------

async function writeLevel(tx: Transaction, ctx: Ctx, itemId: string, level: Level): Promise<void> {
  const hiId = await ensureHouseholdItem(tx, ctx, itemId);
  await tx.execute(`UPDATE household_items SET current_level = ?, updated_at = ? WHERE id = ?`, [level, now(), hiId]);
  await tx.execute(
    `INSERT INTO level_changes (id, household_id, item_id, level, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [newId(), ctx.householdId, itemId, level, ctx.userId, now()]
  );
}

/** Sets the level and returns the previous one, for undo. "Out" also closes the open batches. */
export async function setLevel(ctx: Ctx, itemId: string, level: Level): Promise<{ previous: Level | null; movementIds: string[] }> {
  let previous: Level | null = null;
  const movementIds: string[] = [];
  await db.writeTransaction(async (tx) => {
    const row = await tx.getOptional<{ current_level: Level | null }>(
      `SELECT current_level FROM household_items WHERE household_id = ? AND item_id = ? AND deleted_at IS NULL`,
      [ctx.householdId, itemId]
    );
    previous = row?.current_level ?? null;
    await writeLevel(tx, ctx, itemId, level);
    if (level === 'out') {
      const batches = await tx.getAll<{ id: string; remaining: number }>(BATCHES_FOR_ITEM, [ctx.householdId, itemId]);
      for (const b of batches) {
        const id = newId();
        await tx.execute(
          `INSERT INTO stock_movements (id, household_id, batch_id, type, quantity, user_id, created_at)
           VALUES (?, ?, ?, 'use', ?, ?, ?)`,
          [id, ctx.householdId, b.id, -b.remaining, ctx.userId, now()]
        );
        movementIds.push(id);
      }
    }
  });
  return { previous, movementIds };
}

export async function undoLevel(ctx: Ctx, itemId: string, previous: Level | null, movementIds: string[]): Promise<void> {
  if (movementIds.length) await undoMovements(ctx, movementIds);
  await db.writeTransaction(async (tx) => {
    if (previous) {
      await writeLevel(tx, ctx, itemId, previous);
    } else {
      await tx.execute(
        `UPDATE household_items SET current_level = NULL, updated_at = ? WHERE household_id = ? AND item_id = ? AND deleted_at IS NULL`,
        [now(), ctx.householdId, itemId]
      );
    }
  });
}

// ---------------------------------------------------------------------------
// Item settings
// ---------------------------------------------------------------------------

export async function setMinimum(ctx: Ctx, itemId: string, min: number): Promise<void> {
  await db.writeTransaction(async (tx) => {
    const id = await ensureHouseholdItem(tx, ctx, itemId);
    await tx.execute(`UPDATE household_items SET min_quantity = ?, updated_at = ? WHERE id = ?`, [Math.max(0, min), now(), id]);
  });
}

export async function setLocation(ctx: Ctx, itemId: string, locationId: string | null): Promise<void> {
  await db.writeTransaction(async (tx) => {
    const id = await ensureHouseholdItem(tx, ctx, itemId);
    await tx.execute(`UPDATE household_items SET location_id = ?, updated_at = ? WHERE id = ?`, [locationId, now(), id]);
  });
}

export async function toggleLabel(ctx: Ctx, itemId: string, labelId: string): Promise<void> {
  await db.writeTransaction(async (tx) => {
    const hiId = await ensureHouseholdItem(tx, ctx, itemId);
    const link = await tx.getOptional<{ id: string; deleted_at: string | null }>(
      `SELECT id, deleted_at FROM household_item_labels WHERE household_item_id = ? AND label_id = ?`,
      [hiId, labelId]
    );
    if (!link) {
      await tx.execute(
        `INSERT INTO household_item_labels (id, household_id, household_item_id, label_id, created_at) VALUES (?, ?, ?, ?, ?)`,
        [newId(), ctx.householdId, hiId, labelId, now()]
      );
    } else {
      await tx.execute(`UPDATE household_item_labels SET deleted_at = ? WHERE id = ?`, [link.deleted_at ? null : now(), link.id]);
    }
  });
}

export async function addLabel(ctx: Ctx, name: string): Promise<void> {
  await db.execute(
    `INSERT INTO labels (id, household_id, name, color, is_default, created_at) VALUES (?, ?, ?, 'ink', 0, ?)`,
    [newId(), ctx.householdId, name.trim(), now()]
  );
}

// ---------------------------------------------------------------------------
// Shopping list
// ---------------------------------------------------------------------------

export async function addToList(ctx: Ctx, entry: { itemId?: string; freeText?: string }): Promise<void> {
  await db.execute(
    `INSERT INTO shopping_list_entries (id, household_id, item_id, free_text, added_by, done, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`,
    [newId(), ctx.householdId, entry.itemId ?? null, entry.freeText?.trim() || null, ctx.userId, now()]
  );
}

export async function removeFromList(ctx: Ctx, entryId: string): Promise<void> {
  await db.execute(`UPDATE shopping_list_entries SET deleted_at = ? WHERE id = ? AND household_id = ?`, [now(), entryId, ctx.householdId]);
}

// ---------------------------------------------------------------------------
// Catalog additions (usable at once by this household; shared after review)
// ---------------------------------------------------------------------------

export async function addCatalogItem(
  ctx: Ctx,
  input: { categoryId: string; name: string; language: 'ar' | 'en'; trackingMode: 'counted' | 'level'; icon?: string }
): Promise<string> {
  const id = newId();
  await db.execute(
    `INSERT INTO items (id, category_id, icon, name_en, name_ar, tracking_mode, unit_kind, status, created_by, created_by_household, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'piece', 'pending', ?, ?, ?, ?)`,
    [
      id,
      input.categoryId,
      input.icon ?? null,
      input.language === 'en' ? input.name.trim() : null,
      input.language === 'ar' ? input.name.trim() : null,
      input.trackingMode,
      ctx.userId,
      ctx.householdId,
      now(),
      now()
    ]
  );
  return id;
}

export async function addStore(ctx: Ctx, name: string, language: 'ar' | 'en'): Promise<string> {
  const storeId = newId();
  await db.writeTransaction(async (tx) => {
    await tx.execute(
      `INSERT INTO stores (id, name_en, name_ar, type, status, created_by, created_by_household, created_at, updated_at)
       VALUES (?, ?, ?, 'shop', 'pending', ?, ?, ?, ?)`,
      [storeId, language === 'en' ? name.trim() : null, language === 'ar' ? name.trim() : null, ctx.userId, ctx.householdId, now(), now()]
    );
    await tx.execute(
      `INSERT INTO household_stores (id, household_id, store_id, is_favorite, created_at) VALUES (?, ?, ?, 0, ?)`,
      [newId(), ctx.householdId, storeId, now()]
    );
  });
  return storeId;
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export async function addTransaction(
  ctx: Ctx,
  input: {
    type: 'income' | 'expense';
    amount: number;
    currency: Currency;
    rateToMain: number;
    date: string;
    moneyCategoryId: string | null;
    note: string | null;
  }
): Promise<string> {
  const id = newId();
  await db.execute(
    `INSERT INTO transactions (id, household_id, type, amount, currency, rate_to_main, amount_main, date,
                               money_category_id, user_id, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      ctx.householdId,
      input.type,
      input.amount,
      input.currency,
      input.rateToMain,
      toMain(input.amount, input.currency, ctx.mainCurrency, input.rateToMain),
      input.date,
      input.moneyCategoryId,
      ctx.userId,
      input.note?.trim() || null,
      now(),
      now()
    ]
  );
  return id;
}

export async function setTransactionDeleted(ctx: Ctx, id: string, deleted: boolean): Promise<void> {
  await db.execute(`UPDATE transactions SET deleted_at = ?, updated_at = ? WHERE id = ? AND household_id = ?`, [
    deleted ? now() : null,
    now(),
    id,
    ctx.householdId
  ]);
}

// ---------------------------------------------------------------------------
// Household and profile settings
// ---------------------------------------------------------------------------

export async function updateHousehold(
  ctx: Ctx,
  patch: Partial<{ name: string; main_currency: Currency; money_enabled: 0 | 1; share_prices: 0 | 1 }>
): Promise<void> {
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  if (!keys.length) return;
  await db.execute(
    // updated_at is set by the database; the app may only change these columns.
    `UPDATE households SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
    [...keys.map((k) => patch[k] ?? null), ctx.householdId]
  );
}

export async function updateProfile(userId: string, patch: Partial<{ display_name: string; language: 'ar' | 'en' }>): Promise<void> {
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  if (!keys.length) return;
  await db.execute(
    `UPDATE profiles SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
    [...keys.map((k) => patch[k] ?? null), userId]
  );
}
