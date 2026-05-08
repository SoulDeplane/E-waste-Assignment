'use client';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import StarIcon from '@/components/StarIcon';
import type { Pickup, Review } from '@/lib/types';

// Modal dialog where the user submits a 1-5 star rating and optional comment for a completed pickup.
export default function ReviewForm({
  pickup,
  onClose,
  onSubmitted
}: {
  pickup: Pickup;
  onClose: () => void;
  onSubmitted: (r: Review) => void;
}) {
  const [rating, setRating] = useState<number>(5);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Posts the rating and comment to the API and forwards the new review to the parent on success.
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await api<{ review: Review }>('/api/reviews', {
        body: { pickupId: pickup.id, rating, comment: comment || null }
      });
      onSubmitted(res.review);
    } catch (err) {
      const msg =
        err instanceof ApiError && err.status === 409
          ? 'You already reviewed this pickup...'
          : err instanceof ApiError && err.status === 400
          ? 'Could not submit review...'
          : 'Submission failed...';
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
        zIndex: 60
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="card modal-card"
        style={{ maxWidth: 480, width: '100%' }}
      >
        <h2 style={{ marginTop: 0 }}>Leave a review</h2>
        <p className="muted">
          {pickup.store?.storeName} {'-'} {pickup.scheduledDate}
        </p>
        <div className="field">
          <label>Rating</label>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                type="button"
                key={n}
                onClick={() => setRating(n)}
                aria-label={`${n} star${n > 1 ? 's' : ''}`}
                className="secondary"
                style={{
                  padding: '6px 8px',
                  background: 'transparent',
                  color: n <= rating ? 'var(--warn)' : 'var(--muted)',
                  boxShadow: 'none'
                }}
              >
                <StarIcon size={22} filled={n <= rating} />
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Comment (optional)</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={1000}
            placeholder="How was your experience..."
          />
        </div>
        {error && <div className="muted" style={{ color: 'var(--danger)' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <button type="button" className="secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" disabled={saving}>{saving ? 'Submitting...' : 'Submit review'}</button>
        </div>
      </form>
    </div>
  );
}
