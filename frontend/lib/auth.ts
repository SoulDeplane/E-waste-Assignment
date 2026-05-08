import type { AuthUser, Role } from './types';

const TOKEN_KEY = 'ewaste_token';
const REFRESH_KEY = 'ewaste_refresh';
const USER_KEY = 'ewaste_user';

// Persists access token, user, and optional refresh token to localStorage.
export function saveSession(token: string, user: AuthUser, refreshToken?: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
}

// Replaces the stored access token without touching the user or refresh token.
export function setAccessToken(token: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
}

// Replaces the stored refresh token after a refresh rotation.
export function setRefreshToken(token: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(REFRESH_KEY, token);
}

// Reads the current access token from localStorage, or null if not signed in.
export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

// Reads the current refresh token from localStorage, or null if not signed in.
export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_KEY);
}

// Reads the cached AuthUser, or null if not signed in or the JSON is malformed.
export function getUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

// Removes every session item from localStorage.
export function clearSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

// Maps a role to its post-login dashboard path.
export function dashboardPath(role: Role): string {
  if (role === 'admin') return '/admin/dashboard';
  if (role === 'recycler') return '/recycler/dashboard';
  return '/user/dashboard';
}
