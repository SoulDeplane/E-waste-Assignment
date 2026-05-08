import { clearSession, getRefreshToken, getToken, setAccessToken, setRefreshToken } from './auth';

const BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(`API ${status}`);
    this.status = status;
    this.body = body;
  }
}

interface RequestOpts {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  formData?: FormData;
  skipAuthRefresh?: boolean;
}

let refreshInflight: Promise<string | null> | null = null;

// Calls /api/auth/refresh once at a time, returning the new access token or null on failure.
async function refreshAccessToken(): Promise<string | null> {
  if (refreshInflight) return refreshInflight;
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  refreshInflight = (async () => {
    try {
      const res = await fetch(BASE + '/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.accessToken && data.refreshToken) {
        setAccessToken(data.accessToken);
        setRefreshToken(data.refreshToken);
        return data.accessToken as string;
      }
      return null;
    } catch {
      return null;
    } finally {
      refreshInflight = null;
    }
  })();

  return refreshInflight;
}

// Builds the URL and fetch init for an api call with the given access token.
function buildRequest(path: string, opts: RequestOpts, token: string | null): { url: string; init: RequestInit } {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const url = new URL(BASE + path);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }

  let body: BodyInit | undefined;
  if (opts.formData) {
    body = opts.formData;
  } else if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers['Content-Type'] = 'application/json';
  }

  return {
    url: url.toString(),
    init: {
      method: opts.method || (body ? 'POST' : 'GET'),
      headers,
      body
    }
  };
}

// Generic JSON API client; transparently refreshes the access token on 401 and retries once.
export async function api<T = unknown>(path: string, opts: RequestOpts = {}): Promise<T> {
  let token = getToken();
  let { url, init } = buildRequest(path, opts, token);
  let res = await fetch(url, init);

  if (res.status === 401 && !opts.skipAuthRefresh && getRefreshToken()) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      ({ url, init } = buildRequest(path, opts, newToken));
      res = await fetch(url, init);
    } else {
      clearSession();
      if (typeof window !== 'undefined') {
        window.location.assign('/login?expired=1');
      }
    }
  }

  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

// Parses a string as JSON, falling back to the raw string when parsing fails.
function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// Resolves a relative upload path to an absolute URL pointing at the API server.
export function assetUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http')) return path;
  return BASE + path;
}
