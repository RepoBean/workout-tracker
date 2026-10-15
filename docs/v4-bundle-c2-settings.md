# v4 Bundle C2: Server-side settings

Status: **shipped to staging + main 2026-10-15 (`133aef8`, code = `9d163b3`); wife pending.** Decisions: all recommendations (§6, Jason 2026-10-15). Written 2026-10-15 at `fc2326c`, from
`docs/v4-plan.md` §2 C2 re-checked against the code that day. Line numbers are from that read.

**Gate:** both vitest suites and `tsc` pass; the new backend tests (§3.4) and frontend sync tests
pass; `api-snapshot` diff on staging before/after is empty (settings are never snapshotted); the
previous image (`7cc9b04`) boots on the migrated DB and ignores the new table; a phone + a browser
on staging show the same HR zones and coach thread.

---

## 1. What it does

- Profile (minus bodyweight), progression settings, coach config (including the API key) and the
  coach thread move to the instance's own server, so the phone and the computer agree.
- localStorage stays as the synchronous cache: everything renders from local first, hydrates from
  the server once per page load, and writes through on change.
- An older backend (rollback) 404s the endpoint and the client quietly keeps using local.
- Theme, timer, server URL, HR strap, the dossier memo and all per-session keys stay per device.

---

## 2. The written case for table 7 (`Settings`)

CLAUDE.md requires one before a new table. The four values are per-device today, so the two
devices Jason uses (Pixel app, desktop browser) **compute different HR zones** from different
profiles, gate the progression hint differently, and **cannot see each other's coach chat**. The
data has no natural home in the six tables: it is per-instance configuration, not training data.
Packing it into an existing row (e.g. a JSON column on Programs) would tie it to a program's
lifecycle and surface it in exports. A key/value table with one row per settings group is the
smallest shape that fits: four rows, no relations, additive, ignored by older images.

This is **not** cloud sync or cross-device resume (CLAUDE.md Scope): the data stays on the
instance's own server, and no in-progress session moves between devices.

---

## 3. Re-check: differences from the plan

| # | Plan said | Code says | This doc |
|---|---|---|---|
| 1 | "the axios client toasts by default", so the 404 must be silenced | `shared/api/client.ts:21-32` only `console.error`s; toasts come from each mutation's `onError` | No toast suppression needed. The sync module uses `api` directly (not `useMutation`) and treats 404 as "no server settings" |
| 2 | Coach thread "saves on every `thread` change" (coach/index.tsx ~67) | Confirmed (`:67-69`). One send changes `thread` twice (user turn, then reply/error) | Server write only when an exchange settles (`busy` false) and on New Chat, so one PUT per exchange and the `updatedAt` chain is never raced by its own writes. localStorage still saves every change |
| 3 | Write through on change | `AiCoachSettingsCard.tsx:22` calls `setSettings` per keystroke (API key, base URL inputs) | Server writes are debounced (~800 ms per key) and flushed on `visibilitychange: hidden`. localStorage stays immediate |
| 4 | Body limit on "that route" | `express.json()` is global (`index.ts:28`) and would 413 a large body before any route parser runs | Mount `/api/settings` with its own `express.json({ limit: '1mb' })` **before** the global parser; mirror in `test/app.ts`. nginx (`nginx.conf`, no `client_max_body_size`) defaults to 1 MB, so a ~300 KB worst-case thread fits |
| 5 | Error handler logs `err.body` | Confirmed (`index.ts:55-58`): `console.error(err)` + 500 | `err.type === 'entity.parse.failed'` → 400, `'entity.too.large'` → 413, log only `err.type`/`err.message` for those |
| 6 | `backup.sh` ~39 / `restore.sh` ~31 hard-code 5 tables | Confirmed (`backup.sh:39`, `restore.sh:31` `need`) | Count lists gain ExerciseCatalog + Settings. `restore.sh`'s *required* set stays the original five, so restoring a pre-C2 backup still works |
| 7 | Seed-staging: blank key + thread | `seed-staging.sh` restores main's backup file directly | Copy the backup to a temp file, blank `aiCoach.apiKey` and delete the `coachThread` row with python3 `sqlite3` on the host, restore the copy. Main's backup file is never modified |
| 8 | Contexts read local in `useState(() => …)` | Confirmed for all three (`UserProfileContext.tsx:30`, `ProgressionContext.tsx:37`, `AiCoachContext.tsx:55`) and `loadThread()` (`coach/index.tsx:47`) | Kept; hydration calls the same setters |

---

## 4. Design

