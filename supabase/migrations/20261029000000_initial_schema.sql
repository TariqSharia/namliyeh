-- Home supplies and money app: initial schema (phase 1 creates every table).
-- Rules this file enforces (see the data model doc):
--   * every private row carries household_id and is guarded by row-level security
--   * the shared catalog (categories, items, brands, products, stores) is readable by everyone once approved
--   * money is stored as whole numbers in the currency's smallest unit (agorot, fils, cents)
--   * no hard deletes from the app: rows get deleted_at, stock changes are reversed with new rows
--   * ids are UUIDs so rows created offline on a phone never clash

-- ---------------------------------------------------------------------------
-- Fixed lists (logic values, not business data)
-- ---------------------------------------------------------------------------

create table public.currencies (
  code text primary key,
  decimals smallint not null check (decimals between 0 and 3),
  symbol text not null
);

insert into public.currencies (code, decimals, symbol) values
  ('ILS', 2, '₪'),
  ('JOD', 3, 'JD'),
  ('USD', 2, '$'),
  ('EUR', 2, '€');

-- ---------------------------------------------------------------------------
-- Households and users
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  language text not null default 'ar' check (language in ('ar', 'en')),
  -- Only set by a database admin for the few people who review the shared catalog.
  catalog_role text check (catalog_role in ('admin', 'reviewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  main_currency text not null default 'ILS' references public.currencies (code),
  money_enabled boolean not null default false,
  share_prices boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Copied here so members can see each other's names without reading other profiles.
  display_name text not null default '',
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  unique (household_id, user_id)
);

create table public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  code text not null unique,
  created_by uuid not null references auth.users (id),
  expires_at timestamptz not null,
  accepted_by uuid references auth.users (id),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Shared catalog
-- ---------------------------------------------------------------------------

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories (id) on delete restrict,
  icon text not null default '📦',
  name_en text,
  name_ar text,
  -- Empty on a subcategory means "same as the parent".
  expiry_type text check (expiry_type in ('printed', 'estimated', 'none')),
  shelf_life_days integer check (shelf_life_days > 0),
  default_location_type text check (default_location_type in ('fridge', 'freezer', 'pantry', 'bathroom', 'laundry', 'other')),
  sort_order integer not null default 100,
  status text not null default 'pending' check (status in ('approved', 'pending', 'rejected')),
  created_by uuid references auth.users (id),
  created_by_household uuid references public.households (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (coalesce(name_en, name_ar) is not null)
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories (id) on delete restrict,
  icon text,
  image_path text,
  name_en text,
  name_ar text,
  -- counted: cans, bottles, bars (plus/minus). level: rice, oil (full, half, low, out).
  tracking_mode text not null default 'counted' check (tracking_mode in ('counted', 'level')),
  unit_kind text not null default 'piece' check (unit_kind in ('piece', 'weight', 'volume')),
  -- Empty means "inherit from the category".
  expiry_type text check (expiry_type in ('printed', 'estimated', 'none')),
  shelf_life_days integer check (shelf_life_days > 0),
  status text not null default 'pending' check (status in ('approved', 'pending', 'rejected')),
  created_by uuid references auth.users (id),
  created_by_household uuid references public.households (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (coalesce(name_en, name_ar) is not null)
);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  status text not null default 'pending' check (status in ('approved', 'pending', 'rejected')),
  created_by uuid references auth.users (id),
  created_by_household uuid references public.households (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete restrict,
  brand_id uuid references public.brands (id) on delete restrict,
  name_en text,
  name_ar text,
  size_amount double precision check (size_amount > 0),
  size_unit text check (size_unit in ('g', 'kg', 'ml', 'l', 'piece')),
  pack_count integer not null default 1 check (pack_count > 0),
  status text not null default 'pending' check (status in ('approved', 'pending', 'rejected')),
  created_by uuid references auth.users (id),
  created_by_household uuid references public.households (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique nulls not distinct (item_id, brand_id, size_amount, size_unit, pack_count)
);

create table public.product_barcodes (
  id uuid primary key default gen_random_uuid(),
  barcode text not null unique,
  product_id uuid not null references public.products (id) on delete restrict,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name_en text,
  name_ar text,
  type text not null default 'shop' check (type in ('shop', 'market', 'online')),
  area text,
  status text not null default 'pending' check (status in ('approved', 'pending', 'rejected')),
  created_by uuid references auth.users (id),
  created_by_household uuid references public.households (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (coalesce(name_en, name_ar) is not null)
);

-- Shared prices: no household, user or quantity, so nobody can tell who bought what.
-- Filled by a trigger on purchase_lines, never written by phones.
create table public.price_reports (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete restrict,
  product_id uuid references public.products (id) on delete restrict,
  store_id uuid not null references public.stores (id) on delete restrict,
  unit_price bigint not null check (unit_price >= 0),
  currency text not null references public.currencies (code),
  observed_on date not null,
  status text not null default 'approved' check (status in ('approved', 'hidden')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Household layer
-- ---------------------------------------------------------------------------

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  name text not null,
  type text not null default 'other' check (type in ('fridge', 'freezer', 'pantry', 'bathroom', 'laundry', 'other')),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.household_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  item_id uuid not null references public.items (id) on delete restrict,
  min_quantity double precision not null default 0 check (min_quantity >= 0),
  current_level text check (current_level in ('full', 'half', 'low', 'out')),
  shelf_life_days integer check (shelf_life_days > 0),
  location_id uuid references public.locations (id) on delete restrict,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (household_id, item_id)
);

create table public.labels (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  color text not null default 'olive',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.household_item_labels (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  household_item_id uuid not null references public.household_items (id) on delete restrict,
  label_id uuid not null references public.labels (id) on delete restrict,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (household_item_id, label_id)
);

create table public.household_stores (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  store_id uuid not null references public.stores (id) on delete restrict,
  nickname text,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (household_id, store_id)
);

-- ---------------------------------------------------------------------------
-- Money (typed-in income and expenses only: no accounts, cards or balances)
-- ---------------------------------------------------------------------------

create table public.money_categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  type text not null check (type in ('income', 'expense')),
  name text not null check (length(trim(name)) > 0),
  icon text not null default '💰',
  catalog_category_id uuid references public.categories (id) on delete restrict,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  type text not null check (type in ('income', 'expense')),
  amount bigint not null check (amount > 0),
  currency text not null references public.currencies (code),
  money_category_id uuid references public.money_categories (id) on delete restrict,
  note text,
  day_of_month smallint not null check (day_of_month between 1 and 31),
  next_date date not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  store_id uuid references public.stores (id) on delete restrict,
  purchased_at date not null,
  total_amount bigint check (total_amount >= 0),
  currency text not null references public.currencies (code),
  user_id uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  type text not null check (type in ('income', 'expense')),
  amount bigint not null check (amount > 0),
  currency text not null references public.currencies (code),
  -- Original amount and currency are kept; amount_main is the converted value on that day.
  rate_to_main double precision not null default 1 check (rate_to_main > 0),
  amount_main bigint not null check (amount_main >= 0),
  date date not null,
  money_category_id uuid references public.money_categories (id) on delete restrict,
  user_id uuid not null references auth.users (id),
  note text,
  purchase_id uuid references public.purchases (id) on delete restrict,
  recurring_id uuid references public.recurring_rules (id) on delete restrict,
  -- A trip's expense points to the trip (one direction only, so uploads never wait on each other).
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  from_currency text not null references public.currencies (code),
  to_currency text not null references public.currencies (code),
  rate double precision not null check (rate > 0),
  unique (date, from_currency, to_currency)
);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  money_category_id uuid not null references public.money_categories (id) on delete restrict,
  monthly_limit bigint not null check (monthly_limit > 0),
  from_month date not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (household_id, money_category_id, from_month)
);

-- ---------------------------------------------------------------------------
-- Purchases and stock
-- ---------------------------------------------------------------------------

create table public.purchase_lines (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  purchase_id uuid not null references public.purchases (id) on delete restrict,
  item_id uuid references public.items (id) on delete restrict,
  product_id uuid references public.products (id) on delete restrict,
  -- For one-off things that are not in the catalog.
  description text,
  quantity double precision not null check (quantity > 0),
  unit_price bigint check (unit_price >= 0),
  line_total bigint check (line_total >= 0),
  created_at timestamptz not null default now(),
  check (item_id is not null or description is not null)
);

create table public.batches (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  item_id uuid not null references public.items (id) on delete restrict,
  product_id uuid references public.products (id) on delete restrict,
  purchase_line_id uuid references public.purchase_lines (id) on delete restrict,
  purchase_date date not null,
  -- Empty when the printed date is unknown or the item never expires.
  expiry_date date,
  expiry_is_estimated boolean not null default false,
  location_id uuid references public.locations (id) on delete restrict,
  quantity_initial double precision not null check (quantity_initial >= 0),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- What is left in a batch is always the sum of its movements, never a stored number,
-- so two phones changing stock offline can never overwrite each other.
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  batch_id uuid not null references public.batches (id) on delete restrict,
  type text not null check (type in ('purchase', 'use', 'waste', 'correction', 'undo')),
  -- Signed: purchase is positive, use and waste are negative.
  quantity double precision not null check (quantity <> 0),
  user_id uuid not null references auth.users (id),
  reverses_id uuid references public.stock_movements (id) on delete restrict,
  created_at timestamptz not null default now(),
  check (type <> 'undo' or reverses_id is not null)
);

create table public.level_changes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  item_id uuid not null references public.items (id) on delete restrict,
  level text not null check (level in ('full', 'half', 'low', 'out')),
  user_id uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.shopping_list_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  item_id uuid references public.items (id) on delete restrict,
  free_text text,
  quantity double precision check (quantity > 0),
  added_by uuid references auth.users (id),
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (item_id is not null or free_text is not null)
);

-- ---------------------------------------------------------------------------
-- Indexes for the foreign keys used in every household query
-- ---------------------------------------------------------------------------

create index on public.household_members (user_id);
create index on public.items (category_id);
create index on public.products (item_id);
create index on public.household_items (household_id);
create index on public.batches (household_id, item_id);
create index on public.stock_movements (batch_id);
create index on public.stock_movements (household_id);
create index on public.purchase_lines (purchase_id);
create index on public.purchases (household_id, purchased_at);
create index on public.transactions (household_id, date);
create index on public.price_reports (item_id, store_id, observed_on);

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------

-- True when the signed-in user belongs to the household. Security definer so policies
-- on household_members do not recurse into themselves.
create function public.is_member(hh uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hh and m.user_id = auth.uid()
  );
$$;

create function public.is_catalog_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.catalog_role is not null
  );
$$;

-- updated_at on every update
create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['profiles', 'households', 'categories', 'items', 'brands', 'products',
                           'stores', 'household_items', 'transactions', 'recurring_rules'] loop
    execute format('create trigger touch_updated_at before update on public.%I
                    for each row execute function public.touch_updated_at()', t);
  end loop;
end;
$$;

-- A profile for every new user
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, language)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1), ''),
    case when new.raw_user_meta_data ->> 'language' in ('ar', 'en') then new.raw_user_meta_data ->> 'language' else 'ar' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Shared price report for every priced line, without household, user or quantity.
