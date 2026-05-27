import { Fragment, useState, useCallback, useRef } from 'react';
import { TIME_SLOTS, MAX_PLAYERS, RIICHI_MACHINE_IDS, AUTO_RIICHI } from 'shared';
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

export function RiichiGrid({
  bookings, locks, primaryDate, mode, onSelect,
  cancelUsername, cancelConfirmed,
  selectedBookingIds, selectedLockIds, onToggleCancel,
}: Props) {
  const { t, machineDisplay } = useI18n();

  const [dragCol, setDragCol] = useState<number | null>(null);
  const [dragKeys, setDragKeys] = useState<Set<string>>(new Set());
  const [dragSlots, setDragSlots] = useState<SlotRef[]>([]);
  const isDragging = useRef(false);

  const rows = buildOvernightRows(primaryDate, TIME_SLOTS);

  const getLock = (machineId: number, date: string, timeSlot: string) =>
    locks.find((l) => l.machineId === machineId && l.timeSlot === timeSlot && l.date === date);

  const individualRiichiBookings = (date: string, timeSlot: string) =>
    bookings.filter((b) =>
      b.date === date && b.timeSlot === timeSlot &&
      (b.machineId === AUTO_RIICHI || RIICHI_MACHINE_IDS.includes(b.machineId)),
    );

  // Walk-in stats per slot. Booked count is the displayed numerator (no upper bound — overflow → queue).
  // Effective capacity drops by 4 for each locked riichi table.
  const autoStats = (date: string, timeSlot: string) => {
    const total = RIICHI_MACHINE_IDS.length * MAX_PLAYERS;
    const locked = RIICHI_MACHINE_IDS.filter((id) => getLock(id, date, timeSlot)).length;
    const booked = individualRiichiBookings(date, timeSlot).length;
    const effectiveCap = total - locked * MAX_PLAYERS;
    const remaining = Math.max(0, effectiveCap - booked);
    return { total, booked, locked, effectiveCap, remaining, queueing: booked >= effectiveCap };
  };

  const isMachineCellAvailable = (machineId: number, date: string, timeSlot: string) => {
    if (getLock(machineId, date, timeSlot)) return false;
    return bookings.filter((b) => b.machineId === machineId && b.date === date && b.timeSlot === timeSlot).length === 0;
  };

  // 随便 cell is ALWAYS clickable — overflow allowed (user gets queue warning in modal)
  const isAvailable = (machineId: number, slot: SlotRef) =>
    machineId === AUTO_RIICHI ? true
                              : isMachineCellAvailable(machineId, slot.date, slot.timeSlot);

  const handleMouseDown = useCallback((colId: number, slot: SlotRef) => {
    if (mode !== 'book') return;
    if (!isAvailable(colId, slot)) return;
    isDragging.current = true;
    setDragCol(colId);
    setDragKeys(new Set([slotKey(slot)]));
    setDragSlots([slot]);
  }, [bookings, locks, mode]);

  const handleMouseEnter = useCallback((colId: number, slot: SlotRef) => {
    if (mode !== 'book') return;
    if (!isDragging.current || dragCol !== colId) return;
    if (!isAvailable(colId, slot)) return;
    const k = slotKey(slot);
    setDragKeys((prev) => {
      if (prev.has(k)) return prev;
      const next = new Set(prev);
      next.add(k);
      return next;
    });
    setDragSlots((prev) => prev.find((s) => slotKey(s) === k) ? prev : [...prev, slot]);
  }, [dragCol, bookings, locks, mode]);

  const handleMouseUp = useCallback(() => {
    if (mode !== 'book') return;
    if (isDragging.current && dragCol !== null && dragSlots.length > 0) {
      const sorted = [...dragSlots].sort((a, b) =>
        a.date === b.date ? a.timeSlot.localeCompare(b.timeSlot) : a.date.localeCompare(b.date)
      );
      onSelect(dragCol, sorted);
    }
    isDragging.current = false;
    setDragCol(null);
    setDragKeys(new Set());
    setDragSlots([]);
  }, [dragCol, dragSlots, onSelect, mode]);

  const sel = (colId: number, slot: SlotRef) => dragCol === colId && dragKeys.has(slotKey(slot));

  const userLower = () => cancelUsername.trim().toLowerCase();
  const matchUser = (b: Booking) => cancelConfirmed && b.username.toLowerCase() === userLower();
  const matchUserLock = (l: Lock) => cancelConfirmed && !!l.username && l.username.toLowerCase() === userLower();

  // Insert visual divider before the first overnight row
  const firstOvernightIdx = rows.findIndex((r) => r.isOvernight);

  return (
    <div
      className="grid-wrap"
      onMouseUp={handleMouseUp}
      onMouseLeave={() => { if (isDragging.current) handleMouseUp(); }}
      style={{ userSelect: 'none' }}
    >
      <table className="booking-table riichi-table">
        <thead>
          <tr>
            <th className="th-time">{t('time')}</th>
            {RIICHI_MACHINE_IDS.map((id) => (
              <th key={id} className="th-machine th-machine-package">
                <div className="th-machine-name">{machineDisplay(id)}</div>
                <div className="th-machine-sub">{t('bookEntireTable')}</div>
              </th>
            ))}
            <th className="th-auto" title={t('autoRiichiTip')}>
              <div className="th-auto-name">{t('autoRiichi')}</div>
              <div className="th-auto-sub">{t('sectionRiichiHint')}</div>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const showDivider = idx === firstOvernightIdx && firstOvernightIdx > 0;
            const slot: SlotRef = { date: row.date, timeSlot: row.timeSlot };
            const individuals = individualRiichiBookings(row.date, row.timeSlot);
            const stats = autoStats(row.date, row.timeSlot);
            const autoSelected = sel(AUTO_RIICHI, slot);
            const colSpan = 2 + RIICHI_MACHINE_IDS.length; // time + N + auto

            return (
              <Fragment key={`${row.date}|${row.timeSlot}`}>
                {showDivider && (
                  <tr className="overnight-divider-row">
                    <td colSpan={colSpan}>
                      <div className="overnight-divider">
                        <span className="overnight-divider-label">{t('overnightDivider')}</span>
                        <span className="overnight-divider-date">{row.date}</span>
                      </div>
                    </td>
                  </tr>
                )}
                <tr className={row.isOvernight ? 'overnight-row' : ''}>
                  <td className="td-time">{row.timeSlot}</td>

                  {RIICHI_MACHINE_IDS.map((m) => {
                    const lock = getLock(m, row.date, row.timeSlot);
                    const cellSel = sel(m, slot);
                    const isUserLock = lock && matchUserLock(lock);
                    const isLockSelected = lock ? selectedLockIds.has(lock.id) : false;
                    const open = isMachineCellAvailable(m, row.date, row.timeSlot);

                    let cls = 'td-package';
                    if (lock) cls += ' locked';
                    if (cellSel) cls += ' selected';
                    if (!open && !lock) cls += ' partial';
                    if (isUserLock && !isLockSelected) cls += ' user-highlight-cell';
                    if (isUserLock && isLockSelected) cls += ' cancel-selected-cell';

                    const clickable = mode === 'cancel' ? isUserLock : open;
                    const cellTitle = lock ? `${lock.username || lock.reason || ''}` : t('available');

                    return (
                      <td
                        key={`${m}-${row.date}-${row.timeSlot}`}
                        className={cls}
                        title={cellTitle}
                        onMouseDown={(e) => { e.preventDefault(); handleMouseDown(m, slot); }}
                        onMouseEnter={() => handleMouseEnter(m, slot)}
                        onClick={() => mode === 'cancel' && onToggleCancel(m, slot)}
                        style={mode === 'cancel' ? { cursor: clickable ? 'pointer' : 'default' } : undefined}
                      >
                        {lock ? (
                          <span className="package-state package-state-locked">
                            🔒 {lock.username || lock.reason || ''}
                          </span>
                        ) : !open ? (
                          <span className="package-state package-state-partial">{t('guomaTablePartial')}</span>
                        ) : (
                          <span className="package-state package-state-open">·</span>
                        )}
                      </td>
                    );
                  })}

                  <td
                    className={[
                      'td-auto-list',
                      autoSelected ? 'selected' : '',
                      stats.queueing ? 'queueing' : '',
                      !stats.queueing && stats.remaining > 0 && stats.remaining <= 2 ? 'low' : '',
                    ].filter(Boolean).join(' ')}
                    onMouseDown={(e) => { e.preventDefault(); handleMouseDown(AUTO_RIICHI, slot); }}
                    onMouseEnter={() => handleMouseEnter(AUTO_RIICHI, slot)}
                    onClick={() => {
                      if (mode !== 'cancel') return;
                      const own = individuals.find((b) => matchUser(b));
                      if (own) onToggleCancel(own.machineId, slot);
                    }}
                    style={mode === 'cancel' ? { cursor: individuals.some(matchUser) ? 'pointer' : 'default' } : undefined}
                    title={stats.queueing ? t('queueWarning') : t('autoRiichiTip')}
                  >
                    <div className="auto-list-row">
                      <span className={`auto-list-count ${stats.queueing ? 'queue' : stats.remaining <= 2 ? 'low' : ''}`}>
                        <span className="auto-list-count-num">{stats.booked}</span>
                        <span className="auto-list-count-suffix">/{stats.total}</span>
                      </span>
                      {stats.queueing && (
                        <span className="auto-queue-badge" title={t('queueWarning')}>{t('queueShort')}</span>
                      )}
                      <div className="auto-list-names">
                        {individuals.length === 0 ? (
                          <span className="auto-list-empty">·</span>
                        ) : individuals.map((b) => {
                          const isUser = matchUser(b);
                          const isCancelSelected = isUser && selectedBookingIds.has(b.id);
                          return (
                            <span
                              key={b.id}
                              className={[
                                'auto-list-name',
                                isUser && !isCancelSelected ? 'is-user' : '',
                                isCancelSelected ? 'is-cancel-selected' : '',
                              ].filter(Boolean).join(' ')}
                              title={b.comment ? `${b.username}: ${b.comment}` : b.username}
                            >
                              {b.username}
                              {b.comment && <span className="comment-dot" aria-hidden>•</span>}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
