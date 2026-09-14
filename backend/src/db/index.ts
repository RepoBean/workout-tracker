import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

// DB_PATH is read at import time (tests set ':memory:' in test/setup.ts before
// any src module loads). Production reads /data/database.sqlite from the volume.
export const sqlite: Database.Database = new Database(process.env.DB_PATH || './database.sqlite');

// The live DDL declares ON DELETE CASCADE / SET NULL; SQLite only honours them
// with this pragma on (per connection). Sequelize turned it on too.
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Current time in the shape every timestamp column stores. */
export const now = () => new Date();
