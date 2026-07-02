import type { Sequelize } from 'sequelize';

/**
 * Adds a column via ALTER TABLE if it doesn't already exist.
 * Returns true if the column was added, false if it was already there.
 * Any error other than "duplicate column name" is rethrown — a locked
 * database or bad SQL must fail startup, not be silently skipped.
 */
export async function addColumnIfMissing(
  sequelize: Sequelize,
  table: string,
  columnDef: string
): Promise<boolean> {
  try {
    await sequelize.query(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('duplicate column name')) {
      return false;
    }
    throw error;
  }
}

// Columns added after the original sequelize.sync() table creation.
// sync() only creates missing tables — it never alters existing ones —
// so every schema addition since launch lives here.
const COLUMN_MIGRATIONS: Array<[table: string, columnDef: string]> = [
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

export async function runMigrations(sequelize: Sequelize): Promise<void> {
  for (const [table, columnDef] of COLUMN_MIGRATIONS) {
    const added = await addColumnIfMissing(sequelize, table, columnDef);
    if (added) {
      console.log(`Added column to ${table}: ${columnDef}`);
    }
  }
}
