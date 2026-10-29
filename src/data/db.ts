import { PowerSyncDatabase, WASQLiteVFS } from '@powersync/web';
import { AppSchema } from './schema';

// OPFS keeps the database in the browser's private file storage, which survives
// restarts on both Chrome (Android) and Safari (iPhone).
export const db = new PowerSyncDatabase({
  schema: AppSchema,
  database: {
    dbFilename: 'namliyeh.db',
    vfs: WASQLiteVFS.OPFSCoopSyncVFS,
    enableMultiTabs: typeof SharedWorker !== 'undefined'
  }
});
