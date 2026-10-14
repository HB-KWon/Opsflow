// Access Token은 메모리에만 둔다(localStorage 금지). AuthContext가 setAuthHandlers로 연결한다.
export class ApiError extends Error {
  // message: 백엔드가 준 오류 문구(Nest 형식 { message: string | string[] }). 없으면 "HTTP 409" 같은 기본값
  constructor(
    public status: number,
    message?: string,
  ) {
    super(message || `HTTP ${status}`);
  }
}

async function errorMessage(res: Response): Promise<string | undefined> {
  const body = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
  return Array.isArray(body?.message) ? body.message.join(' ') : body?.message;
}

let accessToken: string | null = null;
let onAuthLost: () => void = () => {};

export function setAccessToken(token: string | null) {
  accessToken = token;
}
export function setOnAuthLost(fn: () => void) {
  onAuthLost = fn;
}

// Refresh Token은 1회용이라 동시에 두 번 부르면 두 번째가 실패한다 → 진행 중인 요청을 공유
let refreshing: Promise<string | null> | null = null;
export function refreshAccessToken(): Promise<string | null> {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST' })
    .then(async (res) => (res.ok ? ((await res.json()) as { accessToken: string }).accessToken : null))
    .catch(() => null)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const send = () => {
    const headers = new Headers(init.headers);
    if (init.body) headers.set('Content-Type', 'application/json');
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    return fetch(`/api${path}`, { ...init, headers });
  };

  let res = await send();
  if (res.status === 401 && path !== '/auth/login' && path !== '/auth/refresh') {
    accessToken = await refreshAccessToken();
    if (accessToken) res = await send();
    if (!accessToken || res.status === 401) {
      accessToken = null;
      onAuthLost();
      throw new ApiError(401);
    }
  }
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}
