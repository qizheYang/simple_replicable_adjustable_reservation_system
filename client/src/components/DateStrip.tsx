import { useMemo } from 'react';
import { useI18n } from '../i18n';
import { todayPST } from '../utils';

interface Props {
  date: string; // YYYY-MM-DD
  onChange: (date: string) => void;
  daysBefore?: number;
  daysAfter?: number;
}

const DOW_KEYS = [
  'dowSun', 'dowMon', 'dowTue', 'dowWed', 'dowThu', 'dowFri', 'dowSat',
] as const;

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map((p) => parseInt(p, 10));
  return new Date(y, m - 1, d);
}

// Fixed window — no scrolling. Range is centered around today, not the picked date,
// so the strip stays stable and the user can always see the same set of days.
export function DateStrip({ date, onChange, daysBefore = 3, daysAfter = 7 }: Props) {
  const { t, lang } = useI18n();

  const today = useMemo(() => parseISO(todayPST()), []);
  const todayIso = fmt(today);

  const days = useMemo(() => {
    const list: Date[] = [];
    for (let i = -daysBefore; i <= daysAfter; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      list.push(d);
    }
    return list;
  }, [today, daysBefore, daysAfter]);

  const selectedInRange = days.some((d) => fmt(d) === date);

  return (
    <div className="date-strip-wrap" aria-label="quick date picker">
      <div className="date-strip">
        {days.map((d, i) => {
          const iso = fmt(d);
          const isSelected = iso === date;
          const isToday = iso === todayIso;
          const dow = t(DOW_KEYS[d.getDay()]);
          // Show month label on the very first pill and on each month boundary
          const isMonthBoundary = i === 0 || d.getDate() === 1;

          return (
            <button
              key={iso}
              type="button"
              className={[
                'date-pill',
                isSelected ? 'selected' : '',
                isToday ? 'today' : '',
                d.getDay() === 0 || d.getDay() === 6 ? 'weekend' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => onChange(iso)}
            >
              {isMonthBoundary && <span className="pill-month">{(d.getMonth() + 1) + (lang === 'en' ? '' : '月')}</span>}
              <span className="pill-dow">{dow}</span>
              <span className="pill-dom">{d.getDate()}</span>
              {isToday && <span className="pill-today-dot" aria-hidden />}
            </button>
          );
        })}
      </div>
      {!selectedInRange && (
        <div className="date-strip-out-hint" title={date}>
          <span aria-hidden>↗</span>
        </div>
      )}
    </div>
  );
}
