'use client';
import { useEffect, useRef, useState } from 'react';

// Auto-dismissing notification banner; pauses on hover and exposes an explicit close button.
export default function Toast({
  message,
  kind = 'info',
  onDone
}: {
  message: string;
  kind?: 'info' | 'error';
  onDone: () => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    timer.current = setTimeout(onDone, 4000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [onDone, paused]);

  return (
    <div
      className={`toast ${kind === 'error' ? 'error' : ''}`}
      role={kind === 'error' ? 'alert' : 'status'}
      aria-live={kind === 'error' ? 'assertive' : 'polite'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 12 }}
    >
      <span style={{ flex: 1 }}>{message}</span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDone}
        className="secondary"
        style={{
          background: 'transparent',
          padding: 4,
          color: 'var(--muted)',
          boxShadow: 'none',
          minHeight: 'auto'
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="6" y1="18" x2="18" y2="6" />
        </svg>
      </button>
    </div>
  );
}
