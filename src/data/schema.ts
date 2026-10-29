// The phone's local SQLite tables. They mirror the Postgres tables the phone syncs
// (see supabase/migrations and powersync/sync-config.yaml). Booleans arrive as 0/1,
// dates and timestamps as ISO text, money as whole numbers in the smallest unit.
import { column, Schema, Table } from '@powersync/web';

const catalogStatus = {
  status: column.text,
  created_by: column.text,
  created_by_household: column.text,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text
};

const profiles = new Table({
  display_name: column.text,
  language: column.text,
  catalog_role: column.text,
  created_at: column.text,
  updated_at: column.text
});

const households = new Table({
  name: column.text,
  main_currency: column.text,
  money_enabled: column.integer,
  share_prices: column.integer,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text
});

const household_members = new Table(
  {
    household_id: column.text,
    user_id: column.text,
    display_name: column.text,
    role: column.text,
    joined_at: column.text
  },
  { indexes: { user: ['user_id'] } }
);

const categories = new Table({
  parent_id: column.text,
  icon: column.text,
  name_en: column.text,
  name_ar: column.text,
  expiry_type: column.text,
  shelf_life_days: column.integer,
  default_location_type: column.text,
  sort_order: column.integer,
  ...catalogStatus
});

const items = new Table(
  {
    category_id: column.text,
    icon: column.text,
    image_path: column.text,
    name_en: column.text,
    name_ar: column.text,
    tracking_mode: column.text,
    unit_kind: column.text,
    expiry_type: column.text,
    shelf_life_days: column.integer,
    ...catalogStatus
  },
  { indexes: { category: ['category_id'] } }
);

const brands = new Table({ name: column.text, ...catalogStatus });

const products = new Table(
  {
    item_id: column.text,
    brand_id: column.text,
    name_en: column.text,
    name_ar: column.text,
    size_amount: column.real,
    size_unit: column.text,
    pack_count: column.integer,
    ...catalogStatus
  },
  { indexes: { item: ['item_id'] } }
);

const stores = new Table({
  name_en: column.text,
  name_ar: column.text,
  type: column.text,
  area: column.text,
  ...catalogStatus
});

const locations = new Table({
  household_id: column.text,
  name: column.text,
  type: column.text,
  created_at: column.text,
  deleted_at: column.text
});

const household_items = new Table(
  {
    household_id: column.text,
    item_id: column.text,
    min_quantity: column.real,
    current_level: column.text,
    shelf_life_days: column.integer,
    location_id: column.text,
    note: column.text,
    created_at: column.text,
    updated_at: column.text,
    deleted_at: column.text
  },
  { indexes: { item: ['household_id', 'item_id'] } }
);

const labels = new Table({
  household_id: column.text,
  name: column.text,
  color: column.text,
  is_default: column.integer,
  created_at: column.text,
  deleted_at: column.text
});

const household_item_labels = new Table(
  {
    household_id: column.text,
    household_item_id: column.text,
    label_id: column.text,
    created_at: column.text,
    deleted_at: column.text
  },
  { indexes: { hi: ['household_item_id'] } }
);

const household_stores = new Table({
  household_id: column.text,
  store_id: column.text,
  nickname: column.text,
  is_favorite: column.integer,
  created_at: column.text,
  deleted_at: column.text
});

const money_categories = new Table({
  household_id: column.text,
  type: column.text,
  name: column.text,
  icon: column.text,
  catalog_category_id: column.text,
  sort_order: column.integer,
  created_at: column.text,
  deleted_at: column.text
});

const purchases = new Table(
  {
    household_id: column.text,
    store_id: column.text,
    purchased_at: column.text,
    total_amount: column.integer,
    currency: column.text,
    user_id: column.text,
    created_at: column.text,
    deleted_at: column.text
  },
  { indexes: { date: ['household_id', 'purchased_at'] } }
);

const purchase_lines = new Table(
  {
    household_id: column.text,
    purchase_id: column.text,
    item_id: column.text,
    product_id: column.text,
    description: column.text,
    quantity: column.real,
    unit_price: column.integer,
    line_total: column.integer,
    created_at: column.text
  },
  { indexes: { purchase: ['purchase_id'], item: ['item_id'] } }
);

const transactions = new Table(
  {
    household_id: column.text,
    type: column.text,
    amount: column.integer,
    currency: column.text,
    rate_to_main: column.real,
    amount_main: column.integer,
    date: column.text,
    money_category_id: column.text,
    user_id: column.text,
    note: column.text,
    purchase_id: column.text,
    recurring_id: column.text,
    created_at: column.text,
    updated_at: column.text,
    deleted_at: column.text
  },
  { indexes: { date: ['household_id', 'date'] } }
);

const batches = new Table(
  {
    household_id: column.text,
    item_id: column.text,
    product_id: column.text,
    purchase_line_id: column.text,
    purchase_date: column.text,
    expiry_date: column.text,
    expiry_is_estimated: column.integer,
    location_id: column.text,
    quantity_initial: column.real,
    created_by: column.text,
    created_at: column.text,
    deleted_at: column.text
  },
  { indexes: { item: ['household_id', 'item_id'] } }
);

const stock_movements = new Table(
  {
    household_id: column.text,
    batch_id: column.text,
    type: column.text,
    quantity: column.real,
    user_id: column.text,
    reverses_id: column.text,
    created_at: column.text
  },
  { indexes: { batch: ['batch_id'], reverses: ['reverses_id'] } }
);

const level_changes = new Table({
  household_id: column.text,
  item_id: column.text,
  level: column.text,
  user_id: column.text,
  created_at: column.text
});

const shopping_list_entries = new Table({
  household_id: column.text,
  item_id: column.text,
  free_text: column.text,
  quantity: column.real,
  added_by: column.text,
  done: column.integer,
  done_at: column.text,
  created_at: column.text,
  deleted_at: column.text
});

// Changes the server refused (kept on this phone only, so the user can see and fix them).
const upload_errors = new Table(
  {
    table_name: column.text,
    row_id: column.text,
    op: column.text,
    data: column.text,
    message: column.text,
    created_at: column.text
  },
  { localOnly: true }
);

export const AppSchema = new Schema({
  profiles,
  households,
  household_members,
  categories,
  items,
  brands,
  products,
  stores,
  locations,
  household_items,
  labels,
  household_item_labels,
  household_stores,
  money_categories,
  purchases,
  purchase_lines,
  transactions,
  batches,
  stock_movements,
  level_changes,
  shopping_list_entries,
  upload_errors
});

export type Database = (typeof AppSchema)['types'];
