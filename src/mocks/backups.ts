import type { Backup } from '@/types';

export const MOCK_BACKUPS: Record<string, Backup[]> = {
  'server-1': [
    { id: 'bk-1', serverId: 'server-1', name: 'backup-2026-08-30-03-00', date: '2026-08-30T03:00:00Z', size: 524288000, type: 'scheduled', status: 'completed' },
    { id: 'bk-2', serverId: 'server-1', name: 'backup-2026-08-29-03-00', date: '2026-08-29T03:00:00Z', size: 518000000, type: 'scheduled', status: 'completed' },
    { id: 'bk-3', serverId: 'server-1', name: 'backup-2026-08-28-03-00', date: '2026-08-28T03:00:00Z', size: 512000000, type: 'scheduled', status: 'completed' },
    { id: 'bk-4', serverId: 'server-1', name: 'manual-backup-2026-08-27', date: '2026-08-27T14:30:00Z', size: 505000000, type: 'manual', status: 'completed' },
    { id: 'bk-5', serverId: 'server-1', name: 'full-backup-2026-08-25', date: '2026-08-25T04:00:00Z', size: 1073741824, type: 'full', status: 'completed' },
    { id: 'bk-6', serverId: 'server-1', name: 'backup-2026-08-24-03-00', date: '2026-08-24T03:00:00Z', size: 498000000, type: 'scheduled', status: 'failed' },
  ],
  'server-4': [
    { id: 'bk-7', serverId: 'server-4', name: 'backup-2026-08-30-03-00', date: '2026-08-30T03:00:00Z', size: 2147483648, type: 'scheduled', status: 'completed' },
    { id: 'bk-8', serverId: 'server-4', name: 'backup-2026-08-29-03-00', date: '2026-08-29T03:00:00Z', size: 2100000000, type: 'scheduled', status: 'completed' },
  ],
  'server-2': [],
  'server-3': [],
};
