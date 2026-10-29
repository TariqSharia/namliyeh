// Tests the real write actions and the real SQL from src/data against SQLite,
// using a day in Tariq's house: buy rice, milk and bananas, use some, throw some away.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from './testDb';

let tdb: TestDb;
vi.mock('../../src/data/db', () => ({
  get db() {
    return tdb;
  }
}));

const actions = await import('../../src/data/actions');
const q = await import('../../src/data/queries');
const { today, addDays } = await import('../../src/data/dates');

const HH = 'hh-1';
const ME = 'user-tariq';
const ctx = { householdId: HH, userId: ME, mainCurrency: 'ILS' as const, moneyEnabled: true };

function seed(db: TestDb) {
  db.insert('households', { id: HH, name: 'بيتنا', main_currency: 'ILS', money_enabled: 1, share_prices: 1 });
  db.insert('locations', { id: 'loc-fridge', household_id: HH, name: 'Fridge', type: 'fridge' });
  db.insert('locations', { id: 'loc-pantry', household_id: HH, name: 'Pantry', type: 'pantry' });
  db.insert('categories', { id: 'c-food', icon: '🍽️', name_en: 'Food', expiry_type: 'printed', status: 'approved', sort_order: 10 });
  db.insert('categories', { id: 'c-grains', parent_id: 'c-food', icon: '🌾', name_en: 'Grains', default_location_type: 'pantry', status: 'approved', sort_order: 11 });
  db.insert('categories', { id: 'c-dairy', parent_id: 'c-food', icon: '🥛', name_en: 'Dairy', expiry_type: 'printed', default_location_type: 'fridge', status: 'approved', sort_order: 12 });
  db.insert('categories', { id: 'c-fruit', parent_id: 'c-food', icon: '🍎', name_en: 'Fruit', expiry_type: 'estimated', shelf_life_days: 7, status: 'approved', sort_order: 13 });
  db.insert('categories', { id: 'c-clean', icon: '🧽', name_en: 'Cleaning', expiry_type: 'none', status: 'approved', sort_order: 30 });
  db.insert('items', { id: 'rice', category_id: 'c-grains', name_en: 'Long-grain rice', name_ar: 'أرز', tracking_mode: 'level', status: 'approved' });
  db.insert('items', { id: 'milk', category_id: 'c-dairy', name_en: 'Milk', tracking_mode: 'counted', status: 'approved' });
  db.insert('items', { id: 'banana', category_id: 'c-fruit', name_en: 'Bananas', tracking_mode: 'counted', shelf_life_days: 5, status: 'approved' });
  db.insert('items', { id: 'soap', category_id: 'c-clean', name_en: 'Soap', tracking_mode: 'counted', status: 'approved' });
}

const stockOf = async (itemId: string) =>
  (await tdb.getAll<{ id: string; stock: number }>(q.ITEMS_WITH_STOCK, [HH])).find((r) => r.id === itemId)!.stock;

beforeEach(() => {
  tdb = createTestDb();
  seed(tdb);
});

