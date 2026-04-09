import { useState } from 'react';
import { MACHINES, TIME_SLOTS, MAX_PLAYERS, WAITLIST_RIICHI, WAITLIST_GUOMA } from 'shared';
import type { Booking, Lock } from 'shared';
import { useI18n } from '../i18n';

interface Props {
  bookings: Booking[];
  locks: Lock[];
  mode: 'book' | 'cancel';
  onSelect: (machineId: number, timeSlots: string[]) => void;
  onCancelBookings: (bookingIds: number[], phone: string) => void;
}

export function MobileView({ bookings, locks, mode, onSelect, onCancelBookings }: Props) {
  const { t, machineDisplay } = useI18n();

  const COLUMNS = [
    ...MACHINES.map((m) => ({ id: m.id, label: machineDisplay(m.id) })),
    { id: WAITLIST_RIICHI, label: t('waitlistRiichi') },
    { id: WAITLIST_GUOMA, label: t('waitlistGuoma') },
  ];

  const [activeCol, setActiveCol] = useState(COLUMNS[0].id);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Cancel mode state
  const [cancelUsername, setCancelUsername] = useState('');
  const [cancelUsernameConfirmed, setCancelUsernameConfirmed] = useState(false);
  const [selectedBookingIds, setSelectedBookingIds] = useState<Set<number>>(new Set());
  const [cancelPhone, setCancelPhone] = useState('');

  const isWaitlist = activeCol === WAITLIST_RIICHI || activeCol === WAITLIST_GUOMA;

  const getBookings = (slot: string) =>
    bookings.filter((b) => b.machineId === activeCol && b.timeSlot === slot);

  const getLock = (slot: string) =>
    locks.find((l) => l.machineId === activeCol && l.timeSlot === slot);

  const isAvailable = (slot: string) => {
    if (isWaitlist) return true;
    if (getLock(slot)) return false;
    if (getBookings(slot).length >= MAX_PLAYERS) return false;
    return true;
  };

  // Book mode: toggle slot
  const toggleSlot = (slot: string) => {
    if (!isAvailable(slot)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slot)) next.delete(slot);
      else next.add(slot);
      return next;
    });
  };

  const handleBookConfirm = () => {
    if (selected.size > 0) {
      onSelect(activeCol, Array.from(selected).sort());
      setSelected(new Set());
    }
  };

  // Cancel mode: find user's bookings on active table
  const userBookings = cancelUsernameConfirmed
    ? bookings.filter(
        (b) =>
          b.machineId === activeCol &&
          b.username.toLowerCase() === cancelUsername.trim().toLowerCase()
      )
    : [];

  const userBookedSlots = new Set(userBookings.map((b) => b.timeSlot));

  const toggleCancelSlot = (slot: string) => {
    const booking = userBookings.find((b) => b.timeSlot === slot);
    if (!booking) return;
    setSelectedBookingIds((prev) => {
      const next = new Set(prev);
      if (next.has(booking.id)) next.delete(booking.id);
      else next.add(booking.id);
      return next;
    });
  };

  const handleCancelConfirm = () => {
    if (selectedBookingIds.size > 0) {
      onCancelBookings(Array.from(selectedBookingIds), cancelPhone.trim());
    }
  };

  const handleConfirmUsername = () => {
    if (cancelUsername.trim()) {
      setCancelUsernameConfirmed(true);
      setSelectedBookingIds(new Set());
    }
  };

  const switchTable = (colId: number) => {
    setActiveCol(colId);
    setSelected(new Set());
    setSelectedBookingIds(new Set());
  };

  return (
    <div className="mobile-view">
      {/* Cancel mode: username input */}
      {mode === 'cancel' && !cancelUsernameConfirmed && (
        <div className="mobile-cancel-input">
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

      {/* Show table tabs & slots after username confirmed (cancel) or always (book) */}
      {(mode === 'book' || cancelUsernameConfirmed) && (
        <>
          {mode === 'cancel' && (
            <div className="mobile-cancel-header">
              <span className="mobile-cancel-user">{cancelUsername}</span>
              <button
                className="mobile-change-user"
                onClick={() => {
                  setCancelUsernameConfirmed(false);
                  setSelectedBookingIds(new Set());
                }}
              >
                {t('cancel')}
              </button>
            </div>
          )}

          <div className="mobile-tabs">
            {COLUMNS.map((col) => {
              // In cancel mode, show count of user's bookings per table
              const colBookingCount = mode === 'cancel'
                ? bookings.filter(
                    (b) =>
                      b.machineId === col.id &&
                      b.username.toLowerCase() === cancelUsername.trim().toLowerCase()
                  ).length
                : 0;

              return (
                <button
                  key={col.id}
                  className={`mobile-tab ${activeCol === col.id ? 'active' : ''}`}
                  onClick={() => switchTable(col.id)}
                >
                  {col.label}
                  {colBookingCount > 0 && <span className="mobile-tab-badge">{colBookingCount}</span>}
                </button>
              );
            })}
          </div>

          {mode === 'cancel' && userBookings.length > 0 && (
            <p className="mobile-hint">{t('yourBookings')}</p>
          )}
          {mode === 'cancel' && cancelUsernameConfirmed && userBookings.length === 0 && (
            <p className="mobile-hint" style={{ color: '#c00' }}>{t('noBookingsForUser')}</p>
          )}
          {mode === 'book' && <p className="mobile-hint">{t('slideHint')}</p>}

          <div className="mobile-slots">
            {TIME_SLOTS.map((slot) => {
              const slotBookings = getBookings(slot);
              const lock = getLock(slot);
              const avail = isAvailable(slot);

              // Cancel mode highlighting
              const isUserSlot = mode === 'cancel' && userBookedSlots.has(slot);
              const userBooking = userBookings.find((b) => b.timeSlot === slot);
              const isCancelSelected = userBooking ? selectedBookingIds.has(userBooking.id) : false;

              // Book mode highlighting
              const isBookSelected = mode === 'book' && selected.has(slot);

              return (
                <div
                  key={slot}
                  data-slot={slot}
                  className={[
                    'mobile-slot',
                    lock ? 'locked' : '',
                    isBookSelected ? 'selected' : '',
                    isCancelSelected ? 'cancel-selected' : '',
                    isUserSlot && !isCancelSelected ? 'user-booked' : '',
                    !avail && !lock && mode === 'book' ? 'full' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => {
                    if (mode === 'book') toggleSlot(slot);
                    else if (mode === 'cancel') toggleCancelSlot(slot);
                  }}
                >
                  <div className="mobile-slot-time">{slot}</div>
                  <div className="mobile-slot-players">
                    {lock ? (
                      <span className="mobile-lock">{lock.reason || t('locked')}</span>
                    ) : isWaitlist ? (
                      slotBookings.map((b) => (
                        <span
                          key={b.id}
                          className={`mobile-player-tag ${mode === 'cancel' && b.username.toLowerCase() === cancelUsername.trim().toLowerCase() ? 'user-highlight' : ''}`}
                        >
                          {b.username}
                        </span>
                      ))
                    ) : (
                      [0, 1, 2, 3].map((i) => {
                        const p = slotBookings[i];
                        const isUser = p && mode === 'cancel' && p.username.toLowerCase() === cancelUsername.trim().toLowerCase();
                        return (
                          <span
                            key={i}
                            className={`mobile-seat ${p ? 'filled' : 'empty'} ${isUser ? 'user-highlight' : ''}`}
                          >
                            {p?.username ?? ''}
                          </span>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Cancel mode: phone + confirm */}
          {mode === 'cancel' && selectedBookingIds.size > 0 && (
            <div className="mobile-confirm-bar cancel-bar">
              <input
                className="cancel-phone-input"
                value={cancelPhone}
                onChange={(e) => setCancelPhone(e.target.value)}
                placeholder={t('phoneCancelPh')}
              />
              <button className="danger mobile-confirm-btn" onClick={handleCancelConfirm}>
                {t('mobileCancelConfirm')} ({selectedBookingIds.size})
              </button>
            </div>
          )}

          {/* Book mode: confirm */}
          {mode === 'book' && selected.size > 0 && (
            <div className="mobile-confirm-bar">
              <button className="primary mobile-confirm-btn" onClick={handleBookConfirm}>
                {t('mobileConfirm')} ({selected.size}{t('slots')})
              </button>
              <button className="mobile-clear-btn" onClick={() => setSelected(new Set())}>{t('cancel')}</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
