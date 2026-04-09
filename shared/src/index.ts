export const MACHINES = [
  { id: 0, code: 'White 8', display: '白色八口机' },
  { id: 1, code: 'Black 8', display: '黑色八口机' },
  { id: 2, code: 'White 4', display: '白色四口机' },
  { id: 3, code: 'Large 1', display: '国麻桌1' },
  { id: 4, code: 'Large 2', display: '国麻桌2' },
] as const;

export const MAX_PLAYERS = 4;

// Waitlist columns
export const WAITLIST_RIICHI = -1;
export const WAITLIST_GUOMA = -2;

// Riichi: machines 0,1,2; 国麻: machines 3,4
export const RIICHI_MACHINE_IDS = [0, 1, 2];
export const GUOMA_MACHINE_IDS = [3, 4];

// 0:00 - 23:00 (full day)
export const TIME_SLOTS = Array.from({ length: 24 }, (_, i) => {
  return `${i}:00`;
});

export type PlayStyle = 'riichi' | 'guoma';

export interface BookingRequest {
  username: string;
  phone?: string;
  date: string; // YYYY-MM-DD
  timeSlots: string[]; // ["HH:00", ...]
  machineId: number; // -1 = riichi waitlist, -2 = guoma waitlist
}

export interface Booking {
  id: number;
  username: string;
  phone: string;
  date: string;
  timeSlot: string;
  machineId: number;
  createdAt: string;
}

export interface Lock {
  id: number;
  machineId: number;
  date: string;
  timeSlot: string;
  reason: string;
  createdAt: string;
}

export interface LockRequest {
  machineId: number;
  date: string;
  timeSlots: string[];
  reason: string;
}