create function public.report_price() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  p record;
begin
  if new.unit_price is null or new.item_id is null then
    return new;
  end if;
  select pu.store_id, pu.currency, pu.purchased_at, h.share_prices
    into p
    from public.purchases pu
    join public.households h on h.id = pu.household_id
   where pu.id = new.purchase_id;
  if p.store_id is not null and p.share_prices then
    insert into public.price_reports (item_id, product_id, store_id, unit_price, currency, observed_on)
    values (new.item_id, new.product_id, p.store_id, new.unit_price, p.currency, p.purchased_at);
  end if;
  return new;
end;
$$;

create trigger report_price
  after insert on public.purchase_lines
  for each row execute function public.report_price();

-- Rows must stay inside one household: a child row cannot point at another household's parent.
create function public.check_same_household() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  parent_household uuid;
begin
  if tg_table_name = 'purchase_lines' then
    select household_id into parent_household from public.purchases where id = new.purchase_id;
  elsif tg_table_name = 'stock_movements' then
    select household_id into parent_household from public.batches where id = new.batch_id;
  elsif tg_table_name = 'household_item_labels' then
    select household_id into parent_household from public.household_items where id = new.household_item_id;
  end if;
  if parent_household is distinct from new.household_id then
    raise exception 'Row belongs to a different household' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger check_same_household before insert or update on public.purchase_lines
  for each row execute function public.check_same_household();
