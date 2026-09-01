import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { totpAt } from './authCrypto.js';
import type { BackendConfig } from './config.js';

const ORIGIN = 'https://darkcraft.projectdarkhope.xyz';
const PASSWORD = 'Owner-password-Testing#7';
const temporary: string[] = [];
afterEach(async () => Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

async function config(): Promise<BackendConfig> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'darkcraft-auth-'));
  temporary.push(root);
  return {
    host: '127.0.0.1', port: 0, readOnly: false, dataDir: path.join(root, 'data'),
    serversRoot: path.join(root, 'servers'), frontendDist: path.join(root, 'missing-dist'),
    allowedOrigins: [ORIGIN], secureCookies: true,
  };
}

function cookie(response: { headers: Record<string, string | string[] | number | undefined> }): string {
  return String(response.headers['set-cookie']).split(';')[0] ?? '';
}

async function setup(context: Awaited<ReturnType<typeof buildApp>>, now: number) {
  const started = await context.app.inject({ method: 'POST', url: '/api/v1/auth/setup/start', headers: { origin: ORIGIN } });
  expect(started.statusCode).toBe(200);
  const details = started.json().data as { setupToken: string; manualKey: string; qrDataUrl: string };
  const completed = await context.app.inject({
    method: 'POST', url: '/api/v1/auth/setup/complete', headers: { origin: ORIGIN },
    payload: { setupToken: details.setupToken, password: PASSWORD, totpCode: totpAt(details.manualKey, now).code },
  });
  expect(completed.statusCode).toBe(200);
  return { details, completed, cookie: cookie(completed), csrf: completed.json().data.csrfToken as string };
}

describe('backend-enforced authentication', () => {
  it('provides first-run TOTP setup, hashes the password, and issues a secure cookie', async () => {
    const now = Date.UTC(2026, 8, 1, 0, 0, 0); const cfg = await config(); const context = await buildApp(cfg, { now: () => now });
    const initial = await context.app.inject({ method: 'GET', url: '/api/v1/auth/status' });
    expect(initial.json().data).toMatchObject({ setupRequired: true, authenticated: false });
    const result = await setup(context, now);
    expect(result.details.manualKey).toMatch(/^[A-Z2-7]+$/);
    expect(result.details.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(result.completed.headers['set-cookie']).toContain('HttpOnly');
    expect(result.completed.headers['set-cookie']).toContain('Secure');
    expect(result.completed.headers['set-cookie']).toContain('SameSite=Strict');
    const credentialFile = await readFile(path.join(cfg.dataDir, 'auth', 'credentials.json'), 'utf8');
    const sessionFile = await readFile(path.join(cfg.dataDir, 'auth', 'sessions.json'), 'utf8');
    expect(credentialFile).toContain('scrypt$');
    expect(credentialFile).not.toContain(PASSWORD);
    expect(sessionFile).not.toContain(result.cookie.split('=')[1]);
    await context.app.close();
  });

  it('accepts both the owner password and a fresh admin TOTP code', async () => {
    let now = Date.UTC(2026, 8, 1, 0, 0, 0); const cfg = await config(); const context = await buildApp(cfg, { now: () => now });
    const created = await setup(context, now);
    const passwordLogin = await context.app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin: ORIGIN }, payload: { username: 'admin', credential: PASSWORD } });
    expect(passwordLogin.statusCode).toBe(200);
    now += 30_000;
    const totpLogin = await context.app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin: ORIGIN }, payload: { username: 'admin', credential: totpAt(created.details.manualKey, now).code } });
    expect(totpLogin.statusCode).toBe(200);
    await context.app.close();
  });

  it('rejects replay of a previously accepted TOTP counter', async () => {
    let now = Date.UTC(2026, 8, 1, 0, 0, 0); const cfg = await config(); const context = await buildApp(cfg, { now: () => now });
    const created = await setup(context, now); now += 30_000;
    const code = totpAt(created.details.manualKey, now).code;
    const first = await context.app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin: ORIGIN }, payload: { username: 'admin', credential: code } });
    const replay = await context.app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin: ORIGIN }, payload: { username: 'admin', credential: code } });
    expect(first.statusCode).toBe(200); expect(replay.statusCode).toBe(401);
    expect(replay.json().error.message).toBe('Authentication failed');
    await context.app.close();
  });

  it('rate-limits repeated failures with temporary backoff and generic errors', async () => {
    const now = Date.UTC(2026, 8, 1, 0, 0, 0); const cfg = await config(); const context = await buildApp(cfg, { now: () => now, lockoutThreshold: 3 });
    await setup(context, now);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const failed = await context.app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin: ORIGIN }, payload: { username: 'admin', credential: 'incorrect credential' } });
      expect(failed.statusCode).toBe(401); expect(failed.json().error.message).toBe('Authentication failed');
    }
    const locked = await context.app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin: ORIGIN }, payload: { username: 'admin', credential: PASSWORD } });
    expect(locked.statusCode).toBe(429); expect(locked.json().error.message).toBe('Authentication temporarily unavailable');
    await context.app.close();
  });

  it('expires sessions after one hour and invalidates logout immediately', async () => {
    let now = Date.UTC(2026, 8, 1, 0, 0, 0); const cfg = await config(); const context = await buildApp(cfg, { now: () => now });
    const auth = await setup(context, now);
    expect((await context.app.inject({ method: 'GET', url: '/api/v1/servers', headers: { cookie: auth.cookie } })).statusCode).toBe(200);
    const logout = await context.app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie: auth.cookie, origin: ORIGIN, 'x-csrf-token': auth.csrf } });
    expect(logout.statusCode).toBe(200);
    expect((await context.app.inject({ method: 'GET', url: '/api/v1/servers', headers: { cookie: auth.cookie } })).statusCode).toBe(401);

    const login = await context.app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin: ORIGIN }, payload: { username: 'admin', credential: PASSWORD } });
    const expiringCookie = cookie(login); now += 60 * 60 * 1000 + 1;
    expect((await context.app.inject({ method: 'GET', url: '/api/v1/servers', headers: { cookie: expiringCookie } })).statusCode).toBe(401);
    await context.app.close();
  });

  it('protects REST and WebSocket endpoints and enforces origin plus CSRF on mutations', async () => {
    const now = Date.UTC(2026, 8, 1, 0, 0, 0); const cfg = await config(); const context = await buildApp(cfg, { now: () => now });
    expect((await context.app.inject({ method: 'GET', url: '/api/v1/servers' })).statusCode).toBe(401);
    expect((await context.app.inject({ method: 'GET', url: '/api/v1/servers/server-1/console/stream', headers: { upgrade: 'websocket', origin: ORIGIN } })).statusCode).toBe(401);
    const auth = await setup(context, now);
    const noOrigin = await context.app.inject({ method: 'POST', url: '/api/v1/servers', headers: { cookie: auth.cookie, 'x-csrf-token': auth.csrf }, payload: { serverName: 'Blocked' } });
    const noCsrf = await context.app.inject({ method: 'POST', url: '/api/v1/servers', headers: { cookie: auth.cookie, origin: ORIGIN }, payload: { serverName: 'Blocked' } });
    const websocketNoCsrf = await context.app.inject({ method: 'GET', url: '/api/v1/servers/server-1/console/stream', headers: { cookie: auth.cookie, upgrade: 'websocket', origin: ORIGIN } });
    expect(noOrigin.statusCode).toBe(403); expect(noCsrf.statusCode).toBe(403); expect(websocketNoCsrf.statusCode).toBe(403);
    await context.app.close();
  });
});
