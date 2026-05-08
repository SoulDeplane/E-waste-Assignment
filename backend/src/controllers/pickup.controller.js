const path = require('path');
const fs = require('fs');
const { z } = require('zod');
const prisma = require('../config/prisma');
const { notifyPickupRequested, notifyPickupStatus } = require('../utils/notify');

const CATEGORIES = ['laptops', 'phones', 'batteries', 'appliances', 'cables', 'monitors', 'other'];
const CONDITIONS = ['working', 'broken', 'unknown'];

const TIME_SLOT_RE = /^\d{2}:\d{2}-\d{2}:\d{2}$/;

const itemSchema = z.object({
  category: z.enum(CATEGORIES),
  quantity: z.coerce.number().int().min(1).max(99).default(1),
  estimatedWeightKg: z.coerce.number().min(0).max(500).optional().nullable(),
  condition: z.enum(CONDITIONS).optional().nullable(),
  notes: z.string().max(255).optional().nullable()
});

const createSchema = z.object({
  storeId: z.coerce.number().int().positive(),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  timeSlot: z.string().regex(TIME_SLOT_RE, 'Use HH:MM-HH:MM'),
  address: z.string().min(1).max(255),
  notes: z.string().max(500).optional().nullable(),
  items: z.array(itemSchema).min(1).max(15)
});

const cancelSchema = z.object({
  cancelReason: z.string().max(255).optional().nullable()
});

const statusPatchSchema = z.object({
  status: z.enum(['confirmed', 'declined', 'completed']),
  cancelReason: z.string().max(255).optional().nullable()
});

// Returns midnight-UTC of today as a Date, used to reject pickups scheduled in the past.
function todayStartUTC() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// Parses YYYY-MM-DD as UTC midnight for the @db.Date column.
function dateOnly(yyyy_mm_dd) {
  return new Date(`${yyyy_mm_dd}T00:00:00.000Z`);
}

// Formats a Date or date-string as YYYY-MM-DD for client serialization.
function formatDate(d) {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toISOString().slice(0, 10);
}

// Normalizes a Pickup row for JSON response (date-only string + numeric weight per item).
function shapePickup(p) {
  return {
    ...p,
    scheduledDate: formatDate(p.scheduledDate),
    items: (p.items || []).map((it) => ({
      ...it,
      estimatedWeightKg: it.estimatedWeightKg != null ? Number(it.estimatedWeightKg) : null
    }))
  };
}

const PICKUP_INCLUDE = {
  items: true,
  store: { select: { id: true, storeName: true, address: true, logoUrl: true } },
  user: { select: { id: true, name: true, email: true, phone: true } }
};

// Creates a Pickup with nested PickupItems and emails the recycler the new request.
async function createPickup(req, res) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;

  const date = dateOnly(data.scheduledDate);
  if (date < todayStartUTC()) {
    return res.status(400).json({ error: 'Scheduled date must be today or later.' });
  }

  const store = await prisma.store.findUnique({
    where: { id: data.storeId },
    include: { recycler: { select: { email: true, name: true } } }
  });
  if (!store || store.status !== 'approved') {
    return res.status(404).json({ error: 'Store not found' });
  }

  const me = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { name: true }
  });

  const created = await prisma.pickup.create({
    data: {
      userId: req.user.id,
      storeId: data.storeId,
      scheduledDate: date,
      timeSlot: data.timeSlot,
      address: data.address,
      notes: data.notes || null,
      items: {
        create: data.items.map((it) => ({
          category: it.category,
          quantity: it.quantity,
          estimatedWeightKg: it.estimatedWeightKg ?? null,
          condition: it.condition ?? null,
          notes: it.notes ?? null
        }))
      }
    },
    include: PICKUP_INCLUDE
  });

  notifyPickupRequested(
    store.recycler.email,
    me?.name || 'A user',
    store.storeName,
    data.scheduledDate,
    data.timeSlot
  );

  res.status(201).json({ pickup: shapePickup(created) });
}

// Lists every pickup the current user has scheduled, newest first.
async function listMine(req, res) {
  const pickups = await prisma.pickup.findMany({
    where: { userId: req.user.id },
    orderBy: { scheduledDate: 'desc' },
    include: { ...PICKUP_INCLUDE, review: { select: { id: true, rating: true } } }
  });
  res.json({ pickups: pickups.map(shapePickup) });
}

