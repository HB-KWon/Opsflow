import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, refreshAccessToken, setAccessToken, setOnAuthLost } from './api';

type Status = 'loading' | 'in' | 'out';
type AuthValue = { status: Status; login: (email: string, password: string) => Promise<void> };

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    setOnAuthLost(() => setStatus('out'));
    // 새로고침 복구: httpOnly 쿠키의 Refresh Token으로 Access Token 재발급
    refreshAccessToken().then((token) => {
      setAccessToken(token);
      setStatus(token ? 'in' : 'out');
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { accessToken } = await api<{ accessToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setAccessToken(accessToken);
    setStatus('in');
  }, []);

  return <AuthContext.Provider value={{ status, login }}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('AuthProvider 안에서만 사용할 수 있습니다');
  return ctx;
}
