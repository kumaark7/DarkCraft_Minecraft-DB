import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readBannedIps, readPlayers } from './playerData.js';

const temporary: string[] = [];
afterEach(async () => Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

describe('Minecraft player JSON sources', () => {
  it('merges ops, whitelist, bans, cache and live presence fresh from disk', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'darkcraft-players-'));
    temporary.push(directory);
    await mkdir(directory, { recursive: true });
    const write = (name: string, value: unknown) => writeFile(path.join(directory, name), JSON.stringify(value));
    await Promise.all([
      write('usercache.json', [{ name: 'Steve', uuid: 'uuid-steve' }, { name: 'Alex', uuid: 'uuid-alex' }]),
      write('ops.json', [{ name: 'Steve', uuid: 'uuid-steve', level: 4 }]),
      write('whitelist.json', [{ name: 'Alex', uuid: 'uuid-alex' }]),
      write('banned-players.json', [{ name: 'Griefer', uuid: 'uuid-griefer', created: '2026-09-01 10:00:00 +0000', source: 'Admin', reason: 'Griefing' }]),
      write('banned-ips.json', [{ ip: '192.0.2.10', created: '2026-09-01 11:00:00 +0000', source: 'Admin', reason: 'Spam' }]),
    ]);
    const players = await readPlayers(directory, [{ username: 'Alex', uuid: 'observed-Alex', online: true, isOp: false, isWhitelisted: false, isBanned: false }]);
    expect(players.find((player) => player.username === 'Steve')).toMatchObject({ uuid: 'uuid-steve', isOp: true, online: false });
    expect(players.find((player) => player.username === 'Alex')).toMatchObject({ uuid: 'uuid-alex', isWhitelisted: true, online: true });
    expect(players.find((player) => player.username === 'Griefer')).toMatchObject({ isBanned: true, banReason: 'Griefing' });
    expect(await readBannedIps(directory)).toEqual([{ ip: '192.0.2.10', reason: 'Spam', bannedBy: 'Admin', date: '2026-09-01 11:00:00 +0000' }]);

    await write('ops.json', [{ name: 'Alex', uuid: 'uuid-alex', level: 4 }]);
    const refreshed = await readPlayers(directory);
    expect(refreshed.find((player) => player.username === 'Steve')?.isOp).toBe(false);
    expect(refreshed.find((player) => player.username === 'Alex')?.isOp).toBe(true);
  });

  it('lets authoritative whitelist casing replace stale usercache casing', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'darkcraft-player-case-')); temporary.push(directory);
    await writeFile(path.join(directory, 'usercache.json'), JSON.stringify([{ name: '.nocturne17dani', uuid: 'floodgate-uuid' }]));
    await writeFile(path.join(directory, 'whitelist.json'), JSON.stringify([{ name: '.Nocturne17Dani', uuid: 'floodgate-uuid' }]));
    expect(await readPlayers(directory)).toEqual([expect.objectContaining({ username: '.Nocturne17Dani', isWhitelisted: true })]);
  });
});
