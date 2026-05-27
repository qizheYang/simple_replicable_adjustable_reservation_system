import { PrismaClient } from '@prisma/client';
import { MACHINES, MAX_PLAYERS, WAITLIST_RIICHI, WAITLIST_GUOMA } from 'shared';

const prisma = new PrismaClient();
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK || '';
const WECOM_WEBHOOK = process.env.WECOM_WEBHOOK || '';

const EN_NAMES: Record<number, string> = {
  0: 'White REXX 🤍',
  1: 'Black REXX ♣️',
  2: 'White JP-Color 🏳️',
  3: 'Chinese 1 🏮',
  4: 'Chinese 2 🀄️',
  [WAITLIST_RIICHI]: 'WL Riichi',
  [WAITLIST_GUOMA]: 'WL Chinese',
};

function machineName(id: number): string {
  return EN_NAMES[id] || `#${id}`;
}

function groupTimeSlots(slots: string[]): string {
  const hours = slots.map((s) => parseInt(s)).sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = hours[0];
  let end = hours[0];
  for (let i = 1; i < hours.length; i++) {
    if (hours[i] === end + 1) {
      end = hours[i];
    } else {
      ranges.push(`${start}:00-${end + 1}:00`);
      start = hours[i];
      end = hours[i];
    }
  }
  ranges.push(`${start}:00-${end + 1}:00`);
  return ranges.join(', ');
}

async function getSeatsRemaining(machineId: number, date: string, timeSlots: string[]): Promise<string> {
  if (machineId === WAITLIST_RIICHI || machineId === WAITLIST_GUOMA) return '';
  const sorted = [...timeSlots].sort();
  const results: { slot: string; remaining: number }[] = [];
  for (const slot of sorted) {
    const count = await prisma.booking.count({ where: { date, timeSlot: slot, machineId } });
    results.push({ slot, remaining: MAX_PLAYERS - count });
  }
  const allSame = results.every((r) => r.remaining === results[0].remaining);
  if (allSame) {
    const range = groupTimeSlots(results.map((r) => r.slot));
    return `${range}: ${results[0].remaining} spot${results[0].remaining !== 1 ? 's' : ''} left!`;
  }
  const parts: string[] = [];
  let i = 0;
  while (i < results.length) {
    const count = results[i].remaining;
    let j = i;
    while (j < results.length && results[j].remaining === count) j++;
    const range = groupTimeSlots(results.slice(i, j).map((r) => r.slot));
    parts.push(`${range}: ${count} spot${count !== 1 ? 's' : ''} left!`);
    i = j;
  }
  return parts.join(', ');
}

// Build embed fields for the day's schedule
async function buildScheduleEmbed(date: string): Promise<{ name: string; value: string; inline: boolean }[]> {
  const bookings = await prisma.booking.findMany({
    where: { date },
    orderBy: { createdAt: 'asc' },
  });
  const locks = await prisma.lock.findMany({ where: { date } });

  const fields: { name: string; value: string; inline: boolean }[] = [];

  // Each machine as a field
  for (const m of MACHINES) {
    const mBookings = bookings.filter((b) => b.machineId === m.id);
    const mLocks = locks.filter((l) => l.machineId === m.id);

    if (mBookings.length === 0 && mLocks.length === 0) {
      fields.push({ name: machineName(m.id), value: '*empty*', inline: true });
      continue;
    }

    // Group by time slot
    const slotSet = new Set<string>();
    mBookings.forEach((b) => slotSet.add(b.timeSlot));
    mLocks.forEach((l) => slotSet.add(l.timeSlot));
    const slots = Array.from(slotSet).sort();

    const lines: string[] = [];
    for (const slot of slots) {
      const lock = mLocks.find((l) => l.timeSlot === slot);
      if (lock) {
        lines.push(`\`${slot}\` 🔒 ${lock.reason || 'locked'}`);
        continue;
      }
      const players = mBookings.filter((b) => b.timeSlot === slot);
      const names = players.map((p) => p.username).join(', ');
      const remaining = MAX_PLAYERS - players.length;
      lines.push(`\`${slot}\` ${names} (${remaining} left)`);
    }

    fields.push({ name: machineName(m.id), value: lines.join('\n'), inline: true });
  }

  // Waitlist columns
  for (const wId of [WAITLIST_RIICHI, WAITLIST_GUOMA]) {
    const wBookings = bookings.filter((b) => b.machineId === wId);
    if (wBookings.length === 0) continue;

    const slotSet = new Set<string>();
    wBookings.forEach((b) => slotSet.add(b.timeSlot));
    const slots = Array.from(slotSet).sort();

    const lines = slots.map((slot) => {
      const names = wBookings.filter((b) => b.timeSlot === slot).map((b) => b.username).join(', ');
      return `\`${slot}\` ${names}`;
    });

    fields.push({ name: machineName(wId), value: lines.join('\n'), inline: true });
  }

  return fields;
}

