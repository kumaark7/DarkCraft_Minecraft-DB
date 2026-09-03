import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PlayerAvatar } from './PlayerAvatar';
import { playerAvatarUrl, playerInitials, activityPlayerName } from '@/utils/playerAvatar';

describe('shared player heads', () => {
  it('prefers verified-format online profile UUIDs over mutable names', () => {
    expect(playerAvatarUrl('Name', '853c80ef-3c37-49fd-aa49-938b674adae6'))
      .toBe('https://mc-heads.net/avatar/853c80ef3c3749fdaa49938b674adae6/64');
  });
  it('uses usernames for offline-mode and runtime-observed identities', () => {
    expect(playerAvatarUrl('Jai', '0925e23c-eebb-357b-80b4-fc6672b5f11f')).toBe('https://mc-heads.net/avatar/Jai/64');
    expect(playerAvatarUrl('KeerDubi', 'observed-KeerDubi')).toBe('https://mc-heads.net/avatar/KeerDubi/64');
  });
  it.each(['', '../secrets', 'https://example.org', 'a?b', 'a/b', 'x'.repeat(17)])('does not request invalid identity %s', name => {
    expect(playerAvatarUrl(name, 'invalid')).toBeNull();
  });
  it('reserves dimensions and suppresses referrers without redundant screen reader text', () => {
    const html = renderToStaticMarkup(createElement(PlayerAvatar, { username: 'Jai' }));
    expect(html).toContain('w-8 h-8 shrink-0');
    expect(html).toContain('width="32" height="32"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('referrerPolicy="no-referrer"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('image-rendering:pixelated');
  });
  it('renders a safe fallback with no request when identity is unavailable', () => {
    const html = renderToStaticMarkup(createElement(PlayerAvatar, { username: '' }));
    expect(html).not.toContain('<img');
    expect(html).toContain('>?</span>');
    expect(playerInitials(' Jai ')).toBe('JA');
  });
  it('does not turn administrators or generic events into Minecraft identities', () => {
    expect(activityPlayerName({ category: 'config-change', actor: 'admin' })).toBeNull();
    expect(activityPlayerName({ category: 'player-join', actor: 'Jai' })).toBe('Jai');
    expect(activityPlayerName({ category: 'player-leave', actor: 'KeerDubi' })).toBe('KeerDubi');
    expect(activityPlayerName({ category: 'player-join' })).toBeNull();
  });
  it('uses the shared component for all player lists, action details, and activity pages', () => {
    const players = readFileSync(new URL('../../pages/server/ServerPlayersTab.tsx', import.meta.url), 'utf8');
    for (const list of ['online', 'whitelist', 'operators', 'banned']) {
      expect(players).toMatch(new RegExp(`${list}\\.map\\(p => \\(\\s*<PlayerRow`));
    }
    expect(players).toContain('uuid={player.uuid}');
    expect(players).toContain('<PlayerRow player={confirmKick}');
    expect(players).toContain('<PlayerRow player={confirmBan}');
    for (const page of ['ActivityPage', 'DashboardPage']) {
      const source = readFileSync(new URL(`../../pages/${page}.tsx`, import.meta.url), 'utf8');
      expect(source).toContain('<PlayerAvatar username={activityPlayerName(event)!}');
    }
    expect(players).not.toContain('crafatar.com');
    expect(players).not.toContain('parentElement');
  });
});
