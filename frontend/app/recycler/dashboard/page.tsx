'use client';
import { useEffect, useState } from 'react';
import RoleGuard from '@/components/RoleGuard';
import Nav from '@/components/Nav';
import Toast from '@/components/Toast';
import { api, ApiError, assetUrl } from '@/lib/api';
import StarIcon from '@/components/StarIcon';
import { getCurrentPosition } from '@/lib/geolocation';
import {
  CATEGORIES,
  DAYS,
  type Category,
  type Day,
  type ServiceMode,
  type PaymentPolicy,
  type Pickup,
  type PickupStatus,
  type Review,
  type Store
} from '@/lib/types';

interface FormState {
  storeName: string;
  address: string;
  latitude: string;
  longitude: string;
  categories: Category[];
  description: string;
  yearEstablished: string;
  licenceNumber: string;
  website: string;
  openDays: Day[];
  openTime: string;
  closeTime: string;
  serviceMode: ServiceMode | '';
  pickupRadiusKm: string;
  paymentPolicy: PaymentPolicy | '';
}

const EMPTY: FormState = {
  storeName: '', address: '', latitude: '', longitude: '',
  categories: [], description: '', yearEstablished: '',
  licenceNumber: '', website: '',
  openDays: [], openTime: '', closeTime: '',
  serviceMode: '', pickupRadiusKm: '', paymentPolicy: ''
};

interface ContactReceivedRow {
  id: number;
  createdAt: string;
  status: string;
  recyclerConnectedAt?: string | null;
  user: { id: number; name: string; email: string; phone?: string | null };
}

// Recycler dashboard route component, gated to the recycler role.
export default function RecyclerDashboard() {
  return (
    <RoleGuard role="recycler">
      <Nav title="Recycler dashboard" />
      <Inner />
    </RoleGuard>
  );
}

