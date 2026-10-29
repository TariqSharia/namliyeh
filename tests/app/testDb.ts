// A stand-in for the phone database: real SQLite (node:sqlite) with the app's own table
// definitions, wrapped in the same small API the app uses (execute, get, getAll, writeTransaction).
import { DatabaseSync } from 'node:sqlite';
import { AppSchema } from '../../src/data/schema';

type Params = unknown[];

export function createTestDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const table of AppSchema.tables) {
    const cols = table.columns.map((c) => `"${c.name}"`).join(', ');
    sqlite.exec(`CREATE TABLE "${table.name}" (id TEXT PRIMARY KEY, ${cols})`);
  }

  const run = (sql: string, params: Params = []) => sqlite.prepare(sql).run(...(params as never[]));
  const all = <T>(sql: string, params: Params = []) => sqlite.prepare(sql).all(...(params as never[])) as T[];

  const api = {
    execute: async (sql: string, params?: Params) => run(sql, params),
    getAll: async <T>(sql: string, params?: Params) => all<T>(sql, params),
    getOptional: async <T>(sql: string, params?: Params) => (all<T>(sql, params)[0] ?? null) as T | null,
    get: async <T>(sql: string, params?: Params) => {
      const row = all<T>(sql, params)[0];
      if (!row) throw new Error(`no row for ${sql}`);
      return row;
    }
  };

  return {
    sqlite,
    ...api,
    writeTransaction: async <T>(fn: (tx: typeof api) => Promise<T>) => {
      sqlite.exec('BEGIN');
      try {
        const result = await fn(api);
        sqlite.exec('COMMIT');
        return result;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
    insert(table: string, row: Record<string, unknown>) {
      const keys = Object.keys(row);
      run(`INSERT INTO "${table}" (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`, Object.values(row));
    }
  };
}

export type TestDb = ReturnType<typeof createTestDb>;
