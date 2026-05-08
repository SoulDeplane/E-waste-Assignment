'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { saveSession, dashboardPath } from '@/lib/auth';
import PasswordInput from '@/components/PasswordInput';
import type { AuthUser } from '@/lib/types';

// Login form that exchanges email + password for tokens and routes to the role dashboard.
function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const expired = params.get('expired') === '1';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Posts credentials and persists the returned session in localStorage on success.
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api<{ accessToken: string; refreshToken: string; user: AuthUser }>(
        '/api/auth/login',
        { body: { email, password }, skipAuthRefresh: true }
      );
      saveSession(res.accessToken, res.user, res.refreshToken);
      router.replace(dashboardPath(res.user.role));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('Invalid email or password.');
      } else {
        setError('Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="center">
      <form onSubmit={submit} className="card auth-card">
        <h2>Log in</h2>
        {expired && (
          <div className="muted" style={{ color: 'var(--warn)', marginBottom: 8 }}>
            Your session expired. Please log in again.
          </div>
        )}
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label>Password</label>
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <div className="muted" style={{ color: 'var(--danger)' }}>{error}</div>}
        <button type="submit" disabled={loading} style={{ width: '100%', marginTop: 10 }}>
          {loading ? 'Logging in...' : 'Log in'}
        </button>
        <p className="muted" style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between' }}>
          <Link href="/register">Register</Link>
          <Link href="/forgot-password">Forgot password?</Link>
        </p>
      </form>
    </div>
  );
}

// Page wrapper that supplies a Suspense boundary required by useSearchParams().
export default function LoginPage() {
  return (
    <Suspense fallback={<div className="center muted">Loading...</div>}>
      <LoginInner />
    </Suspense>
  );
}
