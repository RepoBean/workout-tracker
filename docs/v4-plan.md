# Workout Tracker v4: plan and decision record

Written 2026-10-12 at commit `1b3232b`, after a read-through of openGym
(<https://github.com/DuarteSantos8/openGym>, v1.4.1) and the discussion that followed. Same rules as
`v3-plan.md`: this copy is canonical, tick the boxes as bundles ship, and plan one bundle at a time.

openGym is **AGPL-3.0**. Ideas only: no code, mappings, catalog or media copied from it.

---

## 0. How to resume

1. `git log --oneline 1b3232b..HEAD`: see what has shipped since.
2. Find the first unchecked bundle in §2 and write its `docs/v4-bundle-*.md` before building it.
3. Every bundle ships staging → main → wife on the same commit, with a `CHANGELOG.md` row.

---

## 1. Decisions (2026-10-12)

| Topic | Decision |
|---|---|
| Quick wins (wake lock, timer screen flash, swipe-to-copy set, undo on delete) | **Declined.** Do not re-propose. |
| Measurements, progress photos | **Out.** The bodyweight log is weight only. |
| Old combined-dumbbell history | **Bulk fix, reviewed.** Claude lists every affected set with its proposed weight (halved ranges, plus Pull-Up 2026-09-18/09-26 +40 → −40). Jason approves the list. Applied through the API after `scripts/backup.sh main`. |
| Logged past workouts and the rotation | **Never advance** `currentWorkoutIndex`. |
| Bodyweight entry | From the bodyweight chart in Progress. Settings shows the latest weigh-in. |
| Muscle tags | **Optional, never required.** Adding an exercise stays name + sets/reps. Tags auto-fill from free-exercise-db (public domain) when the name matches, and can be edited in Settings → Exercise catalog. |
| Progression presets (5×5, Greyskull) | Low priority, at the end of C5 or cut. |
| Wife instance | Gets everything, a few days after main as usual. |
| Health Connect | Last. It is the only bundle that needs an APK release. |

---

## 2. Bundles, in order

### [ ] C1: History editing + logging past workouts
- History → open a session → edit mode: change weight/reps/RPE, add or delete sets, change the date.
  The set PUT/POST/DELETE endpoints already exist; the date edit needs one new optional field.
- "Log a past workout": pick a date, start blank or from a program workout (reuse the ad-hoc
  picker), enter sets, save as completed. Never advances the rotation.
- Then do the reviewed bulk dumbbell/Pull-Up correction (§1).
- No new table. The API only gains fields.
- Open points for the bundle doc: how a backdated session sorts against same-day sessions; whether
  editing a completed session's sets should keep its HR fields (yes, unless sets are deleted).

### [ ] C2: Bodyweight log
- New `BodyWeights` table (id, date, weight lbs, createdAt, updatedAt). **This is table 7**, so the
  written case goes in its bundle doc first. The case: one profile value, kept in localStorage, is
  per device (app ≠ web) and rewrites every past assisted-lift 1RM whenever it changes.
- `effectiveWeight()` takes the latest weigh-in on or before the set's date, else the profile value.
- Progress: bodyweight chart + "log weigh-in". Coach dossier: weight trend line.

### [ ] C3: Activity heatmap
- Progress tab: a year of days (Sun-start weeks, like the rest of the app), shaded by that day's
  volume (effective weight × reps). Tap a day to open the session.
- Weekly volume trend under it, so growth is explicit, not just a guess from shading.
- No schema change. It comes after C1/C2 so its volume reads corrected weights.

### [ ] C4: Muscle analytics
- `muscles` JSON column (primary/secondary) on **ExerciseCatalog**, so a lift is tagged once and
  aliases/renames inherit it. Additive column: a CHANGELOG row plus a migration.
- One-off seed from free-exercise-db for name matches, shown to Jason for review before applying.
- Progress + coach: weekly sets per muscle, plus a flag for muscles untrained 14+ days. Untagged
  lifts still count in volume/heatmap, just not per muscle. A body-map SVG is later and optional.

### [ ] C5: Progression schemes
- Per-exercise `progressionScheme` column on Exercises (default `double` = today's behaviour).
- Add `linear` and stall-triggered deload (the stall rule from `shared/lib/liftTrend.ts`).
  The rep/weight `reason` string stays.
- Optional at the end: 5×5 / Greyskull presets.

### [ ] C6: Health Connect write (Android)
- On complete, write the session record plus heart-rate records from `heartRateSeries`, with the
  session id as the record id, so an edit or backdate (C1) replaces the record.
- Behind `isNativeApp()`, with permissions in Settings → Android. No backend change. Needs
  `scripts/release-apk.sh`.
