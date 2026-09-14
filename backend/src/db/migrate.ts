import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

/**
 * Startup schema bootstrap, in two stages:
 *
 * 1. legacyColumns() — the pre-Drizzle additive column list. Sequelize's sync()
 *    created the base tables and this list added everything since launch. It is
 *    kept so a database from before mid-2026 still upgrades, and is skipped on a
 *    fresh database (no tables yet) so the baseline can create them whole.
 * 2. drizzle-kit migrations from backend/drizzle/ — 0000 is a CREATE ... IF NOT
 *    EXISTS baseline that is a no-op on an existing database and a full create
 *    on an empty one; everything after it is a real change. Applied ones are
 *    recorded in __drizzle_migrations.
 */

// Resolves to backend/drizzle from both src/db (tsx) and dist/db (node).
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

const LEGACY_COLUMNS: Array<[table: string, columnDef: string]> = [
  ['Sets', 'dropIndex INTEGER NOT NULL DEFAULT 0'],
  ['Sets', 'heartRateAvg INTEGER'],
  ['Sets', 'heartRateMax INTEGER'],
  ['Sets', 'durationSec INTEGER'],
  ['Sets', 'distance DECIMAL(6,2)'],
  ['Sessions', 'heartRateAvg INTEGER'],
  ['Sessions', 'heartRateMin INTEGER'],
  ['Sessions', 'heartRateMax INTEGER'],
  ['Sessions', 'heartRateSeries TEXT'],
  ['Sessions', 'exerciseNotes JSON'],
  ['Exercises', `exerciseType VARCHAR(16) NOT NULL DEFAULT 'strength'`],
  ['Exercises', 'cardioModality VARCHAR(16)'],
  ['Exercises', 'targetDurationSec INTEGER'],
  ['Exercises', 'targetDistance DECIMAL(6,2)'],
];

export function tableExists(sqlite: Database, table: string): boolean {
  const row = sqlite
    .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table);
  return row !== undefined;
}

/**
 * Adds a column via ALTER TABLE if it doesn't already exist.
 * Returns true if the column was added, false if it was already there.
 * Any error other than "duplicate column name" is rethrown — a locked
 * database or bad SQL must fail startup, not be silently skipped.
 */
export function addColumnIfMissing(sqlite: Database, table: string, columnDef: string): boolean {
  try {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('duplicate column name')) {
      return false;
    }
    throw error;
  }
}

export function legacyColumns(sqlite: Database): string[] {
  const added: string[] = [];
  for (const [table, columnDef] of LEGACY_COLUMNS) {
    if (!tableExists(sqlite, table)) continue;
    if (addColumnIfMissing(sqlite, table, columnDef)) {
      added.push(`${table}.${columnDef}`);
    }
  }
  return added;
}

export function bootstrap(sqlite: Database, migrationsFolder = MIGRATIONS_FOLDER): void {
  const added = legacyColumns(sqlite);
  for (const col of added) console.log(`Added legacy column ${col}`);
  migrate(drizzle(sqlite), { migrationsFolder });
}
