// 用 127.0.0.1 而非 localhost：系统代理开启时（如 nano/Clash 类软件），浏览器会把
// localhost 域名请求劫持到代理导致 502/连接失败；127.0.0.1 回环地址被代理规则放行。
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000/api/v1';
const TOKEN_KEY = 'zivith_token';
const REFRESH_TOKEN_KEY = 'zivith_refresh_token';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const session = {
  getToken() {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(TOKEN_KEY);
  },
  setToken(token: string) {
    window.localStorage.setItem(TOKEN_KEY, token);
  },
  getRefreshToken() {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(REFRESH_TOKEN_KEY);
  },
  setTokens(accessToken: string, refreshToken: string) {
    window.localStorage.setItem(TOKEN_KEY, accessToken);
    window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  },
  clear() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};

let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = session.getRefreshToken();
  if (!refreshToken) return false;
  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!response.ok) return false;
  const payload = (await response.json()) as unknown;
  if (
    typeof payload !== 'object' ||
    payload === null ||
    typeof (payload as Record<string, unknown>).access_token !== 'string' ||
    typeof (payload as Record<string, unknown>).refresh_token !== 'string'
  ) {
    return false;
  }
  session.setTokens(
    (payload as Record<string, string>).access_token,
    (payload as Record<string, string>).refresh_token,
  );
  return true;
}

function extractMessage(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) return '请求失败，请稍后重试';
  const record = payload as Record<string, unknown>;
  const error = record.error;
  if (typeof error === 'object' && error !== null) {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === 'string') return message;
  }
  if (typeof record.message === 'string') return record.message;
  return '请求失败，请稍后重试';
}

export async function api<T>(
  path: string,
  init: Omit<RequestInit, 'body'> & {
    body?: BodyInit | Record<string, unknown>;
  } = {},
): Promise<T> {
  const suppliedBody = init.body;
  let body: BodyInit | undefined;
  if (
    suppliedBody &&
    typeof suppliedBody === 'object' &&
    !(suppliedBody instanceof FormData) &&
    !(suppliedBody instanceof URLSearchParams) &&
    !(suppliedBody instanceof Blob) &&
    !(suppliedBody instanceof ArrayBuffer)
  ) {
    body = JSON.stringify(suppliedBody);
  } else {
    body = suppliedBody as BodyInit | undefined;
  }

  const send = async () => {
    const headers = new Headers(init.headers);
    const token = session.getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (body && typeof body === 'string') headers.set('Content-Type', 'application/json');
    return fetch(`${API_URL}${path}`, { ...init, headers, body });
  };

  let response = await send();
  if (response.status === 401 && !path.startsWith('/auth/')) {
    refreshInFlight ??= refreshAccessToken().finally(() => {
      refreshInFlight = null;
    });
    if (await refreshInFlight) response = await send();
  }
  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload: unknown = isJson ? await (response.json() as Promise<unknown>) : null;

  if (!response.ok) {
    if (response.status === 401) session.clear();
    throw new ApiError(extractMessage(payload), response.status, payload);
  }
  return payload as T;
}

export function unwrapList<T>(payload: T[] | { data?: T[]; items?: T[] }): T[] {
  if (Array.isArray(payload)) return payload;
  return payload.data ?? payload.items ?? [];
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) {
    if (error.name === 'AbortError') return '';
    if (/failed to fetch|networkerror|load failed/i.test(error.message)) {
      return '无法连接服务器，请确认 API 已启动后刷新';
    }
    return error.message;
  }
  return '发生未知错误';
}
