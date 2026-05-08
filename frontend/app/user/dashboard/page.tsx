'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import RoleGuard from '@/components/RoleGuard';
import Nav from '@/components/Nav';
import StoreCard from '@/components/StoreCard';
import StoreDetail from '@/components/StoreDetail';
import PickupForm from '@/components/PickupForm';
import ReviewForm from '@/components/ReviewForm';
import ReviewList from '@/components/ReviewList';
import StatusTimeline from '@/components/StatusTimeline';
import Toast from '@/components/Toast';
import { api, ApiError } from '@/lib/api';
import { getCurrentPosition, type Coords } from '@/lib/geolocation';
import { getToken, getRefreshToken, getUser, saveSession } from '@/lib/auth';
import {
  CATEGORIES,
  type AuthUser,
  type Category,
  type ContactedStore,
  type Pickup,
  type Store
} from '@/lib/types';

const RADIUS_OPTIONS = [5, 10, 25, 50, 100];

// User dashboard route component, gated to the user role.
export default function UserDashboard() {
  return (
    <RoleGuard role="user">
      <Nav title="Find recyclers" />
      <Inner />
    </RoleGuard>
  );
}

// Inner user UI: store discovery, contact / revoke, pickups, reviews, and verify-email banner.
function Inner() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locError, setLocError] = useState<string | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [contactedIds, setContactedIds] = useState<Set<number>>(new Set());
  const [connectedIds, setConnectedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [radiusKm, setRadiusKm] = useState(25);
  const [category, setCategory] = useState<Category | ''>('');
  const [toast, setToast] = useState<{ msg: string; kind?: 'info' | 'error' } | null>(null);
  const [openStore, setOpenStore] = useState<Store | null>(null);
  const [pickupStore, setPickupStore] = useState<Store | null>(null);
  const [pickups, setPickups] = useState<Pickup[]>([]);
  const [reviewPickup, setReviewPickup] = useState<Pickup | null>(null);
  const [me, setMe] = useState<AuthUser | null>(null);
  const [resending, setResending] = useState(false);
  const unverified = !!me && !me.emailVerifiedAt;

  useEffect(() => {
    getCurrentPosition()
      .then(setCoords)
      .catch((e) => setLocError(e.message));
  }, []);

  useEffect(() => {
    setMe(getUser());
    api<{ user: AuthUser }>('/api/auth/me')
      .then((r) => {
        setMe(r.user);
        const token = getToken();
        if (token) saveSession(token, r.user, getRefreshToken() || undefined);
      })
      .catch(() => {});
  }, []);

  // Sends a fresh verification email and surfaces rate-limit errors via toast.
  async function resendVerification() {
    if (!me) return;
    setResending(true);
    try {
      await api('/api/auth/resend-verification', {
        body: { email: me.email },
        skipAuthRefresh: true
      });
      setToast({ msg: 'Verification email sent. Check your inbox...' });
    } catch (err) {
      const msg =
        err instanceof ApiError && err.status === 429
          ? 'Please wait a minute before requesting another email...'
          : 'Could not send verification email...';
      setToast({ msg, kind: 'error' });
    } finally {
      setResending(false);
    }
  }

  // Fetches the user's contacted stores and rebuilds contacted/connected ID sets.
  const loadContacted = useCallback(async () => {
    try {
      const r = await api<{ contacts: ContactedStore[] }>('/api/stores/contacted');
      setContactedIds(new Set(r.contacts.map((c) => c.store.id)));
      setConnectedIds(
        new Set(
          r.contacts
            .filter((c) => !!c.recyclerConnectedAt)
            .map((c) => c.store.id)
        )
      );
    } catch {}
  }, []);

  useEffect(() => { void loadContacted(); }, [loadContacted]);

  // Fetches every pickup the user has scheduled.
  const loadPickups = useCallback(async () => {
    try {
      const res = await api<{ pickups: Pickup[] }>('/api/pickups/mine');
      setPickups(res.pickups);
    } catch {}
  }, []);

  useEffect(() => { void loadPickups(); }, [loadPickups]);

  // Fetches approved stores around the user's location with the current filters applied.
  const fetchStores = useCallback(async () => {
    if (!coords) return;
    setLoading(true);
    try {
      const res = await api<{ stores: Store[] }>('/api/stores', {
        query: {
          lat: coords.lat,
          lng: coords.lng,
          radiusKm,
          category: category || undefined
        }
      });
      setStores(res.stores);
    } catch {
      setToast({ msg: 'Failed to load stores...', kind: 'error' });
    } finally {
      setLoading(false);
    }
  }, [coords, radiusKm, category]);

  useEffect(() => { fetchStores(); }, [fetchStores]);

  // Sends a Contact, optimistically updating local state and surfacing the email-verified gate.
  async function contact(store: Store) {
    if (!window.confirm(
      `Share your name, email and phone with ${store.storeName} so they can reach out about your e-waste? You can revoke until the recycler connects back.`
    )) return;
    try {
      const res = await api<{ status: string; storeName: string }>(`/api/stores/${store.id}/contact`, {
        method: 'POST'
      });
      setContactedIds((prev) => new Set(prev).add(store.id));
      setToast({ msg: `Contacted ${res.storeName}.` });
      void loadContacted();
    } catch (err) {
      const e = err as { status?: number; body?: { error?: string; message?: string } };
      if (e?.status === 403 && e?.body?.error === 'email_unverified') {
        setToast({ msg: 'Verify your email before contacting a store...', kind: 'error' });
      } else {
        setToast({ msg: 'Could not contact store...', kind: 'error' });
      }
    }
  }

  // Revokes a Contact unless the recycler has already initiated a Connect.
  async function revokeContact(store: Store) {
    if (connectedIds.has(store.id)) {
      setToast({
        msg: 'Cannot revoke - the recycler has already connected with you...',
        kind: 'error'
      });
      return;
    }
    if (!window.confirm(`Revoke your contact with ${store.storeName}?`)) return;
    try {
      await api(`/api/stores/${store.id}/contact`, { method: 'DELETE' });
      setContactedIds((prev) => {
        const next = new Set(prev);
        next.delete(store.id);
        return next;
      });
      setToast({ msg: `Contact revoked.` });
    } catch (err) {
      const e = err as { status?: number; body?: { error?: string; message?: string } };
      if (e?.status === 400 && e?.body?.error === 'connection_locked') {
        setToast({
          msg: e.body.message || 'Cannot revoke after the recycler has connected...',
          kind: 'error'
        });
        void loadContacted();
      } else {
        setToast({ msg: 'Could not revoke contact...', kind: 'error' });
      }
    }
  }

  // Cancels one of the user's pickups after a confirmation prompt.
  async function cancelPickup(p: Pickup) {
    if (!window.confirm('Cancel this pickup?')) return;
    try {
      await api(`/api/pickups/${p.id}/cancel`, { method: 'PATCH', body: {} });
      setToast({ msg: 'Pickup cancelled.' });
      void loadContacted();
      void loadPickups();
    } catch {
      setToast({ msg: 'Could not cancel pickup...', kind: 'error' });
    }
  }

  const sortedStores = useMemo(() => stores, [stores]);

  return (
    <div className="container">
      {unverified && (
        <div
          className="section"
          style={{ borderColor: 'var(--warn)', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}
        >
          <div>
            <strong style={{ color: 'var(--warn)' }}>Verify your email</strong>
            <div className="muted" style={{ marginTop: 2 }}>
              Contacting stores is disabled until you verify your email address...
            </div>
          </div>
          <button type="button" className="secondary" onClick={resendVerification} disabled={resending}>
            {resending ? 'Sending...' : 'Resend verification email'}
          </button>
        </div>
      )}

      <div className="section sticky-bar">
        <div className="row">
          <div>
            <label>Radius (km)</label>
            <select value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))}>
              {RADIUS_OPTIONS.map((r) => <option key={r} value={r}>{r} km</option>)}
            </select>
          </div>
          <div>
            <label>Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value as Category | '')}>
              <option value="">All categories</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label>Your location</label>
            <div className="muted" style={{ paddingTop: 8 }}>
              {coords
                ? `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`
                : locError
                ? <span style={{ color: 'var(--danger)' }}>{locError}</span>
                : 'Detecting...'}
            </div>
          </div>
        </div>
      </div>

      {!coords && !locError && <p className="muted">Waiting for browser location...</p>}
      {locError && (
        <p className="muted">
          Allow location access to see stores sorted by distance.
        </p>
      )}

      {coords && (
        <>
          {loading && (
            <>
              <div className="skeleton skeleton-card" />
              <div className="skeleton skeleton-card" />
              <div className="skeleton skeleton-card" />
            </>
          )}
          {!loading && sortedStores.length === 0 && (
            <div className="section" style={{ textAlign: 'center' }}>
              <p className="muted" style={{ marginTop: 0 }}>
                No stores found within {radiusKm} km.
              </p>
              {radiusKm < 100 && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setRadiusKm(radiusKm < 25 ? 25 : radiusKm < 50 ? 50 : 100)}
                >
                  Try {radiusKm < 25 ? 25 : radiusKm < 50 ? 50 : 100} km
                </button>
              )}
            </div>
          )}
          {!loading && sortedStores.length > 0 && (
            <p className="muted" style={{ marginTop: 4, marginBottom: 8 }}>
              Showing {sortedStores.length} {sortedStores.length === 1 ? 'store' : 'stores'} within {radiusKm} km.
            </p>
          )}
          {sortedStores.map((s) => (
            <StoreCard
              key={s.id}
              store={s}
              contacted={contactedIds.has(s.id)}
              connected={connectedIds.has(s.id)}
              unverified={unverified}
              onContact={contact}
              onRevoke={revokeContact}
              onOpen={setOpenStore}
            />
          ))}
        </>
      )}

      <div className="section" style={{ marginTop: 16 }}>
        <h3>My pickups</h3>
        {pickups.length === 0 ? (
          <HowItWorks />
        ) : (
          pickups.map((p) => (
            <MyPickupRow
              key={p.id}
              pickup={p}
              onCancel={() => cancelPickup(p)}
              onLeaveReview={() => setReviewPickup(p)}
            />
          ))
        )}
      </div>

      {openStore && (
        <StoreDetail
          store={openStore}
          onClose={() => setOpenStore(null)}
          onSchedulePickup={(s) => {
            setOpenStore(null);
            setPickupStore(s);
          }}
          reviewSlot={<ReviewList storeId={openStore.id} />}
        />
      )}

      {pickupStore && (
        <PickupForm
          store={pickupStore}
          onClose={() => setPickupStore(null)}
          onCreated={() => {
            setPickupStore(null);
            setToast({ msg: 'Pickup requested. The recycler will respond soon.' });
            void loadPickups();
          }}
        />
      )}

      {reviewPickup && (
        <ReviewForm
          pickup={reviewPickup}
          onClose={() => setReviewPickup(null)}
          onSubmitted={() => {
            setReviewPickup(null);
            setToast({ msg: 'Thanks for your review.' });
            void loadPickups();
          }}
        />
      )}

      {toast && <Toast message={toast.msg} kind={toast.kind} onDone={() => setToast(null)} />}
    </div>
  );
}

