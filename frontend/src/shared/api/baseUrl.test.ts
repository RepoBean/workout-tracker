import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeApiBaseUrl,
  getApiBaseUrl,
  setApiBaseUrl,
  API_BASE_URL_STORAGE_KEY,
} from './baseUrl';

describe('normalizeApiBaseUrl', () => {
  it('handles empty or whitespace-only inputs', () => {
    expect(normalizeApiBaseUrl('')).toBe('');
    expect(normalizeApiBaseUrl('   ')).toBe('');
  });

  it('strips leading and trailing whitespace and slashes', () => {
    expect(normalizeApiBaseUrl(' http://x/ ')).toBe('http://x');
    expect(normalizeApiBaseUrl('https://server:8037///')).toBe('https://server:8037');
  });

  it('prefixes http:// if scheme is missing', () => {
    expect(normalizeApiBaseUrl('x')).toBe('http://x');
    expect(normalizeApiBaseUrl('192.168.1.100:8037/')).toBe('http://192.168.1.100:8037');
  });

  it('preserves existing https scheme', () => {
    expect(normalizeApiBaseUrl('https://localhost:8037')).toBe('https://localhost:8037');
  });
});

describe('getApiBaseUrl and setApiBaseUrl', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns empty string when nothing is stored', () => {
    expect(getApiBaseUrl()).toBe('');
  });

  it('stores and retrieves normalized URL', () => {
    setApiBaseUrl(' 192.168.1.50:8037/ ');
    expect(getApiBaseUrl()).toBe('http://192.168.1.50:8037');
    expect(localStorage.getItem(API_BASE_URL_STORAGE_KEY)).toBe('http://192.168.1.50:8037');
  });

  it('removes storage key when set to empty string', () => {
    setApiBaseUrl('http://192.168.1.50:8037');
    expect(getApiBaseUrl()).toBe('http://192.168.1.50:8037');
    setApiBaseUrl('   ');
    expect(getApiBaseUrl()).toBe('');
    expect(localStorage.getItem(API_BASE_URL_STORAGE_KEY)).toBeNull();
  });
});
