import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, refreshAccessToken, setAccessToken, setOnAuthLost } from './api';

type Status = 'loading' | 'in' | 'out';
export type Role = 'MEMBER' | 'MANAGER' | 'ADMIN';
// eslint-disable-next-line react-refresh/only-export-components
export const ROLE_LABEL: Record<Role, string> = { MEMBER: 'Member', MANAGER: 'Manager', ADMIN: 'Admin' };
export type User = { id: string; email: string; name: string; role: Role; organizationId: string | null };
type AuthValue = {
  status: Status;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    setOnAuthLost(() => {
      setUser(null);
      setStatus('out');
    });
    // 새로고침 복구: httpOnly 쿠키의 Refresh Token으로 Access Token 재발급 후 사용자 정보 조회
    refreshAccessToken().then(async (token) => {
      setAccessToken(token);
      if (!token) return setStatus('out');
      try {
        setUser(await api<User>('/auth/me'));
        setStatus('in');
      } catch {
        setStatus('out');
      }
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<{ accessToken: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setAccessToken(res.accessToken);
    setUser(res.user);
    setStatus('in');
  }, []);

  // 서버 호출이 실패해도(이미 만료 등) 이 브라우저에서는 로그아웃 상태로 만든다
  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setAccessToken(null);
    setUser(null);
    setStatus('out');
  }, []);

  return <AuthContext.Provider value={{ status, user, login, logout }}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('AuthProvider 안에서만 사용할 수 있습니다');
  return ctx;
}