### 4.1 Backend

**Table** (`schema.ts`, migration `0004_settings` via `drizzle-kit generate --name=settings`; the
generated SQL is reviewed and must be `CREATE TABLE IF NOT EXISTS` per v4-plan §3):

```
Settings (key TEXT PRIMARY KEY, value TEXT NOT NULL /* JSON */, createdAt, updatedAt)
```
Dates are `sequelizeDate`, like every other table.

**Router** `routes/settings.ts`, mounted at `/api/settings` with a 1 MB JSON parser ahead of the
global one.

- `GET /api/settings` → `{ profile, progression, aiCoach, coachThread }`, each
  `{ value, updatedAt } | null`. **null = never stored**, no defaults.
- `PUT /api/settings/:key` → body `{ value, baseUpdatedAt? }`. `:key` is a Zod enum via
  `validateParams`; `value` is parsed by that key's schema (unknown fields stripped). Returns the
  stored `{ value, updatedAt }`.
  - `profile`, `progression`, `aiCoach`: last write wins; `baseUpdatedAt` ignored.
  - `coachThread`: `baseUpdatedAt` **required** (`null` = "I expect no row"). Mismatch → 409 with
    the current `{ value, updatedAt }` in the body, so the client reloads without a second GET.
- Value schemas (ranges from `hrZones.ts` `PROFILE_LIMITS`):
  - `profile`: `dob` (`YYYY-MM-DD` | null), `sex` (`male|female|unspecified`), `restingHr`
    (30–100 | null), `maxHrOverride` (100–220 | null). **No `bodyweight`** (stays local; C3).
  - `progression`: `enabled` bool, `incrementLbs` > 0, ≤ 100.
  - `aiCoach`: `enabled`, `provider` (the five ids), `apiKey` (≤ 1000), `model` (≤ 200),
    `baseUrl` (≤ 500).
  - `coachThread`: array ≤ 40 of `{ role: user|assistant, content: string ≤ 100 000, error?: true }`.
- Not in any export, the CSV, `api-snapshot.sh`, or a log line. GET is the only place the key is
  served.

**Error handler** (`index.ts`): §3 #5.

### 4.2 Frontend

Files (placed to match the existing tree rather than a new `shared/settings/` folder):

- `shared/lib/settingsSync.ts`: one module-level `loadServerSettings()` promise (a single GET shared by the three
  contexts and the coach page), `putSetting(key, value, baseUpdatedAt?)`, and the pure
  `reconcile()` below (+ tests). 404 or a network error → `{ available: false }`, never thrown.
- `shared/context/SettingsSyncContext.tsx`: provides the GET result (`useSettingsHydrated()` = settled,
  any outcome) and `useServerBacked`. Mounted above the three settings providers in `main.tsx`.
