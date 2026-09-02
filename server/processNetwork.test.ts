import { createServer, connect } from 'node:net';
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseTcpSockets, readLinuxTcpSnapshot, TcpRateSampler, type TcpSnapshot } from './processNetwork.js';

describe('process-owned TCP counters', () => {
  it('matches socket inodes, not host totals, ports or substring PID matches', () => {
    const output = [
      'LISTEN 0 128 *:25565 *:* ino:10 cubic cwnd:10',
      'ESTAB 0 0 127.0.0.1:25565 127.0.0.1:40000 ino:20 rto:201 bytes_sent:2048 bytes_received:1024',
      'ESTAB 0 0 127.0.0.1:8787 127.0.0.1:40001 ino:200 bytes_sent:999999 bytes_received:999999',
    ].join('\n');
    expect(parseTcpSockets(output, new Set(['10', '20']))).toEqual([{ id: '20', sent: 2048, received: 1024 }]);
    expect(() => parseTcpSockets(output, new Set(['999']))).toThrow('No observable');
    expect(() => parseTcpSockets('ESTAB 0 0 a b ino:20 rto:201', new Set(['20']))).toThrow('unavailable');
  });
  it('uses counter deltas, warmup and real idle zero, invalidating on churn, gaps, PID reuse and failures', async () => {
    let snapshot: TcpSnapshot = { identity: '12:100', timestamp: 1000, sockets: [{ id: '20', received: 100, sent: 200 }] };
    let fail = false;
    const sampler = new TcpRateSampler(async () => { if (fail) throw new Error('permission'); return structuredClone(snapshot); });
    expect((await sampler.sample(12)).networkIn).toBeNull();
    snapshot.timestamp += 10_000; snapshot.sockets[0]!.received += 20_480; snapshot.sockets[0]!.sent += 10_240;
    expect(await sampler.sample(12)).toEqual({ networkIn: 2, networkOut: 1 });
    snapshot.timestamp += 10_000;
    expect(await sampler.sample(12)).toEqual({ networkIn: 0, networkOut: 0 });
    snapshot.timestamp += 10_000; snapshot.sockets = [];
    expect((await sampler.sample(12)).networkIn).toBeNull();
    snapshot.timestamp += 10_000;
    expect(await sampler.sample(12)).toEqual({ networkIn: 0, networkOut: 0 });
    snapshot.timestamp += 40_000;
    expect((await sampler.sample(12)).networkIn).toBeNull();
    snapshot.identity = '12:200'; snapshot.timestamp += 10_000;
    expect((await sampler.sample(12)).networkIn).toBeNull();
    fail = true; expect((await sampler.sample(12)).networkIn).toBeNull();
    fail = false; snapshot.timestamp += 10_000;
    expect((await sampler.sample(12)).networkIn).toBeNull();
  });
  it('does not turn counter resets into negative rates', async () => {
    let count = 0;
    const sampler = new TcpRateSampler(async () => ({
      identity: 'one', timestamp: ++count * 10_000, sockets: [{ id: '20', received: 1000 / count, sent: 1000 / count }],
    }));
    await sampler.sample(1);
    expect(await sampler.sample(1)).toEqual({ networkIn: null, networkOut: null });
  });
  it.skipIf(process.platform !== 'linux' || !existsSync('/usr/bin/ss'))('reads real loopback socket counters without elevated privileges', async () => {
    const server = createServer(socket => socket.on('data', data => socket.write(data)));
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing listener');
    const client = connect(address.port, '127.0.0.1');
    try {
      await new Promise<void>(resolve => client.once('connect', resolve));
      const exchange = async () => {
        const received = new Promise<void>(resolve => client.once('data', () => resolve()));
        client.write(Buffer.alloc(8192)); await received;
      };
      await exchange();
      const sampler = new TcpRateSampler(readLinuxTcpSnapshot);
      await sampler.sample(process.pid);
      await new Promise(resolve => setTimeout(resolve, 100));
      await exchange();
      const result = await sampler.sample(process.pid);
      expect(result.networkIn).toBeGreaterThan(0);
      expect(result.networkOut).toBeGreaterThan(0);
    } finally { client.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
});
