'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import PasswordInput from '@/components/PasswordInput';

// Form that consumes the ?token from the reset email and posts the new password.
function ResetInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Validates the password match and posts the reset request, redirecting to /login on success.
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Passwords do not match...');
      return;
    }
    setLoading(true);
    try {
      await api('/api/auth/reset-password', {
        body: { token, password },
        skipAuthRefresh: true
      });
      setDone(true);
      setTimeout(() => router.replace('/login'), 1500);
    } catch (err) {
      const msg =
        err instanceof ApiError && err.status === 400
          ? 'This reset link is invalid or has expired...'
          : 'Reset failed. Please try again...';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="center">
        <div className="card auth-card">
          <h2>Reset password</h2>
          <p className="muted" style={{ color: 'var(--danger)' }}>Missing reset token...</p>
          <p className="muted" style={{ marginTop: 12 }}>
            <Link href="/forgot-password">Request a new link</Link>
          </p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="center">
        <div className="card auth-card">
          <h2>Password updated</h2>
          <p className="muted">Redirecting to log in...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="center">
      <form onSubmit={submit} className="card auth-card">
        <h2>Reset password</h2>
        <div className="field">
          <label>New password (min 8 chars)</label>
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </div>
        <div className="field">
          <label>Confirm new password</label>
          <PasswordInput
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
          />
        </div>
        {error && <div className="muted" style={{ color: 'var(--danger)' }}>{error}</div>}
        <button type="submit" disabled={loading} style={{ width: '100%', marginTop: 10 }}>
          {loading ? 'Updating...' : 'Update password'}
        </button>
      </form>
    </div>
  );
}

// Page wrapper that supplies a Suspense boundary required by useSearchParams().
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="center muted">Loading...</div>}>
      <ResetInner />
    </Suspense>
  );
}
