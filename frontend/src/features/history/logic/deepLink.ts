/**
 * `/history?sessionId=<id>` deep link (dashboard Calendar, session editor's back link).
 *
 * The History list loads only the newest ~50 sessions when highlighting, so an older session
 * is fetched on its own (`GET /sessions/:id`) and shown pinned above the list.
 */

/** The `sessionId` query param as a positive integer id, else undefined. */
export function parseSessionIdParam(raw: string | null): number | undefined {
  if (!raw || !/^\d+$/.test(raw)) return undefined;
  const id = Number(raw);
  return id > 0 ? id : undefined;
}

/**
 * The id to fetch separately: the linked session when the loaded list is in and doesn't
 * contain it. Null while the list is loading, with no link, or when the list has it.
 */
export function sessionToFetch(
  sessionId: number | undefined,
  loaded: readonly { id: number }[] | undefined,
): number | null {
  if (sessionId === undefined || loaded === undefined) return null;
  return loaded.some(s => s.id === sessionId) ? null : sessionId;
}
