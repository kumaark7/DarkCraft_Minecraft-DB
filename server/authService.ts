import { randomBytes } from 'node:crypto';
import { authenticatorUri, createTotpSecret, hashPassword, secureEqual, sha256, verifyPassword, verifyTotp } from './authCrypto.js';
import { AuthStore, type AuthCredentials } from './authStore.js';

const SESSION_TTL_MS = 60 * 60 * 1000;
const SETUP_TTL_MS = 15 * 60 * 1000;

export class AuthError extends Error {
  constructor(readonly statusCode: number, message = 'Authentication failed') {
    super(message);
    this.name = 'AuthError';
  }
}

export interface SessionGrant {
  sessionToken: string;
  csrfToken: string;
  expiresAt: number;
}

export interface AuthenticatedSession {
  csrfToken: string;
  expiresAt: number;
}

interface FailureState {
  failures: number;
  lockedUntil: number;
  lastAttempt: number;
}

export interface AuthServiceOptions {
  now?: () => number;
  sessionTtlMs?: number;
  lockoutThreshold?: number;
}

export class AuthService {
  private readonly failures = new Map<string, FailureState>();
  private readonly now: () => number;
  private readonly sessionTtlMs: number;
  private readonly lockoutThreshold: number;
  private operationQueue: Promise<void> = Promise.resolve();
  private readonly invalidationListeners = new Map<string, Set<() => void>>();

  constructor(private readonly store: AuthStore, options: AuthServiceOptions = {}) {
    this.now = options.now ?? Date.now;
    this.sessionTtlMs = options.sessionTtlMs ?? SESSION_TTL_MS;
    this.lockoutThreshold = options.lockoutThreshold ?? 5;
  }

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation);
    this.operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  isSetupRequired(): boolean {
    return !this.store.isConfigured();
  }

  async beginSetup(): Promise<{ setupToken: string; manualKey: string; otpauthUri: string }> {
    return this.exclusive(async () => {
      if (this.store.isConfigured()) throw new AuthError(409, 'Setup is not available');
      const setupToken = randomBytes(32).toString('base64url');
      const manualKey = createTotpSecret();
      await this.store.savePendingSetup({ tokenHash: sha256(setupToken), totpSecret: manualKey, expiresAt: this.now() + SETUP_TTL_MS });
      return { setupToken, manualKey, otpauthUri: authenticatorUri(manualKey) };
    });
  }

  async completeSetup(input: { setupToken: string; password: string; totpCode: string }): Promise<SessionGrant> {
    if (input.password.length < 12 || input.password.length > 1024) {
      throw new AuthError(400, 'Owner password must contain between 12 and 1024 characters');
    }
    return this.exclusive(async () => {
      if (this.store.isConfigured()) throw new AuthError(409, 'Setup is not available');
      const pending = this.store.getPendingSetup();
      const counter = pending ? verifyTotp(pending.totpSecret, input.totpCode, this.now()) : null;
      if (!pending || pending.expiresAt <= this.now() || !secureEqual(sha256(input.setupToken), pending.tokenHash) || counter === null) {
        throw new AuthError(401);
      }
      const credentials: AuthCredentials = {
        version: 1,
        username: 'admin',
        passwordHash: await hashPassword(input.password),
        totpSecret: pending.totpSecret,
        lastTotpCounter: counter,
        createdAt: this.now(),
      };
      await this.store.saveCredentials(credentials);
      await this.store.clearPendingSetup();
      return this.createSession();
    });
  }

  private rateKey(ip: string, username: string): string {
    return `${ip}:${username.trim().toLowerCase()}`;
  }

  private assertNotLocked(key: string): void {
    const state = this.failures.get(key);
    if (state && state.lockedUntil > this.now()) throw new AuthError(429, 'Authentication temporarily unavailable');
  }

  private recordFailure(key: string): void {
    const failures = (this.failures.get(key)?.failures ?? 0) + 1;
    const backoffSeconds = failures >= this.lockoutThreshold ? Math.min(900, 2 ** (failures - this.lockoutThreshold)) : 0;
    const now = this.now();
    if (this.failures.size > 1000) {
      for (const [candidate, state] of this.failures) if (now - state.lastAttempt > 60 * 60 * 1000) this.failures.delete(candidate);
    }
    this.failures.set(key, { failures, lockedUntil: now + backoffSeconds * 1000, lastAttempt: now });
  }

  async login(username: string, credential: string, ip: string): Promise<SessionGrant> {
    return this.exclusive(async () => {
      const key = this.rateKey(ip, username);
      this.assertNotLocked(key);
      if (username.length > 64 || credential.length < 1 || credential.length > 1024) {
        this.recordFailure(key);
        throw new AuthError(401);
      }
      const credentials = this.store.getCredentials();
      let valid = false;
      let matchedCounter: number | null = null;
      if (credentials && username === credentials.username) {
        if (/^\d{6}$/.test(credential)) {
          matchedCounter = verifyTotp(credentials.totpSecret, credential, this.now());
          valid = matchedCounter !== null && matchedCounter > credentials.lastTotpCounter;
        } else {
          valid = await verifyPassword(credential, credentials.passwordHash);
        }
      }
      if (!valid || !credentials) {
        this.recordFailure(key);
        throw new AuthError(401);
      }
      if (matchedCounter !== null) {
        credentials.lastTotpCounter = matchedCounter;
        await this.store.saveCredentials(credentials);
      }
      this.failures.delete(key);
      return this.createSession();
    });
  }

  private async createSession(): Promise<SessionGrant> {
    const sessionToken = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    const createdAt = this.now();
    const expiresAt = createdAt + this.sessionTtlMs;
    const active = this.store.getSessions().filter((session) => session.expiresAt > createdAt).slice(-99);
    active.push({ tokenHash: sha256(sessionToken), csrfToken, createdAt, expiresAt });
    await this.store.saveSessions(active);
    return { sessionToken, csrfToken, expiresAt };
  }

  async authenticate(sessionToken: string | undefined): Promise<AuthenticatedSession | null> {
    if (!sessionToken) return null;
    return this.exclusive(async () => {
      const now = this.now();
      const sessions = this.store.getSessions();
      const active = sessions.filter((session) => session.expiresAt > now);
      if (active.length !== sessions.length) await this.store.saveSessions(active);
      const tokenHash = sha256(sessionToken);
      const session = active.find((candidate) => secureEqual(candidate.tokenHash, tokenHash));
      return session ? { csrfToken: session.csrfToken, expiresAt: session.expiresAt } : null;
    });
  }

  async logout(sessionToken: string | undefined): Promise<void> {
    if (!sessionToken) return;
    await this.exclusive(async () => {
      const tokenHash = sha256(sessionToken);
      await this.store.saveSessions(this.store.getSessions().filter((session) => !secureEqual(session.tokenHash, tokenHash)));
      for (const listener of this.invalidationListeners.get(tokenHash) ?? []) listener();
      this.invalidationListeners.delete(tokenHash);
    });
  }

  onSessionInvalidated(sessionToken: string, listener: () => void): () => void {
    const tokenHash = sha256(sessionToken);
    const listeners = this.invalidationListeners.get(tokenHash) ?? new Set<() => void>();
    listeners.add(listener);
    this.invalidationListeners.set(tokenHash, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.invalidationListeners.delete(tokenHash);
    };
  }
}
