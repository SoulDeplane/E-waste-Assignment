'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import StarIcon from '@/components/StarIcon';
import type { Review } from '@/lib/types';

// Fetches and renders the latest reviews for a single store, with average rating header.
export default function ReviewList({ storeId }: { storeId: number }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [count, setCount] = useState(0);
  const [avg, setAvg] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<{ reviews: Review[]; count: number; avgRating: number | null }>(
      `/api/stores/${storeId}/reviews`
    )
      .then((r) => {
        if (cancelled) return;
        setReviews(r.reviews);
        setCount(r.count);
        setAvg(r.avgRating);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  if (loading) return <p className="muted" style={{ marginTop: 12 }}>Loading reviews...</p>;
  if (count === 0) return <p className="muted" style={{ marginTop: 12 }}>No reviews yet.</p>;

  return (
    <div style={{ marginTop: 12 }}>
      <div className="muted">Reviews</div>
      <div style={{ marginTop: 4, marginBottom: 8, display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--warn)' }}>
        <StarIcon size={14} /> <strong style={{ color: 'var(--text)' }}>{avg?.toFixed(1)}</strong> <span className="muted">({count})</span>
      </div>
      {reviews.map((r) => (
        <div key={r.id} className="card" style={{ padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--warn)' }}>
              <StarIcon size={13} /> <strong style={{ color: 'var(--text)' }}>{r.rating}/5</strong>
            </span>
            <span className="muted">
              {r.user?.name || 'User'} · {new Date(r.createdAt).toLocaleDateString()}
            </span>
          </div>
          {r.comment && <p style={{ marginTop: 6, marginBottom: 0 }}>{r.comment}</p>}
        </div>
      ))}
    </div>
  );
}
