'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

// Page where the user types their email to request a password-reset link.
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Posts the email to the API and switches to the success view regardless of whether the address exists.
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api('/api/auth/forgot-password', { body: { email }, skipAuthRefresh: true });
      setSent(true);
    } catch {
      setError('Could not submit request. Please try again...');
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="center">
        <div className="card auth-card">
          <h2>Check your email</h2>
          <p className="muted">
            If an account exists for <strong>{email}</strong>, we've sent a password reset link. The link expires in 1 hour...
          </p>
          <p className="muted" style={{ marginTop: 12 }}>
            <Link href="/login">Back to log in</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="center">
      <form onSubmit={submit} className="card auth-card">
        <h2>Forgot password</h2>
        <p className="muted">Enter your account email and we'll send you a reset link...</p>
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        {error && <div className="muted" style={{ color: 'var(--danger)' }}>{error}</div>}
        <button type="submit" disabled={loading} style={{ width: '100%', marginTop: 10 }}>
          {loading ? 'Sending...' : 'Send reset link'}
        </button>
        <p className="muted" style={{ marginTop: 12 }}>
          <Link href="/login">Back to log in</Link>
        </p>
      </form>
    </div>
  );
}
