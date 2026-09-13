// Consistent SQLite snapshot, run INSIDE the backend container:
//   docker exec -i -w /app <backend> node < scripts/lib/snapshot.js
// Uses the app's own `sqlite3` module (no sqlite3 CLI in the image).
// VACUUM INTO produces a transactionally consistent copy while the app keeps
// running. Verifies the copy (integrity_check + table counts) and prints JSON.
const sqlite3 = require('sqlite3');
const fs = require('fs');

const SRC = process.env.SRC || '/data/database.sqlite';
const DEST = process.env.DEST || '/data/.backup-tmp.sqlite';
const TABLES = ['Programs', 'Workouts', 'Exercises', 'Sessions', 'Sets'];

const open = (file, mode) => new Promise((res, rej) => {
  const db = new sqlite3.Database(file, mode, (e) => (e ? rej(e) : res(db)));
});
const run = (db, sql) => new Promise((res, rej) => db.run(sql, (e) => (e ? rej(e) : res())));
const get = (db, sql) => new Promise((res, rej) => db.get(sql, (e, r) => (e ? rej(e) : res(r))));
const close = (db) => new Promise((res, rej) => db.close((e) => (e ? rej(e) : res())));

(async () => {
  try {
    if (fs.existsSync(DEST)) fs.unlinkSync(DEST);
    const src = await open(SRC, sqlite3.OPEN_READONLY);
    await run(src, `VACUUM INTO '${DEST.replace(/'/g, "''")}'`);
    await close(src);

    const copy = await open(DEST, sqlite3.OPEN_READONLY);
    const integrity = (await get(copy, 'PRAGMA integrity_check')).integrity_check;
    const counts = {};
    for (const t of TABLES) counts[t] = (await get(copy, `SELECT COUNT(*) AS c FROM "${t}"`)).c;
    await close(copy);

    const ok = integrity === 'ok';
    console.log(JSON.stringify({ ok, integrity, counts, dest: DEST, bytes: fs.statSync(DEST).size }));
    if (!ok) { fs.unlinkSync(DEST); process.exit(2); }
  } catch (err) {
    console.log(JSON.stringify({ ok: false, error: String(err && err.message || err) }));
    process.exit(1);
  }
})();
