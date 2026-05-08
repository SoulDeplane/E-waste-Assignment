'use client';
import type { PickupStatus } from '@/lib/types';

const STEPS: { key: PickupStatus; label: string }[] = [
  { key: 'requested', label: 'Requested' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'completed', label: 'Completed' }
];

// Horizontal stepper that visualises a Pickup's progress through requested -> confirmed -> completed.
export default function StatusTimeline({ status }: { status: PickupStatus }) {
  if (status === 'declined' || status === 'cancelled') {
    return (
      <span className={`badge ${status === 'declined' ? 'rejected' : 'rejected'}`} style={{ alignSelf: 'flex-start' }}>
        {status === 'declined' ? 'Declined by recycler' : 'Cancelled'}
      </span>
    );
  }

  const currentIndex = STEPS.findIndex((s) => s.key === status);

  return (
    <div className="status-timeline" aria-label={`Pickup status: ${status}`}>
      {STEPS.map((s, i) => {
        const done = i < currentIndex;
        const current = i === currentIndex;
        const cls = done ? 'done' : current ? 'current' : '';
        return (
          <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span className={`step ${cls}`}>
              <span className="dot">{done ? '✓' : i + 1}</span>
              {s.label}
            </span>
            {i < STEPS.length - 1 && <span className={`bar ${done ? 'done' : ''}`} />}
          </span>
        );
      })}
    </div>
  );
}
