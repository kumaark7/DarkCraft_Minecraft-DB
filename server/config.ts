import path from 'node:path';

export interface BackendConfig {
  host: string;
  port: number;
  readOnly: boolean;
  dataDir: string;
  serversRoot: string;
  frontendDist: string;
  allowedOrigins: string[];
  secureCookies: boolean;
  consoleLogMaxBytes?: number;
  consoleLogRetentionFiles?: number;
}

function envBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`Expected true or false, received: ${value}`);
}

function envPort(value: string | undefined): number {
  const port = Number(value ?? 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('DASHBOARD_PORT is invalid');
  return port;
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

export function loadConfig(cwd = process.cwd(), env = process.env): BackendConfig {
  const dataDir = path.resolve(cwd, env.DASHBOARD_DATA_DIR ?? '.data');
  const serversRoot = path.resolve(cwd, env.MINECRAFT_SERVERS_ROOT ?? path.join(dataDir, 'servers'));

  return {
    host: env.DASHBOARD_HOST ?? '127.0.0.1',
    port: envPort(env.DASHBOARD_PORT),
    readOnly: envBoolean(env.DASHBOARD_READ_ONLY, false),
    dataDir,
    serversRoot,
    frontendDist: path.resolve(cwd, 'dist'),
    allowedOrigins: (env.DASHBOARD_ALLOWED_ORIGINS ?? 'https://darkcraft.projectdarkhope.xyz,http://localhost:5173,http://127.0.0.1:5173')
      .split(',').map((origin) => origin.trim()).filter(Boolean),
    secureCookies: envBoolean(env.DASHBOARD_SECURE_COOKIES, true),
    consoleLogMaxBytes: positiveInteger(env.DASHBOARD_CONSOLE_LOG_MAX_MB, 10, 'DASHBOARD_CONSOLE_LOG_MAX_MB') * 1024 * 1024,
    consoleLogRetentionFiles: positiveInteger(env.DASHBOARD_CONSOLE_LOG_RETENTION_FILES, 5, 'DASHBOARD_CONSOLE_LOG_RETENTION_FILES'),
  };
}