// Inner recycler UI: store-profile form, pickups queue, reviews, and contacts table.
function Inner() {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<number | 'new' | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [contacts, setContacts] = useState<ContactReceivedRow[]>([]);
  const [pickups, setPickups] = useState<Pickup[]>([]);
  const [pickupFilter, setPickupFilter] = useState<PickupStatus | 'all'>('requested');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [busyPickupId, setBusyPickupId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ msg: string; kind?: 'info' | 'error' } | null>(null);

  useEffect(() => { void loadStores(); }, []);
  useEffect(() => {
    if (typeof selectedStoreId !== 'number') {
      setStore(null);
      setContacts([]);
      setReviews([]);
      setPickups([]);
      if (selectedStoreId === 'new') setForm(EMPTY);
      return;
    }
    const current = stores.find((s) => s.id === selectedStoreId) || null;
    setStore(current);
    if (current) setForm(toForm(current));
    void loadContacts(selectedStoreId);
    void loadReviews(selectedStoreId);
    void loadPickups();
  }, [selectedStoreId, stores]);
  useEffect(() => {
    if (typeof selectedStoreId === 'number') void loadPickups();
  }, [pickupFilter]);

  // Loads the recycler's stores; auto-selects the first one or switches to create-mode if there are none.
  async function loadStores() {
    try {
      const res = await api<{ stores: Store[] }>('/api/recycler/stores');
      setStores(res.stores);
      setSelectedStoreId((prev) => {
        if (typeof prev === 'number' && res.stores.some((s) => s.id === prev)) return prev;
        if (res.stores.length > 0) return res.stores[0].id;
        return 'new';
      });
    } catch {}
  }

  async function loadContacts(storeId: number) {
    try {
      const res = await api<{ contacts: ContactReceivedRow[] }>(`/api/recycler/stores/${storeId}/contacts`);
      setContacts(res.contacts);
    } catch {}
  }

  async function loadReviews(storeId: number) {
    try {
      const res = await api<{ reviews: Review[] }>(`/api/recycler/stores/${storeId}/reviews`);
      setReviews(res.reviews);
    } catch {}
  }

  // Refreshes the pickups list for the currently selected store + status filter.
  async function loadPickups() {
    if (typeof selectedStoreId !== 'number') {
      setPickups([]);
      return;
    }
    try {
      const query: Record<string, string | number> = { storeId: selectedStoreId };
      if (pickupFilter !== 'all') query.status = pickupFilter;
      const res = await api<{ pickups: Pickup[] }>('/api/pickups/store', { query });
      setPickups(res.pickups);
    } catch {}
  }

  // Sends a Connect request on a contact row so the user sees "Recycler wants to connect".
  async function connectToContact(contactId: number) {
    if (typeof selectedStoreId !== 'number') return;
    try {
      const res = await api<{ contact: { id: number; recyclerConnectedAt: string } }>(
        `/api/recycler/stores/${selectedStoreId}/contacts/${contactId}/connect`,
        { method: 'POST' }
      );
      setContacts((prev) =>
        prev.map((c) =>
          c.id === contactId ? { ...c, recyclerConnectedAt: res.contact.recyclerConnectedAt } : c
        )
      );
      setToast({ msg: 'Connection request sent.' });
    } catch {
      setToast({ msg: 'Could not send connection request...', kind: 'error' });
    }
  }

  // Transitions a pickup's status (confirm / decline / complete) and refreshes the list.
  async function patchPickup(id: number, status: 'confirmed' | 'declined' | 'completed') {
    setBusyPickupId(id);
    try {
      await api(`/api/pickups/${id}/status`, { method: 'PATCH', body: { status } });
      setToast({ msg: `Pickup ${status}.` });
      await loadPickups();
    } catch (err) {
      const msg = err instanceof ApiError && err.status === 400 ? 'Invalid transition...' : 'Update failed...';
      setToast({ msg, kind: 'error' });
    } finally {
      setBusyPickupId(null);
    }
  }

  // Reads the browser's geolocation and writes it into the form fields.
  async function useMyLocation() {
    try {
      const c = await getCurrentPosition();
      setForm((f) => ({ ...f, latitude: c.lat.toFixed(6), longitude: c.lng.toFixed(6) }));
    } catch (e) {
      setToast({ msg: (e as Error).message, kind: 'error' });
    }
  }

  // Splits a "lat, lng" coordinate pair (as copied from Google Maps) into the two form fields.
  function pasteCoords(raw: string) {
    const m = raw.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (!m) {
      setToast({ msg: 'Could not parse coordinates. Format: "lat, lng".', kind: 'error' });
      return;
    }
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      setToast({ msg: 'Coordinates out of range.', kind: 'error' });
      return;
    }
    setForm((f) => ({ ...f, latitude: lat.toFixed(6), longitude: lng.toFixed(6) }));
    setToast({ msg: 'Location pasted.' });
  }

  // Submits the store form: POST when creating a brand-new store, PUT when editing an existing one.
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (form.categories.length === 0) {
      setToast({ msg: 'Pick at least one category...', kind: 'error' });
      return;
    }
    setSaving(true);
    try {
      const payload = toPayload(form);
      const isNew = selectedStoreId === 'new' || typeof selectedStoreId !== 'number';
      const res = isNew
        ? await api<{ store: Store }>('/api/recycler/stores', { method: 'POST', body: payload })
        : await api<{ store: Store; locationChanged?: boolean }>(
            `/api/recycler/stores/${selectedStoreId}`,
            { method: 'PUT', body: payload }
          );

      const saved = res.store;
      setStores((prev) => {
        const idx = prev.findIndex((s) => s.id === saved.id);
        if (idx === -1) return [...prev, saved];
        const next = prev.slice();
        next[idx] = saved;
        return next;
      });
      setSelectedStoreId(saved.id);
      setStore(saved);
      setForm(toForm(saved));
      const locationChanged = !isNew && (res as { locationChanged?: boolean }).locationChanged;
      setToast({
        msg: isNew
          ? 'Store created. Awaiting admin approval.'
          : locationChanged
            ? 'Saved. Location changed - awaiting admin re-approval...'
            : 'Saved.'
      });
    } catch (err) {
      setToast({
        msg: err instanceof ApiError && err.status === 400 ? 'Please check the form fields...' : 'Save failed...',
        kind: 'error'
      });
    } finally {
      setSaving(false);
    }
  }

  // Posts a multipart logo image to the API and updates the local store.logoUrl on success.
  async function uploadLogo(file: File) {
    if (!store || typeof selectedStoreId !== 'number') {
      setToast({ msg: 'Save the store first, then upload a logo...', kind: 'error' });
      return;
    }
    const fd = new FormData();
    fd.append('logo', file);
    try {
      const res = await api<{ logoUrl: string }>(`/api/recycler/stores/${selectedStoreId}/logo`, { formData: fd });
      const updated = { ...store, logoUrl: res.logoUrl };
      setStore(updated);
      setStores((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setToast({ msg: 'Logo uploaded.' });
    } catch {
      setToast({ msg: 'Upload failed (max 2 MB, jpg/png/webp)...', kind: 'error' });
    }
  }

  // Adds or removes a category from the multi-select form state.
  function toggleCategory(c: Category) {
    setForm((f) => ({
      ...f,
      categories: f.categories.includes(c) ? f.categories.filter((x) => x !== c) : [...f.categories, c]
    }));
  }

  // Adds or removes a day from the open-days multi-select form state.
  function toggleDay(d: Day) {
    setForm((f) => ({
      ...f,
      openDays: f.openDays.includes(d) ? f.openDays.filter((x) => x !== d) : [...f.openDays, d]
    }));
  }

  return (
    <div className="container">
      <StorePicker
        stores={stores}
        selectedStoreId={selectedStoreId}
        onSelect={setSelectedStoreId}
      />
      <StatusBanner store={store} isNew={selectedStoreId === 'new'} />

      <form onSubmit={save}>
        <details className="section collapsible" open>
          <summary>Store Info</summary>
          <div className="form-grid" style={{ marginTop: 12 }}>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Store name</label>
              <input value={form.storeName} onChange={(e) => setForm({ ...form, storeName: e.target.value })} required />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Address <span className="muted">(optional)</span></label>
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Paste coordinates from Google Maps</label>
              <input
                placeholder="28.6139, 77.2090"
                onPaste={(e) => {
                  const text = e.clipboardData.getData('text');
                  if (/^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/.test(text)) {
                    e.preventDefault();
                    pasteCoords(text);
                    (e.target as HTMLInputElement).value = '';
                  }
                }}
                onBlur={(e) => {
                  if (e.target.value.trim()) {
                    pasteCoords(e.target.value);
                    e.target.value = '';
                  }
                }}
              />
              <div className="field-help">In Google Maps, right-click a spot and click the "lat, lng" entry to copy it - then paste here.</div>
            </div>
            <div className="field">
              <label>Latitude</label>
              <input
                value={form.latitude}
                onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label>Longitude</label>
              <input
                value={form.longitude}
                onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                required
              />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <button type="button" className="secondary" onClick={useMyLocation}>
                Use my current location
              </button>
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>What e-waste do you accept?</label>
              <div>
                {CATEGORIES.map((c) => (
                  <label key={c} style={{ display: 'inline-flex', gap: 4, marginRight: 12, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      style={{ width: 'auto' }}
                      checked={form.categories.includes(c)}
                      onChange={() => toggleCategory(c)}
                    />
                    {c}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </details>

        <details className="section collapsible">
          <summary>About the store</summary>
          <div className="form-grid" style={{ marginTop: 12 }}>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Description (max 500 chars)</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                maxLength={500}
              />
            </div>
            <div className="field">
              <label>Year established <span className="muted">(optional)</span></label>
              <input
                type="number"
                value={form.yearEstablished}
                onChange={(e) => setForm({ ...form, yearEstablished: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Licence number <span className="muted">(optional)</span></label>
              <input
                value={form.licenceNumber}
                onChange={(e) => setForm({ ...form, licenceNumber: e.target.value })}
              />
              <div className="field-help">Adds a "Verified" badge on your store card.</div>
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Website <span className="muted">(optional)</span></label>
              <input
                type="url"
                placeholder="https://"
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
              />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Logo</label>
              {store?.logoUrl && (
                <img
                  src={assetUrl(store.logoUrl)}
                  alt="logo"
                  style={{ width: 64, height: 64, borderRadius: 8, marginBottom: 8, objectFit: 'cover' }}
                />
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadLogo(f);
                }}
              />
              <div className="muted" style={{ marginTop: 4 }}>Max 2 MB. Save the store at least once before uploading.</div>
            </div>
          </div>
        </details>

        <details className="section collapsible">
          <summary>Hours and service</summary>
          <div className="form-grid" style={{ marginTop: 12 }}>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Open days</label>
              <div>
                {DAYS.map((d) => (
                  <label key={d} style={{ display: 'inline-flex', gap: 4, marginRight: 12, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      style={{ width: 'auto' }}
                      checked={form.openDays.includes(d)}
                      onChange={() => toggleDay(d)}
                    />
                    {d}
                  </label>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Open time</label>
              <input
                type="time"
                value={form.openTime}
                onChange={(e) => setForm({ ...form, openTime: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Close time</label>
              <input
                type="time"
                value={form.closeTime}
                onChange={(e) => setForm({ ...form, closeTime: e.target.value })}
              />
            </div>
            <div className="field">
              <label>How customers reach you</label>
              <select
                value={form.serviceMode}
                onChange={(e) => setForm({ ...form, serviceMode: e.target.value as ServiceMode | '' })}
              >
                <option value="">Select an option</option>
                <option value="dropoff">They drop off at our location</option>
                <option value="pickup">We pick up from their location</option>
                <option value="both">Both - drop-off and pickup</option>
              </select>
            </div>
            {(form.serviceMode === 'pickup' || form.serviceMode === 'both') && (
              <div className="field">
                <label>How far will you drive for pickups? (km)</label>
                <input
                  type="number"
                  value={form.pickupRadiusKm}
                  onChange={(e) => setForm({ ...form, pickupRadiusKm: e.target.value })}
                />
              </div>
            )}
            <div className="field">
              <label>Payment policy</label>
              <select
                value={form.paymentPolicy}
                onChange={(e) => setForm({ ...form, paymentPolicy: e.target.value as PaymentPolicy | '' })}
              >
                <option value="">Select an option</option>
                <option value="pays">We pay customers for items</option>
                <option value="free">Free - no payment either way</option>
                <option value="fee">We charge a service fee</option>
              </select>
            </div>
          </div>
        </details>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
          <button type="submit" disabled={saving}>
            {saving
              ? 'Saving...'
              : selectedStoreId === 'new'
                ? 'Create store'
                : 'Save store'}
          </button>
        </div>
      </form>

      {typeof selectedStoreId === 'number' && (
      <>
      <div className="section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ margin: 0 }}>Pickups</h3>
          <select
            value={pickupFilter}
            onChange={(e) => setPickupFilter(e.target.value as PickupStatus | 'all')}
            style={{ width: 'auto' }}
          >
            <option value="requested">Requested</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
            <option value="declined">Declined</option>
            <option value="cancelled">Cancelled</option>
            <option value="all">All</option>
          </select>
        </div>
        {pickups.length === 0 ? (
          <p className="muted" style={{ marginTop: 8 }}>No pickups in this category.</p>
        ) : (
          pickups.map((p) => (
            <PickupRow
              key={p.id}
              pickup={p}
              busy={busyPickupId === p.id}
              onConfirm={() => patchPickup(p.id, 'confirmed')}
              onDecline={() => patchPickup(p.id, 'declined')}
              onComplete={() => patchPickup(p.id, 'completed')}
            />
          ))
        )}
      </div>

      <div className="section">
        <h3>Reviews</h3>
        {reviews.length === 0 ? (
          <p className="muted">No reviews yet. They'll appear here after completed pickups.</p>
        ) : (
          reviews.map((r) => (
            <div key={r.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--warn)' }}>
                  <StarIcon size={13} /> <strong style={{ color: 'var(--text)' }}>{r.rating}/5</strong>
                </span>
                <span className="muted">
                  {r.user?.name || 'User'} · {new Date(r.createdAt).toLocaleDateString()}
                </span>
              </div>
              {r.comment && <p style={{ marginTop: 6, marginBottom: 0 }}>{r.comment}</p>}
            </div>
          ))
        )}
      </div>

      <div className="section">
        <h3>Contacts received</h3>
        {contacts.length === 0 ? (
          <p className="muted">No contacts yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Status</th>
                <th>When</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td>{c.user.name}</td>
                  <td>{c.user.email}</td>
                  <td>{c.user.phone || '-'}</td>
                  <td>
                    {c.recyclerConnectedAt
                      ? <span className="badge live">Connected</span>
                      : <span className="badge contacted">Contacted</span>}
                  </td>
                  <td className="muted">{new Date(c.createdAt).toLocaleString()}</td>
                  <td>
                    {c.recyclerConnectedAt ? (
                      <span className="muted" style={{ fontSize: 12 }}>
                        Sent {new Date(c.recyclerConnectedAt).toLocaleDateString()}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => connectToContact(c.id)}
                        title="Lets the user know you've accepted their interest. Once sent, they can no longer revoke this contact."
                        style={{ padding: '4px 10px', fontSize: 13 }}
                      >
                        Connect
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      </>
      )}

      {toast && <Toast message={toast.msg} kind={toast.kind} onDone={() => setToast(null)} />}
    </div>
  );
}

// Single pickup row in the recycler queue with item summary and stage-specific action buttons.
function PickupRow({
  pickup,
  busy,
  onConfirm,
  onDecline,
  onComplete
}: {
  pickup: Pickup;
  busy: boolean;
  onConfirm: () => void;
  onDecline: () => void;
  onComplete: () => void;
}) {
  const totalKg = pickup.items.reduce((sum, it) => sum + (it.estimatedWeightKg || 0) * it.quantity, 0);
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <strong>{pickup.user?.name || 'User'}</strong>
          <div className="muted">
            {pickup.scheduledDate} - {pickup.timeSlot}
          </div>
          <div className="muted">{pickup.address}</div>
          {pickup.user?.phone && <div className="muted">Phone: {pickup.user.phone}</div>}
        </div>
        <RecyclerPickupBadge status={pickup.status} />
      </div>
      <div style={{ marginTop: 8 }}>
        {pickup.items.map((it) => (
          <span key={it.id} className="chip">
            {it.category} x {it.quantity}
            {it.estimatedWeightKg ? ` (${it.estimatedWeightKg} kg)` : ''}
            {it.condition ? ` - ${it.condition}` : ''}
          </span>
        ))}
      </div>
      {totalKg > 0 && <div className="muted" style={{ marginTop: 4 }}>~ {totalKg.toFixed(1)} kg total</div>}
      {pickup.notes && <p className="muted" style={{ marginTop: 4 }}>Notes: {pickup.notes}</p>}
      <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {pickup.status === 'requested' && (
          <>
            <button onClick={onConfirm} disabled={busy}>Confirm</button>
            <button className="danger" onClick={onDecline} disabled={busy}>Decline</button>
          </>
        )}
        {pickup.status === 'confirmed' && (
          <button onClick={onComplete} disabled={busy}>Mark completed</button>
        )}
      </div>
    </div>
  );
}

// Square-ish status pill for pickup rows in the recycler queue.
function RecyclerPickupBadge({ status }: { status: PickupStatus }) {
  const map: Record<PickupStatus, { label: string; cls: string }> = {
    requested: { label: 'Requested', cls: 'pending' },
    confirmed: { label: 'Confirmed', cls: 'contacted' },
    declined: { label: 'Declined', cls: 'rejected' },
    completed: { label: 'Completed', cls: 'live' },
    cancelled: { label: 'Cancelled', cls: 'rejected' }
  };
  const { label, cls } = map[status];
  return (
    <span
      className={`badge ${cls}`}
      style={{ borderRadius: 6, alignSelf: 'flex-start', padding: '4px 10px' }}
    >
      {label}
    </span>
  );
}

// Lists the recycler's stores as selectable cards with a "+ Add store" button.
function StorePicker({
  stores,
  selectedStoreId,
  onSelect
}: {
  stores: Store[];
  selectedStoreId: number | 'new' | null;
  onSelect: (id: number | 'new') => void;
}) {
  const statusBadge = (s: Store) => {
    if (s.status === 'approved') return <span className="badge live">Live</span>;
    if (s.status === 'rejected') return <span className="badge rejected">Rejected</span>;
    return <span className="badge pending">Pending</span>;
  };

  return (
    <div className="section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0 }}>My stores</h3>
        <button
          type="button"
          className={selectedStoreId === 'new' ? '' : 'secondary'}
          onClick={() => onSelect('new')}
        >
          + Add store
        </button>
      </div>

      {stores.length === 0 ? (
        <p className="muted" style={{ marginTop: 8 }}>
          You haven't created a store yet. Click <strong>+ Add store</strong> to get listed.
        </p>
      ) : (
        stores.map((s) => {
          const active = s.id === selectedStoreId;
          return (
            <div
              key={s.id}
              className="card"
              onClick={() => onSelect(s.id)}
              style={{
                marginTop: 12,
                cursor: 'pointer',
                borderColor: active ? 'var(--accent-strong)' : undefined,
                boxShadow: active ? '0 0 0 2px var(--accent-strong)' : undefined
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <strong>{s.storeName}</strong>
                  {s.address && <div className="muted" style={{ fontSize: 13 }}>{s.address}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {statusBadge(s)}
                  <button
                    type="button"
                    className={active ? '' : 'secondary'}
                    onClick={(e) => { e.stopPropagation(); onSelect(s.id); }}
                    style={{ padding: '4px 10px', fontSize: 13 }}
                  >
                    {active ? 'Editing' : 'Edit'}
                  </button>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// Banner above the form that summarises whether the store is pending, approved, rejected, or missing.
function StatusBanner({ store, isNew }: { store: Store | null; isNew: boolean }) {
  if (isNew) {
    return (
      <div className="section">
        <p className="muted">New store. Fill out the form below and save to submit it for admin approval.</p>
      </div>
    );
  }
  if (!store) {
    return (
      <div className="section">
        <p className="muted">You haven't created a store yet. Fill out the form below to get listed.</p>
      </div>
    );
  }
  if (store.status === 'approved') {
    return (
      <div className="section" style={{ borderColor: 'var(--accent-strong)' }}>
        <span className="badge live">Live</span>
        <span style={{ marginLeft: 10 }}>
          Your store is approved and visible to users.
        </span>
      </div>
    );
  }
  if (store.status === 'rejected') {
    return (
      <div className="section">
        <span className="badge rejected">Rejected</span>
        {store.rejectReason && <span style={{ marginLeft: 10 }}>Reason: {store.rejectReason}</span>}
        <p className="muted" style={{ marginTop: 8 }}>Edit the details below and save again to resubmit.</p>
      </div>
    );
  }
  return (
    <div className="section">
      <span className="badge pending">Pending</span>
      <span style={{ marginLeft: 10 }}>Awaiting admin approval.</span>
    </div>
  );
}

// Maps a Store row to the controlled form state used by the recycler form.
function toForm(s: Store): FormState {
  return {
    storeName: s.storeName,
    address: s.address || '',
    latitude: String(s.latitude ?? ''),
    longitude: String(s.longitude ?? ''),
    categories: (s.categories || []) as Category[],
    description: s.description || '',
    yearEstablished: s.yearEstablished ? String(s.yearEstablished) : '',
    licenceNumber: s.licenceNumber || '',
    website: s.website || '',
    openDays: (s.openDays || []) as Day[],
    openTime: s.openTime || '',
    closeTime: s.closeTime || '',
    serviceMode: (s.serviceMode || '') as ServiceMode | '',
    pickupRadiusKm: s.pickupRadiusKm != null ? String(s.pickupRadiusKm) : '',
    paymentPolicy: (s.paymentPolicy || '') as PaymentPolicy | ''
  };
}

// Converts form state back to the API payload, normalising empty strings to null.
function toPayload(f: FormState) {
  return {
    storeName: f.storeName,
    address: f.address || null,
    latitude: Number(f.latitude),
    longitude: Number(f.longitude),
    categories: f.categories,
    description: f.description || null,
    yearEstablished: f.yearEstablished ? Number(f.yearEstablished) : null,
    licenceNumber: f.licenceNumber || null,
    website: f.website || null,
    openDays: f.openDays.length ? f.openDays : null,
    openTime: f.openTime || null,
    closeTime: f.closeTime || null,
    serviceMode: f.serviceMode || null,
    pickupRadiusKm: f.pickupRadiusKm ? Number(f.pickupRadiusKm) : null,
    paymentPolicy: f.paymentPolicy || null
  };
}
