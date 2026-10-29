// Preview mode (only when built with VITE_DEMO=1): a sample home stored on this device only,
// never connected to the internet. Used to look at the screens before accounts exist.
import { recordPurchase, setLevel, addToList, takeFromStock } from './data/actions';
import { addDays, today } from './data/dates';
import { db } from './data/db';

export const DEMO = import.meta.env.VITE_DEMO === '1';
export const DEMO_USER = '00000000-0000-4000-8000-000000000001';
const HH = '00000000-0000-4000-8000-0000000000aa';

const CATS: [string, string | null, string, string, string, string | null, number | null, string][] = [
  ['c-food', null, '🍽️', 'Food', 'طعام', 'printed', null, 'pantry'],
  ['c-grains', 'c-food', '🌾', 'Rice and grains', 'أرز وحبوب', null, null, 'pantry'],
  ['c-dairy', 'c-food', '🥛', 'Dairy and eggs', 'ألبان وبيض', 'printed', null, 'fridge'],
  ['c-fruit', 'c-food', '🍎', 'Fruit', 'فواكه', 'estimated', 7, 'fridge'],
  ['c-veg', 'c-food', '🥕', 'Vegetables', 'خضار', 'estimated', 7, 'fridge'],
  ['c-bakery', 'c-food', '🍞', 'Bread', 'خبز', 'estimated', 3, 'pantry'],
  ['c-clean', null, '🧽', 'Cleaning', 'تنظيف', 'none', null, 'laundry'],
  ['c-care', null, '🧼', 'Personal care', 'عناية شخصية', 'none', null, 'bathroom'],
  ['c-paper', null, '🧻', 'Paper and bags', 'ورق وأكياس', 'none', null, 'other']
];

const ITEMS: [string, string, string, string, string, 'counted' | 'level', number | null][] = [
  ['i-rice', 'c-grains', '🍚', 'Long-grain rice', 'أرز طويل الحبة', 'level', null],
  ['i-rice2', 'c-grains', '🍚', 'Short-grain rice', 'أرز قصير الحبة', 'level', null],
  ['i-sugar', 'c-grains', '🧂', 'Sugar', 'سكر', 'level', null],
  ['i-milk', 'c-dairy', '🥛', 'Milk', 'حليب', 'counted', null],
  ['i-eggs', 'c-dairy', '🥚', 'Eggs', 'بيض', 'counted', null],
  ['i-labneh', 'c-dairy', '🥣', 'Labneh', 'لبنة', 'counted', null],
  ['i-banana', 'c-fruit', '🍌', 'Bananas', 'موز', 'counted', 5],
  ['i-apple', 'c-fruit', '🍎', 'Apples', 'تفاح', 'counted', 14],
  ['i-tomato', 'c-veg', '🍅', 'Tomatoes', 'بندورة', 'counted', 7],
  ['i-cucumber', 'c-veg', '🥒', 'Cucumbers', 'خيار', 'counted', 7],
  ['i-bread', 'c-bakery', '🫓', 'Arabic bread', 'خبز عربي', 'counted', 3],
  ['i-dish', 'c-clean', '🧽', 'Dish soap', 'سائل جلي', 'level', null],
  ['i-laundry', 'c-clean', '🧺', 'Laundry detergent', 'مسحوق غسيل', 'level', null],
  ['i-soap', 'c-care', '🧼', 'Soap', 'صابون', 'counted', null],
  ['i-shampoo', 'c-care', '🧴', 'Shampoo', 'شامبو', 'level', null],
  ['i-tp', 'c-paper', '🧻', 'Toilet paper', 'ورق حمّام', 'counted', null]
];

