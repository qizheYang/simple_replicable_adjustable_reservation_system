import { useState } from 'react';
import type { Booking } from 'shared';
import { MACHINES, WAITLIST_RIICHI, WAITLIST_GUOMA } from 'shared';
import { cancelBooking } from '../api';
import { useI18n } from '../i18n';

interface Props {
  bookings: Booking[];
  date: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function CancelModal({ bookings, date, onClose, onSuccess }: Props) {
  const { t, machineDisplay } = useI18n();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const todayBookings = bookings.filter((b) => b.date === date);
  const selected = todayBookings.find((b) => b.id === selectedId);
  const needsPhone = selected && selected.phone && selected.phone.length > 0;

  const label = (b: Booking) => {
    const name = b.machineId === WAITLIST_RIICHI ? t('waitlistRiichi')
      : b.machineId === WAITLIST_GUOMA ? t('waitlistGuoma')
      : machineDisplay(b.machineId);
    return `${b.username} · ${b.timeSlot} · ${name}`;
  };

  const handleCancel = async () => {
    if (selectedId === null) { setError(t('selectOne')); return; }
    if (needsPhone && !phone.trim()) { setError(t('enterPhone')); return; }
    setLoading(true);
    setError('');
    try {
      await cancelBooking(selectedId, phone.trim());
      onSuccess();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('cancelTitle')}</h2>

        {todayBookings.length === 0 ? (
          <p style={{ color: '#666', fontSize: 14 }}>{t('noBookings')}</p>
        ) : (
          <>
            <div className="form-group">
              <label>{t('selectBooking')}</label>
              <select
                value={selectedId ?? ''}
                onChange={(e) => setSelectedId(e.target.value ? parseInt(e.target.value) : null)}
              >
                <option value="">{t('select')}</option>
                {todayBookings.map((b) => (
                  <option key={b.id} value={b.id}>{label(b)}</option>
                ))}
              </select>
            </div>

            {needsPhone && (
              <div className="form-group">
                <label>{t('phoneVerify')}</label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t('phoneVerifyPh')}
                />
              </div>
            )}
          </>
        )}

        {error && <p className="error">{error}</p>}

        <div className="form-actions">
          {todayBookings.length > 0 && (
            <button className="danger" onClick={handleCancel} disabled={loading}>
              {loading ? t('cancelling') : t('confirmCancel')}
            </button>
          )}
          <button onClick={onClose}>{t('close')}</button>
        </div>
      </div>
    </div>
  );
}
