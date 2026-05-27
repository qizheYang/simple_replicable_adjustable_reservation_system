import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../index';
import {
  MACHINES,
  LockRequest,
  MAX_BATCH_IDS,
  MAX_REASON_LEN,
  MAX_TIME_SLOTS_PER_REQUEST,
  isValidDate,
  isValidTimeSlot,
  sanitizeLine,
} from 'shared';
import { notifyBookingCancelled, notifyBookingsCancelled, notifyLockCreated, notifyLockRemoved } from '../notifier';
import { cancelBatch, parseIdList } from './cancel';

export const adminRoutes = Router();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ewa0526';

// Login - verify password, return a simple token
adminRoutes.post('/login', (req: Request, res: Response) => {
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (password.length === 0 || password.length > 200 || password !== ADMIN_PASSWORD) {
    res.status(401).json({ error: 'Invalid password' });
    return;
  }
  // Simple base64 token (not cryptographic, just for session gating)
  const token = Buffer.from(`admin:${Date.now()}`).toString('base64');
  res.json({ token });
});

// Auth middleware for admin routes
function adminAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const token = auth.slice(7);
  try {
    const decoded = Buffer.from(token, 'base64').toString();
    if (!decoded.startsWith('admin:')) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Batch cancel (admin) — bookings + locks in one combined notification
adminRoutes.post('/batch-cancel', adminAuth, async (req: Request, res: Response) => {
  const bookingIds = parseIdList(req.body?.bookingIds, MAX_BATCH_IDS);
  const lockIds = parseIdList(req.body?.lockIds, MAX_BATCH_IDS);

  if (bookingIds.length === 0 && lockIds.length === 0) {
    res.status(400).json({ error: 'bookingIds or lockIds required' });
    return;
  }

  const { cancelledBookings, cancelledLocks } = await cancelBatch(bookingIds, lockIds);

  if (cancelledBookings.length > 0 || cancelledLocks.length > 0) {
    notifyBookingsCancelled(cancelledBookings, cancelledLocks);
  }

  res.json({
    cancelled: { bookings: cancelledBookings.length, locks: cancelledLocks.length },
  });
});

// Cancel any booking (admin)
adminRoutes.delete('/bookings/:id', adminAuth, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 0) {
    res.status(400).json({ error: 'invalid id' });
    return;
  }
  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) {
    res.status(404).json({ error: 'Booking not found' });
    return;
  }
  await prisma.booking.delete({ where: { id } });
  notifyBookingCancelled({ username: booking.username, date: booking.date, timeSlot: booking.timeSlot, machineId: booking.machineId });
  res.json({ success: true });
});

// Lock a machine for time slots
adminRoutes.post('/locks', adminAuth, async (req: Request, res: Response) => {
  const body: LockRequest = req.body;
  if (typeof body?.machineId !== 'number' || typeof body?.date !== 'string' || !Array.isArray(body?.timeSlots)) {
    res.status(400).json({ error: 'malformed request body' });
    return;
  }
  const { machineId } = body;

  if (!MACHINES.find((m) => m.id === machineId)) {
    res.status(400).json({ error: 'invalid machine ID' });
    return;
  }
  if (!isValidDate(body.date)) {
    res.status(400).json({ error: 'invalid date' });
    return;
  }
  if (body.timeSlots.length === 0 || body.timeSlots.length > MAX_TIME_SLOTS_PER_REQUEST) {
    res.status(400).json({ error: `timeSlots must have 1..${MAX_TIME_SLOTS_PER_REQUEST} entries` });
    return;
  }
  for (const s of body.timeSlots) {
    if (typeof s !== 'string' || !isValidTimeSlot(s)) {
      res.status(400).json({ error: 'invalid timeSlot' });
      return;
    }
  }
  const date = body.date;
  const timeSlots = Array.from(new Set(body.timeSlots));
  const reason = body.reason !== undefined
    ? sanitizeLine(String(body.reason)).slice(0, MAX_REASON_LEN)
    : '';

  const locks = await Promise.all(
    timeSlots.map((timeSlot) =>
      prisma.lock.upsert({
        where: { date_timeSlot_machineId: { date, timeSlot, machineId } },
        update: { reason },
        create: { machineId, date, timeSlot, reason },
      })
    )
  );

  notifyLockCreated(locks.map((l) => ({ machineId: l.machineId, date: l.date, timeSlot: l.timeSlot, reason: l.reason })));
  res.status(201).json(locks);
});

// Unlock
adminRoutes.delete('/locks/:id', adminAuth, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 0) {
    res.status(400).json({ error: 'invalid id' });
    return;
  }
  const lock = await prisma.lock.findUnique({ where: { id } });
  if (!lock) {
    res.status(404).json({ error: 'Lock not found' });
    return;
  }
  await prisma.lock.delete({ where: { id } });
  notifyLockRemoved({ machineId: lock.machineId, date: lock.date, timeSlot: lock.timeSlot });
  res.json({ success: true });
});

// List locks for a date
adminRoutes.get('/locks', adminAuth, async (req: Request, res: Response) => {
  const { date } = req.query;
  if (!date || typeof date !== 'string' || !isValidDate(date)) {
    res.status(400).json({ error: 'date query parameter required (YYYY-MM-DD)' });
    return;
  }
  const locks = await prisma.lock.findMany({
    where: { date },
    orderBy: { createdAt: 'asc' },
  });
  res.json(locks);
});