- `useServerBacked({ key, value, toServer, isDefault, applyServer })`: the hook each context calls.
  On hydrate runs `reconcile` (in a layout effect, before paint); on change debounces a PUT (§3 #3).
- `features/coach/hooks/useThreadSync.ts`: the thread (§4.2 Coach page).
- Settings page: the profile form re-copies the context when it changes, so a page opened before
  hydration can't save pre-hydration values back.

**Reconcile, per key** (the one-time migration plus the rollback/failed-write case, D2):

The client keeps `wt:settings-synced` = `{ [key]: { updatedAt, json } }`, the server copy it last
agreed with. Per device; never sent.

| Server | Local vs. last-synced | Action |
|---|---|---|
| null | — | **Migration:** upload local (if non-default / non-empty), record synced |
| present, `updatedAt` = synced | local equals synced | nothing |
| present, `updatedAt` = synced | local differs | a change the server never got (failed PUT, or made on an old image during a rollback): upload local |
| present, `updatedAt` ≠ synced | — | server wins: apply to local, record synced |
| unavailable (404/offline) | — | use local; try again next page load |

First device wins on migration; the second device's local values, **including a different coach
conversation**, are replaced (accepted in the plan; Jason should expect it on the second device).

- `UserProfileContext`: the server value is merged with the local `bodyweight`; only the four
  synced fields are compared.
- `ProgressionContext`, `AiCoachContext`: whole value.
- `isCoachReady` and the Coach tab (`App.tsx:153`) render from local, so no flicker; a first-ever
  hydrate on a fresh device can make the tab appear a moment after load (accepted).

**Coach page** (`features/coach/index.tsx`):
- Disabled (same "Loading…" line as the dossier) until `hydrated`.
- Thread loads from local, then **fresh** from the server when the page mounts (the page-load GET
  may be old by then) and on `visibilitychange: visible` (skipped while `busy`). Sending waits for
  that first fetch.
- After an exchange settles and on New Chat (= PUT `[]`), PUT with `baseUpdatedAt`. On 409: take
  the server's thread, toast "Coach chat changed on another device — reloaded", and the losing
  exchange is dropped (D3). The dossier pin is untouched by reloads except New Chat.

### 4.3 Scripts

- `backup.sh:39` / `restore.sh` count lists: + `ExerciseCatalog`, `Settings` (counted only if
  present, so pre-C2 backups still validate).
- `seed-staging.sh`: §3 #7.
- `api-snapshot.sh`: unchanged, and a comment saying settings must never be added.

### 4.4 Tests

Backend (`test/settings.test.ts`):
- GET on an empty DB → all four null.
- PUT each key → GET returns it; unknown fields (e.g. `profile.bodyweight`) stripped; bad key 400;
  out-of-range value 400.
- coachThread: missing `baseUpdatedAt` 400; `null` when a row exists → 409 with current; matching
  → 200 and a new `updatedAt`; a 300 KB thread accepted; > 1 MB → 413 (not 500).
- Malformed JSON body on any route → 400, and the body is not logged.
- Migrations test: 7 tables, 5 migrations; the old-image-on-new-DB check still passes.

Frontend (`shared/lib/settingsSync.test.ts`): every row of the reconcile table; 404 → unavailable;
one GET per page load; PUT 409 / other failures.

---

## 5. Compatibility and rollback

- Old frontends/APKs never call `/api/settings`; they keep their localStorage. A B3 phone gets the
  new UI with `ship.sh`, no APK.
- Rollback to `7cc9b04`: the table is ignored; new UI isn't served by it, so devices are back on
  local copies, which write-through has kept current. Changes made during the rollback are pushed
  on roll-forward by the reconcile rule (D2), unless another device changed the same key on the
  server meanwhile (server wins).
- The API key and thread will be in the local and NAS backups.

---

## 6. Decisions (Jason, 2026-10-15: all recommendations taken)

| # | Question | Recommendation |
|---|---|---|
| D1 | `aiCoach.model` per instance or per device? | **Per instance** (the whole `aiCoach` object syncs) |
| D2 | Push local changes the server never saw (failed write, rollback window) using the last-synced marker, or plain "server wins once present"? | **Push them** (the reconcile table above). Small, and it means a gym-Wi-Fi blip never silently loses a settings change |
| D3 | Coach thread conflict (409) | **Reload the server thread, toast, drop the losing exchange** (plan). The user resends |
| D4 | Staging after `seed-staging.sh` | **Blank the API key, delete the thread** (plan). Headless agents on staging already run without a key |

---

## 7. Cross-cutting checks (v4-plan §3)

- New table `CREATE TABLE IF NOT EXISTS`; no column changes; older image ignores it.
- API gains one GET and one PUT; nothing removed.
- Coach memo: no change to what feeds the all-time block (bodyweight stays local) → no
  `ALLTIME_FORMAT_VERSION` bump.
- Docs on ship: CLAUDE.md tables rule ("Six" → seven, citing this doc), schema diagram, API table,
  tree (`routes/settings.ts`, `shared/settings/`, contexts server-backed), Scope line (same-instance
  settings sharing ≠ cloud sync); `v3-plan.md` pointer that v4 reversed "API key browser-only";
  `CHANGELOG.md` row.

---

## 8. Build notes (2026-10-15)

- No Settings-page "clear thread" button exists (the plan's CLAUDE.md line was stale); New Chat is the
  only clear, and it syncs.
- Backend 117 tests, frontend 272.
- Staging checks (2026-10-15): api-snapshot diff empty; malformed JSON → 400, body not logged;
  `7cc9b04` boots on the migrated DB (`/api/settings` 404); headless two-device run: first device
  uploads (bodyweight stripped), second device takes the server copy and keeps its own bodyweight,
  Settings form shows hydrated values, toggle writes through, coach page shows the server thread,
  a stale New Chat 409s and reloads the other device's thread, the retry succeeds. Scrub verified
  on a copy (key absent from the file after VACUUM).

## 9. Build order

1. Backend: schema + migration, router, error handler, tests.
2. `shared/settings/` sync + reconcile tests.
3. Wire the three contexts; Settings page unchanged apart from hydration.
4. Coach page thread sync.
5. Scripts.
6. Docs. Ship staging → seed → check phone + browser → main → wife.
