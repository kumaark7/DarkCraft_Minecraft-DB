import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ServerStatus, ConsoleSeverity } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

export function formatUptime(seconds: number): string {
  if (seconds <= 0) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

export const statusColors: Record<ServerStatus, string> = {
  ONLINE: 'text-primary',
  OFFLINE: 'text-muted-foreground',
  STARTING: 'text-yellow-400',
  STOPPING: 'text-orange-400',
  CRASHED: 'text-red-400',
};

export const statusBgColors: Record<ServerStatus, string> = {
  ONLINE: 'bg-primary/10 text-primary border-primary/20',
  OFFLINE: 'bg-muted/50 text-muted-foreground border-border',
  STARTING: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  STOPPING: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  CRASHED: 'bg-red-500/10 text-red-400 border-red-500/20',
};

export const statusDotColors: Record<ServerStatus, string> = {
  ONLINE: 'bg-primary',
  OFFLINE: 'bg-muted-foreground',
  STARTING: 'bg-yellow-400',
  STOPPING: 'bg-orange-400',
  CRASHED: 'bg-red-400',
};

export const severityColors: Record<ConsoleSeverity, string> = {
  INFO: 'text-foreground/80',
  WARN: 'text-yellow-400',
  ERROR: 'text-red-400',
  COMMAND: 'text-sky-400',
  PLAYER: 'text-primary',
};

export function getFileIcon(extension?: string): string {
  if (!extension) return 'file';
  const map: Record<string, string> = {
    jar: 'package',
    json: 'braces',
    yml: 'file-code',
    yaml: 'file-code',
    properties: 'settings',
    toml: 'file-code',
    txt: 'file-text',
    conf: 'settings',
    cfg: 'settings',
    log: 'scroll',
    gz: 'archive',
    zip: 'archive',
    png: 'image',
    jpg: 'image',
  };
  return map[extension.toLowerCase()] ?? 'file';
}

export function isEditableFile(filename: string): boolean {
  const editableExts = ['properties', 'json', 'yml', 'yaml', 'toml', 'txt', 'conf', 'cfg', 'md', 'log'];
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return editableExts.includes(ext);
}

export function truncate(str: string, len: number): string {
  return str.length > len ? `${str.slice(0, len)}...` : str;
}

export { playerAvatarUrl } from './playerAvatar';

export function serverIconFallback(name: string): string {
  return name.slice(0, 2).toUpperCase();
}