create trigger check_same_household before insert or update on public.stock_movements
  for each row execute function public.check_same_household();
create trigger check_same_household before insert or update on public.household_item_labels
  for each row execute function public.check_same_household();

-- ---------------------------------------------------------------------------
-- Online-only actions (create a household, invite, join)
-- ---------------------------------------------------------------------------

create function public.create_household(p_name text, p_currency text default 'ILS', p_language text default 'ar')
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  hh uuid;
  uid uuid := auth.uid();
  ar boolean := p_language = 'ar';
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  insert into public.households (name, main_currency) values (p_name, p_currency) returning id into hh;

  insert into public.household_members (household_id, user_id, display_name, role)
  select hh, uid, coalesce(p.display_name, ''), 'owner' from public.profiles p where p.id = uid;

  insert into public.labels (household_id, name, color, is_default) values
    (hh, case when ar then 'أساسي' else 'Essential' end, 'olive', true),
    (hh, case when ar then 'إضافي' else 'Extra' end, 'saffron', true);

  insert into public.locations (household_id, name, type) values
    (hh, case when ar then 'الثلاجة' else 'Fridge' end, 'fridge'),
    (hh, case when ar then 'الفريزر' else 'Freezer' end, 'freezer'),
    (hh, case when ar then 'المؤونة' else 'Pantry' end, 'pantry'),
    (hh, case when ar then 'الحمّام' else 'Bathroom' end, 'bathroom'),
    (hh, case when ar then 'الغسيل' else 'Laundry' end, 'laundry');

  insert into public.money_categories (household_id, type, name, icon, sort_order) values
    (hh, 'income', case when ar then 'راتب' else 'Salary' end, '💼', 10),
    (hh, 'income', case when ar then 'دخل آخر' else 'Other income' end, '➕', 20),
    (hh, 'expense', case when ar then 'مشتريات البيت' else 'Home supplies' end, '🛒', 10),
    (hh, 'expense', case when ar then 'إيجار' else 'Rent' end, '🏠', 20),
    (hh, 'expense', case when ar then 'كهرباء وماء' else 'Electricity and water' end, '💡', 30),
    (hh, 'expense', case when ar then 'مواصلات ووقود' else 'Transport and fuel' end, '⛽', 40),
    (hh, 'expense', case when ar then 'صحة' else 'Health' end, '💊', 50),
    (hh, 'expense', case when ar then 'تعليم' else 'Education' end, '📚', 60),
    (hh, 'expense', case when ar then 'اتصالات وإنترنت' else 'Phone and internet' end, '📱', 70),
    (hh, 'expense', case when ar then 'أخرى' else 'Other' end, '🧾', 90);

  return hh;
