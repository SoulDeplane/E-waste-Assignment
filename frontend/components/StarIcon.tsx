// Inline SVG star used wherever a rating glyph appears, so the visual is consistent across themes and browsers.
export default function StarIcon({ size = 14, filled = true }: { size?: number; filled?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.6}
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: 'inline-block', verticalAlign: '-2px' }}
    >
      <path d="M12 2.6l2.95 6.36 6.97.73-5.21 4.71 1.5 6.86L12 17.78 5.79 21.26l1.5-6.86L2.08 9.69l6.97-.73L12 2.6z" />
    </svg>
  );
}
