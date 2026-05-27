import { useState, useCallback, useRef } from 'react';
import { MACHINES, TIME_SLOTS, MAX_PLAYERS, WAITLIST_RIICHI, WAITLIST_GUOMA } from 'shared';
import type { Booking, Lock } from 'shared';
import { useI18n } from '../i18n';

interface Props {
  bookings: Booking[];
  locks: Lock[];
  mode: 'book' | 'cancel';
  onSelect: (machineId: number, timeSlots: string[]) => void;
  onCancelBookings: (bookingIds: number[], lockIds: number[], phone: string) => void;
}

export function BookingGrid({ bookings, locks, mode, onSelect, onCancelBookings }: Props) {
  const { t, machineDisplay } = useI18n();

  // Book mode drag state
  const [dragCol, setDragCol] = useState<number | null>(null);
  const [dragSlots, setDragSlots] = useState<Set<string>>(new Set());
  const isDragging = useRef(false);

  // Cancel mode state
  const [cancelUsername, setCancelUsername] = useState('');
  const [cancelConfirmed, setCancelConfirmed] = useState(false);
  const [selectedBookingIds, setSelectedBookingIds] = useState<Set<number>>(new Set());
  const [selectedLockIds, setSelectedLockIds] = useState<Set<number>>(new Set());
  const [cancelPhone, setCancelPhone] = useState('');

  const getBookingsFor = (machineId: number, timeSlot: string) =>
    bookings.filter((b) => b.machineId === machineId && b.timeSlot === timeSlot);

  const getLock = (machineId: number, timeSlot: string) =>
    locks.find((l) => l.machineId === machineId && l.timeSlot === timeSlot);

  const isAvailable = (machineId: number, timeSlot: string) => {
    if (machineId === WAITLIST_RIICHI || machineId === WAITLIST_GUOMA) return true;
    if (getLock(machineId, timeSlot)) return false;
    if (getBookingsFor(machineId, timeSlot).length >= MAX_PLAYERS) return false;
    return true;
  };

  // Book mode handlers
  const handleMouseDown = useCallback((colId: number, timeSlot: string) => {
    if (mode !== 'book') return;
    if (!isAvailable(colId, timeSlot)) return;
    isDragging.current = true;
    setDragCol(colId);
    setDragSlots(new Set([timeSlot]));
  }, [bookings, locks, mode]);

  const handleMouseEnter = useCallback((colId: number, timeSlot: string) => {
    if (mode !== 'book') return;
    if (!isDragging.current || dragCol !== colId) return;
    if (!isAvailable(colId, timeSlot)) return;
    setDragSlots((prev) => new Set(prev).add(timeSlot));
  }, [dragCol, bookings, locks, mode]);

  const handleMouseUp = useCallback(() => {
    if (mode !== 'book') return;
    if (isDragging.current && dragCol !== null && dragSlots.size > 0) {
      onSelect(dragCol, Array.from(dragSlots).sort());
    }
    isDragging.current = false;
    setDragCol(null);
    setDragSlots(new Set());
  }, [dragCol, dragSlots, onSelect, mode]);

  const sel = (colId: number, slot: string) =>
    dragCol === colId && dragSlots.has(slot);

  // Cancel mode helpers
  const userLower = () => cancelUsername.trim().toLowerCase();
  const matchUser = (b: Booking) =>
    cancelConfirmed && b.username.toLowerCase() === userLower();
  const matchUserLock = (l: Lock) =>
    cancelConfirmed && !!l.username && l.username.toLowerCase() === userLower();

  const toggleCancelCell = (machineId: number, timeSlot: string) => {
    if (mode !== 'cancel' || !cancelConfirmed) return;

    // Check for user lock first (包桌)
    const userLock = locks.find(
      (l) => l.machineId === machineId && l.timeSlot === timeSlot && matchUserLock(l)
    );
    if (userLock) {
      setSelectedLockIds((prev) => {
        const next = new Set(prev);
        if (next.has(userLock.id)) next.delete(userLock.id);
        else next.add(userLock.id);
        return next;
      });
      return;
    }

    const booking = bookings.find(
      (b) => b.machineId === machineId && b.timeSlot === timeSlot && matchUser(b)
    );
    if (!booking) return;
    setSelectedBookingIds((prev) => {
      const next = new Set(prev);
      if (next.has(booking.id)) next.delete(booking.id);
      else next.add(booking.id);
      return next;
    });
  };

  const handleCellClick = (machineId: number, timeSlot: string) => {
    if (mode === 'cancel') {
      toggleCancelCell(machineId, timeSlot);
    }
  };

  const handleCancelConfirm = () => {
    if (selectedBookingIds.size > 0 || selectedLockIds.size > 0) {
      onCancelBookings(Array.from(selectedBookingIds), Array.from(selectedLockIds), cancelPhone.trim());
      setCancelUsername('');
      setCancelConfirmed(false);
      setSelectedBookingIds(new Set());
      setSelectedLockIds(new Set());
      setCancelPhone('');
    }
  };

  const handleConfirmUsername = () => {
    if (cancelUsername.trim()) {
      setCancelConfirmed(true);
      setSelectedBookingIds(new Set());
      setSelectedLockIds(new Set());
    }
  };

  return (
    <div>
      {/* Cancel mode: username input */}
      {mode === 'cancel' && !cancelConfirmed && (
        <div className="desktop-cancel-input">
          <p className="mobile-hint">{t('enterNameToCancel')}</p>
          <div className="mobile-cancel-row">
            <input
              value={cancelUsername}
              onChange={(e) => setCancelUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConfirmUsername()}
              placeholder={t('username')}
              autoFocus
            />
            <button className="primary" onClick={handleConfirmUsername} disabled={!cancelUsername.trim()}>
              {t('confirm')}
            </button>
          </div>
        </div>
      )}

      {mode === 'cancel' && cancelConfirmed && (
        <div className="desktop-cancel-header">
          <span>
            <strong>{cancelUsername}</strong> — {t('yourBookings')}
          </span>
          <button
            style={{ padding: '4px 12px', fontSize: 12 }}
            onClick={() => { setCancelConfirmed(false); setSelectedBookingIds(new Set()); }}
          >
            {t('cancel')}
          </button>
        </div>
      )}

      {(mode === 'book' || cancelConfirmed) && (
        <>
          {mode === 'book' && (
            <p style={{ fontSize: 13, color: '#888', marginBottom: 12 }}>{t('dragHint')}</p>
          )}

          <div
            className="grid-wrap"
            onMouseUp={handleMouseUp}
            onMouseLeave={() => { if (isDragging.current) handleMouseUp(); }}
            style={{ userSelect: 'none' }}
          >
            <table className="booking-table">
              <thead>
                <tr>
                  <th rowSpan={2} className="th-time">{t('time')}</th>
                  {MACHINES.map((m) => (
                    <th key={m.id} colSpan={4} className="th-machine">{machineDisplay(m.id)}</th>
                  ))}
                  <th className="th-waitlist">{t('waitlistRiichi')}</th>
                  <th className="th-waitlist">{t('waitlistGuoma')}</th>
                </tr>
                <tr>
                  {MACHINES.map((m) =>
                    [1, 2, 3, 4].map((s) => (
                      <th key={`s-${m.id}-${s}`} className="th-seat">{s}</th>
                    ))
                  )}
                  <th className="th-seat-waitlist"></th>
                  <th className="th-seat-waitlist"></th>
                </tr>
              </thead>
              <tbody>
                {TIME_SLOTS.map((slot) => (
                  <tr key={slot}>
                    <td className="td-time">{slot}</td>
                    {MACHINES.map((m) => {
                      const cb = getBookingsFor(m.id, slot);
                      const lock = getLock(m.id, slot);
                      const selected = sel(m.id, slot);
                      const hasUserBooking = cb.some(matchUser);
                      const userBooking = cb.find(matchUser);
                      const isCancelSelected = userBooking ? selectedBookingIds.has(userBooking.id) : false;
                      const isUserLock = lock && matchUserLock(lock);
                      const isLockSelected = lock ? selectedLockIds.has(lock.id) : false;
                      const cellClickable = mode === 'cancel' && (hasUserBooking || isUserLock);

                      return [0, 1, 2, 3].map((s) => {
                        const player = cb[s];
                        const isLast = s === 3;
                        const isUser = player && matchUser(player);
                        let cls = 'td-seat';
                        if (lock) cls += ' locked';
                        if (selected) cls += ' selected';
                        if (player) cls += ' filled';
                        if (isLast) cls += ' seat-border-right';
                        if (isUser && !isCancelSelected) cls += ' user-highlight-cell';
                        if (isCancelSelected && isUser) cls += ' cancel-selected-cell';
                        if (isUserLock && !isLockSelected) cls += ' user-highlight-cell';
                        if (isUserLock && isLockSelected) cls += ' cancel-selected-cell';

                        const cellTitle = player?.comment
                          ? `${player.username}: ${player.comment}`
                          : player?.username || undefined;
                        return (
                          <td
                            key={`${m.id}-${slot}-${s}`}
                            className={cls}
                            title={cellTitle}
                            onMouseDown={(e) => { e.preventDefault(); handleMouseDown(m.id, slot); }}
                            onMouseEnter={() => handleMouseEnter(m.id, slot)}
                            onClick={() => handleCellClick(m.id, slot)}
                            style={mode === 'cancel' ? { cursor: cellClickable ? 'pointer' : 'default' } : undefined}
                          >
                            {lock && s === 0 ? <span className="lock-label">{lock.reason || t('lock')}</span>
                              : player ? (
                                <span className="player-name">
                                  {player.username}
                                  {player.comment && <span className="comment-dot" aria-hidden>•</span>}
                                </span>
                              ) : null}
                          </td>
                        );
                      });
                    })}
                    {/* Waitlist columns */}
                    {[WAITLIST_RIICHI, WAITLIST_GUOMA].map((wId) => {
                      const wBookings = getBookingsFor(wId, slot);
                      const hasUserBooking = wBookings.some(matchUser);
                      const userBooking = wBookings.find(matchUser);
                      const isCancelSelected = userBooking ? selectedBookingIds.has(userBooking.id) : false;

                      return (
                        <td
                          key={`wl-${wId}-${slot}`}
                          className={`td-waitlist${sel(wId, slot) ? ' selected' : ''} ${isCancelSelected ? ' cancel-selected-cell' : ''}`}
                          onMouseDown={(e) => { e.preventDefault(); handleMouseDown(wId, slot); }}
                          onMouseEnter={() => handleMouseEnter(wId, slot)}
                          onClick={() => handleCellClick(wId, slot)}
                          style={mode === 'cancel' ? { cursor: hasUserBooking ? 'pointer' : 'default' } : undefined}
                        >
                          {wBookings.map((b) => (
                            <span
                              key={b.id}
                              className={`wl-name ${matchUser(b) ? (selectedBookingIds.has(b.id) ? 'wl-cancel-selected' : 'wl-user-highlight') : ''}`}
                              title={b.comment ? `${b.username}: ${b.comment}` : undefined}
                            >
                              {b.username}
                              {b.comment && <span className="comment-dot" aria-hidden>•</span>}
                            </span>
                          ))}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cancel confirm bar */}
          {mode === 'cancel' && (selectedBookingIds.size + selectedLockIds.size) > 0 && (
            <div className="desktop-cancel-bar">
              <input
                className="cancel-phone-input"
                value={cancelPhone}
                onChange={(e) => setCancelPhone(e.target.value)}
                placeholder={t('phoneCancelPh')}
              />
              <button className="danger" onClick={handleCancelConfirm}>
                {t('mobileCancelConfirm')} ({selectedBookingIds.size + selectedLockIds.size})
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
