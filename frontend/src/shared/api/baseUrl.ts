export const API_BASE_URL_STORAGE_KEY = 'wt:api-base-url';

/**
 * Normalizes an API base URL:
 * - Strips leading and trailing whitespace
 * - If empty, returns '' (meaning same origin)
 * - Prepends 'http://' if no scheme is specified
 * - Removes trailing slashes
 */
export function normalizeApiBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  let withScheme = trimmed;
  if (!/^https?:\/\//i.test(withScheme)) {
    withScheme = `http://${withScheme}`;
  }

  return withScheme.replace(/\/+$/, '');
}

/**
 * Returns the stored API base URL origin or '' (same-origin).
 */
export function getApiBaseUrl(): string {
  try {
    const val = localStorage.getItem(API_BASE_URL_STORAGE_KEY);
    if (!val) return '';
    return normalizeApiBaseUrl(val);
  } catch {
    return '';
  }
}

/**
 * Stores the normalized API base URL in localStorage, or removes it if empty.
 */
export function setApiBaseUrl(url: string): void {
  const normalized = normalizeApiBaseUrl(url);
  try {
    if (!normalized) {
      localStorage.removeItem(API_BASE_URL_STORAGE_KEY);
    } else {
      localStorage.setItem(API_BASE_URL_STORAGE_KEY, normalized);
    }
  } catch {
    // Ignore storage errors
  }
}
