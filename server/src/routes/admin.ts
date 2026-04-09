import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../index';
import { MACHINES, LockRequest } from 'shared';
import { notifyBookingCancelled, notifyLockCreated, notifyLockRemoved } from '../notifier';

export const adminRoutes = Router();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ewa0526';

// Login - verify password, return a simple token
adminRoutes.post('/login', (req: Request, res: Response) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) {
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

// Cancel any booking (admin)
adminRoutes.delete('/bookings/:id', adminAuth, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
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
  const { machineId, date, timeSlots, reason } = body;

  if (!MACHINES.find((m) => m.id === machineId)) {
    res.status(400).json({ error: 'Invalid machine ID' });
    return;
  }
  if (!date || !timeSlots || timeSlots.length === 0) {
    res.status(400).json({ error: 'date and timeSlots required' });
    return;
  }

  const locks = await Promise.all(
    timeSlots.map((timeSlot) =>
      prisma.lock.upsert({
        where: { date_timeSlot_machineId: { date, timeSlot, machineId } },
        update: { reason: reason || '' },
        create: { machineId, date, timeSlot, reason: reason || '' },
      })
    )
  );

  notifyLockCreated(locks.map((l) => ({ machineId: l.machineId, date: l.date, timeSlot: l.timeSlot, reason: l.reason })));
  res.status(201).json(locks);
});

// Unlock
adminRoutes.delete('/locks/:id', adminAuth, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
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
  if (!date || typeof date !== 'string') {
    res.status(400).json({ error: 'date query parameter required' });
    return;
  }
  const locks = await prisma.lock.findMany({
    where: { date },
    orderBy: { createdAt: 'asc' },
  });
  res.json(locks);
});
