const { z } = require('zod');
const prisma = require('../config/prisma');

const createSchema = z.object({
  pickupId: z.coerce.number().int().positive(),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().max(1000).optional().nullable()
});

// Creates one Review per completed Pickup; rejects double-reviews and non-completed pickups.
async function createReview(req, res) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { pickupId, rating, comment } = parsed.data;

  const pickup = await prisma.pickup.findUnique({
    where: { id: pickupId },
    include: { review: { select: { id: true } } }
  });
  if (!pickup) return res.status(404).json({ error: 'Pickup not found' });
  if (pickup.userId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  if (pickup.status !== 'completed') {
    return res.status(400).json({ error: 'You can only review completed pickups.' });
  }
  if (pickup.review) {
    return res.status(409).json({ error: 'You have already reviewed this pickup.' });
  }

  const review = await prisma.review.create({
    data: {
      pickupId,
      userId: req.user.id,
      storeId: pickup.storeId,
      rating,
      comment: comment || null
    }
  });
  res.status(201).json({ review });
}

// Returns paginated reviews for a single store.
async function listForStore(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const [reviews, count] = await Promise.all([
    prisma.review.findMany({
      where: { storeId: id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: { user: { select: { id: true, name: true } } }
    }),
    prisma.review.count({ where: { storeId: id } })
  ]);

  res.json({ reviews, count });
}

module.exports = { createReview, listForStore };