// Single row in the My-pickups list with item summary, status timeline, total weight, and contextual buttons.
function MyPickupRow({
  pickup,
  onCancel,
  onLeaveReview
}: {
  pickup: Pickup;
  onCancel: () => void;
  onLeaveReview: () => void;
}) {
  const canCancel = pickup.status === 'requested' || pickup.status === 'confirmed';
  const canReview = pickup.status === 'completed' && !pickup.review;
  const totalKg = pickup.items.reduce((sum, it) => sum + (it.estimatedWeightKg || 0) * it.quantity, 0);
  return (
    <div className="card">
      <div>
        <h3 style={{ margin: 0 }}>{pickup.store?.storeName || 'Store'}</h3>
        <div className="muted">
          {pickup.scheduledDate} - {pickup.timeSlot}
        </div>
        <div className="muted">{pickup.address}</div>
      </div>
      <div style={{ marginTop: 10 }}>
        <StatusTimeline status={pickup.status} />
      </div>
      <div style={{ marginTop: 10 }}>
        {pickup.items.map((it) => (
          <span key={it.id} className="chip">
            {it.category} x {it.quantity}
            {it.estimatedWeightKg ? ` (${it.estimatedWeightKg} kg)` : ''}
          </span>
        ))}
      </div>
      {totalKg > 0 && (
        <div className="muted" style={{ marginTop: 4 }}>~ {totalKg.toFixed(1)} kg total</div>
      )}
      {pickup.notes && <p className="muted" style={{ marginTop: 4 }}>Notes: {pickup.notes}</p>}
      {pickup.cancelReason && <p className="muted" style={{ marginTop: 4 }}>Reason: {pickup.cancelReason}</p>}
      {pickup.review && (
        <p className="muted" style={{ marginTop: 4 }}>You rated this {pickup.review.rating}/5.</p>
      )}
      <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {canReview && <button onClick={onLeaveReview}>Leave a review</button>}
        {canCancel && <button className="danger" onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  );
}

// Inline 3-step "how it works" panel shown when the user has zero pickups, to orient them.
function HowItWorks() {
  const steps = [
    { n: 1, title: 'Find a recycler', body: 'Use the radius and category filters above to see the closest matches.' },
    { n: 2, title: 'Schedule a pickup', body: 'Open a store, choose a date and time slot, and list what you want to recycle.' },
    { n: 3, title: 'Confirm and rate', body: 'Once the recycler completes the pickup, leave a star rating to help others.' }
  ];
  return (
    <div className="grid-2" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
      {steps.map((s) => (
        <div key={s.n} className="card" style={{ marginBottom: 0 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: 'var(--accent-strong)',
              color: '#04130a',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 14,
              marginBottom: 8
            }}
          >
            {s.n}
          </div>
          <div style={{ fontWeight: 600 }}>{s.title}</div>
          <div className="muted" style={{ marginTop: 4 }}>{s.body}</div>
        </div>
      ))}
    </div>
  );
}
