import { useState } from 'react';
import { MACHINES, WAITLIST_RIICHI, WAITLIST_GUOMA } from 'shared';
import { createBooking } from '../api';
import { useI18n } from '../i18n';

interface Props {
  date: string;
  machineId: number;
  timeSlots: string[];
  onClose: () => void;
  onSuccess: () => void;
}

export function BookingModal({ date, machineId, timeSlots, onClose, onSuccess }: Props) {
  const { t, machineDisplay } = useI18n();
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isWaitlist = machineId === WAITLIST_RIICHI || machineId === WAITLIST_GUOMA;
  const columnName = machineId === WAITLIST_RIICHI ? t('waitlistRiichi')
    : machineId === WAITLIST_GUOMA ? t('waitlistGuoma')
    : machineDisplay(machineId);

  const slotsDisplay = timeSlots.length <= 3
    ? timeSlots.join(', ')
    : `${timeSlots[0]} - ${timeSlots[timeSlots.length - 1]} (${timeSlots.length}${t('hours')})`;

  const handleSubmit = async () => {
    if (!username.trim()) {
      setError(t('enterName'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await createBooking({
        username: username.trim(),
        phone: phone.trim() || undefined,
        date,
        timeSlots,
        machineId,
      });
      if (result.errors && result.errors.length > 0 && result.bookings.length > 0) {
        setError(`${t('partialFail')}: ${result.errors.map((e) => `${e.timeSlot} (${e.error})`).join(', ')}`);
      }
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
        <h2>{isWaitlist ? t('waitlistReg') : t('booking')}</h2>
        <p style={{ fontSize: 13, marginBottom: 16, color: '#666' }}>
          {date} · {slotsDisplay} · {columnName}
        </p>

        <div className="form-group">
          <label>{t('username')}</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder={t('usernamePh')}
            autoFocus
          />
        </div>

        <div className="form-group">
          <label>{t('phone')} <span className="optional">({t('optional')})</span></label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder={t('phonePh')}
          />
        </div>

        {error && <p className="error">{error}</p>}

        <div className="form-actions">
          <button className="primary" onClick={handleSubmit} disabled={loading}>
            {loading ? t('submitting') : `${t('confirm')} (${timeSlots.length}${t('slots')})`}
          </button>
          <button onClick={onClose}>{t('cancel')}</button>
        </div>
      </div>
    </div>
  );
}