// Lists pickups against a specific store the recycler owns, optionally filtered by status.
async function listForStore(req, res) {
  const storeId = Number(req.query.storeId);
  if (!Number.isInteger(storeId) || storeId <= 0) {
    return res.status(400).json({ error: 'storeId is required' });
  }

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store || store.recyclerId !== req.user.id) {
    return res.status(404).json({ error: 'Store not found' });
  }

  const status = req.query.status;
  const where = { storeId: store.id };
  if (typeof status === 'string' && ['requested', 'confirmed', 'declined', 'completed', 'cancelled'].includes(status)) {
    where.status = status;
  }

  const pickups = await prisma.pickup.findMany({
    where,
    orderBy: [{ status: 'asc' }, { scheduledDate: 'desc' }],
    include: PICKUP_INCLUDE
  });
  res.json({ pickups: pickups.map(shapePickup) });
}

// Returns one pickup, accessible to the user who scheduled it or the recycler whose store hosts it.
async function getPickup(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  const pickup = await prisma.pickup.findUnique({
    where: { id },
    include: { ...PICKUP_INCLUDE, store: { include: { recycler: { select: { id: true, email: true, name: true } } } } }
  });
  if (!pickup) return res.status(404).json({ error: 'Pickup not found' });

  const isOwnerUser = pickup.userId === req.user.id;
  const isOwnerRecycler = req.user.role === 'recycler' && pickup.store.recycler.id === req.user.id;
  if (!isOwnerUser && !isOwnerRecycler) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  res.json({ pickup: shapePickup(pickup) });
}

// Cancels a pickup the user owns, only while it is requested or confirmed.
async function cancelPickup(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
  const parsed = cancelSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const pickup = await prisma.pickup.findUnique({
    where: { id },
    include: { store: { select: { storeName: true, recycler: { select: { email: true } } } } }
  });
  if (!pickup) return res.status(404).json({ error: 'Pickup not found' });
  if (pickup.userId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  if (!['requested', 'confirmed'].includes(pickup.status)) {
    return res.status(400).json({ error: `Cannot cancel a pickup that is ${pickup.status}.` });
  }

  const updated = await prisma.pickup.update({
    where: { id },
    data: {
      status: 'cancelled',
      cancelReason: parsed.data.cancelReason || null
    },
    include: PICKUP_INCLUDE
  });
  res.json({ pickup: shapePickup(updated) });
}

// Recycler-side state machine: requested->confirmed/declined, confirmed->completed.
async function patchStatus(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
  const parsed = statusPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const next = parsed.data.status;

  const pickup = await prisma.pickup.findUnique({
    where: { id },
    include: {
      user: { select: { email: true, name: true } },
      store: { select: { storeName: true, recyclerId: true } }
    }
  });
  if (!pickup) return res.status(404).json({ error: 'Pickup not found' });
  if (pickup.store.recyclerId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

  const allowed = {
    requested: ['confirmed', 'declined'],
    confirmed: ['completed']
  };
  if (!allowed[pickup.status]?.includes(next)) {
    return res.status(400).json({ error: `Cannot transition ${pickup.status} -> ${next}.` });
  }

  const data = { status: next };
  if (next === 'confirmed') data.confirmedAt = new Date();
  if (next === 'completed') data.completedAt = new Date();
  if (next === 'declined') data.cancelReason = parsed.data.cancelReason || null;

  const updated = await prisma.pickup.update({
    where: { id },
    data,
    include: PICKUP_INCLUDE
  });

  notifyPickupStatus(pickup.user.email, pickup.store.storeName, next, formatDate(pickup.scheduledDate));

  res.json({ pickup: shapePickup(updated) });
}

// Saves a multer-uploaded photo for a single pickup item, only while the pickup is still requested.
async function uploadItemPhoto(req, res) {
  const pickupId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  if (!Number.isInteger(pickupId) || !Number.isInteger(itemId)) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'Invalid id' });
  }
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const item = await prisma.pickupItem.findUnique({
    where: { id: itemId },
    include: { pickup: true }
  });
  if (!item || item.pickupId !== pickupId) {
    fs.unlink(req.file.path, () => {});
    return res.status(404).json({ error: 'Item not found' });
  }
  if (item.pickup.userId !== req.user.id) {
    fs.unlink(req.file.path, () => {});
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (item.pickup.status !== 'requested') {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'Cannot edit photos after the pickup is confirmed.' });
  }

  const ext = path.extname(req.file.originalname).toLowerCase();
  const finalDir = path.join(req.file.destination, String(pickupId));
  fs.mkdirSync(finalDir, { recursive: true });
  const finalName = `${itemId}${ext}`;
  const finalPath = path.join(finalDir, finalName);
  fs.renameSync(req.file.path, finalPath);
  const photoUrl = `/uploads/pickups/${pickupId}/${finalName}`;

  const updated = await prisma.pickupItem.update({
    where: { id: itemId },
    data: { photoUrl }
  });

  res.json({ photoUrl: updated.photoUrl });
}

module.exports = {
  createPickup,
  listMine,
  listForStore,
  getPickup,
  cancelPickup,
  patchStatus,
  uploadItemPhoto
};
