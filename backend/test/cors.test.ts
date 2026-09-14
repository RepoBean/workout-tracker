import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';

describe('CORS', () => {
  it('allows requests with Origin: https://localhost', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'https://localhost');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://localhost');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('allows requests with Origin: http://localhost', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'http://localhost');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost');
  });

  it('does not reflect unauthorized origins', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'https://unauthorized-domain.com');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