describe('buying', () => {
  it('raises stock, sets expiry by the rules, and logs one expense', async () => {
    const soon = addDays(today(), 2);
    await actions.recordPurchase(ctx, {
      storeId: null,
      currency: 'ILS',
      rateToMain: 1,
      total: null,
      moneyCategoryId: null,
      lines: [
        { itemId: 'milk', quantity: 2, unitPrice: 650, printedExpiry: soon },
        { itemId: 'banana', quantity: 6, unitPrice: 150 },
        { itemId: 'soap', quantity: 3 },
        { itemId: null, description: 'Birthday candles', quantity: 1, unitPrice: 500 }
      ]
    });

    expect(await stockOf('milk')).toBe(2);
    expect(await stockOf('banana')).toBe(6);
    expect(await stockOf('soap')).toBe(3);

    const batches = await tdb.getAll<{ item_id: string; expiry_date: string | null; expiry_is_estimated: number; location_id: string | null }>(
      `SELECT item_id, expiry_date, expiry_is_estimated, location_id FROM batches`
    );
    const by = Object.fromEntries(batches.map((b) => [b.item_id, b]));
    expect(by.milk).toMatchObject({ expiry_date: soon, expiry_is_estimated: 0, location_id: 'loc-fridge' });
    // Item shelf life (5) beats the category's (7).
    expect(by.banana).toMatchObject({ expiry_date: addDays(today(), 5), expiry_is_estimated: 1 });
    expect(by.soap!.expiry_date).toBeNull();
    // The one-off line is money only, never stock.
    expect(batches).toHaveLength(3);

    const tx = await tdb.getAll<{ amount: number; amount_main: number; type: string }>(`SELECT * FROM transactions`);
    expect(tx).toEqual([expect.objectContaining({ type: 'expense', amount: 2 * 650 + 6 * 150 + 500, amount_main: 2700 })]);
  });

  it('does not log money when money is switched off', async () => {
    await actions.recordPurchase(
      { ...ctx, moneyEnabled: false },
      { storeId: null, currency: 'ILS', rateToMain: 1, total: 1000, moneyCategoryId: null, lines: [{ itemId: 'milk', quantity: 1 }] }
    );
    expect(await tdb.getAll(`SELECT * FROM transactions`)).toHaveLength(0);
  });

  it('converts a purchase in dinars to the main currency with the saved rate', async () => {
    await actions.recordPurchase(ctx, {
      storeId: null,
      currency: 'JOD',
      rateToMain: 5.2,
      total: 3250, // 3.250 JD
      moneyCategoryId: null,
      lines: [{ itemId: 'soap', quantity: 1 }]
    });
    const row = await tdb.get<{ amount: number; currency: string; amount_main: number }>(`SELECT * FROM transactions`);
    expect(row).toMatchObject({ amount: 3250, currency: 'JOD', amount_main: 1690 }); // 16.90 ₪
  });

  it('undoing a trip brings stock and money back', async () => {
    const id = await actions.recordPurchase(ctx, {
      storeId: null, currency: 'ILS', rateToMain: 1, total: 1300, moneyCategoryId: null,
      lines: [{ itemId: 'milk', quantity: 2 }]
    });
    await actions.undoPurchase(ctx, id);
    expect(await stockOf('milk')).toBe(0);
    expect(await tdb.getAll(`SELECT * FROM transactions WHERE deleted_at IS NULL`)).toHaveLength(0);
  });
});

describe('using', () => {
  it('takes from the batch that expires first, and undo puts it back', async () => {
    const buy = (printedExpiry: string, qty: number) =>
      actions.recordPurchase(ctx, {
        storeId: null, currency: 'ILS', rateToMain: 1, total: null, moneyCategoryId: null,
        lines: [{ itemId: 'milk', quantity: qty, printedExpiry }]
      });
    await buy(addDays(today(), 10), 1); // bought first, expires later
    await buy(addDays(today(), 3), 1); // bought second, expires sooner

    const ids = await actions.takeFromStock(ctx, 'milk', 1);
    const left = await tdb.getAll<{ expiry_date: string }>(q.BATCHES_FOR_ITEM, [HH, 'milk']);
    expect(left.map((b) => b.expiry_date)).toEqual([addDays(today(), 10)]);

    await actions.undoMovements(ctx, ids);
    expect(await stockOf('milk')).toBe(2);
  });

  it('never takes more than there is', async () => {
    await actions.recordPurchase(ctx, {
      storeId: null, currency: 'ILS', rateToMain: 1, total: null, moneyCategoryId: null,
      lines: [{ itemId: 'soap', quantity: 1 }]
    });
    await actions.takeFromStock(ctx, 'soap', 5);
    expect(await stockOf('soap')).toBe(0);
  });

  it('corrects stock up and down', async () => {
    await actions.recordPurchase(ctx, {
      storeId: null, currency: 'ILS', rateToMain: 1, total: null, moneyCategoryId: null,
      lines: [{ itemId: 'soap', quantity: 3 }]
    });
    await actions.correctStock(ctx, 'soap', 1);
    expect(await stockOf('soap')).toBe(1);
    await actions.correctStock(ctx, 'soap', 4);
    expect(await stockOf('soap')).toBe(4);
  });
});

