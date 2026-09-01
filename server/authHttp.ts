import path from 'node:path';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import QRCode from 'qrcode';
import type { BackendConfig } from './config.js';
import { AuthError, AuthService } from './authService.js';
import { AuthStore } from './authStore.js';
import { secureEqual } from './authCrypto.js';

const COOKIE_NAME = 'darkcraft_session';
const PUBLIC_API_PATHS = new Set([
  '/api/v1/health',
  '/api/v1/auth/status',
  '/api/v1/auth/setup/start',
  '/api/v1/auth/setup/complete',
  '/api/v1/auth/login',
]);

interface RequestAuth {
  sessionToken: string;
  expiresAt: number;
}

export interface AuthContext {
  service: AuthService;
  store: AuthStore;
  getRequestAuth(request: FastifyRequest): RequestAuth | undefined;
}

function requestPath(request: FastifyRequest): string {
  return request.url.split('?')[0] ?? request.url;
}

function cookieValue(request: FastifyRequest): string | undefined {
  const cookies = request.headers.cookie?.split(';') ?? [];
  for (const cookie of cookies) {
    const [name, ...parts] = cookie.trim().split('=');
    if (name === COOKIE_NAME) return parts.join('=');
  }
  return undefined;
}

function sessionCookie(token: string, config: BackendConfig, maxAge = 3600): string {
  return [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    config.secureCookies ? 'Secure' : '',
    'SameSite=Strict',
    `Max-Age=${maxAge}`,
  ].filter(Boolean).join('; ');
}

function isMutation(request: FastifyRequest): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
}

function isWebSocket(request: FastifyRequest): boolean {
  return request.headers.upgrade?.toLowerCase() === 'websocket';
}

function assertOrigin(request: FastifyRequest, allowedOrigins: string[]): void {
  const origin = request.headers.origin;
  if (!origin || !allowedOrigins.includes(origin)) throw new AuthError(403, 'Request rejected');
}

function csrfFromRequest(request: FastifyRequest): string | undefined {
  const header = request.headers['x-csrf-token'];
  if (typeof header === 'string') return header;
  if (isWebSocket(request)) return new URL(request.url, 'http://localhost').searchParams.get('csrf') ?? undefined;
  return undefined;
}

export async function installAuthentication(
  app: FastifyInstance,
  config: BackendConfig,
  options: { now?: () => number; sessionTtlMs?: number; lockoutThreshold?: number } = {},
): Promise<AuthContext> {
  const store = new AuthStore(path.join(config.dataDir, 'auth'));
  await store.load();
  const service = new AuthService(store, options);
  const requestAuth = new WeakMap<FastifyRequest, RequestAuth>();

  app.addHook('onRequest', async (request, reply) => {
    const pathname = requestPath(request);
    if (!pathname.startsWith('/api/v1/')) return;
    if (isMutation(request) || isWebSocket(request)) assertOrigin(request, config.allowedOrigins);
    if (PUBLIC_API_PATHS.has(pathname)) return;
    const sessionToken = cookieValue(request);
    const session = await service.authenticate(sessionToken);
    if (!session || !sessionToken) {
      await reply.code(401).send({ error: { code: 'Unauthorized', message: 'Authentication required' } });
      return reply;
    }
    requestAuth.set(request, { sessionToken, expiresAt: session.expiresAt });
    const suppliedCsrf = csrfFromRequest(request);
    if ((isMutation(request) || isWebSocket(request)) && (!suppliedCsrf || !secureEqual(suppliedCsrf, session.csrfToken))) {
      await reply.code(403).send({ error: { code: 'Forbidden', message: 'Request rejected' } });
      return reply;
    }
  });

  app.get('/api/v1/auth/status', async (request) => {
    const session = await service.authenticate(cookieValue(request));
    return { data: { setupRequired: service.isSetupRequired(), authenticated: session !== null, csrfToken: session?.csrfToken, expiresAt: session?.expiresAt } };
  });

  app.post('/api/v1/auth/setup/start', async () => {
    const setup = await service.beginSetup();
    return { data: { ...setup, qrDataUrl: await QRCode.toDataURL(setup.otpauthUri, { width: 240, margin: 1 }) } };
  });

  app.post('/api/v1/auth/setup/complete', async (request, reply) => {
    const input = request.body as { setupToken?: string; password?: string; totpCode?: string };
    const grant = await service.completeSetup({ setupToken: input.setupToken ?? '', password: input.password ?? '', totpCode: input.totpCode ?? '' });
    reply.header('Set-Cookie', sessionCookie(grant.sessionToken, config));
    return { data: { authenticated: true, csrfToken: grant.csrfToken, expiresAt: grant.expiresAt } };
  });

  app.post('/api/v1/auth/login', async (request, reply) => {
    const input = request.body as { username?: string; credential?: string };
    const grant = await service.login(input.username ?? '', input.credential ?? '', request.ip);
    reply.header('Set-Cookie', sessionCookie(grant.sessionToken, config));
    return { data: { authenticated: true, csrfToken: grant.csrfToken, expiresAt: grant.expiresAt } };
  });

  app.post('/api/v1/auth/logout', async (request, reply) => {
    await service.logout(requestAuth.get(request)?.sessionToken);
    reply.header('Set-Cookie', sessionCookie('', config, 0));
    return { data: null };
  });

  return { service, store, getRequestAuth: (request) => requestAuth.get(request) };
}
