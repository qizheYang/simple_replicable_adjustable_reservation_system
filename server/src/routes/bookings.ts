import { Router, Request, Response } from 'express';
import { prisma } from '../index';
import {
  MACHINES,
  MAX_PLAYERS,
  WAITLIST_RIICHI,
  WAITLIST_GUOMA,
  BookingRequest,
} from 'shared';
import { notifyBookingCreated, notifyBookingCancelled } from '../notifier';

export const bookingRoutes = Router();

const WAITLIST_IDS = [WAITLIST_RIICHI, WAITLIST_GUOMA];

bookingRoutes.get('/', async (req: Request, res: Response) => {
  const { date } = req.query;
  if (!date || typeof date !== 'string') {
    res.status(400).json({ error: 'date query parameter required (YYYY-MM-DD)' });
    return;
  }

  const bookings = await prisma.booking.findMany({
    where: { date },
    select: {
      id: true, username: true, date: true, timeSlot: true,
      machineId: true, createdAt: true,
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
  const { username, phone, date, timeSlots, machineId } = body;

  if (!username || !date || !timeSlots || timeSlots.length === 0) {
    res.status(400).json({ error: 'username, date, and timeSlots are required' });
    return;
  }

  const isWaitlist = WAITLIST_IDS.includes(machineId);

  if (!isWaitlist && !MACHINES.find((m) => m.id === machineId)) {
    res.status(400).json({ error: 'Invalid machine ID' });
    return;
  }

  const results = [];
  const errors = [];

  for (const timeSlot of timeSlots) {
    if (!isWaitlist) {
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
      if (existingCount >= MAX_PLAYERS) {
        errors.push({ timeSlot, error: 'Machine is full' });
        continue;
      }
    }

    const duplicate = await prisma.booking.findFirst({
      where: { date, timeSlot, machineId, username },
    });
    if (duplicate) {
      errors.push({ timeSlot, error: 'Already booked' });
      continue;
    }

    const booking = await prisma.booking.create({
      data: {
        username, phone: phone || '', date, timeSlot, machineId,
      },
    });
    results.push(booking);
  }

  if (results.length === 0 && errors.length > 0) {
    res.status(409).json({ error: errors[0].error, errors });
    return;
  }

  notifyBookingCreated(results.map((b) => ({ username: b.username, date: b.date, timeSlot: b.timeSlot, machineId: b.machineId })));
  res.status(201).json({ bookings: results, errors });
});

bookingRoutes.delete('/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
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
