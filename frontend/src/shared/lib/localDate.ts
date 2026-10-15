/**
 * Local calendar date as YYYY-MM-DD. Never UTC: the API sends ISO `…Z`
 * timestamps, and slicing those puts an evening session on tomorrow.
 */
export function localDateKey(value: Date | string): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
