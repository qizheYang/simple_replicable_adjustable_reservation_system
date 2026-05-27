import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import { bookingRoutes } from './routes/bookings';
import { machineRoutes } from './routes/machines';
import { adminRoutes } from './routes/admin';

export const prisma = new PrismaClient();

const app = express();
const PORT = process.env.PORT || 3001;

// Trust the upstream nginx proxy so req.ip reflects the real client (needed for rate limiting)
app.set('trust proxy', 1);

// Security headers (CSP intentionally not enforced here — nginx serves the SPA)
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// CORS: same-origin in production via nginx; allow localhost for dev
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:4173')
  .split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    // No origin = same-origin / curl / server-to-server — allow
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin) || /^https:\/\/eastwindriichi\.com$/.test(origin)) return cb(null, true);
    return cb(new Error('Origin not allowed'));
  },
}));

// Cap request body size — booking payloads are tiny, anything bigger is an attack surface
app.use(express.json({ limit: '16kb' }));

// Per-IP rate limits — abuse mitigation, not an auth boundary
const writeLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,                // 30 writes per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too many requests' },
});
const loginLimiter = rateLimit({
  windowMs: 5 * 60_000,
  max: 10,                // 10 admin login attempts per 5 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too many login attempts' },
});

// Apply write limiter to mutating endpoints
app.use((req, _res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  return writeLimiter(req, _res, next);
});
// Tighter limiter on admin login specifically
app.use('/api/admin/login', loginLimiter);

app.use('/api/bookings', bookingRoutes);
app.use('/api/machines', machineRoutes);
app.use('/api/admin', adminRoutes);

// Express error handler — never leak stack traces
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err && /Origin not allowed/i.test(String(err.message))) {
    res.status(403).json({ error: 'origin not allowed' });
    return;
  }
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    res.status(413).json({ error: 'request too large' });
    return;
  }
  if (err && err.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'malformed JSON' });
    return;
  }
  console.error('[server]', err);
  res.status(500).json({ error: 'internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
