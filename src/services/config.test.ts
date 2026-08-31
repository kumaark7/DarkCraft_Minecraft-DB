import { describe, expect, it } from 'vitest';
import { normalizeApiBaseUrl, resolveServiceConfig } from './config';

describe('service configuration', () => {
  it('defaults safely to mock mode', () => {
    expect(resolveServiceConfig({} as ImportMetaEnv)).toEqual({ dataSource: 'mock', apiBaseUrl: '/api/v1' });
  });

  it('accepts explicit real mode and a trusted HTTP base URL', () => {
    expect(resolveServiceConfig({ VITE_DATA_SOURCE: 'real', VITE_API_BASE_URL: 'https://dashboard.example/api/v1/' } as ImportMetaEnv)).toEqual({ dataSource: 'real', apiBaseUrl: 'https://dashboard.example/api/v1' });
  });

  it.each(['ftp://example.test/api', 'https://user:secret@example.test/api', 'https://example.test/api?token=x'])('rejects unsafe API base %s', (value) => {
    expect(() => normalizeApiBaseUrl(value)).toThrow();
  });
});
