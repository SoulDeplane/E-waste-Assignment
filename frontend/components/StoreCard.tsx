'use client';
import { assetUrl } from '@/lib/api';
import StarIcon from '@/components/StarIcon';
import type { Day, Store } from '@/lib/types';

const PAYMENT_LABEL: Record<string, string> = {
  pays: 'Pays for items',
  free: 'Free drop-off',
  fee: 'Service fee'
};

const SERVICE_LABEL: Record<string, string> = {
  dropoff: 'Drop-off',
  pickup: 'Pickup',
  both: 'Drop-off + Pickup'
};

const DAY_KEYS: Day[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// Returns a small label describing whether the store is currently open, or null if hours aren't set.
function openNow(store: Store): { open: boolean; label: string } | null {
  if (!store.openTime || !store.closeTime) return null;
  const days = (store.openDays || []) as Day[];
  if (days.length === 0) return null;
  const now = new Date();
  const todayKey = DAY_KEYS[now.getDay()];
  if (!days.includes(todayKey)) return { open: false, label: 'Closed today' };
  const [oH, oM] = store.openTime.split(':').map(Number);
  const [cH, cM] = store.closeTime.split(':').map(Number);
  const mins = now.getHours() * 60 + now.getMinutes();
  const oMin = oH * 60 + oM;
  const cMin = cH * 60 + cM;
  if (mins >= oMin && mins < cMin) return { open: true, label: `Open - closes at ${store.closeTime}` };
  if (mins < oMin) return { open: false, label: `Opens at ${store.openTime}` };
  return { open: false, label: 'Closed' };
}

// Compact store summary card with Details, Contact, Revoke, and connection-state badges.
export default function StoreCard({
  store,
  contacted,
  connected,
  unverified,
  onContact,
  onRevoke,
  onOpen
}: {
  store: Store;
  contacted: boolean;
  connected?: boolean;
  unverified?: boolean;
  onContact: (s: Store) => void;
  onRevoke: (s: Store) => void;
  onOpen: (s: Store) => void;
}) {
  const logo = assetUrl(store.logoUrl);
  const status = openNow(store);

  return (
    <div className="card hoverable" style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 8,
          background: 'var(--panel-2)',
          flexShrink: 0,
          backgroundImage: logo ? `url(${logo})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          border: '1px solid var(--border)'
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
          <h3 style={{ margin: 0 }}>{store.storeName}</h3>
          {typeof store.distance_km === 'number' && (
            <span className="muted">{store.distance_km.toFixed(1)} km away</span>
          )}
        </div>
        {typeof store.avgRating === 'number' && (store.reviewCount || 0) > 0 && (
          <div className="muted" style={{ marginTop: 2, display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--warn)' }}>
            <StarIcon size={13} /> <span style={{ color: 'var(--text)', fontWeight: 600 }}>{store.avgRating.toFixed(1)}</span>
            <span style={{ color: 'var(--muted)' }}>({store.reviewCount})</span>
          </div>
        )}
        {store.address && <div className="muted">{store.address}</div>}
        <div style={{ marginTop: 8 }}>
          {store.categories?.map((c) => (
            <span key={c} className="chip">{c}</span>
          ))}
        </div>
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {status && (
            <span
              className="muted"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                color: status.open ? 'var(--accent-strong)' : 'var(--muted)',
                fontWeight: 500
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: status.open ? 'var(--accent-strong)' : 'var(--muted)',
                  display: 'inline-block'
                }}
              />
              {status.label}
            </span>
          )}
          {store.yearEstablished && <span className="muted">since {store.yearEstablished}</span>}
          {store.serviceMode && <span className="chip">{SERVICE_LABEL[store.serviceMode]}</span>}
          {store.paymentPolicy && <span className="chip">{PAYMENT_LABEL[store.paymentPolicy]}</span>}
          {store.licenceNumber && <span className="badge verified" title={`Licence ${store.licenceNumber}`}>Verified</span>}
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="secondary" onClick={() => onOpen(store)}>Details</button>
          {contacted ? (
            connected ? (
              <span className="badge live" style={{ alignSelf: 'center' }}>
                Recycler wants to connect
              </span>
            ) : (
              <>
                <span className="badge contacted" style={{ alignSelf: 'center' }}>Contacted</span>
                <button className="secondary" onClick={() => onRevoke(store)}>Revoke contact</button>
              </>
            )
          ) : (
            <button
              onClick={() => onContact(store)}
              disabled={unverified}
              title={unverified ? 'Verify your email to contact stores...' : undefined}
            >
              Contact
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
