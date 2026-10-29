// Connects the phone's local database to Supabase (sign-in and uploads) and PowerSync (downloads).
import {
  type AbstractPowerSyncDatabase,
  type CrudEntry,
  type PowerSyncBackendConnector,
  type PowerSyncCredentials,
  UpdateType
} from '@powersync/web';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const config = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  supabaseKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined,
  powersyncUrl: import.meta.env.VITE_POWERSYNC_URL as string | undefined
};

export const isConfigured =
  import.meta.env.VITE_DEMO === '1' || Boolean(config.supabaseUrl && config.supabaseKey && config.powersyncUrl);

export const supabase: SupabaseClient = createClient(
  config.supabaseUrl ?? 'http://localhost',
  config.supabaseKey ?? 'missing',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
);

// Postgres answers that retrying will never fix: bad data, broken rules, no permission.
const FATAL = [/^22...$/, /^23...$/, /^42501$/, /^PGRST/];

export class Connector implements PowerSyncBackendConnector {
  async fetchCredentials(): Promise<PowerSyncCredentials | null> {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) return null;
    return { endpoint: config.powersyncUrl!, token: data.session.access_token };
  }

  // Sends queued local changes to Supabase in the order they were made, so a trip is
  // uploaded before its lines, and a batch before its movements.
  async uploadData(db: AbstractPowerSyncDatabase): Promise<void> {
    const tx = await db.getNextCrudTransaction();
    if (!tx) return;

    let current: CrudEntry | null = null;
    try {
      for (const op of tx.crud) {
        current = op;
        const table = supabase.from(op.table);
        const result =
          op.op === UpdateType.PUT
            ? await table.upsert({ ...op.opData, id: op.id })
            : op.op === UpdateType.PATCH
              ? await table.update(op.opData ?? {}).eq('id', op.id)
              : await table.delete().eq('id', op.id);
        if (result.error?.code === '23505' && op.table === 'household_items') {
          // Both phones set up the same item while offline: the other phone's row already
          // won. Skip only this row; the rest of the trip still uploads.
          continue;
        }
        if (result.error) throw result.error;
      }
      await tx.complete();
    } catch (err) {
      const code = (err as { code?: unknown }).code;
      if (typeof code === 'string' && FATAL.some((re) => re.test(code)) && current) {
        // Keep the refused change on the phone so the user sees it, then move on
        // instead of blocking every later change behind it.
        await db.execute(
          `INSERT INTO upload_errors (id, table_name, row_id, op, data, message, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            crypto.randomUUID(),
            current.table,
            current.id,
            current.op,
            JSON.stringify(current.opData ?? {}),
            String((err as { message?: unknown }).message ?? code),
            new Date().toISOString()
          ]
        );
        await tx.complete();
        return;
      }
      // Network or server hiccup: PowerSync retries later.
      throw err;
    }
  }
}
