# Namliyeh (النملية)

Named after the old Palestinian kitchen cupboard with a mesh door that kept food fresh and safe. A household app for supplies and money, shared by a family across Android and iPhone, in Arabic and English, and usable offline.

- **We bought**: record a shopping trip in a few taps. Stock goes up, expiry dates are set, and one expense is logged.
- **We used**: one tap per thing finished or thrown away, with Undo on every action.
- **To buy**: things below their minimum, items running low, and anything added by hand.
- **Use soon**: what expires in the next few days.
- **Money**: income and expenses typed in by hand, in shekel, dinar, dollar or euro, with monthly totals by category and person. No bank or card data, ever.

Status: early development.

## How it is built

| Part | Choice |
| --- | --- |
| App | React, Vite and TypeScript, installed as a PWA (no app store) |
| Database | Postgres on Supabase, with row-level security per household |
| Offline sync | PowerSync: a SQLite copy on each phone, synced with Postgres |
| Hosting | Cloudflare Pages |

Rules the code follows:

- Calculations (stock, shopping list, expiry, money totals) are SQL on the phone, so they work offline: `src/data/queries.ts`.
- Every write goes through one file and one local transaction: `src/data/actions.ts`.
- Stock is never stored as a number; it is the sum of a movement log, so two phones offline never overwrite each other.
- Shared catalog, private households. Prices are shared without any household, user or quantity.
- Money is stored in the currency's smallest unit (agorot, fils, cents), with the original currency and rate kept per entry.

## Run it

See [SETUP.md](SETUP.md) for the one-time setup. Then:

```bash
npm install
npm run dev
```

## Tests

```bash
npm test
```

- `tests/db`: the real migrations in an in-process Postgres: privacy between households, invites, price sharing.
- `tests/app`: the real actions and SQL against SQLite: buying, using the earliest-expiring batch first, undo, corrections, the shopping list, expiry, currencies, monthly reports, and that every text exists in both languages.

## Roadmap

- [x] Data model, migrations and access rules
- [x] Buy, use, shopping list, expiring soon, corrections, labels
- [x] Income and expenses with monthly reports
- [x] Arabic and English, right to left
- [x] Offline with sync
- [ ] Barcode scanning
- [ ] Recurring entries and budgets
- [ ] Price comparison between shops
- [ ] Catalog review screen for reviewers
