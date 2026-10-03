import { describe, expect, it } from 'vitest';
import { describeCoachError } from './errorMessage';

/** Shaped like the Anthropic SDK's APIError: numeric status, body in the message. */
function apiError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status });
}

describe('describeCoachError', () => {
  it('explains a rejected key instead of dumping the response body', () => {
    const err = apiError(
      401,
      '401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}'
    );
    const text = describeCoachError(err);
    expect(text).toBe('The provider rejected your API key (401). Check it in Settings → AI Coach.');
    expect(text).not.toContain('{');
  });

  it('reads the status the OpenAI-compatible adapter writes into the message', () => {
    const err = new Error('Chat request failed (HTTP 401): {"error":{"message":"Incorrect API key"}}');
    expect(describeCoachError(err)).toContain('rejected your API key (401)');
  });

  it('names rate limits and provider outages', () => {
    expect(describeCoachError(apiError(429, '429 {"error":{"message":"slow down"}}'))).toContain('Rate limit');
    expect(describeCoachError(apiError(529, '529 {"error":{"message":"Overloaded"}}'))).toBe(
      'The provider is having trouble (529). Try again shortly.'
    );
  });

  it('pulls the provider sentence out of other error bodies', () => {
    const err = apiError(
      400,
      '400 {"type":"error","error":{"type":"invalid_request_error","message":"model: \\"x\\" not found"}}'
    );
    expect(describeCoachError(err)).toBe('model: "x" not found (400)');
  });

  it('passes plain messages through and survives non-errors', () => {
    expect(describeCoachError(new Error('Connection error.'))).toBe('Connection error.');
    expect(describeCoachError('boom')).toBe('Something went wrong');
  });
});
