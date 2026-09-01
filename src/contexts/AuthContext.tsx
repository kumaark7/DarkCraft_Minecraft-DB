import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AUTH_UNAUTHORIZED_EVENT, createApiClient, setApiCsrfToken } from '@/services/apiClient';
import { resolveServiceConfig } from '@/services/config';

interface AuthStatus {
  setupRequired: boolean;
  authenticated: boolean;
  csrfToken?: string;
  expiresAt?: number;
}

export interface SetupDetails {
  setupToken: string;
  manualKey: string;
  otpauthUri: string;
  qrDataUrl: string;
}

interface AuthContextValue extends AuthStatus {
  loading: boolean;
  login(username: string, credential: string): Promise<void>;
  startSetup(): Promise<SetupDetails>;
  completeSetup(setupToken: string, password: string, totpCode: string): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const authClient = createApiClient(resolveServiceConfig().apiBaseUrl);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>({ setupRequired: false, authenticated: false });
  const [loading, setLoading] = useState(true);

  const applyStatus = useCallback((next: AuthStatus) => {
    setApiCsrfToken(next.csrfToken ?? null);
    setStatus(next);
  }, []);

  const refresh = useCallback(async () => {
    try {
      applyStatus(await authClient.get<AuthStatus>('/auth/status'));
    } finally {
      setLoading(false);
    }
  }, [applyStatus]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const unauthorized = () => applyStatus({ setupRequired: false, authenticated: false });
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, unauthorized);
    return () => window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, unauthorized);
  }, [applyStatus]);
  useEffect(() => {
    if (!status.authenticated || !status.expiresAt) return;
    const timer = window.setTimeout(() => applyStatus({ setupRequired: false, authenticated: false }), Math.max(0, status.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [status.authenticated, status.expiresAt, applyStatus]);

  const login = useCallback(async (username: string, credential: string) => {
    applyStatus({ setupRequired: false, ...await authClient.post<Omit<AuthStatus, 'setupRequired'>>('/auth/login', { username, credential }) });
  }, [applyStatus]);

  const startSetup = useCallback(() => authClient.post<SetupDetails>('/auth/setup/start'), []);

  const completeSetup = useCallback(async (setupToken: string, password: string, totpCode: string) => {
    applyStatus({ setupRequired: false, ...await authClient.post<Omit<AuthStatus, 'setupRequired'>>('/auth/setup/complete', { setupToken, password, totpCode }) });
  }, [applyStatus]);

  const logout = useCallback(async () => {
    try {
      await authClient.post('/auth/logout');
    } finally {
      applyStatus({ setupRequired: false, authenticated: false });
    }
  }, [applyStatus]);

  const value = useMemo<AuthContextValue>(() => ({ ...status, loading, login, startSetup, completeSetup, logout }), [status, loading, login, startSetup, completeSetup, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
