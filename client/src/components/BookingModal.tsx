import { useState } from 'react';
import {
  WAITLIST_RIICHI, WAITLIST_GUOMA, AUTO_RIICHI,
  MAX_COMPANIONS, MAX_PLAYERS,
  RIICHI_MACHINE_IDS,
  isGuomaMachine, isRiichiMachine,
} from 'shared';
import type { Booking, Lock } from 'shared';
import { createBooking } from '../api';
import { useI18n } from '../i18n';
import type { SlotRef } from '../utils';

interface Props {
  machineId: number;
  slots: SlotRef[]; // sorted; may span two dates
  bookings: Booking[];
  locks: Lock[];
  onClose: () => void;
  onSuccess: () => void;
}

export function BookingModal({ machineId, slots, bookings, locks, onClose, onSuccess }: Props) {
  const { t, machineDisplay } = useI18n();
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [comment, setComment] = useState('');
  const [companions, setCompanions] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isWaitlist = machineId === WAITLIST_RIICHI || machineId === WAITLIST_GUOMA;
  const isAuto = machineId === AUTO_RIICHI;
  const isGuoma = isGuomaMachine(machineId);
  const isSpecificRiichi = isRiichiMachine(machineId);

  const effectiveBookEntireTable = isGuoma || isSpecificRiichi;

  const columnName =
    machineId === WAITLIST_RIICHI ? t('waitlistRiichi')
    : machineId === WAITLIST_GUOMA ? t('waitlistGuoma')
    : isAuto ? t('autoRiichi')
    : machineDisplay(machineId);

  // Group selected slots by date for display + submission
  const slotsByDate = new Map<string, string[]>();
  for (const s of slots) {
    const arr = slotsByDate.get(s.date) || [];
    arr.push(s.timeSlot);
    slotsByDate.set(s.date, arr);
  }
  const dateEntries = Array.from(slotsByDate.entries());
  const spansTwoDates = dateEntries.length > 1;

  const slotsDisplay = dateEntries
    .map(([d, ts]) => {
      const range = ts.length <= 3 ? ts.join(', ') : `${ts[0]} – ${ts[ts.length - 1]}`;
      return spansTwoDates ? `${d} ${range}` : range;
    })
    .join(spansTwoDates ? ' → ' : '');

  const allowsCompanions = isAuto;
  const maxCompanionsAllowed = allowsCompanions ? MAX_COMPANIONS : 0;

  // Queue check for 随便: any slot where (current walk-ins + party) would exceed
  // the effective capacity (12 - 4*locked riichi tables).
  const partySize = 1 + companions.filter((c) => c.trim().length > 0).length;
  const queueSlots: SlotRef[] = isAuto
    ? slots.filter((s) => {
        const lockedRiichi = locks.filter((l) =>
          RIICHI_MACHINE_IDS.includes(l.machineId) && l.date === s.date && l.timeSlot === s.timeSlot,
        ).length;
        const used = bookings.filter((b) =>
          b.date === s.date && b.timeSlot === s.timeSlot &&
          (b.machineId === AUTO_RIICHI || RIICHI_MACHINE_IDS.includes(b.machineId)),
        ).length;
        const effectiveCap = RIICHI_MACHINE_IDS.length * MAX_PLAYERS - lockedRiichi * MAX_PLAYERS;
        return used + partySize > effectiveCap;
      })
    : [];
  const willQueue = queueSlots.length > 0;

  const updateCompanion = (i: number, val: string) => {
    setCompanions((prev) => prev.map((c, idx) => (idx === i ? val : c)));
  };
  const addCompanion = () => {
    if (companions.length >= maxCompanionsAllowed) return;
    setCompanions((prev) => [...prev, '']);
  };
  const removeCompanion = (i: number) => {
    setCompanions((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleSubmit = async () => {
    if (!username.trim()) {
      setError(t('enterName'));
      return;
    }
    setLoading(true);
    setError('');
    const cleanedCompanions = companions.map((c) => c.trim()).filter((c) => c.length > 0);
    try {
      // One POST per date — the server treats each date independently. If the second
      // call fails after the first succeeds, surface the partial failure.
      const partialErrors: string[] = [];
      for (const [date, dateSlots] of dateEntries) {
        try {
          const result = await createBooking({
            username: username.trim(),
            phone: phone.trim() || undefined,
            date,
            timeSlots: dateSlots,
            machineId,
            bookEntireTable: effectiveBookEntireTable && !isWaitlist && !isAuto,
            comment: comment.trim() || undefined,
            companions: isAuto && cleanedCompanions.length > 0 ? cleanedCompanions : undefined,
          });
          if (result.errors && result.errors.length > 0) {
            partialErrors.push(`${date}: ${result.errors.map((e) => `${e.timeSlot} (${e.error})`).join(', ')}`);
          }
        } catch (e: any) {
          partialErrors.push(`${date}: ${e.message || 'failed'}`);
        }
      }
      if (partialErrors.length > 0 && partialErrors.length === dateEntries.length) {
        setError(partialErrors.join(' · '));
        return;
      }
      if (partialErrors.length > 0) {
        setError(`${t('partialFail')}: ${partialErrors.join(' · ')}`);
      }
      onSuccess();
    } finally {
      setLoading(false);
    }
  };

  const titleText = isWaitlist ? t('waitlistReg')
    : isGuoma || isSpecificRiichi ? t('bookEntireTable')
    : t('booking');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{titleText}</h2>
        <p style={{ fontSize: 13, marginBottom: 16, color: 'var(--c-ink-soft)' }}>
          {slotsDisplay} · {columnName}
          {spansTwoDates && (
            <span className="overnight-tag" style={{ marginLeft: 8 }}>
              {t('overnightDivider')}
            </span>
          )}
        </p>
        {isAuto && !willQueue && (
          <p className="hint-text" style={{ marginTop: -8, marginBottom: 12 }}>
            {t('autoRiichiTip')}
          </p>
        )}
        {isAuto && willQueue && (
          <p className="queue-warning" style={{ marginTop: -8, marginBottom: 12 }}>
            ⚠ {t('queueWarning')}
            {queueSlots.length < slots.length && (
              <span className="queue-warning-slots"> · {queueSlots.map((s) => `${s.timeSlot}`).join(', ')}</span>
            )}
          </p>
        )}
        {(isGuoma || isSpecificRiichi) && (
          <p className="hint-text" style={{ marginTop: -8, marginBottom: 12 }}>
            {t('bookEntireTableHint')}
          </p>
        )}

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

        <div className="form-group">
          <label>{t('comment')} <span className="optional">({t('optional')})</span></label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t('commentPh')}
            rows={2}
            maxLength={200}
          />
        </div>

        {allowsCompanions && (
          <div className="form-group">
            <label>{t('companions')} <span className="optional">({t('optional')})</span></label>
            {companions.map((c, i) => (
              <div key={i} className="companion-row">
                <input
                  value={c}
                  onChange={(e) => updateCompanion(i, e.target.value)}
                  placeholder={t('companionPh')}
                  maxLength={40}
                />
                <button type="button" className="companion-remove" onClick={() => removeCompanion(i)}>
                  {t('removeCompanion')}
                </button>
              </div>
            ))}
            {companions.length < maxCompanionsAllowed && (
              <button type="button" className="add-companion" onClick={addCompanion}>
                {t('addCompanion')}
              </button>
            )}
            <p className="hint-text">{t('companionsHint')}</p>
          </div>
        )}

        {error && <p className="error">{error}</p>}

        <div className="form-actions">
          <button className="primary" onClick={handleSubmit} disabled={loading}>
            {loading ? t('submitting') : `${t('confirm')} (${slots.length}${t('slots')})`}
          </button>
          <button onClick={onClose}>{t('cancel')}</button>
        </div>
      </div>
    </div>
  );
}
