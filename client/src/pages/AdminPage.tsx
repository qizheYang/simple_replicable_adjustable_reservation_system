import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { MACHINES, TIME_SLOTS, MAX_PLAYERS, WAITLIST_RIICHI, WAITLIST_GUOMA } from 'shared';
import type { Booking, Lock } from 'shared';
import { todayPST } from '../utils';
import { useI18n } from '../i18n';
import { LangSwitcher } from '../components/LangSwitcher';
import {
  fetchBookings,
  adminLogin,
  adminDeleteBooking,
  adminCreateLock,
  adminDeleteLock,
} from '../api';

type AdminMode = 'view' | 'cancel' | 'unlock' | 'lock';

export function AdminPage() {
  const { t, machineDisplay } = useI18n();

  const [token, setToken] = useState<string | null>(
    () => sessionStorage.getItem('admin_token')
  );
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [date, setDate] = useState(todayPST());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [locks, setLocks] = useState<Lock[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [mode, setMode] = useState<AdminMode>('view');
  const [selectedBookingIds, setSelectedBookingIds] = useState<Set<number>>(new Set());
  const [selectedLockIds, setSelectedLockIds] = useState<Set<number>>(new Set());

  // Lock form
  const [lockMachine, setLockMachine] = useState(0);
  const [lockSlots, setLockSlots] = useState<Set<string>>(new Set());
  const [lockReason, setLockReason] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await fetchBookings(date);
      setBookings(data.bookings);
      setLocks(data.locks);
    } catch (e) {
      console.error(e);
    }
  }, [date, token]);

  useEffect(() => { load(); }, [load]);

  const handleLogin = async () => {
    try {
      const tk = await adminLogin(password);
      setToken(tk);
      sessionStorage.setItem('admin_token', tk);
      setLoginError('');
    } catch {
      setLoginError(t('wrongPw'));
    }
  };

  const switchMode = (m: AdminMode) => {
    setMode(m);
    setSelectedBookingIds(new Set());
    setSelectedLockIds(new Set());
    setError('');
    setSuccess('');
  };

  // Batch cancel bookings
  const handleBatchCancel = async () => {
    if (!token || selectedBookingIds.size === 0) return;
    setError('');
    let failed = 0;
    for (const id of selectedBookingIds) {
      try {
        await adminDeleteBooking(id, token);
      } catch {
        failed++;
      }
    }
    if (failed > 0) setError(`${failed} failed`);
    else setSuccess(t('cancelled'));
    setSelectedBookingIds(new Set());
    load();
  };

  // Batch unlock
  const handleBatchUnlock = async () => {
    if (!token || selectedLockIds.size === 0) return;
    setError('');
    let failed = 0;
    for (const id of selectedLockIds) {
      try {
        await adminDeleteLock(id, token);
      } catch {
        failed++;
      }
    }
    if (failed > 0) setError(`${failed} failed`);
    else setSuccess(t('unlocked'));
    setSelectedLockIds(new Set());
    load();
  };

  // Lock creation
  const handleLock = async () => {
    if (!token || lockSlots.size === 0) return;
    setError('');
    try {
      await adminCreateLock(
        { machineId: lockMachine, date, timeSlots: Array.from(lockSlots), reason: lockReason },
        token
      );
      setSuccess(t('lockedSuccess'));
      setLockSlots(new Set());
      setLockReason('');
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const toggleSlot = (slot: string) => {
    setLockSlots((prev) => {
      const next = new Set(prev);
      if (next.has(slot)) next.delete(slot);
      else next.add(slot);
      return next;
    });
  };

  // Grid cell click handlers
  const handleCellClick = (machineId: number, timeSlot: string) => {
    if (mode === 'cancel') {
      // Select all bookings in this cell
      const cellBookings = bookings.filter(
        (b) => b.machineId === machineId && b.timeSlot === timeSlot
      );
      if (cellBookings.length === 0) return;
      setSelectedBookingIds((prev) => {
        const next = new Set(prev);
        const allSelected = cellBookings.every((b) => next.has(b.id));
        cellBookings.forEach((b) => {
          if (allSelected) next.delete(b.id);
          else next.add(b.id);
        });
        return next;
      });
    } else if (mode === 'unlock') {
      const lock = locks.find(
        (l) => l.machineId === machineId && l.timeSlot === timeSlot
      );
      if (!lock) return;
      setSelectedLockIds((prev) => {
        const next = new Set(prev);
        if (next.has(lock.id)) next.delete(lock.id);
        else next.add(lock.id);
        return next;
      });
    }
  };

  // Helpers
  const getBookingsFor = (machineId: number, timeSlot: string) =>
    bookings.filter((b) => b.machineId === machineId && b.timeSlot === timeSlot);

  const getLock = (machineId: number, timeSlot: string) =>
    locks.find((l) => l.machineId === machineId && l.timeSlot === timeSlot);

  if (!token) {
    return (
      <div className="container">
        <div className="admin-login">
          <h1>{t('adminLogin')}</h1>
          <div className="form-group" style={{ marginTop: 20 }}>
            <label>{t('password')}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              autoFocus
            />
          </div>
          {loginError && <p className="error">{loginError}</p>}
          <button className="primary" onClick={handleLogin}>{t('login')}</button>
          <div style={{ marginTop: 16 }}>
            <Link to="/">{t('back')}</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="nav">
        <h1>{t('adminPanel')}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <LangSwitcher />
          <Link to="/">{t('backHome')}</Link>
          <a href="#" onClick={(e) => {
            e.preventDefault();
            sessionStorage.removeItem('admin_token');
            setToken(null);
          }}>{t('logout')}</a>
        </div>
      </div>

      <div className="date-bar">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <button onClick={() => setDate(todayPST())}>{t('today')}</button>
      </div>

      {/* Mode buttons */}
      <div className="admin-modes">
        <button
          className={mode === 'cancel' ? 'danger' : ''}
          onClick={() => switchMode(mode === 'cancel' ? 'view' : 'cancel')}
        >
          {mode === 'cancel' ? t('exitMode') : t('adminCancelMode')}
        </button>
        <button
          className={mode === 'unlock' ? 'danger' : ''}
          onClick={() => switchMode(mode === 'unlock' ? 'view' : 'unlock')}
        >
          {mode === 'unlock' ? t('exitMode') : t('adminUnlockMode')}
        </button>
        <button
          className={mode === 'lock' ? 'primary' : ''}
          onClick={() => switchMode(mode === 'lock' ? 'view' : 'lock')}
        >
          {mode === 'lock' ? t('exitMode') : t('lockTables')}
        </button>
      </div>

      {mode !== 'view' && mode !== 'lock' && (
        <p style={{ fontSize: 13, color: '#888', marginBottom: 8 }}>{t('clickToSelect')}</p>
      )}

      {error && <p className="error">{error}</p>}
      {success && <p className="success">{success}</p>}

      {/* Lock form (shown when lock mode active) */}
      {mode === 'lock' && (
        <div className="admin-section">
          <div className="form-group">
            <label>{t('selectTable')}</label>
            <select value={lockMachine} onChange={(e) => setLockMachine(parseInt(e.target.value))}>
              {MACHINES.map((m) => (
                <option key={m.id} value={m.id}>{machineDisplay(m.id)}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>{t('selectSlots')}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
              {TIME_SLOTS.map((slot) => (
                <button
                  key={slot}
                  style={{
                    padding: '4px 10px', fontSize: 12,
                    background: lockSlots.has(slot) ? '#000' : '#fff',
                    color: lockSlots.has(slot) ? '#fff' : '#000',
                  }}
                  onClick={() => toggleSlot(slot)}
                >{slot}</button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label>{t('reason')}</label>
            <input value={lockReason} onChange={(e) => setLockReason(e.target.value)} placeholder={t('reasonPh')} />
          </div>
          <button className="primary" onClick={handleLock} disabled={lockSlots.size === 0}>{t('lockBtn')}</button>
        </div>
      )}

      {/* Grid */}
      <div className="grid-wrap" style={{ userSelect: 'none' }}>
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
                  const lockSelected = lock ? selectedLockIds.has(lock.id) : false;
                  const cellHasSelectedBooking = cb.some((b) => selectedBookingIds.has(b.id));

                  return [0, 1, 2, 3].map((s) => {
                    const player = cb[s];
                    const isLast = s === 3;
                    const bookingSelected = player ? selectedBookingIds.has(player.id) : false;

                    let cls = 'td-seat';
                    if (lock) cls += ' locked';
                    if (player) cls += ' filled';
                    if (isLast) cls += ' seat-border-right';
                    if (bookingSelected) cls += ' cancel-selected-cell';
                    if (lockSelected) cls += ' unlock-selected-cell';

                    const clickable =
                      (mode === 'cancel' && cb.length > 0) ||
                      (mode === 'unlock' && !!lock);

                    return (
                      <td
                        key={`${m.id}-${slot}-${s}`}
                        className={cls}
                        style={{ cursor: clickable ? 'pointer' : 'default' }}
                        onClick={() => handleCellClick(m.id, slot)}
                      >
                        {lock && s === 0 ? <span className="lock-label">{lock.reason || t('lock')}</span>
                          : player ? <span className="player-name">{player.username}</span>
                          : null}
                      </td>
                    );
                  });
                })}
                {/* Waitlist */}
                {[WAITLIST_RIICHI, WAITLIST_GUOMA].map((wId) => {
                  const wBookings = getBookingsFor(wId, slot);
                  const cellHasSelected = wBookings.some((b) => selectedBookingIds.has(b.id));

                  return (
                    <td
                      key={`wl-${wId}-${slot}`}
                      className={`td-waitlist${cellHasSelected ? ' cancel-selected-cell' : ''}`}
                      style={{ cursor: mode === 'cancel' && wBookings.length > 0 ? 'pointer' : 'default' }}
                      onClick={() => handleCellClick(wId, slot)}
                    >
                      {wBookings.map((b) => (
                        <span
                          key={b.id}
                          className={`wl-name ${selectedBookingIds.has(b.id) ? 'wl-cancel-selected' : ''}`}
                        >
                          {b.username}
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

      {/* Batch action bars */}
      {mode === 'cancel' && selectedBookingIds.size > 0 && (
        <div className="desktop-cancel-bar">
          <button className="danger" onClick={handleBatchCancel}>
            {t('adminCancelSelected')} ({selectedBookingIds.size})
          </button>
        </div>
      )}

      {mode === 'unlock' && selectedLockIds.size > 0 && (
        <div className="desktop-cancel-bar">
          <button className="danger" onClick={handleBatchUnlock}>
            {t('adminUnlockSelected')} ({selectedLockIds.size})
          </button>
        </div>
      )}
    </div>
  );
}
