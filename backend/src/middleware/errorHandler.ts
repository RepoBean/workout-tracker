import { Request, Response, NextFunction } from 'express';

type HttpError = Error & { type?: string; status?: number };

/**
 * Last-resort error handler. Body-parser failures are the client's fault and carry the
 * raw request on `err.body` (it could hold the coach API key), so they answer 4xx and log
 * only their type, never the error object.
 */
export function errorHandler(err: HttpError, _req: Request, res: Response, _next: NextFunction): void {
  if (err.type === 'entity.parse.failed') {
    console.error('Rejected request: malformed JSON body');
    res.status(400).json({ error: 'Malformed JSON body' });
    return;
  }
  if (err.type === 'entity.too.large') {
    console.error('Rejected request: body too large');
    res.status(413).json({ error: 'Request body too large' });
    return;
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
}
