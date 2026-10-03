/**
 * Turn a failed coach request into one readable line for the chat bubble.
 *
 * The provider SDKs put the raw response body in `Error.message`
 * (`401 {"type":"error","error":{...}}`), which is noise on a phone. Status comes from
 * `err.status` (Anthropic SDK) or the "HTTP 401" the OpenAI-compatible adapter writes.
 */
export function describeCoachError(err: unknown): string {
  if (!(err instanceof Error)) return 'Something went wrong';

  const raw = err.message || '';
  const statusField = (err as { status?: unknown }).status;
  const status =
    typeof statusField === 'number'
      ? statusField
      : Number(/^(\d{3})\b/.exec(raw)?.[1] ?? /\bHTTP (\d{3})\b/.exec(raw)?.[1] ?? NaN);

  if (status === 401 || status === 403) {
    return `The provider rejected your API key (${status}). Check it in Settings → AI Coach.`;
  }
  if (status === 429) {
    return 'Rate limit or quota reached (429). Wait a moment and try again.';
  }
  if (status >= 500) {
    return `The provider is having trouble (${status}). Try again shortly.`;
  }

  // Anything else: prefer the provider's own sentence over the JSON around it.
  const nested = /"message"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(raw)?.[1];
  if (nested) {
    const text = nested.replace(/\\"/g, '"').replace(/\\n/g, ' ');
    return Number.isFinite(status) ? `${text} (${status})` : text;
  }
  return raw || 'Something went wrong';
}
