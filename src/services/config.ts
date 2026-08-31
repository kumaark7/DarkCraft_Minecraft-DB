export type DataSource = 'mock' | 'real';

export interface ServiceConfig {
  dataSource: DataSource;
  apiBaseUrl: string;
}

export function normalizeApiBaseUrl(value = '/api/v1'): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) throw new Error('VITE_API_BASE_URL cannot be empty');
  if (trimmed.startsWith('/')) return trimmed;
  const url = new URL(trimmed);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('VITE_API_BASE_URL must be an HTTP(S) origin/path without credentials, query, or fragment');
  }
  return url.toString().replace(/\/$/, '');
}

export function resolveServiceConfig(env: ImportMetaEnv = import.meta.env): ServiceConfig {
  const source = env.VITE_DATA_SOURCE?.trim() || 'mock';
  if (source !== 'mock' && source !== 'real') throw new Error(`Unsupported VITE_DATA_SOURCE: ${source}`);
  return { dataSource: source, apiBaseUrl: normalizeApiBaseUrl(env.VITE_API_BASE_URL) };
}
