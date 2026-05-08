const { z } = require('zod');
const prisma = require('../config/prisma');
const { notifyStoreContacted } = require('../utils/notify');

const listSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().min(1).max(1000).default(50),
  category: z.string().optional()
});

// Returns approved stores within radiusKm of the user, sorted by Haversine distance.
async function listStores(req, res) {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { lat, lng, radiusKm, category } = parsed.data;

  const rows = await prisma.$queryRaw`
    SELECT s.id, s.storeName, s.address, s.latitude, s.longitude,
           s.categories, s.description, s.yearEstablished, s.logoUrl,
           s.licenceNumber, s.website, s.openDays, s.openTime, s.closeTime,
           s.serviceMode, s.pickupRadiusKm, s.paymentPolicy, s.languages,
           u.name AS recyclerName, u.phone AS recyclerPhone,
           (6371 * acos(
             cos(radians(${lat})) * cos(radians(s.latitude)) *
             cos(radians(s.longitude) - radians(${lng})) +
             sin(radians(${lat})) * sin(radians(s.latitude))
           )) AS distance_km
    FROM Store s
    JOIN User u ON u.id = s.recyclerId
    WHERE s.status = 'approved'
    HAVING distance_km <= ${radiusKm}
    ORDER BY distance_km ASC
  `;

  const ids = rows.map((r) => Number(r.id));
  const ratingMap = await getRatingMap(ids);

  const stores = rows
    .map((r) => {
      const parseJson = (v) => {
        if (v == null) return null;
        if (Array.isArray(v) || typeof v === 'object') return v;
        try { return JSON.parse(v); } catch { return null; }
      };
      const id = Number(r.id);
      const agg = ratingMap.get(id);
      return {
        ...r,
        id,
        latitude: Number(r.latitude),
        longitude: Number(r.longitude),
        distance_km: Number(r.distance_km),
        categories: parseJson(r.categories) || [],
        openDays: parseJson(r.openDays),
        languages: parseJson(r.languages),
        avgRating: agg ? Number(agg.avg.toFixed(2)) : null,
        reviewCount: agg ? agg.count : 0
      };
    })
    .filter((r) => {
      if (!category) return true;
      return Array.isArray(r.categories) && r.categories.includes(category);
    });

  res.json({ stores });
}

// Builds a Map of storeId -> { avg, count } for the given store ids using a single Prisma groupBy.
async function getRatingMap(storeIds) {
  const map = new Map();
  if (storeIds.length === 0) return map;
  const grouped = await prisma.review.groupBy({
    by: ['storeId'],
    where: { storeId: { in: storeIds } },
    _avg: { rating: true },
    _count: { _all: true }
  });
  for (const g of grouped) {
    map.set(g.storeId, { avg: g._avg.rating || 0, count: g._count._all });
  }
  return map;
}

// Records a verified user's expression of interest in a store and notifies the recycler by email.
async function contactStore(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  const me = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { name: true, emailVerifiedAt: true }
  });
  if (!me) return res.status(401).json({ error: 'User not found' });
  if (!me.emailVerifiedAt) {
    return res.status(403).json({
      error: 'email_unverified',
      message: 'Verify your email before contacting a store...'
    });
  }

  const store = await prisma.store.findUnique({
    where: { id },
    include: { recycler: { select: { email: true } } }
  });
  if (!store || store.status !== 'approved') {
    return res.status(404).json({ error: 'Store not found' });
  }

  await prisma.contact.upsert({
    where: { userId_storeId: { userId: req.user.id, storeId: id } },
    update: {},
    create: { userId: req.user.id, storeId: id }
  });

  notifyStoreContacted(store.recycler.email, me.name || 'A user', store.storeName);

  res.json({ status: 'Contacted', storeName: store.storeName });
}

// Removes a Contact row, blocked if the recycler has already initiated a Connect.
async function revokeContact(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  const existing = await prisma.contact.findUnique({
    where: { userId_storeId: { userId: req.user.id, storeId: id } }
  });
  if (!existing) return res.status(404).json({ error: 'No contact to revoke' });
  if (existing.recyclerConnectedAt) {
    return res.status(400).json({
      error: 'connection_locked',
      message: 'Cannot revoke a contact after the recycler has connected...'
    });
  }

  await prisma.contact.delete({ where: { id: existing.id } });
  res.json({ status: 'revoked' });
}

// Lists every store the current user has contacted, including any recycler-connect timestamp.
async function listContacted(req, res) {
  const contacts = await prisma.contact.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      createdAt: true,
      status: true,
      recyclerConnectedAt: true,
      store: {
        select: { id: true, storeName: true, address: true, logoUrl: true }
      }
    }
  });
  res.json({ contacts });
}

// Returns paginated reviews and aggregate stats for a single store.
async function listStoreReviews(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const [reviews, count, agg] = await Promise.all([
    prisma.review.findMany({
      where: { storeId: id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: { user: { select: { id: true, name: true } } }
    }),
    prisma.review.count({ where: { storeId: id } }),
    prisma.review.aggregate({ where: { storeId: id }, _avg: { rating: true } })
  ]);

  res.json({
    reviews,
    count,
    avgRating: agg._avg.rating != null ? Number(agg._avg.rating.toFixed(2)) : null
  });
}

module.exports = { listStores, contactStore, revokeContact, listContacted, listStoreReviews };
