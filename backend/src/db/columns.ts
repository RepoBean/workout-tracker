import { customType } from 'drizzle-orm/sqlite-core';

/**
 * Sequelize stored every DATETIME as text in its own format:
 *   "2026-09-11 16:10:29.104 +00:00"
 * Every row in the live databases is in that shape, and the pre-Drizzle image
 * expects it, so this column type reads and WRITES exactly that format. That
 * keeps a database touched by the new image readable by the old one (rollback
 * without a restore) and makes the API output byte-identical (Express serialises
 * the Date as ISO, same as Sequelize did).
 *
 * The format is fixed-width UTC, so text comparison orders correctly — date
 * bounds in queries must go through toStorage() before comparing.
 */
const STORAGE_RE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}\.\d{3}) \+00:00$/;

export function toStorage(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    throw new Error('toStorage: invalid Date');
  }
  const iso = date.toISOString(); // 2026-09-11T16:10:29.104Z
  return `${iso.slice(0, 10)} ${iso.slice(11, 23)} +00:00`;
}

export function fromStorage(value: string): Date {
  const m = STORAGE_RE.exec(value);
  if (m) {
    return new Date(`${m[1]}T${m[2]}Z`);
  }
  // Not one of ours — let V8 have a go (ISO strings etc.) rather than corrupt.
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`fromStorage: unparseable datetime "${value}"`);
  }
  return parsed;
}

export const sequelizeDate = customType<{ data: Date; driverData: string }>({
  dataType() {
    return 'DATETIME';
  },
  toDriver(value: Date): string {
    return toStorage(value);
  },
  fromDriver(value: string): Date {
    return fromStorage(value);
  },
});
