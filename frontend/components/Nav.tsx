'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { clearSession, getRefreshToken, getUser, saveSession, getToken } from '@/lib/auth';
import { api } from '@/lib/api';
import { useTheme } from '@/components/ThemeProvider';
import Avatar from '@/components/Avatar';
import ProfileEditModal from '@/components/ProfileEditModal';
import type { AuthUser } from '@/lib/types';

// Top navigation bar with a profile-button dropdown that exposes Edit profile, theme toggle, and Log out.
export default function Nav({ title }: { title: string }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const { theme, toggle } = useTheme();
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setUser(getUser()), []);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Revokes the refresh token server-side and clears local session before routing to /login.
  async function logout() {
    setOpen(false);
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      await api('/api/auth/logout', {
        body: { refreshToken },
        skipAuthRefresh: true
      }).catch(() => {});
    }
    clearSession();
    router.replace('/login');
  }

  // Refreshes local user state after a profile edit and forces re-login if the email changed.
  function onProfileSaved(updated: AuthUser, info?: { passwordChanged?: boolean; needsReverification?: boolean }) {
    setUser(updated);
    const token = getToken();
    if (token) saveSession(token, updated, getRefreshToken() || undefined);
    if (info?.needsReverification) {
      setEditing(false);
      setOpen(false);
      clearSession();
      router.replace('/login');
    }
  }

  return (
    <div className="nav">
      <div className="brand">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-9-9" />
          <path d="M21 3v6h-6" />
          <path d="M9 12l2 2 4-4" />
        </svg>
        <span>E-Waste</span>
        <span className="muted" style={{ fontWeight: 500, marginLeft: 4 }}>· {title}</span>
      </div>
      <div ref={wrapRef} style={{ position: 'relative' }}>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Open profile menu"
          onClick={() => setOpen((o) => !o)}
          className="secondary"
          style={{
            background: 'transparent',
            padding: 2,
            borderRadius: '50%',
            border: open ? '1px solid var(--accent)' : '1px solid transparent',
            cursor: 'pointer'
          }}
        >
          <Avatar src={user?.profilePicUrl} size={36} alt={user ? `${user.name} profile picture` : 'Profile'} />
        </button>

        {open && user && (
          <div
            role="menu"
            style={{
              position: 'absolute',
              right: 0,
              top: 'calc(100% + 8px)',
              minWidth: 240,
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
              padding: 12,
              zIndex: 30
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
              <Avatar src={user.profilePicUrl} size={48} alt={`${user.name} profile picture`} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</div>
                <div className="muted" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user.email}
                </div>
              </div>
            </div>

            <div
              className="muted"
              style={{
                fontSize: 12,
                padding: '8px 0',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8
              }}
            >
              <span className="badge">{user.role}</span>
              {user.phone && <span>{user.phone}</span>}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 8 }}>
              <button
                type="button"
                className="secondary"
                onClick={() => { setEditing(true); setOpen(false); }}
                style={{ textAlign: 'center' }}
              >
                Edit profile
              </button>
              <button
                type="button"
                className="secondary"
                onClick={toggle}
                title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                style={{ textAlign: 'center' }}
              >
                {theme === 'dark' ? 'Light mode' : 'Dark mode'}
              </button>
              <button type="button" className="danger" onClick={logout} style={{ textAlign: 'center' }}>
                Log out
              </button>
            </div>
          </div>
        )}
      </div>

      {editing && user && (
        <ProfileEditModal
          user={user}
          onClose={() => setEditing(false)}
          onSaved={onProfileSaved}
        />
      )}
    </div>
  );
}
