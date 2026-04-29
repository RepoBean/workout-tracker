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

        // Cardio in-progress state is one key per (exercise, setNumber);
        // scan-and-delete by the shared prefix so we catch them all.
        const cardioPrefix = getCardioStorageKeyPrefix(sessionId);
        for (const key of Object.keys(localStorage)) {
            if (key.startsWith(cardioPrefix)) {
                localStorage.removeItem(key);
            }
        }
    } catch {
        // ignore — best-effort cleanup
    }
}
