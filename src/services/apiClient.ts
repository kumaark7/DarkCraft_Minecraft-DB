export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

type Query = Record<string, string | number | boolean | undefined>;

export interface ApiClient {
  get<T>(path: string, query?: Query): Promise<T>;
  post<T = void>(path: string, body?: unknown): Promise<T>;
  patch<T = void>(path: string, body?: unknown): Promise<T>;
  put<T = void>(path: string, body?: unknown, query?: Query): Promise<T>;
  delete<T = void>(path: string, body?: unknown, query?: Query): Promise<T>;
  upload<T = void>(path: string, file: File, query?: Query): Promise<T>;
  download(path: string, filename?: string, query?: Query): Promise<void>;
  websocketUrl(path: string): string;
}

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in payload) return (payload as { data: T }).data;
  return payload as T;
}

export function createApiClient(baseUrl: string, fetcher: typeof fetch = fetch): ApiClient {
  const url = (endpoint: string, query?: Query) => {
    const absolute = /^https?:\/\//.test(baseUrl);
    const target = new URL(`${baseUrl}${endpoint}`, absolute ? undefined : window.location.origin);
    for (const [key, value] of Object.entries(query ?? {})) if (value !== undefined) target.searchParams.set(key, String(value));
    return absolute ? target.toString() : `${target.pathname}${target.search}`;
  };
  const request = async <T>(method: string, endpoint: string, payload?: unknown, query?: Query): Promise<T> => {
    const response = await fetcher(url(endpoint, query), {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: payload === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      throw new ApiError(response.status, error?.error?.message ?? `API request failed (${response.status})`);
    }
    if (response.status === 204) return undefined as T;
    return unwrap<T>(await response.json());
  };
  const upload = async <T>(endpoint: string, file: File, query?: Query): Promise<T> => {
    const form = new FormData(); form.set('file', file);
    const response = await fetcher(url(endpoint, query), { method: 'POST', body: form, credentials: 'same-origin' });
    if (!response.ok) throw new ApiError(response.status, `Upload failed (${response.status})`);
    return unwrap<T>(await response.json());
  };
  const download = async (endpoint: string, filename?: string, query?: Query) => {
    const response = await fetcher(url(endpoint, query), { credentials: 'same-origin' });
    if (!response.ok) throw new ApiError(response.status, `Download failed (${response.status})`);
    const objectUrl = URL.createObjectURL(await response.blob()); const anchor = document.createElement('a');
    anchor.href = objectUrl; anchor.download = filename ?? 'download'; anchor.click(); URL.revokeObjectURL(objectUrl);
  };
  return {
    get: (endpoint, query) => request('GET', endpoint, undefined, query),
    post: (endpoint, payload) => request('POST', endpoint, payload),
    patch: (endpoint, payload) => request('PATCH', endpoint, payload),
    put: (endpoint, payload, query) => request('PUT', endpoint, payload, query),
    delete: (endpoint, payload, query) => request('DELETE', endpoint, payload, query),
    upload,
    download,
    websocketUrl(endpoint) {
      const httpUrl = new URL(`${baseUrl}${endpoint}`, window.location.origin);
      httpUrl.protocol = httpUrl.protocol === 'https:' ? 'wss:' : 'ws:';
      return httpUrl.toString();
    },
  };
}
