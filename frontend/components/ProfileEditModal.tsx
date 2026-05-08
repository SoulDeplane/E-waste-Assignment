'use client';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import Avatar from '@/components/Avatar';
import PasswordInput from '@/components/PasswordInput';
import type { AuthUser } from '@/lib/types';

// Modal that lets the signed-in user update their name, email, phone, password, and profile picture.
export default function ProfileEditModal({
  user,
  onClose,
  onSaved
}: {
  user: AuthUser;
  onClose: () => void;
  onSaved: (u: AuthUser, info?: { passwordChanged?: boolean; needsReverification?: boolean }) => void;
}) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [picUrl, setPicUrl] = useState<string | null | undefined>(user.profilePicUrl);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const emailChanged = email.trim().toLowerCase() !== user.email.toLowerCase();
  const passwordChanging = newPassword.length > 0;
  const needsCurrent = emailChanged || passwordChanging;

  // Posts a new avatar image and updates local preview + parent state on success.
  async function uploadAvatar(file: File) {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      const res = await api<{ user: AuthUser }>('/api/auth/me/avatar', { formData: fd });
      setPicUrl(res.user.profilePicUrl);
      onSaved(res.user);
    } catch (err) {
      const msg =
        err instanceof ApiError && err.status === 413
          ? 'Picture too large (max 2 MB)...'
          : 'Upload failed (jpg/png/webp, max 2 MB)...';
      setError(msg);
    } finally {
      setUploading(false);
    }
  }

  // Submits the profile diff to PATCH /api/auth/me, surfacing reverification or password-change side effects.
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (passwordChanging && newPassword !== confirmPassword) {
      setError('New passwords do not match...');
      return;
    }
    if (passwordChanging && newPassword.length < 8) {
      setError('New password must be at least 8 characters...');
      return;
    }

    const body: Record<string, unknown> = {};
    if (name.trim() && name !== user.name) body.name = name.trim();
    if (phone !== (user.phone || '')) body.phone = phone || null;
    if (emailChanged) body.email = email.trim();
    if (passwordChanging) body.newPassword = newPassword;
    if (needsCurrent) body.currentPassword = currentPassword;

    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      const res = await api<{
        user: AuthUser;
        passwordChanged?: boolean;
        needsReverification?: boolean;
      }>('/api/auth/me', { method: 'PATCH', body });

      const messages: string[] = ['Profile updated.'];
      if (res.needsReverification) {
        messages.push('Verification email sent to your new address.');
      }
      if (res.passwordChanged) {
        messages.push('Password changed - other sessions signed out.');
      }
      setInfo(messages.join(' '));
      onSaved(res.user, {
        passwordChanged: res.passwordChanged,
        needsReverification: res.needsReverification
      });
    } catch (err) {
      let msg = 'Could not save changes...';
      if (err instanceof ApiError) {
        if (err.status === 401) msg = 'Current password is incorrect...';
        else if (err.status === 409) msg = 'That email is already in use...';
        else if (err.status === 400) {
          const body = err.body as { error?: { fieldErrors?: Record<string, string[]> } | string };
          if (typeof body?.error === 'string') msg = body.error;
          else msg = 'Please check the form fields...';
        }
      }
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      onClick={onClose}
      className="modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 70
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="card modal-card"
        style={{ maxWidth: 520, width: '100%', maxHeight: '92vh', overflowY: 'auto' }}
      >
        <h2 style={{ marginTop: 0 }}>Edit profile</h2>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar src={picUrl} size={72} alt={`${user.name} profile picture`} />
          <div style={{ flex: 1 }}>
            <label>Profile picture</label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadAvatar(f);
              }}
              disabled={uploading}
            />
            <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>
              jpg/png/webp - max 2 MB
            </div>
          </div>
        </div>

        <hr style={{ borderColor: 'var(--border)', margin: '16px 0' }} />

        <div className="field">
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
        </div>
        <div className="field">
          <label>Email {emailChanged && <span className="muted">- requires re-verification</span>}</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label>Phone</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} />
        </div>
        <div className="field">
          <label>Role</label>
          <input value={user.role} disabled />
        </div>

        <hr style={{ borderColor: 'var(--border)', margin: '16px 0' }} />

        <h3 style={{ margin: '8px 0' }}>Change password (optional)</h3>
        <div className="form-grid">
          <div className="field">
            <label>New password</label>
            <PasswordInput
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <div className="field">
            <label>Confirm new password</label>
            <PasswordInput
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={8}
              autoComplete="new-password"
            />
          </div>
        </div>

        {needsCurrent && (
          <div className="field">
            <label>Current password (required to change email or password)</label>
            <PasswordInput
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
        )}

        {error && <div className="muted" style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</div>}
        {info && <div className="muted" style={{ color: 'var(--accent)', marginTop: 8 }}>{info}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" className="secondary" onClick={onClose} disabled={saving}>Close</button>
          <button type="submit" disabled={saving || uploading}>
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
