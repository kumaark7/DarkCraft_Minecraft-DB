import type { Player, BannedIP } from '@/types';

export const MOCK_PLAYERS: Record<string, Player[]> = {
  'server-1': [
    { username: 'KeerDubi', uuid: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', online: true, duration: 7200, ping: 24, isOp: true, isWhitelisted: true, isBanned: false },
    { username: 'Jai', uuid: 'b2c3d4e5-f6a7-8901-bcde-f12345678901', online: true, duration: 3600, ping: 45, isOp: true, isWhitelisted: true, isBanned: false },
    { username: 'Kesavan', uuid: 'c3d4e5f6-a7b8-9012-cdef-123456789012', online: true, duration: 1800, ping: 67, isOp: false, isWhitelisted: true, isBanned: false },
    { username: 'Priya', uuid: 'd4e5f6a7-b8c9-0123-defa-234567890123', online: true, duration: 5400, ping: 32, isOp: false, isWhitelisted: true, isBanned: false },
    { username: 'Arjun', uuid: 'e5f6a7b8-c9d0-1234-efab-345678901234', online: true, duration: 900, ping: 88, isOp: false, isWhitelisted: true, isBanned: false },
    { username: 'Maya', uuid: 'f6a7b8c9-d0e1-2345-fabc-456789012345', online: true, duration: 2700, ping: 55, isOp: false, isWhitelisted: true, isBanned: false },
    { username: 'Raj', uuid: 'a7b8c9d0-e1f2-3456-abcd-567890123456', online: true, duration: 600, ping: 101, isOp: false, isWhitelisted: true, isBanned: false },
    { username: 'BannedPlayer1', uuid: 'dead0001-dead-dead-dead-dead00000001', online: false, duration: 0, isOp: false, isWhitelisted: false, isBanned: true, banReason: 'Griefing', banDate: '2025-08-20T10:00:00Z' },
    { username: 'Troll99', uuid: 'dead0002-dead-dead-dead-dead00000002', online: false, duration: 0, isOp: false, isWhitelisted: false, isBanned: true, banReason: 'Hacking', banDate: '2025-07-15T14:00:00Z' },
  ],
  'server-4': [
    { username: 'ForgeUser1', uuid: 'f1111111-1111-1111-1111-111111111111', online: true, duration: 3600, ping: 28, isOp: true, isWhitelisted: true, isBanned: false },
    { username: 'ModdedMike', uuid: 'f2222222-2222-2222-2222-222222222222', online: true, duration: 7200, ping: 42, isOp: false, isWhitelisted: true, isBanned: false },
    { username: 'TechWizard', uuid: 'f3333333-3333-3333-3333-333333333333', online: true, duration: 1200, ping: 65, isOp: false, isWhitelisted: true, isBanned: false },
  ],
};

export const MOCK_BANNED_IPS: Record<string, BannedIP[]> = {
  'server-1': [
    { ip: '192.168.1.100', reason: 'DDoS attempt', bannedBy: 'KeerDubi', date: '2025-08-18T12:00:00Z' },
    { ip: '10.0.0.55', reason: 'Spam bots', bannedBy: 'KeerDubi', date: '2025-08-01T09:00:00Z' },
  ],
  'server-4': [],
};
