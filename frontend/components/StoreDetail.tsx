'use client';
import { assetUrl } from '@/lib/api';
import StarIcon from '@/components/StarIcon';
import type { Store } from '@/lib/types';

const DAY_LABEL: Record<string, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun'
};

// Modal showing the full store profile, with optional Schedule-pickup CTA and a slot for the review list.
export default function StoreDetail({
  store,
  onClose,
  onSchedulePickup,
  reviewSlot
}: {
  store: Store;
  onClose: () => void;
  onSchedulePickup?: (s: Store) => void;
  reviewSlot?: React.ReactNode;
}) {
  const logo = assetUrl(store.logoUrl);
  const hasRating = typeof store.avgRating === 'number' && (store.reviewCount || 0) > 0;
  return (
    <div
      onClick={onClose}
      className="modal-overlay"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 40
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card modal-card"
        style={{ maxWidth: 560, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}
      >
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div
            style={{
              width: 72, height: 72, borderRadius: 10, background: 'var(--panel-2)',
              backgroundImage: logo ? `url(${logo})` : undefined,
              backgroundSize: 'cover', backgroundPosition: 'center',
              border: '1px solid var(--border)'
            }}
            role="img"
            aria-label={`${store.storeName} logo`}
          />
          <div>
            <h2 style={{ margin: 0 }}>{store.storeName}</h2>
            {hasRating && (
              <div className="muted" style={{ marginTop: 2, display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--warn)' }}>
                <StarIcon size={13} /> <span style={{ color: 'var(--text)', fontWeight: 600 }}>{store.avgRating!.toFixed(1)}</span>
                <span style={{ color: 'var(--muted)' }}>({store.reviewCount})</span>
              </div>
            )}
            {store.address && <div className="muted">{store.address}</div>}
          </div>
        </div>

        {store.description && <p style={{ marginTop: 16 }}>{store.description}</p>}

        <div className="grid-2" style={{ marginTop: 12 }}>
          {store.yearEstablished && <Info label="Operating since" value={String(store.yearEstablished)} />}
          {store.licenceNumber && <Info label="Licence #" value={store.licenceNumber} />}
          {store.serviceMode && <Info label="Service" value={store.serviceMode} />}
          {store.serviceMode !== 'dropoff' && store.pickupRadiusKm != null && (
            <Info label="Pickup radius" value={`${store.pickupRadiusKm} km`} />
          )}
          {store.paymentPolicy && <Info label="Payment" value={store.paymentPolicy} />}
          {store.openTime && store.closeTime && (
            <Info label="Hours" value={`${store.openTime} - ${store.closeTime}`} />
          )}
        </div>

        {store.openDays?.length ? (
          <div style={{ marginTop: 12 }}>
            <div className="muted">Open days</div>
            <div>{store.openDays.map((d) => <span key={d} className="chip">{DAY_LABEL[d] || d}</span>)}</div>
          </div>
        ) : null}

        {store.languages?.length ? (
          <div style={{ marginTop: 12 }}>
            <div className="muted">Languages</div>
            <div>{store.languages.map((l) => <span key={l} className="chip">{l}</span>)}</div>
          </div>
        ) : null}

        <div style={{ marginTop: 12 }}>
          <div className="muted">Accepted</div>
          <div>{store.categories?.map((c) => <span key={c} className="chip">{c}</span>)}</div>
        </div>

        {store.website && (
          <div style={{ marginTop: 12 }}>
            <a href={store.website} target="_blank" rel="noreferrer">{store.website}</a>
          </div>
        )}

        {reviewSlot}

        <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {onSchedulePickup && store.serviceMode === 'dropoff' ? (
            <span className="muted" style={{ alignSelf: 'center' }}>Drop-off only - no pickup available.</span>
          ) : (
            onSchedulePickup && (
              <button onClick={() => onSchedulePickup(store)}>Schedule pickup</button>
            )
          )}
          <button className="secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// Renders one label/value cell inside the StoreDetail info grid.
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="muted">{label}</div>
      <div>{value}</div>
    </div>
  );
}
