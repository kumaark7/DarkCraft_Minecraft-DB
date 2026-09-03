import { describe, expect, it } from 'vitest';
import { formatServerAddress } from './serverAddress';

describe('player-facing server address', () => {
  it.each(['', '0.0.0.0', '::', '[::]', '0:0:0:0:0:0:0:0'])('replaces wildcard %s with the configured public host', ip => {
    expect(formatServerAddress({ ip, port: 25565 }, '203.0.113.42')).toBe('203.0.113.42:25565');
  });
  it('preserves explicit bindings, per-server ports and input data', () => {
    const first = { ip: '0.0.0.0', port: 25566 };
    expect(formatServerAddress(first, 'play.example.org')).toBe('play.example.org:25566');
    expect(first).toEqual({ ip: '0.0.0.0', port: 25566 });
    expect(formatServerAddress({ ip: '192.168.1.10', port: 25567 }, 'play.example.org')).toBe('192.168.1.10:25567');
  });
  it('brackets IPv6 addresses exactly once', () => {
    expect(formatServerAddress({ ip: '::', port: 25565 }, '2001:db8::1')).toBe('[2001:db8::1]:25565');
    expect(formatServerAddress({ ip: '[2001:db8::2]', port: 25566 }, '')).toBe('[2001:db8::2]:25566');
  });
  it.each(['', '0.0.0.0', '::', 'https://example.org', 'example.org:25565', 'user@example.org', '999.999.999.999'])('does not invent a destination from invalid public host %s', publicHost => {
    expect(formatServerAddress({ ip: '0.0.0.0', port: 25565 }, publicHost)).toBe('N/A');
  });
  it.each([0, 65536, 1.5, Number.NaN])('does not publish invalid port %s', port => {
    expect(formatServerAddress({ ip: '203.0.113.42', port }, '')).toBe('N/A');
  });
});
