import { Fragment, useState, useCallback, useRef } from 'react';
import { TIME_SLOTS, GUOMA_MACHINE_IDS } from 'shared';
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
  selectedLockIds: Set<number>;
  onToggleCancel: (machineId: number, slot: SlotRef) => void;
}

const slotKey = (s: SlotRef) => `${s.date}|${s.timeSlot}`;

export function GuomaGrid({
  bookings, locks, primaryDate, mode, onSelect,
  cancelUsername, cancelConfirmed,
  selectedLockIds, onToggleCancel,
}: Props) {
  const { t, machineDisplay } = useI18n();

  const [dragCol, setDragCol] = useState<number | null>(null);
  const [dragKeys, setDragKeys] = useState<Set<string>>(new Set());
  const [dragSlots, setDragSlots] = useState<SlotRef[]>([]);
  const isDragging = useRef(false);

  const rows = buildOvernightRows(primaryDate, TIME_SLOTS);

  const getBookingsFor = (machineId: number, date: string, timeSlot: string) =>
    bookings.filter((b) => b.machineId === machineId && b.date === date && b.timeSlot === timeSlot);
  const getLock = (machineId: number, date: string, timeSlot: string) =>
    locks.find((l) => l.machineId === machineId && l.date === date && l.timeSlot === timeSlot);

  const isAvailable = (machineId: number, slot: SlotRef) => {
    if (getLock(machineId, slot.date, slot.timeSlot)) return false;
    return getBookingsFor(machineId, slot.date, slot.timeSlot).length === 0;
  };

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
  const matchUserLock = (l: Lock) =>
    cancelConfirmed && !!l.username && l.username.toLowerCase() === userLower();

  const firstOvernightIdx = rows.findIndex((r) => r.isOvernight);

  return (
    <div
      className="grid-wrap"
      onMouseUp={handleMouseUp}
      onMouseLeave={() => { if (isDragging.current) handleMouseUp(); }}
      style={{ userSelect: 'none' }}
    >
      <table className="booking-table guoma-table">
        <thead>
          <tr>
            <th className="th-time">{t('time')}</th>
            {GUOMA_MACHINE_IDS.map((id) => (
              <th key={id} className="th-machine th-machine-wide">{machineDisplay(id)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const showDivider = idx === firstOvernightIdx && firstOvernightIdx > 0;
            const slot: SlotRef = { date: row.date, timeSlot: row.timeSlot };
            const colSpan = 1 + GUOMA_MACHINE_IDS.length;
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
                  {GUOMA_MACHINE_IDS.map((m) => {
                    const lock = getLock(m, row.date, row.timeSlot);
                    const partial = getBookingsFor(m, row.date, row.timeSlot).length > 0;
                    const selected = sel(m, slot);
                    const isUserLock = lock && matchUserLock(lock);
                    const isLockSelected = lock ? selectedLockIds.has(lock.id) : false;

                    let cls = 'td-guoma';
                    if (lock) cls += ' locked';
                    if (partial) cls += ' partial';
                    if (selected) cls += ' selected';
                    if (isUserLock && !isLockSelected) cls += ' user-highlight-cell';
                    if (isUserLock && isLockSelected) cls += ' cancel-selected-cell';

                    const clickable = mode === 'cancel' && isUserLock;
                    const cellTitle = lock
                      ? `${lock.username || ''} ${lock.reason || ''}`.trim()
                      : partial ? t('guomaTablePartial') : t('available');

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
                          <span className="guoma-state guoma-state-locked">
                            🔒 {lock.username || lock.reason || t('guomaTableTaken')}
                          </span>
                        ) : partial ? (
                          <span className="guoma-state guoma-state-partial">{t('guomaTablePartial')}</span>
                        ) : (
                          <span className="guoma-state guoma-state-open">·</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
