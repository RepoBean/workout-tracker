import { getNavStorageKeys } from '../hooks/useExerciseNavigation';
import { getAdHocStorageKey } from '../hooks/useAdHocExercises';
import {
    getOrderStorageKey,
    getHiddenStorageKey,
} from '../hooks/useExerciseOrdering';
import { getCardioStorageKeyPrefix } from '../components/CardioSetInput';

// HR chart visibility key (per session). The owning storage key — the
// active-session page reads/writes the same key via this exported helper.
export function getHrChartStorageKey(sessionId: number): string {
    return `wt:livehr:visible:${sessionId}`;
}

// SetInput weight/reps overrides — one pair of keys per (exercise, setNumber),
// scoped per session so a dirty override from an abandoned session can't leak
// into the next session of the same exercise and beat fresh hints.
export function getSetInputStorageKeyPrefix(sessionId: number): string {
    return `wt:setinput:${sessionId}:`;
}

export function getSetInputStorageKeys(
    sessionId: number,
    exerciseName: string,
    setNumber: number
): { weight: string; reps: string } {
    const base = `${getSetInputStorageKeyPrefix(sessionId)}${exerciseName.toLowerCase()}:${setNumber}`;
    return { weight: `${base}:weight`, reps: `${base}:reps` };
}

/**
 * One-time migration: remove legacy unscoped SetInput override keys
 * (`set-weight-*` / `set-reps-*`). Called on app start; no-op once gone.
 */
export function sweepLegacySetInputKeys(): void {
    try {
        for (const key of Object.keys(localStorage)) {
            if (key.startsWith('set-weight-') || key.startsWith('set-reps-')) {
                localStorage.removeItem(key);
            }
        }
    } catch {
        // ignore — best-effort cleanup
    }
}

/**
 * Clears all session-scoped localStorage keys for a given sessionId.
 * Call from session completion and from session deletion to keep storage
 * from accumulating stale per-session state.
 */
export function clearSessionLocalState(sessionId: number): void {
    try {
        const navKeys = getNavStorageKeys(sessionId);
        localStorage.removeItem(navKeys.step);
        localStorage.removeItem(navKeys.superset);
        localStorage.removeItem(getAdHocStorageKey(sessionId));
        localStorage.removeItem(getOrderStorageKey(sessionId));
        localStorage.removeItem(getHiddenStorageKey(sessionId));
        localStorage.removeItem(getHrChartStorageKey(sessionId));

        // Cardio in-progress state and SetInput overrides are one key per
        // (exercise, setNumber); scan-and-delete by shared prefix to catch all.
        const prefixes = [
            getCardioStorageKeyPrefix(sessionId),
            getSetInputStorageKeyPrefix(sessionId),
        ];
        for (const key of Object.keys(localStorage)) {
            if (prefixes.some(prefix => key.startsWith(prefix))) {
                localStorage.removeItem(key);
            }
        }
    } catch {
        // ignore — best-effort cleanup
    }
}
