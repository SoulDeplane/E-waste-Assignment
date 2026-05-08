const path = require('path');
const fs = require('fs');
const { z } = require('zod');
const prisma = require('../config/prisma');

const CATEGORIES = ['laptops', 'phones', 'batteries', 'appliances', 'cables', 'monitors', 'other'];
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const storeSchema = z.object({
  storeName: z.string().min(1).max(150),
  address: z.string().max(255).optional().nullable(),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  categories: z.array(z.enum(CATEGORIES)).min(1),

  description: z.string().max(500).optional().nullable(),
  yearEstablished: z.coerce.number().int().min(1900).max(new Date().getFullYear()).optional().nullable(),
  licenceNumber: z.string().max(120).optional().nullable(),
  website: z.string().url().max(255).optional().nullable().or(z.literal('')),
  openDays: z.array(z.enum(DAYS)).optional().nullable(),
  openTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable().or(z.literal('')),
  closeTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable().or(z.literal('')),
  serviceMode: z.enum(['dropoff', 'pickup', 'both']).optional().nullable(),
  pickupRadiusKm: z.coerce.number().int().min(0).max(500).optional().nullable(),
  paymentPolicy: z.enum(['pays', 'free', 'fee']).optional().nullable(),
  languages: z.array(z.string().max(40)).optional().nullable()
});

// Coerces empty-string fields to null so optional store data is stored consistently.
function normalize(data) {
  const out = { ...data };
  if (out.website === '') out.website = null;
  if (out.openTime === '') out.openTime = null;
  if (out.closeTime === '') out.closeTime = null;
  return out;
}

function parseStoreId(req) {
  const id = Number(req.params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Loads a store by id only when it belongs to the requesting recycler. Returns null otherwise.
async function loadOwnedStore(storeId, userId) {
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store || store.recyclerId !== userId) return null;
  return store;
}

// Lists every store owned by the current recycler, newest first.
async function listStores(req, res) {
  const stores = await prisma.store.findMany({
    where: { recyclerId: req.user.id },
    orderBy: { createdAt: 'asc' }
  });
  res.json({ stores });
}

// Creates a new store for the current recycler in pending status.
async function createStore(req, res) {
  const parsed = storeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = normalize(parsed.data);

  const created = await prisma.store.create({
    data: { ...data, recyclerId: req.user.id, status: 'pending' }
  });
  res.status(201).json({ store: created });
}

// Returns one of the recycler's stores, or 404 if not theirs.
async function getStore(req, res) {
  const id = parseStoreId(req);
  if (id == null) return res.status(400).json({ error: 'Invalid id' });
  const store = await loadOwnedStore(id, req.user.id);
  if (!store) return res.status(404).json({ error: 'Store not found' });
  res.json({ store });
}

// Updates one of the recycler's stores. Resets approval state when the location moves.
async function updateStore(req, res) {
  const id = parseStoreId(req);
  if (id == null) return res.status(400).json({ error: 'Invalid id' });

  const parsed = storeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = normalize(parsed.data);

  const existing = await loadOwnedStore(id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Store not found' });

  const existingLat = Number(existing.latitude.toString());
  const existingLng = Number(existing.longitude.toString());
  const locationChanged = existingLat !== data.latitude || existingLng !== data.longitude;

  const updated = await prisma.store.update({
    where: { id: existing.id },
    data: {
      ...data,
      ...(locationChanged ? { status: 'pending', approvedAt: null, approvedById: null } : {})
    }
  });
  res.json({ store: updated, locationChanged });
}

// Saves a multer-uploaded logo image and updates the store's logoUrl.
async function uploadLogo(req, res) {
  const id = parseStoreId(req);
  if (id == null) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'Invalid id' });
  }
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const store = await loadOwnedStore(id, req.user.id);
  if (!store) {
    fs.unlink(req.file.path, () => {});
    return res.status(404).json({ error: 'Store not found' });
  }

  const ext = path.extname(req.file.originalname).toLowerCase();
  const finalName = `${store.id}${ext}`;
  const finalPath = path.join(req.file.destination, finalName);
  fs.renameSync(req.file.path, finalPath);
  const logoUrl = `/uploads/logos/${finalName}`;

  const updated = await prisma.store.update({
    where: { id: store.id },
    data: { logoUrl }
  });
  res.json({ logoUrl: updated.logoUrl });
}

// Lists incoming Contact rows for a specific store owned by the recycler.
async function listOwnContacts(req, res) {
  const id = parseStoreId(req);
  if (id == null) return res.status(400).json({ error: 'Invalid id' });

  const store = await loadOwnedStore(id, req.user.id);
  if (!store) return res.status(404).json({ error: 'Store not found' });

  const contacts = await prisma.contact.findMany({
    where: { storeId: store.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      createdAt: true,
      status: true,
      recyclerConnectedAt: true,
      user: { select: { id: true, name: true, email: true, phone: true } }
    }
  });
  res.json({ contacts });
}

// Marks recyclerConnectedAt on a contact, scoped to a specific store the recycler owns.
async function connectContact(req, res) {
  const storeId = parseStoreId(req);
  const contactId = Number(req.params.contactId);
  if (storeId == null || !Number.isInteger(contactId)) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  const store = await loadOwnedStore(storeId, req.user.id);
  if (!store) return res.status(404).json({ error: 'Store not found' });

  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact || contact.storeId !== store.id) {
    return res.status(404).json({ error: 'Contact not found' });
  }
  if (contact.recyclerConnectedAt) {
    return res.json({
      contact: {
        id: contact.id,
        recyclerConnectedAt: contact.recyclerConnectedAt.toISOString(),
        status: contact.status,
        already: true
      }
    });
  }

  const updated = await prisma.contact.update({
    where: { id: contactId },
    data: { recyclerConnectedAt: new Date() },
    select: { id: true, status: true, recyclerConnectedAt: true }
  });
  res.json({
    contact: {
      ...updated,
      recyclerConnectedAt: updated.recyclerConnectedAt.toISOString()
    }
  });
}

// Lists reviews left on a specific store the recycler owns, with aggregate rating summary.
async function listOwnReviews(req, res) {
  const id = parseStoreId(req);
  if (id == null) return res.status(400).json({ error: 'Invalid id' });

  const store = await loadOwnedStore(id, req.user.id);
  if (!store) return res.status(404).json({ error: 'Store not found' });

  const [reviews, agg] = await Promise.all([
    prisma.review.findMany({
      where: { storeId: store.id },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, name: true } } }
    }),
    prisma.review.aggregate({
      where: { storeId: store.id },
      _avg: { rating: true },
      _count: { _all: true }
    })
  ]);

  res.json({
    reviews,
    count: agg._count._all,
    avgRating: agg._avg.rating != null ? Number(agg._avg.rating.toFixed(2)) : null
  });
}

module.exports = {
  listStores,
  createStore,
  getStore,
  updateStore,
  uploadLogo,
  listOwnContacts,
  connectContact,
  listOwnReviews
};
