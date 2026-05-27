export function todayPST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

export function isMobile(): boolean {
  return window.innerWidth <= 768;
}

// "2026-05-04" -> "2026-05-05" — purely calendar-based, no TZ involved (date strings only).
export function nextDate(iso: string): string {
  const [y, m, d] = iso.split('-').map((p) => parseInt(p, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  const ny = dt.getUTCFullYear();
  const nm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const nd = String(dt.getUTCDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

// How many early-morning hours from the next calendar day to surface alongside
// the primary date (overnight / late-session bookings).
export const OVERNIGHT_HOURS = 6;

// Build the row list for one or two date bands: returns [{ date, timeSlot, isOvernight }]
export function buildOvernightRows(primaryDate: string, slots: readonly string[]) {
  const base = slots.map((s) => ({ date: primaryDate, timeSlot: s, isOvernight: false }));
  const nextSlots = slots.slice(0, OVERNIGHT_HOURS);
  const overnight = nextSlots.map((s) => ({ date: nextDate(primaryDate), timeSlot: s, isOvernight: true }));
  return [...base, ...overnight];
}

export type SlotRef = { date: string; timeSlot: string };
