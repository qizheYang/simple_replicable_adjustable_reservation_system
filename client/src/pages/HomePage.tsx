import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { Booking, Lock } from 'shared';
import { fetchBookings, batchCancel } from '../api';
import { RiichiGrid } from '../components/RiichiGrid';
import { GuomaGrid } from '../components/GuomaGrid';
import { MobileView } from '../components/MobileView';
import { BookingModal } from '../components/BookingModal';
import { DateStrip } from '../components/DateStrip';
import { LangSwitcher } from '../components/LangSwitcher';
import { useI18n } from '../i18n';
import { todayPST, nextDate, type SlotRef } from '../utils';

export function HomePage() {
  const { t, lang } = useI18n();
  const [date, setDate] = useState(todayPST);
  const dateInputRef = useRef<HTMLInputElement>(null);

  const formattedDate = useMemo(() => {
    // Render the picked date with weekday in the active locale.
    const [y, m, d] = date.split('-').map((p) => parseInt(p, 10));
    const dt = new Date(y, m - 1, d);
    const fmtLocale = lang === 'zh' ? 'zh-CN' : lang === 'ja' ? 'ja-JP' : 'en-US';
    return new Intl.DateTimeFormat(fmtLocale, {
      month: 'short', day: 'numeric', weekday: 'short',
    }).format(dt);
  }, [date, lang]);

  const isToday = date === todayPST();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [locks, setLocks] = useState<Lock[]>([]);
  const [modal, setModal] = useState<{
    machineId: number;
    slots: SlotRef[];
  } | null>(null);
  const [mobile, setMobile] = useState(window.innerWidth <= 768);
  const [mode, setMode] = useState<'book' | 'cancel'>('book');
  const [activeSection, setActiveSection] = useState<'riichi' | 'guoma'>('riichi');

  // Cancel-mode shared state
  const [cancelUsername, setCancelUsername] = useState('');
  const [cancelConfirmed, setCancelConfirmed] = useState(false);
  const [selectedBookingIds, setSelectedBookingIds] = useState<Set<number>>(new Set());
  const [selectedLockIds, setSelectedLockIds] = useState<Set<number>>(new Set());
  const [cancelPhone, setCancelPhone] = useState('');

  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const load = useCallback(async () => {
    try {
      // Fetch primary date + next morning in parallel — bookings & locks come back
      // pre-tagged with their date so a single merged list is enough.
      const [primary, next] = await Promise.all([
        fetchBookings(date),
        fetchBookings(nextDate(date)),
      ]);
      setBookings([...primary.bookings, ...next.bookings]);
      setLocks([...primary.locks, ...next.locks]);
    } catch (e) {
      console.error('Failed to load bookings', e);
    }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const handleSelect = (machineId: number, slots: SlotRef[]) => {
    setModal({ machineId, slots });
  };

  const handleSuccess = () => { setModal(null); load(); };

  const resetCancelState = () => {
    setCancelUsername('');
    setCancelConfirmed(false);
    setSelectedBookingIds(new Set());
    setSelectedLockIds(new Set());
    setCancelPhone('');
  };

  const handleCancelBookings = async () => {
    const bookingIds = Array.from(selectedBookingIds);
    const lockIds = Array.from(selectedLockIds);
    if (bookingIds.length === 0 && lockIds.length === 0) return;
    try {
      const result = await batchCancel(bookingIds, lockIds, cancelPhone.trim());
      const failed = (result.errors || []).length;
      if (failed > 0) {
        alert(`${failed} items failed to cancel (wrong phone?)`);
      }
    } catch (e: any) {
      alert(e.message || 'Cancel failed');
    }
    resetCancelState();
    setMode('book');
    load();
  };

  const userLower = () => cancelUsername.trim().toLowerCase();
  const onToggleCancel = (machineId: number, slot: SlotRef) => {
    if (mode !== 'cancel' || !cancelConfirmed) return;
    const userLock = locks.find(
      (l) => l.machineId === machineId && l.timeSlot === slot.timeSlot && l.date === slot.date
        && !!l.username && l.username.toLowerCase() === userLower()
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
      (b) => b.machineId === machineId && b.timeSlot === slot.timeSlot && b.date === slot.date
        && b.username.toLowerCase() === userLower()
    );
    if (!booking) return;
    setSelectedBookingIds((prev) => {
      const next = new Set(prev);
      if (next.has(booking.id)) next.delete(booking.id);
      else next.add(booking.id);
      return next;
    });
  };

  const handleConfirmUsername = () => {
    if (cancelUsername.trim()) {
      setCancelConfirmed(true);
      setSelectedBookingIds(new Set());
      setSelectedLockIds(new Set());
    }
  };

  const totalSelected = selectedBookingIds.size + selectedLockIds.size;

  return (
    <div className="container">
      <div className="nav">
        <h1>{t('title')}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <LangSwitcher />
          <Link to="/admin">{t('admin')}</Link>
        </div>
      </div>

      <div className="date-bar">
        <label
          className="date-input-wrap"
          onClick={(e) => {
            // Click anywhere on the wrap (icon, badge, padding) opens the native picker.
            // Native input handles its own typing/click.
            if (e.target === e.currentTarget || (e.target as HTMLElement).closest('.date-input-icon, .date-input-badge')) {
              const el = dateInputRef.current;
              if (el && typeof (el as any).showPicker === 'function') {
                try { (el as any).showPicker(); } catch { el.focus(); }
              }
            }
          }}
        >
          <span className="date-input-icon" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="3" width="12" height="11" rx="1" />
              <line x1="2" y1="6" x2="14" y2="6" />
              <line x1="5" y1="2" x2="5" y2="4" />
              <line x1="11" y1="2" x2="11" y2="4" />
            </svg>
          </span>
          <input
            ref={dateInputRef}
            type="date"
            value={date}
            onChange={(e) => {
              const v = e.target.value;
              if (v) setDate(v);
            }}
            className="date-input-native"
            aria-label="date"
          />
          <span className="date-input-badge">{formattedDate}</span>
        </label>
        <button
          className={isToday ? 'date-today-btn active' : 'date-today-btn'}
          onClick={() => setDate(todayPST())}
          disabled={isToday}
        >
          {t('today')}
        </button>
        <span className="date-bar-spacer" />
        <button
          className={mode === 'cancel' ? 'danger' : ''}
          onClick={() => {
            const next = mode === 'cancel' ? 'book' : 'cancel';
            setMode(next);
            if (next === 'book') resetCancelState();
          }}
        >
          {mode === 'cancel' ? t('cancel') : t('cancelBooking')}
        </button>
      </div>

      <DateStrip date={date} onChange={setDate} />

      {/* Cancel mode controls */}
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
          <span><strong>{cancelUsername}</strong> — {t('yourBookings')}</span>
          <button
            style={{ padding: '4px 12px', fontSize: 12 }}
            onClick={() => { setCancelConfirmed(false); setSelectedBookingIds(new Set()); setSelectedLockIds(new Set()); }}
          >
            {t('cancel')}
          </button>
        </div>
      )}

      {mobile ? (
        <MobileView
          bookings={bookings}
          locks={locks}
          primaryDate={date}
          mode={mode}
          onSelect={handleSelect}
          cancelUsername={cancelUsername}
          cancelConfirmed={cancelConfirmed}
          selectedBookingIds={selectedBookingIds}
          selectedLockIds={selectedLockIds}
          onToggleCancel={onToggleCancel}
        />
      ) : (mode === 'book' || cancelConfirmed) ? (
        <>
          <div className="section-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={activeSection === 'riichi'}
              className={`section-tab ${activeSection === 'riichi' ? 'active' : ''}`}
              onClick={() => setActiveSection('riichi')}
            >
              {t('sectionRiichi')}
            </button>
            <button
              role="tab"
              aria-selected={activeSection === 'guoma'}
              className={`section-tab ${activeSection === 'guoma' ? 'active' : ''}`}
              onClick={() => setActiveSection('guoma')}
            >
              {t('sectionGuoma')}
            </button>
            <p className="section-tab-hint">
              {activeSection === 'riichi' ? t('sectionRiichiHint') : t('sectionGuomaHint')}
            </p>
          </div>

          {activeSection === 'riichi' ? (
            <RiichiGrid
              bookings={bookings}
              locks={locks}
              primaryDate={date}
              mode={mode}
              onSelect={handleSelect}
              cancelUsername={cancelUsername}
              cancelConfirmed={cancelConfirmed}
              selectedBookingIds={selectedBookingIds}
              selectedLockIds={selectedLockIds}
              onToggleCancel={onToggleCancel}
            />
          ) : (
            <GuomaGrid
              bookings={bookings}
              locks={locks}
              primaryDate={date}
              mode={mode}
              onSelect={handleSelect}
              cancelUsername={cancelUsername}
              cancelConfirmed={cancelConfirmed}
              selectedLockIds={selectedLockIds}
              onToggleCancel={onToggleCancel}
            />
          )}
        </>
      ) : null}

      {mode === 'cancel' && cancelConfirmed && totalSelected > 0 && (
        <div className="desktop-cancel-bar">
          <input
            className="cancel-phone-input"
            value={cancelPhone}
            onChange={(e) => setCancelPhone(e.target.value)}
            placeholder={t('phoneCancelPh')}
          />
          <button className="danger" onClick={handleCancelBookings}>
            {t('mobileCancelConfirm')} ({totalSelected})
          </button>
        </div>
      )}

      {modal && mode === 'book' && (
        <BookingModal
          machineId={modal.machineId}
          slots={modal.slots}
          bookings={bookings}
          locks={locks}
          onClose={() => setModal(null)}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}