end;
$$;

-- Short code that is easy to read aloud: no 0/O or 1/I.
create function public.create_invite(p_household uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  new_code text;
  i int;
begin
  if not public.is_member(p_household) then
    raise exception 'Not a member of this household' using errcode = '42501';
  end if;
  loop
    new_code := '';
    for i in 1..6 loop
      new_code := new_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.household_invites where code = new_code);
  end loop;
  insert into public.household_invites (household_id, code, created_by, expires_at)
  values (p_household, new_code, auth.uid(), now() + interval '7 days');
  return new_code;
end;
$$;

create function public.join_household(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  inv public.household_invites;
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select * into inv from public.household_invites
   where code = upper(trim(p_code)) and accepted_by is null and expires_at > now()
   for update;
  if inv.id is null then
    raise exception 'This code is wrong or has expired' using errcode = 'P0002';
  end if;
  insert into public.household_members (household_id, user_id, display_name, role)
  select inv.household_id, uid, coalesce(p.display_name, ''), 'member' from public.profiles p where p.id = uid
  on conflict (household_id, user_id) do nothing;
  update public.household_invites set accepted_by = uid, accepted_at = now() where id = inv.id;
  return inv.household_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Access rules (row-level security)
-- ---------------------------------------------------------------------------

alter table public.currencies enable row level security;
alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
alter table public.categories enable row level security;
alter table public.items enable row level security;
alter table public.brands enable row level security;
alter table public.products enable row level security;
alter table public.product_barcodes enable row level security;
alter table public.stores enable row level security;
alter table public.price_reports enable row level security;
alter table public.locations enable row level security;
alter table public.household_items enable row level security;
alter table public.labels enable row level security;
alter table public.household_item_labels enable row level security;
alter table public.household_stores enable row level security;
alter table public.money_categories enable row level security;
alter table public.recurring_rules enable row level security;
alter table public.purchases enable row level security;
alter table public.transactions enable row level security;
alter table public.exchange_rates enable row level security;
alter table public.budgets enable row level security;
alter table public.purchase_lines enable row level security;
alter table public.batches enable row level security;
alter table public.stock_movements enable row level security;
alter table public.level_changes enable row level security;
alter table public.shopping_list_entries enable row level security;

create policy "anyone reads currencies" on public.currencies for select to authenticated using (true);
create policy "anyone reads exchange rates" on public.exchange_rates for select to authenticated using (true);

create policy "read own profile" on public.profiles for select to authenticated using (id = auth.uid());
create policy "update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "members read household" on public.households for select to authenticated using (public.is_member(id));
create policy "members update household" on public.households for update to authenticated
  using (public.is_member(id)) with check (public.is_member(id));

create policy "members read members" on public.household_members for select to authenticated using (public.is_member(household_id));
create policy "members read invites" on public.household_invites for select to authenticated using (public.is_member(household_id));

-- Catalog: approved rows for everyone; pending rows for the household that added them and for staff.
do $$
declare t text;
begin
  foreach t in array array['categories', 'items', 'brands', 'products', 'stores'] loop
    execute format($f$
      create policy "read catalog" on public.%1$I for select to authenticated
        using (status = 'approved' or public.is_member(created_by_household) or public.is_catalog_staff());
      create policy "add to catalog" on public.%1$I for insert to authenticated
        with check (status = 'pending' and public.is_member(created_by_household) and created_by = auth.uid());
      create policy "edit own pending or staff" on public.%1$I for update to authenticated
        using ((status = 'pending' and public.is_member(created_by_household)) or public.is_catalog_staff())
        with check ((status = 'pending' and public.is_member(created_by_household)) or public.is_catalog_staff());
    $f$, t);
  end loop;
end;
$$;

create policy "read barcodes" on public.product_barcodes for select to authenticated using (true);
create policy "add barcodes" on public.product_barcodes for insert to authenticated with check (created_by = auth.uid());

create policy "read prices" on public.price_reports for select to authenticated using (status = 'approved' or public.is_catalog_staff());
create policy "staff hide prices" on public.price_reports for update to authenticated using (public.is_catalog_staff()) with check (public.is_catalog_staff());

-- Household tables: members read, add and edit; nobody hard-deletes from the app.
do $$
declare t text;
begin
  foreach t in array array['locations', 'household_items', 'labels', 'household_item_labels', 'household_stores',
                           'money_categories', 'recurring_rules', 'purchases', 'transactions', 'budgets',
                           'purchase_lines', 'batches', 'stock_movements', 'level_changes', 'shopping_list_entries'] loop
    execute format($f$
      create policy "members read" on public.%1$I for select to authenticated using (public.is_member(household_id));
      create policy "members add" on public.%1$I for insert to authenticated with check (public.is_member(household_id));
      create policy "members edit" on public.%1$I for update to authenticated
        using (public.is_member(household_id)) with check (public.is_member(household_id));
    $f$, t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: what the signed-in role may touch at all (RLS then filters the rows)
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
grant select on all tables in schema public to authenticated;
grant insert, update on
  public.categories, public.items, public.brands, public.products, public.stores,
  public.locations, public.household_items, public.labels, public.household_item_labels, public.household_stores,
  public.money_categories, public.recurring_rules, public.purchases, public.transactions, public.budgets,
  public.purchase_lines, public.batches, public.stock_movements, public.level_changes, public.shopping_list_entries
  to authenticated;
grant insert on public.product_barcodes to authenticated;
grant update (name, main_currency, money_enabled, share_prices) on public.households to authenticated;
grant update (display_name, language) on public.profiles to authenticated;
grant update (status) on public.price_reports to authenticated;

revoke execute on function public.create_household(text, text, text) from public, anon;
revoke execute on function public.create_invite(uuid) from public, anon;
revoke execute on function public.join_household(text) from public, anon;
grant execute on function public.create_household(text, text, text) to authenticated;
grant execute on function public.create_invite(uuid) to authenticated;
grant execute on function public.join_household(text) to authenticated;

-- ---------------------------------------------------------------------------
-- PowerSync reads changes through this publication (the name must be "powersync").
-- price_reports, invites and fixed lists are not synced to phones.
-- ---------------------------------------------------------------------------

create publication powersync for table
  public.profiles, public.households, public.household_members,
  public.categories, public.items, public.brands, public.products, public.stores,
  public.locations, public.household_items, public.labels, public.household_item_labels, public.household_stores,
  public.money_categories, public.purchases, public.transactions,
  public.purchase_lines, public.batches, public.stock_movements, public.level_changes, public.shopping_list_entries;