describe('need to buy and expiring soon', () => {
  it('lists what fell below the minimum, low level items, and hand-added entries', async () => {
    await actions.recordPurchase(ctx, {
      storeId: null, currency: 'ILS', rateToMain: 1, total: null, moneyCategoryId: null,
      lines: [{ itemId: 'milk', quantity: 1 }, { itemId: 'rice', quantity: 1 }, { itemId: 'soap', quantity: 2 }]
    });
    // Nothing is needed right after shopping.
    expect(await tdb.getAll(q.NEED_TO_BUY, [HH])).toHaveLength(0);

    await actions.takeFromStock(ctx, 'milk', 1); // milk runs out (minimum 1 by default)
    await actions.setLevel(ctx, 'rice', 'low'); // rice is getting low
    await actions.addToList(ctx, { freeText: 'Batteries' });

    const need = await tdb.getAll<{ item_id: string | null; free_text: string | null }>(q.NEED_TO_BUY, [HH]);
    expect(need.map((n) => n.item_id ?? n.free_text).sort()).toEqual(['Batteries', 'milk', 'rice']);

    // Setting the minimum to 0 means "don't remind me".
    await actions.setMinimum(ctx, 'milk', 0);
    const after = await tdb.getAll<{ item_id: string | null }>(q.NEED_TO_BUY, [HH]);
    expect(after.map((n) => n.item_id)).not.toContain('milk');
  });

  it('buying an item takes it off the hand-made list', async () => {
    await actions.addToList(ctx, { itemId: 'soap' });
    await actions.recordPurchase(ctx, {
      storeId: null, currency: 'ILS', rateToMain: 1, total: null, moneyCategoryId: null,
      lines: [{ itemId: 'soap', quantity: 1 }]
    });
    expect(await tdb.getAll(q.NEED_TO_BUY, [HH])).toHaveLength(0);
  });

  it('shows open batches that expire within the window, soonest first', async () => {
    await actions.recordPurchase(ctx, {
      storeId: null, currency: 'ILS', rateToMain: 1, total: null, moneyCategoryId: null,
      lines: [
        { itemId: 'milk', quantity: 1, printedExpiry: addDays(today(), 2) },
        { itemId: 'banana', quantity: 4 }, // estimated: 5 days
        { itemId: 'soap', quantity: 1 } // never expires
      ]
    });
    const soon = await tdb.getAll<{ item_id: string; days_left: number }>(q.EXPIRING_SOON, [HH, 3, today()]);
    expect(soon.map((s) => [s.item_id, s.days_left])).toEqual([['milk', 2]]);

    const week = await tdb.getAll<{ item_id: string }>(q.EXPIRING_SOON, [HH, 7, today()]);
    expect(week.map((s) => s.item_id)).toEqual(['milk', 'banana']);
  });

  it('marking a level item as out closes its stock and can be undone', async () => {
    await actions.recordPurchase(ctx, {
      storeId: null, currency: 'ILS', rateToMain: 1, total: null, moneyCategoryId: null,
      lines: [{ itemId: 'rice', quantity: 1 }]
    });
    const { previous, movementIds } = await actions.setLevel(ctx, 'rice', 'out');
    expect(previous).toBe('full');
    expect(await stockOf('rice')).toBe(0);
    await actions.undoLevel(ctx, 'rice', previous, movementIds);
    expect(await stockOf('rice')).toBe(1);
    const hi = await tdb.get<{ current_level: string }>(`SELECT current_level FROM household_items WHERE item_id = 'rice'`);
    expect(hi.current_level).toBe('full');
  });
});

describe('money reports', () => {
  it('totals the month by type, category, person and waste', async () => {
    tdb.insert('household_members', { id: 'm1', household_id: HH, user_id: ME, display_name: 'Tariq', role: 'owner' });
    tdb.insert('money_categories', { id: 'mc-salary', household_id: HH, type: 'income', name: 'Salary', icon: '💼' });
    tdb.insert('money_categories', { id: 'mc-home', household_id: HH, type: 'expense', name: 'Home supplies', icon: '🛒' });
    const d = today();
    await actions.addTransaction(ctx, { type: 'income', amount: 500000, currency: 'ILS', rateToMain: 1, date: d, moneyCategoryId: 'mc-salary', note: null });
    await actions.recordPurchase(ctx, {
      storeId: null, currency: 'ILS', rateToMain: 1, total: null, moneyCategoryId: 'mc-home',
      lines: [{ itemId: 'banana', quantity: 6, unitPrice: 150 }]
    });
    await actions.takeFromStock(ctx, 'banana', 2, 'waste');

    const { monthStart, nextMonthStart } = await import('../../src/data/dates');
    const range = [HH, monthStart(d), nextMonthStart(d)];
    expect(await tdb.get(q.MONTH_TOTALS, range)).toEqual({ income: 500000, expense: 900 });
    const byCat = await tdb.getAll<{ name: string; total: number }>(q.MONTH_BY_CATEGORY, range);
    expect(byCat.map((c) => [c.name, c.total])).toEqual([['Salary', 500000], ['Home supplies', 900]]);
    expect(await tdb.get(q.MONTH_BY_PERSON, range)).toMatchObject({ display_name: 'Tariq', total: 900 });
    expect(await tdb.get(q.MONTH_WASTE, range)).toMatchObject({ wasted_value: 300 });
  });
});
