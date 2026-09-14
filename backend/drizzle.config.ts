import { defineConfig } from 'drizzle-kit';

// `npx drizzle-kit generate` diffs src/db/schema.ts against drizzle/meta and
// writes a new SQL migration. `--custom --name=<x>` writes an empty one to fill
// in by hand (used for the expression index drizzle-kit can't express).
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DB_PATH ?? './database.sqlite' },
});
