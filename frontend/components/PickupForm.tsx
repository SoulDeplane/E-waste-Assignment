'use client';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import {
  CATEGORIES,
  PICKUP_TIME_SLOTS,
  type Category,
  type ItemCondition,
  type Pickup,
  type Store
} from '@/lib/types';

interface ItemRow {
  category: Category;
  quantity: string;
  estimatedWeightKg: string;
  condition: ItemCondition | '';
  notes: string;
}

const EMPTY_ITEM: ItemRow = {
  category: 'laptops',
  quantity: '1',
  estimatedWeightKg: '',
  condition: '',
  notes: ''
};

// Returns today's local date as a YYYY-MM-DD string for date inputs.
function todayStr() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Returns YYYY-MM-DD for `n` days from today (n=1 -> tomorrow, etc.).
function addDaysStr(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Returns the YYYY-MM-DD of the next Saturday (this Saturday if today is before, else next).
function nextSaturdayStr() {
  const d = new Date();
  const day = d.getDay();
  const offset = day === 6 ? 7 : (6 - day);
  d.setDate(d.getDate() + offset);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Modal where the user picks a date, time slot, address, and item list to schedule a pickup.
export default function PickupForm({
  store,
  defaultAddress,
  onClose,
  onCreated
}: {
  store: Store;
  defaultAddress?: string;
  onClose: () => void;
  onCreated: (p: Pickup) => void;
}) {
  const [scheduledDate, setScheduledDate] = useState(todayStr());
  const [timeSlot, setTimeSlot] = useState<string>(PICKUP_TIME_SLOTS[0]);
  const [address, setAddress] = useState(defaultAddress || '');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ItemRow[]>([{ ...EMPTY_ITEM }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Replaces a partial set of fields on the item row at the given index.
  function update(idx: number, patch: Partial<ItemRow>) {
    setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  // Appends an empty item row, capped at 15.
  function addRow() {
    if (items.length >= 15) return;
    setItems((arr) => [...arr, { ...EMPTY_ITEM }]);
  }

  // Removes an item row, keeping at least one row in the list.
  function removeRow(idx: number) {
    setItems((arr) => (arr.length === 1 ? arr : arr.filter((_, i) => i !== idx)));
  }

  // Submits the pickup to the API and forwards the created Pickup to the parent on success.
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload = {
        storeId: store.id,
        scheduledDate,
        timeSlot,
        address,
        notes: notes || null,
        items: items.map((it) => ({
          category: it.category,
          quantity: Number(it.quantity) || 1,
          estimatedWeightKg: it.estimatedWeightKg ? Number(it.estimatedWeightKg) : null,
          condition: it.condition || null,
          notes: it.notes || null
        }))
      };
      const res = await api<{ pickup: Pickup }>('/api/pickups', { body: payload });
      onCreated(res.pickup);
    } catch (err) {
      const msg =
        err instanceof ApiError && err.status === 400
          ? 'Please check the form fields...'
          : 'Could not schedule pickup...';
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
        zIndex: 50
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="card modal-card"
        style={{ maxWidth: 640, width: '100%', maxHeight: '92vh', overflowY: 'auto' }}
      >
        <h2 style={{ marginTop: 0 }}>Schedule pickup at {store.storeName}</h2>
        <p className="muted">The recycler will confirm or decline your request.</p>

        <div className="form-grid" style={{ marginTop: 12 }}>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Date</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              <DatePill label="Today" target={todayStr()} current={scheduledDate} onPick={setScheduledDate} />
              <DatePill label="Tomorrow" target={addDaysStr(1)} current={scheduledDate} onPick={setScheduledDate} />
              <DatePill label="This Saturday" target={nextSaturdayStr()} current={scheduledDate} onPick={setScheduledDate} />
            </div>
            <input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              min={todayStr()}
              required
            />
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Time slot</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {PICKUP_TIME_SLOTS.map((s) => {
                const active = timeSlot === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setTimeSlot(s)}
                    className={active ? '' : 'secondary'}
                    style={{ flex: '1 1 120px', padding: '10px 12px', minHeight: 0 }}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Pickup address</label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              maxLength={255}
              required
            />
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              placeholder="Anything the recycler should know..."
            />
          </div>
        </div>

        <div className="section" style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Items</h3>
            <button type="button" className="secondary" onClick={addRow} disabled={items.length >= 15}>
              + Add item
            </button>
          </div>
          {items.map((it, idx) => (
            <div key={idx} className="card" style={{ marginTop: 12 }}>
              <div className="form-grid">
                <div className="field">
                  <label>Category</label>
                  <select
                    value={it.category}
                    onChange={(e) => update(idx, { category: e.target.value as Category })}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Quantity</label>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={it.quantity}
                    onChange={(e) => update(idx, { quantity: e.target.value })}
                    required
                  />
                </div>
                <div className="field">
                  <label>Est. weight (kg, optional)</label>
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    max={500}
                    value={it.estimatedWeightKg}
                    onChange={(e) => update(idx, { estimatedWeightKg: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Condition (optional)</label>
                  <select
                    value={it.condition}
                    onChange={(e) => update(idx, { condition: e.target.value as ItemCondition | '' })}
                  >
                    <option value="">-</option>
                    <option value="working">Working</option>
                    <option value="broken">Broken</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Notes (optional)</label>
                  <input
                    value={it.notes}
                    onChange={(e) => update(idx, { notes: e.target.value })}
                    maxLength={255}
                  />
                </div>
              </div>
              {items.length > 1 && (
                <div style={{ textAlign: 'right' }}>
                  <button type="button" className="danger" onClick={() => removeRow(idx)}>
                    Remove item
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {error && <div className="muted" style={{ color: 'var(--danger)' }}>{error}</div>}

        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" disabled={saving}>{saving ? 'Submitting...' : 'Schedule pickup'}</button>
        </div>
      </form>
    </div>
  );
}

// One quick-pick chip in the date row; highlighted when its target equals the current selection.
function DatePill({
  label,
  target,
  current,
  onPick
}: {
  label: string;
  target: string;
  current: string;
  onPick: (s: string) => void;
}) {
  const active = current === target;
  return (
    <button
      type="button"
      onClick={() => onPick(target)}
      className={active ? '' : 'secondary'}
      style={{ padding: '8px 12px', minHeight: 0, fontSize: 13 }}
    >
      {label}
    </button>
  );
}
