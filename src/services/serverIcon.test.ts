import { describe, expect, it, vi } from 'vitest';
import { createRealServices } from './realAdapter';
import type { ApiClient } from './apiClient';

describe('server icon adapter', () => {
  it('uses the authenticated server-specific API rather than external icon metadata', async () => {
    const get = vi.fn(async () => 'data:image/png;base64,fixture');
    const client = { get } as unknown as ApiClient;
    expect(await createRealServices(client).serverService.getServerIcon('server-1')).toBe('data:image/png;base64,fixture');
    expect(get).toHaveBeenCalledWith('/servers/server-1/icon');
    expect(() => createRealServices(client).serverService.getServerIcon('../other')).toThrow();
    expect(get).toHaveBeenCalledTimes(1);
  });
});
