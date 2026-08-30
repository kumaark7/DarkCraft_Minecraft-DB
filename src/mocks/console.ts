import type { ConsoleEntry } from '@/types';

const now = new Date();
const ts = (offsetSeconds: number): string => {
  const d = new Date(now.getTime() - offsetSeconds * 1000);
  return d.toISOString();
};
const fmt = (offsetSeconds: number): string => {
  const d = new Date(now.getTime() - offsetSeconds * 1000);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  const s = d.getSeconds().toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
};

export const MOCK_CONSOLE_HISTORY: Record<string, ConsoleEntry[]> = {
  'server-1': [
    { id: 'c1', timestamp: ts(7200), severity: 'INFO', message: `[${fmt(7200)} INFO]: Starting minecraft server version 1.21.1`, source: 'HISTORY' },
    { id: 'c2', timestamp: ts(7195), severity: 'INFO', message: `[${fmt(7195)} INFO]: Loading properties`, source: 'HISTORY' },
    { id: 'c3', timestamp: ts(7190), severity: 'INFO', message: `[${fmt(7190)} INFO]: This server is running Paper version git-Paper-196 (MC: 1.21.1)`, source: 'HISTORY' },
    { id: 'c4', timestamp: ts(7185), severity: 'INFO', message: `[${fmt(7185)} INFO]: Preparing level "world"`, source: 'HISTORY' },
    { id: 'c5', timestamp: ts(7180), severity: 'INFO', message: `[${fmt(7180)} INFO]: Done (4.17s)! For help, type "help"`, source: 'HISTORY' },
    { id: 'c6', timestamp: ts(7000), severity: 'INFO', message: `[${fmt(7000)} INFO]: KeerDubi joined the game`, source: 'HISTORY' },
    { id: 'c7', timestamp: ts(6800), severity: 'INFO', message: `[${fmt(6800)} INFO]: Jai joined the game`, source: 'HISTORY' },
    { id: 'c8', timestamp: ts(6500), severity: 'WARN', message: `[${fmt(6500)} WARN]: Can't keep up! Is the server overloaded? Running 2018ms or 40 ticks behind`, source: 'HISTORY' },
    { id: 'c9', timestamp: ts(6400), severity: 'INFO', message: `[${fmt(6400)} INFO]: Saving the game (this may take a moment!)`, source: 'HISTORY' },
    { id: 'c10', timestamp: ts(6395), severity: 'INFO', message: `[${fmt(6395)} INFO]: Saved the game`, source: 'HISTORY' },
    { id: 'c11', timestamp: ts(5000), severity: 'INFO', message: `[${fmt(5000)} INFO]: Kesavan joined the game`, source: 'HISTORY' },
    { id: 'c12', timestamp: ts(4800), severity: 'COMMAND', message: `[${fmt(4800)} INFO]: KeerDubi issued server command: /gamemode creative Jai`, source: 'HISTORY' },
    { id: 'c13', timestamp: ts(4700), severity: 'INFO', message: `[${fmt(4700)} INFO]: Game mode updated for Jai`, source: 'HISTORY' },
    { id: 'c14', timestamp: ts(3600), severity: 'INFO', message: `[${fmt(3600)} INFO]: Priya joined the game`, source: 'HISTORY' },
    { id: 'c15', timestamp: ts(3200), severity: 'ERROR', message: `[${fmt(3200)} ERROR]: Could not pass event EntityDamageEvent to Plugin v1.2.3`, source: 'HISTORY' },
    { id: 'c16', timestamp: ts(3000), severity: 'INFO', message: `[${fmt(3000)} INFO]: Arjun joined the game`, source: 'HISTORY' },
    { id: 'c17', timestamp: ts(2800), severity: 'INFO', message: `[${fmt(2800)} INFO]: Maya joined the game`, source: 'HISTORY' },
    { id: 'c18', timestamp: ts(2400), severity: 'INFO', message: `[${fmt(2400)} INFO]: Saving the game (this may take a moment!)`, source: 'HISTORY' },
    { id: 'c19', timestamp: ts(2395), severity: 'INFO', message: `[${fmt(2395)} INFO]: Saved the game`, source: 'HISTORY' },
    { id: 'c20', timestamp: ts(1800), severity: 'PLAYER', message: `[${fmt(1800)} INFO]: <KeerDubi> hey everyone!`, source: 'HISTORY' },
    { id: 'c21', timestamp: ts(1700), severity: 'PLAYER', message: `[${fmt(1700)} INFO]: <Jai> welcome!`, source: 'HISTORY' },
    { id: 'c22', timestamp: ts(1200), severity: 'INFO', message: `[${fmt(1200)} INFO]: Raj joined the game`, source: 'HISTORY' },
    { id: 'c23', timestamp: ts(600), severity: 'WARN', message: `[${fmt(600)} WARN]: Kicked BannedPlayer1 due to banned IP address`, source: 'HISTORY' },
    { id: 'c24', timestamp: ts(300), severity: 'COMMAND', message: `[${fmt(300)} INFO]: KeerDubi issued server command: /backup start`, source: 'HISTORY' },
    { id: 'c25', timestamp: ts(120), severity: 'INFO', message: `[${fmt(120)} INFO]: Backup completed successfully`, source: 'HISTORY' },
    { id: 'c26', timestamp: ts(60), severity: 'INFO', message: `[${fmt(60)} INFO]: Saving the game (this may take a moment!)`, source: 'HISTORY' },
    { id: 'c27', timestamp: ts(55), severity: 'INFO', message: `[${fmt(55)} INFO]: Saved the game`, source: 'HISTORY' },
  ],
};

// Generate live entries that will be appended in mock realtime
export const MOCK_LIVE_ENTRIES: ConsoleEntry[] = [
  { id: 'live-1', timestamp: new Date().toISOString(), severity: 'INFO', message: `[${fmt(0)} INFO]: Connection from 192.168.1.50 established`, source: 'LIVE' },
  { id: 'live-2', timestamp: new Date().toISOString(), severity: 'INFO', message: `[${fmt(0)} INFO]: Player Priya has been idle for 5 minutes`, source: 'LIVE' },
  { id: 'live-3', timestamp: new Date().toISOString(), severity: 'WARN', message: `[${fmt(0)} WARN]: Player movement is out of sync (KeerDubi)`, source: 'LIVE' },
  { id: 'live-4', timestamp: new Date().toISOString(), severity: 'INFO', message: `[${fmt(0)} INFO]: Performing level save...`, source: 'LIVE' },
  { id: 'live-5', timestamp: new Date().toISOString(), severity: 'INFO', message: `[${fmt(0)} INFO]: Level save complete.`, source: 'LIVE' },
];
