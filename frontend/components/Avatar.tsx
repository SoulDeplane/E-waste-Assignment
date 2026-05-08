'use client';
import { assetUrl } from '@/lib/api';

// Renders a user's profile picture or a default silhouette icon when no picture is set.
export default function Avatar({
  src,
  size = 36,
  alt
}: {
  src?: string | null;
  size?: number;
  alt?: string;
}) {
  const url = assetUrl(src);
  if (url) {
    return (
      <img
        src={url}
        alt={alt || 'Profile picture'}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          border: '1px solid var(--border)',
          background: 'var(--panel-2)',
          display: 'block'
        }}
      />
    );
  }
  return (
    <div
      role="img"
      aria-label={alt || 'No profile picture'}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'var(--panel-2)',
        border: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--muted)'
      }}
    >
      <svg
        width={Math.round(size * 0.6)}
        height={Math.round(size * 0.6)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    </div>
  );
}
