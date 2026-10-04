import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
export const tables = [
  'owners',
  'processes',
  'sessions',
  'events',
  'segments',
  'assets',
  'confirmations',
  'versions',
  'cases',
  'runs',
  'actions',
  'operations',
  'bindings',
  'metrics',
  'proposals',
  'evaluations',
  'optimizations',
] as const;
export type Table = (typeof tables)[number];
export class Store {
  db: DatabaseSync;
  constructor(file = ':memory:') {
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;');
    for (const table of tables)
      this.db.exec(
        `CREATE TABLE IF NOT EXISTS ${table}(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL ${table === 'owners' ? '' : 'REFERENCES owners(id)'}, session_id TEXT ${table === 'owners' ? '' : 'REFERENCES sessions(id) DEFERRABLE INITIALLY DEFERRED'}, payload TEXT NOT NULL CHECK(json_valid(payload))); CREATE INDEX IF NOT EXISTS ${table}_session ON ${table}(session_id);`,
      );
    this.db.exec(
      'CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY); INSERT OR IGNORE INTO schema_migrations VALUES(1); INSERT OR IGNORE INTO schema_migrations VALUES(2); CREATE UNIQUE INDEX IF NOT EXISTS action_idempotency ON actions(owner_id,id);',
    );
  }
  get<T>(table: Table, id: string): T | undefined {
    const row = this.db.prepare(`SELECT payload FROM ${table} WHERE id=?`).get(id) as
      { payload: string } | undefined;
    return row ? JSON.parse(row.payload) : undefined;
  }
  list<T>(table: Table, sessionId?: string): T[] {
    const rows = (
      sessionId
        ? this.db.prepare(`SELECT payload FROM ${table} WHERE session_id=?`).all(sessionId)
        : this.db.prepare(`SELECT payload FROM ${table}`).all()
    ) as { payload: string }[];
    return rows.map((x) => JSON.parse(x.payload));
  }
  put<T extends { id: string }>(table: Table, value: T, ownerId: string, sessionId?: string) {
    this.db
      .prepare(
        `INSERT INTO ${table}(id,owner_id,session_id,payload) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload`,
      )
      .run(value.id, ownerId, sessionId ?? null, JSON.stringify(value));
    return value;
  }
  delete(table: Table, id: string) {
    this.db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id);
  }
  tx<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  close() {
    this.db.close();
  }
}
export const dataDir = resolve(process.env.BLUEPRINT_DATA_DIR || 'data');
let singleton: Store | undefined;
export function getStore() {
  if (!singleton) {
    mkdirSync(dataDir, { recursive: true });
    singleton = new Store(resolve(dataDir, 'blueprint.sqlite'));
  }
  return singleton;
}
