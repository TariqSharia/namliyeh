// Runs the real migration files against an in-process Postgres (PGlite) with a small
// stand-in for Supabase's auth schema, then checks the rules that matter most:
// households stay private, the catalog is shared, prices are shared without the household.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const MIGRATIONS = new URL('../../supabase/migrations/', import.meta.url);

const AUTH_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated;
  grant usage on schema public to authenticated, anon;
  grant execute on function auth.uid() to authenticated;
  -- Same defaults as a Supabase project: new public tables and functions are open to these roles.
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`;

async function freshDb() {
  const db = new PGlite();
  await db.exec(AUTH_STUB);
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(new URL(file, MIGRATIONS), 'utf8'));
  }
  return db;
}

const TARIQ = '11111111-1111-1111-1111-111111111111';
const WIFE = '22222222-2222-2222-2222-222222222222';
const STRANGER = '33333333-3333-3333-3333-333333333333';

async function addUser(db, id, name) {
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
    id,
    `${name}@example.com`,
    JSON.stringify({ display_name: name, language: 'ar' })
  ]);
}

// Run a block as a signed-in user, the way Supabase does: role authenticated + jwt sub.
async function as(db, userId, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

test('migrations apply and seed an approved starter catalog', async () => {
  const db = await freshDb();
  const { rows } = await db.query(`select count(*)::int as n from public.items where status = 'approved'`);
  assert.ok(rows[0].n >= 50, `expected starter items, got ${rows[0].n}`);
  const sub = await db.query(
    `select count(*)::int as n from public.categories where parent_id is not null and status = 'approved'`
  );
  assert.ok(sub.rows[0].n >= 10);
});

test('household is private, catalog is shared, invite lets a member join', async () => {
  const db = await freshDb();
  await addUser(db, TARIQ, 'tariq');
  await addUser(db, WIFE, 'wife');
  await addUser(db, STRANGER, 'stranger');

  const hh = await as(db, TARIQ, async () => {
    const r = await db.query(`select public.create_household('بيتنا', 'ILS', 'ar') as id`);
    return r.rows[0].id;
  });

  // The owner sees the household, its labels and money categories.
  await as(db, TARIQ, async () => {
    const labels = await db.query(`select name from public.labels where household_id = $1 order by name`, [hh]);
    assert.deepEqual(labels.rows.map((r) => r.name).sort(), ['أساسي', 'إضافي'].sort());
  });

  // A stranger sees nothing of it, but does see the shared catalog.
  await as(db, STRANGER, async () => {
    const h = await db.query(`select * from public.households where id = $1`, [hh]);
    assert.equal(h.rows.length, 0);
    const items = await db.query(`select count(*)::int as n from public.items`);
    assert.ok(items.rows[0].n >= 50);
  });

  // Invite and join.
  const code = await as(db, TARIQ, async () => (await db.query(`select public.create_invite($1) as c`, [hh])).rows[0].c);
  assert.match(code, /^[A-Z2-9]{6}$/);
  await as(db, WIFE, async () => {
    await db.query(`select public.join_household($1)`, [code.toLowerCase()]);
    const h = await db.query(`select name from public.households where id = $1`, [hh]);
    assert.equal(h.rows[0].name, 'بيتنا');
  });

  // The same code cannot be used twice.
  await as(db, STRANGER, async () => {
    await assert.rejects(db.query(`select public.join_household($1)`, [code]));
  });
});

test('a priced purchase creates a shared price report without the household', async () => {
  const db = await freshDb();
  await addUser(db, TARIQ, 'tariq');
  await addUser(db, STRANGER, 'stranger');
  const hh = await as(db, TARIQ, async () =>
    (await db.query(`select public.create_household('Home', 'ILS', 'en') as id`)).rows[0].id
  );
  const rice = (await db.query(`select id from public.items where name_en = 'Long-grain rice'`)).rows[0].id;

  await as(db, TARIQ, async () => {
    const store = await db.query(
      `insert into public.stores (name_en, status, created_by, created_by_household) values ('Corner shop', 'pending', $1, $2) returning id`,
      [TARIQ, hh]
    );
    const purchase = await db.query(
      `insert into public.purchases (household_id, store_id, purchased_at, total_amount, currency, user_id)
       values ($1, $2, '2026-10-29', 3200, 'ILS', $3) returning id`,
      [hh, store.rows[0].id, TARIQ]
    );
    await db.query(
      `insert into public.purchase_lines (household_id, purchase_id, item_id, quantity, unit_price, line_total)
       values ($1, $2, $3, 1, 3200, 3200)`,
      [hh, purchase.rows[0].id, rice]
    );
  });

  const reports = await db.query(`select * from public.price_reports`);
  assert.equal(reports.rows.length, 1);
  assert.equal(Number(reports.rows[0].unit_price), 3200);
  assert.ok(!('household_id' in reports.rows[0]), 'price reports must not carry the household');

  // Turning sharing off stops new reports.
  await as(db, TARIQ, async () => {
    await db.query(`update public.households set share_prices = false where id = $1`, [hh]);
  });
});

test('a member cannot write into another household or link across households', async () => {
  const db = await freshDb();
  await addUser(db, TARIQ, 'tariq');
  await addUser(db, STRANGER, 'stranger');
  const hh = await as(db, TARIQ, async () =>
    (await db.query(`select public.create_household('Home') as id`)).rows[0].id
  );
  const strangerHh = await as(db, STRANGER, async () =>
    (await db.query(`select public.create_household('Other') as id`)).rows[0].id
  );
  const rice = (await db.query(`select id from public.items where name_en = 'Long-grain rice'`)).rows[0].id;

  await as(db, STRANGER, async () => {
    await assert.rejects(
      db.query(`insert into public.household_items (household_id, item_id) values ($1, $2)`, [hh, rice]),
      /row-level security/
    );
  });

  // A stock movement in the stranger's household pointing at Tariq's batch is refused.
  const batch = await as(db, TARIQ, async () =>
    (
      await db.query(
        `insert into public.batches (household_id, item_id, purchase_date, quantity_initial, created_by)
         values ($1, $2, '2026-10-29', 1, $3) returning id`,
        [hh, rice, TARIQ]
      )
    ).rows[0].id
  );
  await as(db, STRANGER, async () => {
    await assert.rejects(
      db.query(
        `insert into public.stock_movements (household_id, batch_id, type, quantity, user_id) values ($1, $2, 'use', -1, $3)`,
        [strangerHh, batch, STRANGER]
      )
    );
  });
});

test('users cannot promote themselves to catalog staff or hard-delete rows', async () => {
  const db = await freshDb();
  await addUser(db, TARIQ, 'tariq');
  const hh = await as(db, TARIQ, async () =>
    (await db.query(`select public.create_household('Home') as id`)).rows[0].id
  );
  await as(db, TARIQ, async () => {
    await assert.rejects(db.query(`update public.profiles set catalog_role = 'admin' where id = $1`, [TARIQ]));
    await assert.rejects(db.query(`delete from public.labels where household_id = $1`, [hh]));
    await assert.rejects(db.query(`update public.price_reports set unit_price = 1`));
  });
});

test('the keep-alive ping can read one row and nothing else', async () => {
  const db = await freshDb();
  await addUser(db, TARIQ, 'tariq');
  await db.exec('set role anon;');
  try {
    // The exact query the GitHub Action sends: GET /rest/v1/keepalive?select=id&limit=1
    const { rows } = await db.query(`select id from public.keepalive limit 1`);
    assert.deepEqual(rows, [{ id: 1 }]);
    await assert.rejects(db.query(`insert into public.keepalive (id) values (2)`));
    await assert.rejects(db.query(`update public.keepalive set pinged_at = now()`));
    await assert.rejects(db.query(`delete from public.keepalive`));
  } finally {
    await db.exec('reset role;');
  }
  // Signed-in users have no reason to touch it either.
  await as(db, TARIQ, async () => {
    await assert.rejects(db.query(`select id from public.keepalive`));
  });
  // Never synced to phones.
  const pub = await db.query(`select 1 from pg_publication_tables where pubname = 'powersync' and tablename = 'keepalive'`);
  assert.equal(pub.rows.length, 0);
});

test('a visitor who is not signed in can read nothing', async () => {
  const db = await freshDb();
  await db.exec('set role anon;');
  try {
    await assert.rejects(db.query(`select * from public.items limit 1`));
    await assert.rejects(db.query(`select public.create_household('x')`));
  } finally {
    await db.exec('reset role;');
  }
});
