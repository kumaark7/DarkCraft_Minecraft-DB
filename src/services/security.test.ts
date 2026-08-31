import { describe, expect, it } from 'vitest';
import { assertServerId, normalizeServerPath, UnsafePathError } from './security';

describe('frontend server path security', () => {
  it.each([
    ['/', '/'],
    ['/world/region', '/world/region'],
    ['//plugins//config.yml', '/plugins/config.yml'],
  ])('normalizes %s', (input, expected) => expect(normalizeServerPath(input)).toBe(expected));

  it.each(['../secret', '/world/../secret', '/%2e%2e/secret', '/%252e%252e/secret', '..\\secret', '/bad%00name'])('rejects traversal path %s', (input) => {
    expect(() => normalizeServerPath(input)).toThrow(UnsafePathError);
  });

  it('accepts opaque server identifiers and rejects path-like identifiers', () => {
    expect(assertServerId('server-01.prod')).toBe('server-01.prod');
    expect(() => assertServerId('../server')).toThrow('Invalid server identifier');
  });
});
