require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const authRoutes = require('./routes/auth.routes');
const recyclerRoutes = require('./routes/recycler.routes');
const adminRoutes = require('./routes/admin.routes');
const storeRoutes = require('./routes/store.routes');
const pickupRoutes = require('./routes/pickup.routes');
const reviewRoutes = require('./routes/review.routes');

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));

app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/recycler', recyclerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/pickups', pickupRoutes);
app.use('/api/reviews', reviewRoutes);

app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  if (err.message && err.message.startsWith('Only ')) {
    return res.status(400).json({ error: err.message });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large (max 2 MB)' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
