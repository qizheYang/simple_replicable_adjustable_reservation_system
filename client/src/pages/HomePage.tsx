import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import type { Booking, Lock } from 'shared';
import { fetchBookings, cancelBooking } from '../api';
import { BookingGrid } from '../components/BookingGrid';
import { MobileView } from '../components/MobileView';
import { BookingModal } from '../components/BookingModal';
import { LangSwitcher } from '../components/LangSwitcher';
import { useI18n } from '../i18n';
import { todayPST } from '../utils';

export function HomePage() {
  const { t } = useI18n();
  const [date, setDate] = useState(todayPST);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [locks, setLocks] = useState<Lock[]>([]);
  const [modal, setModal] = useState<{
    machineId: number;
    timeSlots: string[];
  } | null>(null);
  const [mobile, setMobile] = useState(window.innerWidth <= 768);
  const [mode, setMode] = useState<'book' | 'cancel'>('book');

  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await fetchBookings(date);
      setBookings(data.bookings);
      setLocks(data.locks);
    } catch (e) {
      console.error('Failed to load bookings', e);
    }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const handleSelect = (machineId: number, timeSlots: string[]) => {
    setModal({ machineId, timeSlots });
  };

  const handleSuccess = () => { setModal(null); load(); };

  const handleCancelBookings = async (bookingIds: number[], phone: string) => {
    let failed = 0;
    for (const id of bookingIds) {
      try {
        await cancelBooking(id, phone);
      } catch {
        failed++;
      }
    }
    if (failed > 0) {
      alert(`${failed} bookings failed to cancel (wrong phone?)`);
    }
    setMode('book');
    load();
  };

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
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <button onClick={() => setDate(todayPST())}>{t('today')}</button>
        <button
          className={mode === 'cancel' ? 'danger' : ''}
          onClick={() => setMode(mode === 'cancel' ? 'book' : 'cancel')}
        >
          {mode === 'cancel' ? t('cancel') : t('cancelBooking')}
        </button>
      </div>

      {mobile ? (
        <MobileView
          bookings={bookings}
          locks={locks}
          mode={mode}
          onSelect={handleSelect}
          onCancelBookings={handleCancelBookings}
        />
      ) : (
        <BookingGrid
          bookings={bookings}
          locks={locks}
          mode={mode}
          onSelect={handleSelect}
          onCancelBookings={handleCancelBookings}
        />
      )}

      {modal && mode === 'book' && (
        <BookingModal
          date={date}
          machineId={modal.machineId}
          timeSlots={modal.timeSlots}
          onClose={() => setModal(null)}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}
