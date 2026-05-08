'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';

// Auto-submits the verification token from the URL and shows success or failure feedback.
function VerifyInner() {
  const params = useSearchParams();
  const token = params.get('token') || '';
  const [state, setState] = useState<'pending' | 'ok' | 'fail'>('pending');

  useEffect(() => {
    if (!token) {
      setState('fail');
      return;
    }
    api('/api/auth/verify-email', { body: { token }, skipAuthRefresh: true })
      .then(() => setState('ok'))
      .catch(() => setState('fail'));
  }, [token]);

  return (
    <div className="center">
      <div className="card auth-card">
        <h2>Email verification</h2>
        {state === 'pending' && <p className="muted">Verifying your email...</p>}
        {state === 'ok' && (
          <>
            <p>Your email is verified. You can now log in.</p>
            <p className="muted" style={{ marginTop: 12 }}>
              <Link href="/login">Go to log in</Link>
            </p>
          </>
        )}
        {state === 'fail' && (
          <>
            <p style={{ color: 'var(--danger)' }}>This verification link is invalid or has expired...</p>
            <p className="muted" style={{ marginTop: 12 }}>
              <Link href="/login">Back to log in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// Page wrapper that supplies a Suspense boundary required by useSearchParams().
export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="center muted">Loading...</div>}>
      <VerifyInner />
    </Suspense>
  );
}
