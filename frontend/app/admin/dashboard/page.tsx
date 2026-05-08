'use client';
import { useEffect, useState } from 'react';
import RoleGuard from '@/components/RoleGuard';
import Nav from '@/components/Nav';
import Toast from '@/components/Toast';
import { api } from '@/lib/api';
import type { Store, StoreStatus } from '@/lib/types';

interface AdminStore extends Store {
  recycler: { id: number; name: string; email: string; phone?: string | null };
}

interface AnalyticsSummary {
  totals: { users: number; recyclers: number; stores: number; pickups: number };
  pickupsByStatus: { status: string; count: number }[];
  topCategories: { category: string; count: number }[];
  topStores: { storeId: number; storeName: string; count: number }[];
  signups30d: { date: string; count: number }[];
}

// Admin dashboard route component, gated to the admin role.
export default function AdminDashboard() {
  return (
    <RoleGuard role="admin">
      <Nav title="Admin" />
      <Inner />
    </RoleGuard>
  );
}

// Inner admin UI: analytics panel + per-status moderation queue with approve / reject actions.
function Inner() {
  const [filter, setFilter] = useState<StoreStatus | 'all'>('pending');
  const [stores, setStores] = useState<AdminStore[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; kind?: 'info' | 'error' } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);

  useEffect(() => { void load(); }, [filter]);
  useEffect(() => { void loadAnalytics(); }, []);

  // Fetches the moderation queue for the current status filter.
  async function load() {
    setLoading(true);
    try {
      const res = await api<{ stores: AdminStore[] }>('/api/admin/stores', {
        query: filter === 'all' ? {} : { status: filter }
      });
      setStores(res.stores);
    } catch {
      setToast({ msg: 'Failed to load stores...', kind: 'error' });
    } finally {
      setLoading(false);
    }
  }

  // Refreshes the analytics summary panel.
  async function loadAnalytics() {
    try {
      const res = await api<AnalyticsSummary>('/api/admin/analytics/summary');
      setAnalytics(res);
    } catch {}
  }

  // Approves a store and refreshes both the queue and analytics.
  async function approve(id: number) {
    setBusyId(id);
    try {
      await api(`/api/admin/stores/${id}/approve`, { method: 'POST' });
      setToast({ msg: 'Store approved.' });
      await load();
      void loadAnalytics();
    } catch {
      setToast({ msg: 'Approve failed...', kind: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  // Rejects a store with an optional reason and refreshes the queue.
  async function submitReject(id: number) {
    setBusyId(id);
    try {
      await api(`/api/admin/stores/${id}/reject`, { body: { reason: rejectReason || null } });
      setToast({ msg: 'Store rejected.' });
      setRejectingId(null);
      setRejectReason('');
      await load();
    } catch {
      setToast({ msg: 'Reject failed...', kind: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="container">
      {analytics && <AnalyticsPanel data={analytics} />}

      <div className="section">
        <label>Filter by status</label>
        <select value={filter} onChange={(e) => setFilter(e.target.value as StoreStatus | 'all')}>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="all">All</option>
        </select>
      </div>

      {loading && <p className="muted">Loading...</p>}
      {!loading && stores.length === 0 && <p className="muted">No stores in this category.</p>}

      {stores.map((s) => (
        <div key={s.id} className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <h3 style={{ margin: 0 }}>{s.storeName}</h3>
              <div className="muted">{s.address}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {Number(s.latitude).toFixed(4)}, {Number(s.longitude).toFixed(4)}
              </div>
            </div>
            <div>
              <StatusBadge status={s.status} />
            </div>
          </div>
          {s.description && <p>{s.description}</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            {(s.categories || []).map((c) => <span key={c} className="chip">{c}</span>)}
          </div>
          <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
            Recycler: {s.recycler.name} ({s.recycler.email})
            {s.licenceNumber && <> - Licence: {s.licenceNumber}</>}
          </div>
          {s.status === 'rejected' && s.rejectReason && (
            <div className="muted" style={{ marginTop: 4 }}>Reject reason: {s.rejectReason}</div>
          )}
          {s.status !== 'approved' && (
            <div style={{ marginTop: 12 }}>
              {rejectingId === s.id ? (
                <div className="form-grid">
                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <label>Reason (optional, max 255 chars)</label>
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      maxLength={255}
                      autoFocus
                    />
                  </div>
                  <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
                    <button
                      className="danger"
                      onClick={() => submitReject(s.id)}
                      disabled={busyId === s.id}
                    >
                      Confirm reject
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => { setRejectingId(null); setRejectReason(''); }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => approve(s.id)} disabled={busyId === s.id}>Approve</button>
                  <button
                    className="danger"
                    onClick={() => { setRejectingId(s.id); setRejectReason(''); }}
                    disabled={busyId === s.id}
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {toast && <Toast message={toast.msg} kind={toast.kind} onDone={() => setToast(null)} />}
    </div>
  );
}

// Renders the small status pill (Live / Pending / Rejected) for a store row.
function StatusBadge({ status }: { status: StoreStatus }) {
  if (status === 'approved') return <span className="badge live">Live</span>;
  if (status === 'rejected') return <span className="badge rejected">Rejected</span>;
  return <span className="badge pending">Pending</span>;
}

// Top-of-page analytics panel rendering totals plus four bar lists side-by-side.
function AnalyticsPanel({ data }: { data: AnalyticsSummary }) {
  const { totals, pickupsByStatus, topCategories, topStores, signups30d } = data;
  const totalSignups = signups30d.reduce((sum, r) => sum + r.count, 0);
  return (
    <div className="section">
      <h3 style={{ marginTop: 0 }}>Analytics</h3>
      <div className="row">
        <Stat label="Users" value={totals.users} />
        <Stat label="Recyclers" value={totals.recyclers} />
        <Stat label="Stores" value={totals.stores} />
        <Stat label="Pickups" value={totals.pickups} />
        <Stat label="Signups (30d)" value={totalSignups} />
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <BarBlock title="Pickups by status" rows={pickupsByStatus.map((r) => ({ label: r.status, value: r.count }))} />
        <BarBlock title="Top categories" rows={topCategories.map((r) => ({ label: r.category, value: r.count }))} />
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <BarBlock
          title="Top stores by pickups"
          rows={topStores.map((r) => ({ label: r.storeName, value: r.count }))}
        />
        <BarBlock
          title="Signups (last 30 days)"
          rows={signups30d.map((r) => ({ label: r.date, value: r.count }))}
        />
      </div>
    </div>
  );
}

// Single labelled total tile in the analytics row.
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card" style={{ minWidth: 120, marginBottom: 0, textAlign: 'center' }}>
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

// Renders a horizontal-bar list scaled to its own max value.
function BarBlock({ title, rows }: { title: string; rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div>
      <div className="muted" style={{ marginBottom: 6 }}>{title}</div>
      {rows.length === 0 ? (
        <div className="muted">No data.</div>
      ) : (
        rows.map((r) => (
          <div key={r.label} style={{ marginBottom: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span>{r.label}</span>
              <span className="muted">{r.value}</span>
            </div>
            <div
              style={{
                height: 6,
                background: 'var(--panel-2)',
                borderRadius: 4,
                overflow: 'hidden'
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${(r.value / max) * 100}%`,
                  background: 'var(--accent-strong)'
                }}
              />
            </div>
          </div>
        ))
      )}
    </div>
  );
}