const RSVP_URL = 'https://eastwindriichi.com/rsvp/';

interface DiscordEmbed {
  title?: string;
  url?: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
}

async function sendDiscord(content: string, embeds?: DiscordEmbed[]) {
  if (!DISCORD_WEBHOOK) {
    console.log('[notifier]', content);
    return;
  }
  try {
    const body: any = {};
    if (content) body.content = content;
    if (embeds) body.embeds = embeds;
    const res = await fetch(DISCORD_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) console.error('[notifier] Discord failed:', res.status, await res.text());
  } catch (err) {
    console.error('[notifier] Discord error:', err);
  }
}

// Build a markdown summary for WeCom (and other text-only channels)
async function buildScheduleMarkdown(date: string): Promise<string> {
  const bookings = await prisma.booking.findMany({
    where: { date },
    orderBy: { createdAt: 'asc' },
  });
  const locks = await prisma.lock.findMany({ where: { date } });

  const sections: string[] = [];
  for (const m of MACHINES) {
    const mBookings = bookings.filter((b) => b.machineId === m.id);
    const mLocks = locks.filter((l) => l.machineId === m.id);
    if (mBookings.length === 0 && mLocks.length === 0) continue;

    const slotSet = new Set<string>();
    mBookings.forEach((b) => slotSet.add(b.timeSlot));
    mLocks.forEach((l) => slotSet.add(l.timeSlot));
    const slots = Array.from(slotSet).sort();

    const lines: string[] = [`**${machineName(m.id)}**`];
    for (const slot of slots) {
      const lock = mLocks.find((l) => l.timeSlot === slot);
      if (lock) {
        lines.push(`> \`${slot}\` 🔒 ${lock.reason || 'locked'}`);
        continue;
      }
      const players = mBookings.filter((b) => b.timeSlot === slot);
      const names = players.map((p) => p.username).join(', ');
      const remaining = MAX_PLAYERS - players.length;
      lines.push(`> \`${slot}\` ${names} (${remaining} left)`);
    }
    sections.push(lines.join('\n'));
  }

  for (const wId of [WAITLIST_RIICHI, WAITLIST_GUOMA]) {
    const wBookings = bookings.filter((b) => b.machineId === wId);
    if (wBookings.length === 0) continue;

    const slotSet = new Set<string>();
    wBookings.forEach((b) => slotSet.add(b.timeSlot));
    const slots = Array.from(slotSet).sort();

    const lines: string[] = [`**${machineName(wId)}**`];
    for (const slot of slots) {
      const names = wBookings.filter((b) => b.timeSlot === slot).map((b) => b.username).join(', ');
      lines.push(`> \`${slot}\` ${names}`);
    }
    sections.push(lines.join('\n'));
  }

  return sections.join('\n\n');
}

async function sendWeCom(title: string, summary: string, date: string) {
  if (!WECOM_WEBHOOK) {
    return;
  }
  try {
    const schedule = await buildScheduleMarkdown(date);
    const content = `## ${title}\n${summary}\n\n📋 **${date}**\n${schedule}\n\n[eastwindriichi.com/rsvp](https://eastwindriichi.com/rsvp/)`;

    const res = await fetch(WECOM_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'markdown',
        markdown: { content },
      }),
    });
    if (!res.ok) console.error('[notifier] WeCom failed:', res.status, await res.text());
  } catch (err) {
    console.error('[notifier] WeCom error:', err);
  }
}

interface BookingPartyMeta {
  primary: string;
  companions: string[];
  comment?: string;
}

export async function notifyBookingCreated(
  bookings: { username: string; date: string; timeSlot: string; machineId: number; comment?: string }[],
  party?: BookingPartyMeta,
) {
  if (bookings.length === 0) return;

  // When a party is provided, collapse all companion rows into the primary's line.
  const companionSet = new Set((party?.companions || []).map((n) => n.toLowerCase()));
  const primaryName = party?.primary;
  const filtered = primaryName
    ? bookings.filter((b) => !companionSet.has(b.username.toLowerCase()))
    : bookings;

  const key = (b: typeof bookings[0]) => `${b.username}|${b.machineId}|${b.date}`;
  const groups = new Map<string, typeof bookings>();
  for (const b of filtered) {
    const k = key(b);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(b);
  }

  const lines: string[] = [];
  const dates = new Set<string>();
  for (const [, group] of groups) {
    const b = group[0];
    dates.add(b.date);
    const timeRange = groupTimeSlots(group.map((g) => g.timeSlot));
    let header = `**${b.username}**`;
    if (party && b.username === primaryName && party.companions.length > 0) {
      header += ` +${party.companions.length} (${party.companions.join(', ')})`;
    }
    let line = `${header} — ${timeRange} — ${machineName(b.machineId)}`;
    const noteText = party?.comment || b.comment;
    if (noteText) line += `\n💬 ${noteText}`;
    const seats = await getSeatsRemaining(b.machineId, b.date, group.map((g) => g.timeSlot));
    if (seats) line += `\n→ ${seats}`;
    lines.push(line);
  }

  for (const date of dates) {
    const fields = await buildScheduleEmbed(date);
    await sendDiscord('', [{
      title: `✅ New Booking`,
      description: lines.join('\n\n'),
      color: 0x00cc00,
      fields,
      url: RSVP_URL,
      footer: { text: date },
    }]);
    await sendWeCom('✅ New Booking', lines.join('\n\n'), date);
  }
}

