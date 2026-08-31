import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from './apiClient';
import { createRealServices } from './realAdapter';

function clientStub(): ApiClient {
  return {
    get: vi.fn(async () => []), post: vi.fn(async () => undefined), patch: vi.fn(async () => undefined),
    put: vi.fn(async () => undefined), delete: vi.fn(async () => undefined), upload: vi.fn(async () => undefined),
    download: vi.fn(async () => undefined), websocketUrl: vi.fn(() => 'ws://localhost/test'),
  } as ApiClient;
}

describe('real adapter', () => {
  it('maps server reads to the versioned REST contract', async () => {
    const client = clientStub();
    await createRealServices(client).serverService.getServers();
    expect(client.get).toHaveBeenCalledWith('/servers');
  });

  it('normalizes safe file paths before sending them', async () => {
    const client = clientStub();
    await createRealServices(client).fileService.getFiles('server-1', '//world//region');
    expect(client.get).toHaveBeenCalledWith('/servers/server-1/files', { path: '/world/region' });
  });

  it('blocks traversal before making any API call', async () => {
    const client = clientStub();
    const services = createRealServices(client);
    expect(() => services.fileService.getFileContent('server-1', '/%252e%252e/secrets')).toThrow('Path traversal');
    expect(client.get).not.toHaveBeenCalled();
  });
});
