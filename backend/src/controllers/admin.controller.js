const { z } = require('zod');
const prisma = require('../config/prisma');
const { notifyStoreApproved } = require('../utils/notify');

const rejectSchema = z.object({
  reason: z.string().max(255).optional().nullable()
});

// Lists every store, optionally filtered by status, for the admin moderation queue.
async function listStores(req, res) {
  const status = req.query.status;
  const where = status && ['pending', 'approved', 'rejected'].includes(status) ? { status } : {};
  const stores = await prisma.store.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      recycler: { select: { id: true, name: true, email: true, phone: true } }
    }
  });
  res.json({ stores });
}

// Approves a pending store and emails the recycler.
async function approveStore(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  const store = await prisma.store.update({
    where: { id },
    data: {
      status: 'approved',
      approvedById: req.user.id,
      approvedAt: new Date(),
      rejectReason: null
    },
    include: { recycler: { select: { email: true } } }
  });

  notifyStoreApproved(store.recycler.email, store.storeName);
  res.json({ store });
}

// Rejects a store with an optional reason that the recycler will see on their dashboard.
async function rejectStore(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
  const parsed = rejectSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const store = await prisma.store.update({
    where: { id },
    data: {
      status: 'rejected',
      rejectReason: parsed.data.reason || null,
      approvedById: null,
      approvedAt: null
    }
  });
  res.json({ store });
}

// Returns aggregate platform metrics: totals, pickup status mix, top categories/stores, signup trend.
async function analyticsSummary(_req, res) {
  const [
    userCount,
    recyclerCount,
    storeCount,
    pickupCount,
    pickupsByStatusRaw,
    topCategoriesRaw,
    topStoresRaw,
    signups30dRaw
  ] = await Promise.all([
    prisma.user.count({ where: { role: 'user' } }),
    prisma.user.count({ where: { role: 'recycler' } }),
    prisma.store.count(),
    prisma.pickup.count(),
    prisma.pickup.groupBy({
      by: ['status'],
      _count: { _all: true }
    }),
    prisma.pickupItem.groupBy({
      by: ['category'],
      _count: { _all: true },
      orderBy: { _count: { category: 'desc' } },
      take: 10
    }),
    prisma.pickup.groupBy({
      by: ['storeId'],
      _count: { _all: true },
      orderBy: { _count: { storeId: 'desc' } },
      take: 5
    }),
    prisma.$queryRaw`
      SELECT DATE(createdAt) AS date, COUNT(*) AS count
      FROM User
      WHERE createdAt >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY)
      GROUP BY DATE(createdAt)
      ORDER BY date ASC
    `
  ]);

  const topStoreIds = topStoresRaw.map((s) => s.storeId);
  const topStoreNames = topStoreIds.length
    ? await prisma.store.findMany({
        where: { id: { in: topStoreIds } },
        select: { id: true, storeName: true }
      })
    : [];
  const nameById = new Map(topStoreNames.map((s) => [s.id, s.storeName]));

  res.json({
    totals: {
      users: userCount,
      recyclers: recyclerCount,
      stores: storeCount,
      pickups: pickupCount
    },
    pickupsByStatus: pickupsByStatusRaw.map((r) => ({ status: r.status, count: r._count._all })),
    topCategories: topCategoriesRaw.map((r) => ({ category: r.category, count: r._count._all })),
    topStores: topStoresRaw.map((r) => ({
      storeId: r.storeId,
      storeName: nameById.get(r.storeId) || 'Unknown',
      count: r._count._all
    })),
    signups30d: signups30dRaw.map((r) => ({
      date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date),
      count: Number(r.count)
    }))
  });
}

module.exports = { listStores, approveStore, rejectStore, analyticsSummary };
