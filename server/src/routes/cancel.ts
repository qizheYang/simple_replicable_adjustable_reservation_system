import { prisma } from '../index';

export interface CancelledBooking {
  username: string;
  date: string;
  timeSlot: string;
  machineId: number;
}

export interface CancelledLock {
  machineId: number;
  date: string;
  timeSlot: string;
  reason: string;
  username?: string | null;
}

export interface BatchCancelError {
  id: number;
  kind: 'booking' | 'lock';
  error: string;
}

interface BatchCancelOptions {
  phone?: string;
  verifyPhone?: boolean;
  userLocksOnly?: boolean;
  reportMissing?: boolean;
}

export function parseIdList(value: unknown, max: number): number[] {
  return Array.isArray(value)
    ? value.filter((n: unknown) => Number.isInteger(n) && (n as number) >= 0).slice(0, max)
    : [];
}

export async function cancelBatch(
  bookingIds: number[],
  lockIds: number[],
  options: BatchCancelOptions = {},
) {
  const cancelledBookings: CancelledBooking[] = [];
  const cancelledLocks: CancelledLock[] = [];
  const errors: BatchCancelError[] = [];

  for (const id of bookingIds) {
    const booking = await prisma.booking.findUnique({ where: { id } });
    if (!booking) {
      if (options.reportMissing) errors.push({ id, kind: 'booking', error: 'not found' });
      continue;
    }
    if (options.verifyPhone && booking.phone && booking.phone.length > 0 && booking.phone !== options.phone) {
      errors.push({ id, kind: 'booking', error: 'phone mismatch' });
      continue;
    }

    await prisma.booking.delete({ where: { id } });
    cancelledBookings.push({
      username: booking.username,
      date: booking.date,
      timeSlot: booking.timeSlot,
      machineId: booking.machineId,
    });
  }

  for (const id of lockIds) {
    const lock = await prisma.lock.findUnique({ where: { id } });
    if (!lock) {
      if (options.reportMissing) errors.push({ id, kind: 'lock', error: 'not found' });
      continue;
    }
    if (options.userLocksOnly && !lock.username) {
      errors.push({ id, kind: 'lock', error: 'admin lock' });
      continue;
    }
    if (options.verifyPhone && lock.phone && lock.phone.length > 0 && lock.phone !== options.phone) {
      errors.push({ id, kind: 'lock', error: 'phone mismatch' });
      continue;
    }

    await prisma.lock.delete({ where: { id } });
    cancelledLocks.push({
      machineId: lock.machineId,
      date: lock.date,
      timeSlot: lock.timeSlot,
      reason: lock.reason,
      username: lock.username,
    });
  }

  return { cancelledBookings, cancelledLocks, errors };
}