export async function notifyBookingCancelled(booking: { username: string; date: string; timeSlot: string; machineId: number }) {
  await notifyBookingsCancelled([booking], []);
}

interface CancelledLock {
  machineId: number;
  date: string;
  timeSlot: string;
  reason?: string;
  username?: string | null;
}

export async function notifyBookingsCancelled(
  bookings: { username: string; date: string; timeSlot: string; machineId: number }[],
  locks: CancelledLock[] = [],
) {
  if (bookings.length === 0 && locks.length === 0) return;

  // Group bookings by username|machineId|date so each line collapses contiguous slots
  const bookingKey = (b: typeof bookings[0]) => `${b.username}|${b.machineId}|${b.date}`;
  const bookingGroups = new Map<string, typeof bookings>();
  for (const b of bookings) {
    const k = bookingKey(b);
    if (!bookingGroups.has(k)) bookingGroups.set(k, []);
    bookingGroups.get(k)!.push(b);
  }

  // Group locks by machineId|date as well
  const lockKey = (l: CancelledLock) => `${l.machineId}|${l.date}`;
  const lockGroups = new Map<string, CancelledLock[]>();
  for (const l of locks) {
    const k = lockKey(l);
    if (!lockGroups.has(k)) lockGroups.set(k, []);
    lockGroups.get(k)!.push(l);
  }

  const lines: string[] = [];
  const dates = new Set<string>();

  for (const [, group] of bookingGroups) {
    const b = group[0];
    dates.add(b.date);
    const timeRange = groupTimeSlots(group.map((g) => g.timeSlot));
    let line = `**${b.username}** — ${timeRange} — ${machineName(b.machineId)}`;
    const seats = await getSeatsRemaining(b.machineId, b.date, group.map((g) => g.timeSlot));
    if (seats) line += `\n→ ${seats}`;
    lines.push(line);
  }

  for (const [, group] of lockGroups) {
    const l = group[0];
    dates.add(l.date);
    const timeRange = groupTimeSlots(group.map((g) => g.timeSlot));
    const who = l.username ? ` (${l.username})` : '';
    lines.push(`🔓 ${machineName(l.machineId)} — ${timeRange}${who}`);
  }

  const total = bookings.length + locks.length;
  const titleSuffix = total > 1 ? ` (${total})` : '';

  for (const date of dates) {
    const fields = await buildScheduleEmbed(date);
    await sendDiscord('', [{
      title: `❌ Cancelled${titleSuffix}`,
      url: RSVP_URL,
      description: lines.join('\n\n'),
      color: 0xcc0000,
      fields,
      footer: { text: date },
    }]);
    await sendWeCom(`❌ Cancelled${titleSuffix}`, lines.join('\n\n'), date);
  }
}

export async function notifyLockCreated(locks: { machineId: number; date: string; timeSlot: string; reason: string }[]) {
  if (locks.length === 0) return;

  const key = (l: typeof locks[0]) => `${l.machineId}|${l.date}`;
  const groups = new Map<string, typeof locks>();
  for (const l of locks) {
    const k = key(l);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(l);
  }

  const lines: string[] = [];
  const dates = new Set<string>();
  for (const [, group] of groups) {
    const l = group[0];
    dates.add(l.date);
    const timeRange = groupTimeSlots(group.map((g) => g.timeSlot));
    lines.push(`${machineName(l.machineId)} — ${timeRange}${l.reason ? ` — ${l.reason}` : ''}`);
  }

  for (const date of dates) {
    const fields = await buildScheduleEmbed(date);
    await sendDiscord('', [{
      title: `🔒 Locked`,
      description: lines.join('\n'),
      color: 0x888888,
      fields,
      url: RSVP_URL,
      footer: { text: date },
    }]);
    await sendWeCom('🔒 Locked', lines.join('\n'), date);
  }
}

export async function notifyLockRemoved(lock: { machineId: number; date: string; timeSlot: string }) {
  const timeRange = groupTimeSlots([lock.timeSlot]);
  const desc = `${machineName(lock.machineId)} — ${timeRange}`;
  const fields = await buildScheduleEmbed(lock.date);
  await sendDiscord('', [{
    title: `🔓 Unlocked`,
    url: RSVP_URL,
    description: desc,
    color: 0x4488ff,
    fields,
    footer: { text: lock.date },
  }]);
  await sendWeCom('🔓 Unlocked', desc, lock.date);
}
