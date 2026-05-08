'use client';
import { forwardRef, useState } from 'react';

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>;

// Password input that adds an eye icon on the right edge to toggle plaintext visibility.
const PasswordInput = forwardRef<HTMLInputElement, Props>(function PasswordInput(props, ref) {
  const [shown, setShown] = useState(false);
  const { style, ...rest } = props;
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        ref={ref}
        type={shown ? 'text' : 'password'}
        {...rest}
        style={{ paddingRight: 40, ...style }}
      />
      <button
        type="button"
        aria-label={shown ? 'Hide password' : 'Show password'}
        title={shown ? 'Hide password' : 'Show password'}
        onClick={() => setShown((s) => !s)}
        tabIndex={-1}
        style={{
          position: 'absolute',
          top: '50%',
          right: 6,
          transform: 'translateY(-50%)',
          background: 'transparent',
          border: 0,
          padding: 4,
          color: 'var(--muted)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {shown ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
});

export default PasswordInput;

// SVG eye icon shown when the password is currently masked.
function EyeIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// SVG crossed-out eye icon shown when the password is currently visible.
function EyeOffIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a19.78 19.78 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a19.5 19.5 0 0 1-3.36 4.42" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}
