// Consistent SQLite snapshot, run INSIDE the backend container:
//   docker exec -i -w /app <backend> node < scripts/lib/snapshot.js
// Uses whichever SQLite driver the image ships (no sqlite3 CLI in the image):
// better-sqlite3 (Drizzle images, 2026-09 on) or sqlite3 (Sequelize images).
// Both are needed while instances straddle the swap — backup.sh runs against
// the LIVE container, and the wife stack lags main by days.
// VACUUM INTO produces a transactionally consistent copy while the app keeps
// running. Verifies the copy (integrity_check + table counts) and prints JSON.
const fs = require('fs');

const SRC = process.env.SRC || '/data/database.sqlite';
const DEST = process.env.DEST || '/data/.backup-tmp.sqlite';
const TABLES = ['Programs', 'Workouts', 'Exercises', 'Sessions', 'Sets'];
const vacuumSql = `VACUUM INTO '${DEST.replace(/'/g, "''")}'`;

function tryRequire(name) {
  try { return require(name); } catch { return null; }
}

// ---- better-sqlite3 (synchronous) ----
function withBetterSqlite(Database) {
  const src = new Database(SRC, { readonly: true });
  src.exec(vacuumSql);
  src.close();

  const copy = new Database(DEST, { readonly: true });
  const integrity = copy.pragma('integrity_check', { simple: true });
  const counts = {};
  for (const t of TABLES) counts[t] = copy.prepare(`SELECT COUNT(*) AS c FROM "${t}"`).get().c;
  copy.close();
  return { integrity, counts, driver: 'better-sqlite3' };
}

// ---- sqlite3 (callback API) ----
async function withSqlite3(sqlite3) {
  const open = (file, mode) => new Promise((res, rej) => {
    const db = new sqlite3.Database(file, mode, (e) => (e ? rej(e) : res(db)));
  });
  const run = (db, sql) => new Promise((res, rej) => db.run(sql, (e) => (e ? rej(e) : res())));
  const get = (db, sql) => new Promise((res, rej) => db.get(sql, (e, r) => (e ? rej(e) : res(r))));
  const close = (db) => new Promise((res, rej) => db.close((e) => (e ? rej(e) : res())));

  const src = await open(SRC, sqlite3.OPEN_READONLY);
  await run(src, vacuumSql);
  await close(src);

  const copy = await open(DEST, sqlite3.OPEN_READONLY);
  const integrity = (await get(copy, 'PRAGMA integrity_check')).integrity_check;
  const counts = {};
  for (const t of TABLES) counts[t] = (await get(copy, `SELECT COUNT(*) AS c FROM "${t}"`)).c;
  await close(copy);
  return { integrity, counts, driver: 'sqlite3' };
}

(async () => {
  try {
    if (fs.existsSync(DEST)) fs.unlinkSync(DEST);

    const better = tryRequire('better-sqlite3');
    const legacy = better ? null : tryRequire('sqlite3');
    if (!better && !legacy) throw new Error('neither better-sqlite3 nor sqlite3 is installed in this image');

    const { integrity, counts, driver } = better ? withBetterSqlite(better) : await withSqlite3(legacy);

    const ok = integrity === 'ok';
    console.log(JSON.stringify({ ok, integrity, counts, driver, dest: DEST, bytes: fs.statSync(DEST).size }));
    if (!ok) { fs.unlinkSync(DEST); process.exit(2); }
  } catch (err) {
    console.log(JSON.stringify({ ok: false, error: String(err && err.message || err) }));
    process.exit(1);
  }
})();
