import { Router, Request, Response } from 'express';
import { prisma } from '../index';
import {
  MACHINES,
  MAX_PLAYERS,
  MAX_COMPANIONS,
  MAX_BATCH_IDS,
  MAX_COMMENT_LEN,
  MAX_TIME_SLOTS_PER_REQUEST,
  WAITLIST_RIICHI,
  WAITLIST_GUOMA,
  AUTO_RIICHI,
  RIICHI_MACHINE_IDS,
  BookingRequest,
  isValidDate,
  isValidPhone,
  isValidTimeSlot,
  isValidUsername,
  sanitizeLine,
  sanitizeText,
} from 'shared';
import {
  notifyBookingCreated,
  notifyBookingCancelled,
  notifyBookingsCancelled,
  notifyLockCreated,
  notifyLockRemoved,
} from '../notifier';
import { cancelBatch, parseIdList } from './cancel';

export const bookingRoutes = Router();

const WAITLIST_IDS = [WAITLIST_RIICHI, WAITLIST_GUOMA];

bookingRoutes.get('/', async (req: Request, res: Response) => {
  const { date } = req.query;
  if (!date || typeof date !== 'string' || !isValidDate(date)) {
    res.status(400).json({ error: 'date query parameter required (YYYY-MM-DD)' });
    return;
  }

  const bookings = await prisma.booking.findMany({
    where: { date },
    select: {
      id: true, username: true, date: true, timeSlot: true,
      machineId: true, comment: true, createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const locks = await prisma.lock.findMany({
    where: { date },
    orderBy: { createdAt: 'asc' },
  });

  res.json({ bookings, locks });
});

bookingRoutes.post('/', async (req: Request, res: Response) => {
  const body: BookingRequest = req.body;
  const { machineId, bookEntireTable } = body;

  // Type + presence
  if (typeof body?.username !== 'string' || typeof body?.date !== 'string' || !Array.isArray(body?.timeSlots) || typeof machineId !== 'number') {
    res.status(400).json({ error: 'malformed request body' });
    return;
  }

  // Sanitize / validate scalars
  const username = sanitizeLine(body.username);
  const phone = body.phone !== undefined ? sanitizeLine(String(body.phone)) : '';
  const comment = body.comment !== undefined ? sanitizeText(String(body.comment)).slice(0, MAX_COMMENT_LEN) : '';
  const date = body.date;

  if (!isValidUsername(username)) {
    res.status(400).json({ error: 'invalid username' });
    return;
  }
  if (phone.length > 0 && !isValidPhone(phone)) {
    res.status(400).json({ error: 'invalid phone' });
    return;
  }
  if (!isValidDate(date)) {
    res.status(400).json({ error: 'invalid date' });
    return;
  }
  if (body.timeSlots.length === 0 || body.timeSlots.length > MAX_TIME_SLOTS_PER_REQUEST) {
    res.status(400).json({ error: `timeSlots must have 1..${MAX_TIME_SLOTS_PER_REQUEST} entries` });
    return;
  }
  for (const s of body.timeSlots) {
    if (typeof s !== 'string' || !isValidTimeSlot(s)) {
      res.status(400).json({ error: `invalid timeSlot: ${String(s).slice(0, 16)}` });
      return;
    }
  }
  // Dedupe timeSlots
  const timeSlots = Array.from(new Set(body.timeSlots));

  const isWaitlist = WAITLIST_IDS.includes(machineId);
  const isAutoRiichi = machineId === AUTO_RIICHI;

  if (!isWaitlist && !isAutoRiichi && !MACHINES.find((m) => m.id === machineId)) {
    res.status(400).json({ error: 'invalid machine ID' });
    return;
  }

  // Companions
  const rawCompanions = Array.isArray(body.companions) ? body.companions : [];
  if (rawCompanions.length > MAX_COMPANIONS) {
    res.status(400).json({ error: `up to ${MAX_COMPANIONS} companions allowed` });
    return;
  }
  const companions: string[] = [];
  for (const c of rawCompanions) {
    if (typeof c !== 'string') continue;
    const cleaned = sanitizeLine(c);
    if (cleaned.length === 0) continue;
    if (!isValidUsername(cleaned)) {
      res.status(400).json({ error: 'invalid companion name' });
      return;
    }
    companions.push(cleaned);
  }
  if (isWaitlist && companions.length > 0) {
    res.status(400).json({ error: 'companions are not supported on waitlist' });
    return;
  }
  if (isAutoRiichi && bookEntireTable) {
    res.status(400).json({ error: '随便 cannot be combined with 包桌' });
    return;
  }
  // Disallow duplicates within the submitted party
  const partyNames = [username, ...companions];
  const seen = new Set<string>();
  for (const n of partyNames) {
    const key = n.toLowerCase();
    if (seen.has(key)) {
      res.status(400).json({ error: 'duplicate names in party' });
      return;
    }
    seen.add(key);
  }

  // 包桌: create locks instead of bookings (locks the entire table)
  if (bookEntireTable && !isWaitlist) {
    const lockResults = [];
    const lockErrors = [];

    for (const timeSlot of timeSlots) {
      // Can't 包桌 if there are existing bookings or locks
      const existingBookings = await prisma.booking.count({
        where: { date, timeSlot, machineId },
      });
      if (existingBookings > 0) {
        lockErrors.push({ timeSlot, error: 'Slot has existing bookings' });
        continue;
      }
      const existingLock = await prisma.lock.findUnique({
        where: { date_timeSlot_machineId: { date, timeSlot, machineId } },
      });
      if (existingLock) {
        lockErrors.push({ timeSlot, error: 'Already locked' });
        continue;
      }

      const lock = await prisma.lock.create({
        data: {
          machineId, date, timeSlot,
          reason: `包桌 - ${username}`.slice(0, 80),
          username,
          phone: phone || null,
        },
      });
      lockResults.push(lock);
    }

    if (lockResults.length === 0 && lockErrors.length > 0) {
      res.status(409).json({ error: lockErrors[0].error, errors: lockErrors });
      return;
    }

    notifyLockCreated(lockResults.map((l) => ({
      machineId: l.machineId, date: l.date, timeSlot: l.timeSlot, reason: l.reason,
    })));
    res.status(201).json({ bookings: [], locks: lockResults, errors: lockErrors });
    return;
  }

  const results = [];
  const errors = [];
  const partySize = 1 + companions.length;

  // 随便 (AUTO_RIICHI): walk-in / "先到先得" — no hard cap. Overflow above
  // the 12-seat capacity is allowed; the front-end warns the user about the
  // queue, and staff resolves seating on arrival.

  for (const timeSlot of timeSlots) {
    const resolvedMachineId = machineId;

    if (isAutoRiichi) {
      // No capacity check — walk-ins can queue.
    } else if (!isWaitlist) {
      const lock = await prisma.lock.findUnique({
        where: { date_timeSlot_machineId: { date, timeSlot, machineId } },
      });
      if (lock) {
        errors.push({ timeSlot, error: 'Machine is locked' });
        continue;
      }

      const existingCount = await prisma.booking.count({
        where: { date, timeSlot, machineId },
      });
      if (existingCount + partySize > MAX_PLAYERS) {
        errors.push({ timeSlot, error: companions.length > 0 ? 'Not enough seats for party' : 'Machine is full' });
        continue;
      }
    }

    // Check that none of the party names already booked this slot on the resolved machine
    const existingNames = await prisma.booking.findMany({
      where: { date, timeSlot, machineId: resolvedMachineId, username: { in: partyNames } },
      select: { username: true },
    });
    if (existingNames.length > 0) {
      errors.push({ timeSlot, error: `Already booked: ${existingNames.map((b) => b.username).join(', ')}` });
      continue;
    }

    const created = [];
    for (const name of partyNames) {
      const booking = await prisma.booking.create({
        data: {
          username: name,
          phone: phone || '',
          date,
          timeSlot,
          machineId: resolvedMachineId,
          comment: comment || null,
        },
      });
      created.push(booking);
    }
    results.push(...created);
  }

  if (results.length === 0 && errors.length > 0) {
    res.status(409).json({ error: errors[0].error, errors });
    return;
  }

  notifyBookingCreated(
    results.map((b) => ({
      username: b.username,
      date: b.date,
      timeSlot: b.timeSlot,
      machineId: b.machineId,
      comment: b.comment || undefined,
    })),
    { primary: username.trim(), companions, comment: comment || undefined },
  );
  res.status(201).json({ bookings: results, errors });
});

// Batch cancel — combines bookings + locks into a single phone-verified delete and one notification
bookingRoutes.post('/batch-cancel', async (req: Request, res: Response) => {
  const phone = typeof req.body?.phone === 'string' ? sanitizeLine(req.body.phone) : '';
  if (phone.length > 0 && !isValidPhone(phone)) {
    res.status(400).json({ error: 'invalid phone' });
    return;
  }
  const bookingIds = parseIdList(req.body?.bookingIds, MAX_BATCH_IDS);
  const lockIds = parseIdList(req.body?.lockIds, MAX_BATCH_IDS);

  if (bookingIds.length === 0 && lockIds.length === 0) {
    res.status(400).json({ error: 'bookingIds or lockIds required' });
    return;
  }

  const { cancelledBookings, cancelledLocks, errors } = await cancelBatch(bookingIds, lockIds, {
    phone,
    verifyPhone: true,
    userLocksOnly: true,
    reportMissing: true,
  });

  if (cancelledBookings.length > 0 || cancelledLocks.length > 0) {
    notifyBookingsCancelled(cancelledBookings, cancelledLocks);
  }

  res.json({
    cancelled: { bookings: cancelledBookings.length, locks: cancelledLocks.length },
    errors,
  });
});

bookingRoutes.delete('/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 0) {
    res.status(400).json({ error: 'invalid id' });
    return;
  }
  const { phone } = req.query;

  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) {
    res.status(404).json({ error: 'Booking not found' });
    return;
  }

  // If booking has a phone, require it for verification
  if (booking.phone && booking.phone.length > 0) {
    if (!phone || typeof phone !== 'string') {
      res.status(400).json({ error: 'phone query parameter required for verification' });
      return;
    }
    if (booking.phone !== phone) {
      res.status(403).json({ error: 'Phone number does not match' });
      return;
    }
  }

  await prisma.booking.delete({ where: { id } });
  notifyBookingCancelled({ username: booking.username, date: booking.date, timeSlot: booking.timeSlot, machineId: booking.machineId });
  res.json({ success: true });
});

// Cancel a user-created lock (包桌) by lock id; verify phone if set
bookingRoutes.delete('/locks/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 0) {
    res.status(400).json({ error: 'invalid id' });
    return;
  }
  const { phone } = req.query;

  const lock = await prisma.lock.findUnique({ where: { id } });
  if (!lock) {
    res.status(404).json({ error: 'Lock not found' });
    return;
  }
  // Only user-created locks can be cancelled this way
  if (!lock.username) {
    res.status(403).json({ error: 'This lock can only be cancelled by admin' });
    return;
  }
  // Verify phone if set
  if (lock.phone && lock.phone.length > 0) {
    if (!phone || typeof phone !== 'string' || lock.phone !== phone) {
      res.status(403).json({ error: 'Phone number does not match' });
      return;
    }
  }

  await prisma.lock.delete({ where: { id } });
  notifyLockRemoved({ machineId: lock.machineId, date: lock.date, timeSlot: lock.timeSlot });
  res.json({ success: true });
});
