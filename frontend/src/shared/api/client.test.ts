import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from './client';
import * as baseUrlModule from './baseUrl';
import type { InternalAxiosRequestConfig, AxiosResponse } from 'axios';

describe('api client interceptor', () => {
  beforeEach(() => {
    vi.spyOn(baseUrlModule, 'getApiBaseUrl').mockReturnValue('http://stored-server:8037');
  });

  it('preserves per-request baseURL if custom', async () => {
    let capturedBaseUrl: string | undefined;
    await api.get('/health', {
      baseURL: 'http://custom-server:8037/api',
      adapter: async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
        capturedBaseUrl = config.baseURL;
        return {
          data: { status: 'ok' },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      },
    });

    expect(capturedBaseUrl).toBe('http://custom-server:8037/api');
  });

  it('substitutes getApiBaseUrl() + /api when baseURL is default /api', async () => {
    let capturedBaseUrl: string | undefined;
    await api.get('/health', {
      baseURL: '/api',
      adapter: async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
        capturedBaseUrl = config.baseURL;
        return {
          data: { status: 'ok' },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      },
    });

    expect(capturedBaseUrl).toBe('http://stored-server:8037/api');
  });

  it('substitutes getApiBaseUrl() + /api when baseURL is not specified', async () => {
    let capturedBaseUrl: string | undefined;
    await api.get('/health', {
      adapter: async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
        capturedBaseUrl = config.baseURL;
        return {
          data: { status: 'ok' },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      },
    });

    expect(capturedBaseUrl).toBe('http://stored-server:8037/api');
  });
});
