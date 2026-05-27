export const MACHINES = [
  { id: 0, code: 'White 8', display: '白色八口机' },
  { id: 1, code: 'Black 8', display: '黑色八口机' },
  { id: 2, code: 'White 4', display: '白色四口机' },
  { id: 3, code: 'Large 1', display: '国麻桌1' },
  { id: 4, code: 'Large 2', display: '国麻桌2' },
] as const;

export const MAX_PLAYERS = 4;

// Waitlist columns (legacy — kept for backwards-compatible API support)
export const WAITLIST_RIICHI = -1;
export const WAITLIST_GUOMA = -2;

// Auto-assign sentinels (immediate booking onto a real machine)
export const AUTO_RIICHI = -3;

// Riichi: machines 0,1,2; 国麻: machines 3,4
export const RIICHI_MACHINE_IDS = [0, 1, 2];
export const GUOMA_MACHINE_IDS = [3, 4];

export function isRiichiMachine(id: number): boolean {
  return RIICHI_MACHINE_IDS.includes(id);
}
export function isGuomaMachine(id: number): boolean {
  return GUOMA_MACHINE_IDS.includes(id);
}

// 0:00 - 23:00 (full day)
export const TIME_SLOTS = Array.from({ length: 24 }, (_, i) => {
  return `${i}:00`;
});

export type PlayStyle = 'riichi' | 'guoma';

export const MAX_COMPANIONS = 3;

// ===== Input validation (used by both client and server) =====
export const MAX_USERNAME_LEN = 40;
export const MAX_PHONE_LEN = 20;
export const MAX_COMMENT_LEN = 200;
export const MAX_REASON_LEN = 80;
export const MAX_TIME_SLOTS_PER_REQUEST = 24;
export const MAX_BATCH_IDS = 200;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_SLOT_RE = /^([0-9]|1[0-9]|2[0-3]):00$/;
const PHONE_RE = /^[0-9+\-\s().]*$/;
// Username: any printable Unicode except control chars / angle brackets / quotes / backticks
// (angle/quote/backtick stripped to neutralize log/markdown injection; React still escapes for display)
const USERNAME_FORBIDDEN_RE = /[<>`"']/;

export function stripControlChars(s: string): string {
  // Remove C0 control chars except \t (\x09) and \n (\x0A); also strip DEL (\x7F)
  return s.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '');
}

export function sanitizeLine(s: string): string {
  // For single-line inputs (username, phone, reason): strip controls + newlines
  return stripControlChars(s).replace(/[\r\n]/g, ' ').trim();
}

export function sanitizeText(s: string): string {
  // For multi-line inputs (comment): strip controls but keep newlines
  return stripControlChars(s).trim();
}

export function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map((p) => parseInt(p, 10));
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export function isValidTimeSlot(s: string): boolean {
  return TIME_SLOT_RE.test(s);
}

export function isValidUsername(s: string): boolean {
  if (s.length === 0 || s.length > MAX_USERNAME_LEN) return false;
  if (USERNAME_FORBIDDEN_RE.test(s)) return false;
  return true;
}

export function isValidPhone(s: string): boolean {
  return s.length <= MAX_PHONE_LEN && PHONE_RE.test(s);
}

export interface BookingRequest {
  username: string;
  phone?: string;
  date: string; // YYYY-MM-DD
  timeSlots: string[]; // ["HH:00", ...]
  machineId: number; // -1 = riichi waitlist, -2 = guoma waitlist
  bookEntireTable?: boolean; // 包桌 - locks the whole table
  comment?: string;
  companions?: string[]; // up to MAX_COMPANIONS extra player names
}

export interface Booking {
  id: number;
  username: string;
  phone: string;
  date: string;
  timeSlot: string;
  machineId: number;
  comment?: string | null;
  createdAt: string;
}

export interface Lock {
  id: number;
  machineId: number;
  date: string;
  timeSlot: string;
  reason: string;
  username?: string | null;
  phone?: string | null;
  createdAt: string;
}

export interface LockRequest {
  machineId: number;
  date: string;
  timeSlots: string[];
  reason: string;
}
