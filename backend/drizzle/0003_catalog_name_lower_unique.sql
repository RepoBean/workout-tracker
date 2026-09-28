-- One catalog row per lift, case-insensitively ("Leg Press" and "leg press" are
-- the same entry). An expression index, which drizzle-kit can't express — same
-- as 0001. Aliases are checked in the merge/split handlers, not by the DB.
CREATE UNIQUE INDEX IF NOT EXISTS `catalog_name_lower` ON `ExerciseCatalog` (lower(`name`));
