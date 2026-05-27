import { useState } from 'react';
import {
  TIME_SLOTS, MAX_PLAYERS,
  RIICHI_MACHINE_IDS, GUOMA_MACHINE_IDS,
  AUTO_RIICHI, isGuomaMachine,
} from 'shared';
import type { Booking, Lock } from 'shared';
import { useI18n } from '../i18n';
import { buildOvernightRows, type SlotRef } from '../utils';

interface Props {
  bookings: Booking[];
  locks: Lock[];
  primaryDate: string;
  mode: 'book' | 'cancel';
  onSelect: (machineId: number, slots: SlotRef[]) => void;
  cancelUsername: string;
  cancelConfirmed: boolean;
  selectedBookingIds: Set<number>;
  selectedLockIds: Set<number>;
  onToggleCancel: (machineId: number, slot: SlotRef) => void;
}

const slotKey = (s: SlotRef) => `${s.date}|${s.timeSlot}`;

export function MobileView({
  bookings, locks, primaryDate, mode, onSelect,
  cancelUsername, cancelConfirmed,
  selectedBookingIds, selectedLockIds, onToggleCancel,
}: Props) {
  const { t, machineDisplay } = useI18n();

  const RIICHI_COLUMNS = [
    ...RIICHI_MACHINE_IDS.map((id) => ({ id, label: machineDisplay(id), kind: 'riichi' as const })),
    { id: AUTO_RIICHI, label: t('autoRiichi'), kind: 'auto' as const },
  ];
  const GUOMA_COLUMNS = GUOMA_MACHINE_IDS.map((id) => ({ id, label: machineDisplay(id), kind: 'guoma' as const }));
  const ALL_COLUMNS = [...RIICHI_COLUMNS, ...GUOMA_COLUMNS];

  const [activeCol, setActiveCol] = useState(ALL_COLUMNS[0].id);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [selectedSlots, setSelectedSlots] = useState<SlotRef[]>([]);

  const rows = buildOvernightRows(primaryDate, TIME_SLOTS);
  const firstOvernightIdx = rows.findIndex((r) => r.isOvernight);

  const activeKind: 'riichi-package' | 'auto' | 'guoma' =
    activeCol === AUTO_RIICHI ? 'auto'
    : isGuomaMachine(activeCol) ? 'guoma'
    : 'riichi-package';

  const getLock = (date: string, timeSlot: string) =>
    locks.find((l) => l.machineId === activeCol && l.date === date && l.timeSlot === timeSlot);

  const individualRiichiBookings = (date: string, timeSlot: string) =>
    bookings.filter((b) =>
      b.date === date && b.timeSlot === timeSlot &&
      (b.machineId === AUTO_RIICHI || RIICHI_MACHINE_IDS.includes(b.machineId)),
    );

  const autoStats = (date: string, timeSlot: string) => {
    const total = RIICHI_MACHINE_IDS.length * MAX_PLAYERS;
    const locked = RIICHI_MACHINE_IDS.filter((id) =>
      locks.find((l) => l.machineId === id && l.date === date && l.timeSlot === timeSlot),
    ).length;
    const booked = individualRiichiBookings(date, timeSlot).length;
    const effectiveCap = total - locked * MAX_PLAYERS;
    const remaining = Math.max(0, effectiveCap - booked);
    return { total, booked, locked, effectiveCap, remaining, queueing: booked >= effectiveCap };
  };

  const packageAvailableAt = (date: string, timeSlot: string) => {
    if (locks.find((l) => l.machineId === activeCol && l.date === date && l.timeSlot === timeSlot)) return false;
    return bookings.filter((b) => b.machineId === activeCol && b.date === date && b.timeSlot === timeSlot).length === 0;
  };

  // Walk-in tab is always clickable (overflow → queue); other tabs use availability check.
  const isAvailable = (slot: SlotRef) => {
    if (activeKind === 'auto') return true;
    return packageAvailableAt(slot.date, slot.timeSlot);
  };

  const toggleSlot = (slot: SlotRef) => {
    if (!isAvailable(slot)) return;
    const k = slotKey(slot);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
    setSelectedSlots((prev) => {
      const exists = prev.find((s) => slotKey(s) === k);
      if (exists) return prev.filter((s) => slotKey(s) !== k);
      return [...prev, slot];
    });
  };

  const handleBookConfirm = () => {
    if (selectedSlots.length > 0) {
      const sorted = [...selectedSlots].sort((a, b) =>
        a.date === b.date ? a.timeSlot.localeCompare(b.timeSlot) : a.date.localeCompare(b.date)
      );
      onSelect(activeCol, sorted);
      setSelectedKeys(new Set());
      setSelectedSlots([]);
    }
  };

  const userLower = () => cancelUsername.trim().toLowerCase();

  const userBookings = cancelConfirmed
    ? activeKind === 'auto'
      ? bookings.filter((b) =>
          (b.machineId === AUTO_RIICHI || RIICHI_MACHINE_IDS.includes(b.machineId)) &&
          b.username.toLowerCase() === userLower(),
        )
      : bookings.filter((b) => b.machineId === activeCol && b.username.toLowerCase() === userLower())
    : [];
  const userLocks = cancelConfirmed
    ? activeKind === 'auto'
      ? []
      : locks.filter((l) => l.machineId === activeCol && l.username && l.username.toLowerCase() === userLower())
    : [];
  const userBookedKeys = new Set([
    ...userBookings.map((b) => `${b.date}|${b.timeSlot}`),
    ...userLocks.map((l) => `${l.date}|${l.timeSlot}`),
  ]);

  const switchTable = (colId: number) => {
    setActiveCol(colId);
    setSelectedKeys(new Set());
    setSelectedSlots([]);
  };

  return (
    <div className="mobile-view">
      <div className="mobile-section-label">{t('sectionRiichi')}</div>
      <div className="mobile-tabs">
        {RIICHI_COLUMNS.map((col) => {
          const colCount = mode === 'cancel'
            ? col.kind === 'auto'
              ? bookings.filter((b) =>
                  (b.machineId === AUTO_RIICHI || RIICHI_MACHINE_IDS.includes(b.machineId)) &&
                  b.username.toLowerCase() === userLower(),
                ).length
              : locks.filter((l) => l.machineId === col.id && l.username && l.username.toLowerCase() === userLower()).length
            : 0;
          return (
            <button
              key={col.id}
              className={`mobile-tab ${activeCol === col.id ? 'active' : ''} ${col.kind === 'auto' ? 'mobile-tab-auto' : ''}`}
              onClick={() => switchTable(col.id)}
            >
              {col.label}
              {colCount > 0 && <span className="mobile-tab-badge">{colCount}</span>}
            </button>
          );
        })}
      </div>

      <div className="mobile-section-label">{t('sectionGuoma')}</div>
      <div className="mobile-tabs">
        {GUOMA_COLUMNS.map((col) => {
          const colCount = mode === 'cancel'
            ? locks.filter((l) => l.machineId === col.id && l.username && l.username.toLowerCase() === userLower()).length
            : 0;
          return (
            <button
              key={col.id}
              className={`mobile-tab ${activeCol === col.id ? 'active' : ''}`}
              onClick={() => switchTable(col.id)}
            >
              {col.label}
              {colCount > 0 && <span className="mobile-tab-badge">{colCount}</span>}
            </button>
          );
        })}
      </div>

      {mode === 'cancel' && cancelConfirmed && userBookings.length === 0 && userLocks.length === 0 && (
        <p className="mobile-hint" style={{ color: 'var(--c-red)' }}>{t('noBookingsForUser')}</p>
      )}
      {mode === 'cancel' && cancelConfirmed && (userBookings.length > 0 || userLocks.length > 0) && (
        <p className="mobile-hint">{t('yourBookings')}</p>
      )}
      {mode === 'book' && activeKind === 'auto' && (
        <p className="mobile-hint">{t('autoRiichiTip')}</p>
      )}
      {mode === 'book' && activeKind === 'guoma' && (
        <p className="mobile-hint">{t('guomaPackageOnly')}</p>
      )}
      {mode === 'book' && activeKind === 'riichi-package' && (
        <p className="mobile-hint">{t('bookEntireTableHint')}</p>
      )}

      <div className="mobile-slots">
        {rows.map((row, idx) => {
          const showDivider = idx === firstOvernightIdx && firstOvernightIdx > 0;
          const slot: SlotRef = { date: row.date, timeSlot: row.timeSlot };
          const lock = getLock(row.date, row.timeSlot);
          const avail = isAvailable(slot);

          const isUserSlot = mode === 'cancel' && userBookedKeys.has(slotKey(slot));
          const userBooking = userBookings.find((b) => b.date === row.date && b.timeSlot === row.timeSlot);
          const userLock = userLocks.find((l) => l.date === row.date && l.timeSlot === row.timeSlot);
          const isCancelSelected =
            (userBooking && selectedBookingIds.has(userBooking.id)) ||
            (userLock && selectedLockIds.has(userLock.id));

          const isBookSelected = mode === 'book' && selectedKeys.has(slotKey(slot));

          const handleClick = () => {
            if (mode === 'book') {
              toggleSlot(slot);
              return;
            }
            if (activeKind === 'auto' && userBooking) {
              onToggleCancel(userBooking.machineId, slot);
              return;
            }
            onToggleCancel(activeCol, slot);
          };

          const slotEl = (
            <div
              key={slotKey(slot)}
              data-slot={row.timeSlot}
              className={[
                'mobile-slot',
                row.isOvernight ? 'overnight' : '',
                lock && !userLock && activeKind !== 'auto' ? 'locked' : '',
                isBookSelected ? 'selected' : '',
                isCancelSelected ? 'cancel-selected' : '',
                isUserSlot && !isCancelSelected ? 'user-booked' : '',
                !avail && !lock && mode === 'book' ? 'full' : '',
              ].filter(Boolean).join(' ')}
              onClick={handleClick}
            >
              <div className="mobile-slot-time">{row.timeSlot}</div>
              <div className="mobile-slot-players">
                {activeKind === 'auto' ? (
                  (() => {
                    const stats = autoStats(row.date, row.timeSlot);
                    const indiv = individualRiichiBookings(row.date, row.timeSlot);
                    return (
                      <div className="mobile-auto-row">
                        <span className={`auto-list-count ${stats.queueing ? 'queue' : stats.remaining <= 2 ? 'low' : ''}`}>
                          <span className="auto-list-count-num">{stats.booked}</span>
                          <span className="auto-list-count-suffix">/{stats.total}</span>
                        </span>
                        {stats.queueing && <span className="auto-queue-badge">{t('queueShort')}</span>}
                        <div className="auto-list-names mobile-auto-names">
                          {indiv.length === 0 ? (
                            <span className="auto-list-empty">·</span>
                          ) : indiv.map((b) => {
                            const isUser = mode === 'cancel' && b.username.toLowerCase() === userLower();
                            const sel = isUser && selectedBookingIds.has(b.id);
                            return (
                              <span
                                key={b.id}
                                className={`auto-list-name ${isUser && !sel ? 'is-user' : ''} ${sel ? 'is-cancel-selected' : ''}`}
                                title={b.comment ? `${b.username}: ${b.comment}` : b.username}
                              >
                                {b.username}
                                {b.comment && <span className="comment-dot" aria-hidden>•</span>}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  lock ? (
                    <span className="mobile-lock">🔒 {lock.username || lock.reason || t('guomaTableTaken')}</span>
                  ) : !avail ? (
                    <span className="mobile-lock">{t('guomaTablePartial')}</span>
                  ) : (
                    <span className="mobile-auto-state">·</span>
                  )
                )}
              </div>
            </div>
          );

          if (showDivider) {
            return (
              <div key={`group-${row.date}`}>
                <div className="overnight-divider mobile-overnight-divider">
                  <span className="overnight-divider-label">{t('overnightDivider')}</span>
                  <span className="overnight-divider-date">{row.date}</span>
                </div>
                {slotEl}
              </div>
            );
          }
          return slotEl;
        })}
      </div>

      {mode === 'book' && selectedSlots.length > 0 && (
        <div className="mobile-confirm-bar">
          <button className="primary mobile-confirm-btn" onClick={handleBookConfirm}>
            {t('mobileConfirm')} ({selectedSlots.length}{t('slots')})
          </button>
          <button className="mobile-clear-btn" onClick={() => { setSelectedKeys(new Set()); setSelectedSlots([]); }}>{t('cancel')}</button>
        </div>
      )}
    </div>
  );
}