export async function seedDemo(): Promise<void> {
  await db.init();
  const existing = await db.getOptional(`SELECT id FROM households WHERE id = ?`, [HH]);
  if (existing) return;
  const now = new Date().toISOString();
  await db.writeTransaction(async (tx) => {
    await tx.execute(`INSERT INTO profiles (id, display_name, language) VALUES (?, 'طارق', 'ar')`, [DEMO_USER]);
    await tx.execute(
      `INSERT INTO households (id, name, main_currency, money_enabled, share_prices, created_at) VALUES (?, 'بيتنا', 'ILS', 1, 1, ?)`,
      [HH, now]
    );
    await tx.execute(
      `INSERT INTO household_members (id, household_id, user_id, display_name, role, joined_at) VALUES (?, ?, ?, 'طارق', 'owner', ?)`,
      [crypto.randomUUID(), HH, DEMO_USER, now]
    );
    for (const [type, name] of [['fridge', 'الثلاجة'], ['pantry', 'المؤونة'], ['bathroom', 'الحمّام'], ['laundry', 'الغسيل']]) {
      await tx.execute(`INSERT INTO locations (id, household_id, name, type) VALUES (?, ?, ?, ?)`, [crypto.randomUUID(), HH, name, type]);
    }
    await tx.execute(`INSERT INTO labels (id, household_id, name, color, is_default) VALUES (?, ?, 'أساسي', 'olive', 1)`, [crypto.randomUUID(), HH]);
    await tx.execute(`INSERT INTO labels (id, household_id, name, color, is_default) VALUES (?, ?, 'إضافي', 'saffron', 1)`, [crypto.randomUUID(), HH]);
    const moneyCats: [string, string, string, number][] = [
      ['income', 'راتب', '💼', 10],
      ['expense', 'مشتريات البيت', '🛒', 10],
      ['expense', 'كهرباء وماء', '💡', 30],
      ['expense', 'مواصلات ووقود', '⛽', 40]
    ];
    for (const [type, name, icon, sort] of moneyCats) {
      await tx.execute(`INSERT INTO money_categories (id, household_id, type, name, icon, sort_order) VALUES (?, ?, ?, ?, ?, ?)`, [
        `mc-${name}`,
        HH,
        type,
        name,
        icon,
        sort
      ]);
    }
    for (const [id, parent, icon, en, ar, expiry, shelf, loc] of CATS) {
      await tx.execute(
        `INSERT INTO categories (id, parent_id, icon, name_en, name_ar, expiry_type, shelf_life_days, default_location_type, sort_order, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')`,
        [id, parent, icon, en, ar, expiry, shelf, loc, CATS.findIndex((c) => c[0] === id)]
      );
    }
    for (const [id, cat, icon, en, ar, mode, shelf] of ITEMS) {
      await tx.execute(
        `INSERT INTO items (id, category_id, icon, name_en, name_ar, tracking_mode, shelf_life_days, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'approved')`,
        [id, cat, icon, en, ar, mode, shelf]
      );
    }
  });

  const ctx = { householdId: HH, userId: DEMO_USER, mainCurrency: 'ILS' as const, moneyEnabled: true };
  await recordPurchase(ctx, {
    storeId: null,
    currency: 'ILS',
    rateToMain: 1,
    total: null,
    moneyCategoryId: 'mc-مشتريات البيت',
    lines: [
      { itemId: 'i-rice', quantity: 1, unitPrice: 3200 },
      { itemId: 'i-milk', quantity: 2, unitPrice: 650, printedExpiry: addDays(today(), 1) },
      { itemId: 'i-labneh', quantity: 1, unitPrice: 1400, printedExpiry: addDays(today(), 3) },
      { itemId: 'i-banana', quantity: 6, unitPrice: 150 },
      { itemId: 'i-tomato', quantity: 2, unitPrice: 400 },
      { itemId: 'i-bread', quantity: 2, unitPrice: 500 },
      { itemId: 'i-dish', quantity: 1, unitPrice: 1200 },
      { itemId: 'i-soap', quantity: 3, unitPrice: 300 },
      { itemId: 'i-tp', quantity: 1, unitPrice: 2500 },
      { itemId: 'i-eggs', quantity: 1, unitPrice: 1800 }
    ]
  });
  await takeFromStock(ctx, 'i-eggs', 1);
  await setLevel(ctx, 'i-dish', 'low');
  await addToList(ctx, { freeText: 'بطاريات' });
  await db.execute(
    `INSERT INTO transactions (id, household_id, type, amount, currency, rate_to_main, amount_main, date, money_category_id, user_id, created_at)
     VALUES (?, ?, 'income', 650000, 'ILS', 1, 650000, ?, 'mc-راتب', ?, ?)`,
    [crypto.randomUUID(), HH, today(), DEMO_USER, now]
  );
}
