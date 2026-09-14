-- Expression index for the case-insensitive exercise-name lookups
-- (/sessions/:id/previous, /exercises/history-by-name, /exercises/all-sets-by-name).
-- Invisible to the app and harmless to the pre-Drizzle image.
CREATE INDEX IF NOT EXISTS `sets_exercise_name_lower` ON `Sets` (lower(`exerciseName`));
