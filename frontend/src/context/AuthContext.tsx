import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { get, http, tokenStore } from '../lib/api';
import { setCurrency } from '../lib/format';
import type { Area, Settings, User } from '../lib/types';

interface AuthState {
  user: User | null;
  settings: Settings | null;
  aiEnabled: boolean;
  loading: boolean;
  setupRequired: boolean;
  /** Resolves with a ticket when the account needs a two-factor code next. */
  login: (email: string, password: string) => Promise<{ twoFactorTicket?: string }>;
  verifyTwoFactor: (ticket: string, code: string) => Promise<void>;
  /** Read or write access to an area for the signed-in user's role. */
  can: (area: Area, need?: 'read' | 'write') => boolean;
  /** Replace the session token (e.g. after changing your own password). */
  setToken: (token: string) => void;
  refreshUser: () => Promise<void>;
  setup: (data: { name: string; email: string; password: string; businessName: string }) => Promise<void>;
  logout: () => void;
  refreshSettings: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);

  const refreshSettings = useCallback(async () => {
    const res = await http.get('/settings');
    const s = res.data.data as Settings;
    setSettings(s);
    setAiEnabled(Boolean(res.data.meta?.aiEnabled));
    setCurrency(s.currencySymbol, s.currency);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const status = await get<{ setupRequired: boolean }>('/auth/status');
        setSetupRequired(status.setupRequired);
        if (tokenStore.get() && !status.setupRequired) {
          const me = await http.get('/auth/me');
          setUser(me.data.user);
          await refreshSettings();
        }
      } catch {
        tokenStore.clear();
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshSettings]);

  const finishLogin = async (token: string, u: User) => {
    tokenStore.set(token);
    setUser(u);
    setSetupRequired(false);
    await refreshSettings();
  };

  const login = async (email: string, password: string) => {
    const res = await http.post('/auth/login', { email, password });
    if (res.data.twoFactorRequired) return { twoFactorTicket: res.data.ticket as string };
    await finishLogin(res.data.token, res.data.user);
    return {};
  };

  const verifyTwoFactor = async (ticket: string, code: string) => {
    const res = await http.post('/auth/login/2fa', { ticket, code });
    await finishLogin(res.data.token, res.data.user);
  };

  const can = useCallback(
    (area: Area, need: 'read' | 'write' = 'read') => {
      const a = user?.permissions?.[area] ?? 'none';
      return need === 'read' ? a !== 'none' : a === 'write';
    },
    [user],
  );

  const refreshUser = useCallback(async () => {
    const me = await http.get('/auth/me');
    setUser(me.data.user);
  }, []);

  const setup = async (data: { name: string; email: string; password: string; businessName: string }) => {
    const res = await http.post('/auth/setup', data);
    await finishLogin(res.data.token, res.data.user);
  };

  const logout = () => {
    tokenStore.clear();
    setUser(null);
    setSettings(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, settings, aiEnabled, loading, setupRequired, login, verifyTwoFactor, can, setToken: tokenStore.set, refreshUser, setup, logout, refreshSettings }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
