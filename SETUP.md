# Setup guide

Follow these steps once. They take about 30 minutes. Every service is on its free plan; none needs a card.
Never paste keys or passwords into a chat. They go only where this guide says.

## 1. Supabase: the database

1. In your Supabase project, open **SQL Editor** → **New query**.
2. Open `supabase/migrations/20261029000000_initial_schema.sql` from this repo, copy all of it into the editor, and press **Run**. It should say "Success. No rows returned".
3. New query again: copy all of `supabase/migrations/20261029000100_starter_catalog.sql`, press **Run**. This adds about 55 starter items in Arabic and English.
4. New query again, for PowerSync's read-only user. Replace `CHOOSE_A_LONG_PASSWORD` with a long password you make up (save it in your password manager), then **Run**:

   ```sql
   create role powersync_role with replication bypassrls login password 'CHOOSE_A_LONG_PASSWORD';
   grant select on all tables in schema public to powersync_role;
   ```

5. Open **Authentication** → **URL Configuration**:
   - **Site URL**: your Cloudflare address once you have it (step 4), for example `https://namliyeh.pages.dev`.
   - **Redirect URLs**: add the same address, and `http://localhost:5173` for testing on your computer.
6. Open **Project Settings** → **API keys** and keep this tab open: you need the **Project URL** and the **publishable key** (starts with `sb_publishable_`).

## 2. PowerSync: offline sync

1. In the PowerSync dashboard, create a project and an instance (Free plan, region near Frankfurt).
2. **Database Connection**: choose Postgres (or the Supabase option if shown). Use:
   - Host: `db.<your-project-ref>.supabase.co`, port `5432`, database `postgres`
   - Username `powersync_role` and the password from step 1.4
   - SSL mode: keep `verify-full`

   Press **Test connection**, then save.
3. **Client Auth**: tick **Use Supabase Auth** and save. Leave the JWT secret empty unless the screen asks for it.
4. **Sync Streams**: replace the editor content with all of `powersync/sync-config.yaml`, press **Validate**, then **Deploy**.
5. Press **Connect** (top of the instance) and copy the **instance URL**.

## 3. Try it on your computer (optional)

In PowerShell, inside the repo folder:

```powershell
Copy-Item .env.example .env.local
```

Open `.env.local` and fill in the three values (Supabase URL, publishable key, PowerSync URL). Then:

```powershell
npm install
```

```powershell
npm run dev
```

Open `http://localhost:5173`.

## 4. Cloudflare Pages: the app's address

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**, and pick the `namliyeh` repository.
2. Build settings:
   - Framework preset: **None**
   - Build command: `npm run build`
   - Build output directory: `dist`
3. **Environment variables** (Production): add
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_POWERSYNC_URL`
   - `NODE_VERSION` = `22`
4. **Save and deploy**. You get an address like `https://namliyeh.pages.dev` (if that name is taken, Cloudflare adds a few letters; use the address it gives you). Put it into Supabase (step 1.5).

Every push to GitHub publishes a new version, and the phones update themselves the next time the app opens.

## 5. Install on both phones

- **Android (Chrome)**: open the address → menu **⋮** → **Install app** (or **Add to Home screen**).
- **iPhone (Safari only)**: open the address → **Share** → **Add to Home Screen**. It must be Safari; other iPhone browsers cannot install it.

Open it from the home screen icon, not from the browser, so it keeps its data like an app.

## 6. The offline test (do this first)

1. You: create an account, then **Start a new home**.
2. You: **Settings** → **Invite family** → share the code.
3. Your wife: create her account → **Join my family's home** → type the code.
4. Both phones online: you record a purchase. Within seconds it should appear on her phone.
5. Your phone in **airplane mode**: record a purchase and mark something used. The top corner says "Offline".
6. Turn airplane mode off. Within seconds both changes appear on her phone.

If step 4 or 6 fails, send me the message from **Settings → Not saved** (if any) and what you saw.

## Optional later: Google sign-in

Needs a Google Cloud OAuth client. Supabase → **Authentication** → **Sign In / Providers** → **Google** walks you through it. Email and password work without it.
