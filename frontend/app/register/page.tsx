'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { saveSession, dashboardPath } from '@/lib/auth';
import PasswordInput from '@/components/PasswordInput';
import type { AuthUser, Role } from '@/lib/types';

// Registration form: creates the account, saves the auto-login session, and routes to the dashboard.
export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<Role>('user');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Posts the registration form and persists the returned session before redirecting.
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api<{
        accessToken: string;
        refreshToken: string;
        user: AuthUser;
        verificationEmailSent?: boolean;
      }>('/api/auth/register', {
        body: { name, email, password, role, phone: phone || undefined },
        skipAuthRefresh: true
      });
      saveSession(res.accessToken, res.user, res.refreshToken);
      router.replace(dashboardPath(res.user.role));
    } catch (err) {
      let msg = 'Registration failed...';
      if (err instanceof ApiError && err.status === 409) msg = 'Email already in use...';
      else if (err instanceof ApiError && err.status === 400) msg = 'Please check your input (password must be 8+ chars)...';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="center">
      <form onSubmit={submit} className="card auth-card">
        <h2>Create account</h2>
        <div className="field">
          <label>Full name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <div className="field-help">We'll send a verification link here.</div>
        </div>
        <div className="field">
          <label>Password</label>
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          <div className="field-help">Minimum 8 characters.</div>
        </div>
        <div className="field">
          <label>Phone <span className="muted">(optional)</span></label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="field">
          <label>Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="user">User - find recyclers near me</option>
            <option value="recycler">Recycler - list my store</option>
          </select>
        </div>
        {error && <div className="muted" style={{ color: 'var(--danger)' }}>{error}</div>}
        <button type="submit" disabled={loading} style={{ width: '100%', marginTop: 10 }}>
          {loading ? 'Creating...' : 'Create account'}
        </button>
        <p className="muted" style={{ marginTop: 12 }}>
          Already have an account? <Link href="/login">Log in</Link>
        </p>
      </form>
    </div>
  );
}
