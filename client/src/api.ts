import type { Booking, Lock, BookingRequest, LockRequest } from 'shared';

const BASE = '/api';

export async function fetchBookings(date: string): Promise<{ bookings: Booking[]; locks: Lock[] }> {
  const res = await fetch(`${BASE}/bookings?date=${date}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createBooking(data: BookingRequest): Promise<{ bookings: Booking[]; errors: { timeSlot: string; error: string }[] }> {
  const res = await fetch(`${BASE}/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Booking failed');
  }
  return res.json();
}

export async function cancelBooking(id: number, phone: string): Promise<void> {
  const res = await fetch(`${BASE}/bookings/${id}?phone=${encodeURIComponent(phone)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Cancel failed');
  }
}

// Admin APIs
export async function adminLogin(password: string): Promise<string> {
  const res = await fetch(`${BASE}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error('Invalid password');
  const data = await res.json();
  return data.token;
}

export async function adminDeleteBooking(id: number, token: string): Promise<void> {
  const res = await fetch(`${BASE}/admin/bookings/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Delete failed');
  }
}

export async function adminCreateLock(data: LockRequest, token: string): Promise<Lock[]> {
  const res = await fetch(`${BASE}/admin/locks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Lock failed');
  }
  return res.json();
}

export async function adminDeleteLock(id: number, token: string): Promise<void> {
  const res = await fetch(`${BASE}/admin/locks/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Unlock failed');
  }
}
