import type { ActivityEvent } from '@/types';

// Offline-mode UUIDs (v3) are not Mojang profile IDs. Never send them as such.
export function playerAvatarUrl(username: string, uuid?: string): string | null {
  const compact = (uuid ?? '').replace(/-/g, '').toLowerCase();
  const onlineUuid = /^(?:[0-9a-f]{12}4[0-9a-f]{3}[89ab][0-9a-f]{15})$/.test(compact)
    && (/^[0-9a-f]{32}$/i.test(uuid ?? '') || /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(uuid ?? ''));
  const name = username.trim();
  const identity = onlineUuid ? compact : /^[A-Za-z0-9_]{1,16}$/.test(name) ? name : null;
  return identity ? `https://mc-heads.net/avatar/${encodeURIComponent(identity)}/64` : null;
}

export function playerInitials(username: string): string {
  return username.trim().slice(0, 2).toUpperCase() || '?';
}

export function activityPlayerName(event: Pick<ActivityEvent, 'category' | 'actor'>): string | null {
  // Other actors can be dashboard administrators, not Minecraft identities.
  if (event.category !== 'player-join' && event.category !== 'player-leave') return null;
  const name = event.actor?.trim() ?? '';
  return /^[A-Za-z0-9_]{1,16}$/.test(name) ? name : null;
}
