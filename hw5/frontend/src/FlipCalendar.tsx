// A flip calendar for the shop date. It hangs from a nail on two rings (or, compact, sits small in the
// top bar); when the date changes, the top half of the old page folds down over the new one.
import { useEffect, useState } from 'react'
import './calendar.css'

interface Day {
  month: string
  day: number
  weekday: string
  year: number
}

const FLIP_MS = 720

// 'YYYY-MM-DD' is read as a local date (new Date(y, m - 1, d)) so it never shifts a day by time zone.
function parse(date: string | null): Day | null {
  if (!date) return null
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(date.trim())
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (Number.isNaN(d.getTime())) return null
  return {
    month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    day: d.getDate(),
    weekday: d.toLocaleDateString('en-US', { weekday: 'long' }),
    year: d.getFullYear(),
  }
}

// One calendar page, clipped to its top or bottom half.
function Half({ day, half, className = '' }: { day: Day | null; half: 'top' | 'bottom'; className?: string }) {
  return (
    <div className={`cal-half cal-half-${half} ${className}`}>
      <div className="cal-face">
        <div className="cal-month">{day?.month ?? '———'}</div>
        <div className="cal-day">{day?.day ?? '—'}</div>
        <div className="cal-sub">
          <span className="cal-weekday">{day?.weekday ?? 'Shop date'}</span>
          <span className="cal-year">{day?.year ?? ''}</span>
        </div>
      </div>
    </div>
  )
}

export function FlipCalendar({ date, compact = false }: { date: string | null; compact?: boolean }) {
  const [shown, setShown] = useState<string | null>(date)
  const [flip, setFlip] = useState<{ from: string | null; key: number } | null>(null)

  // A new date arrived: remember the old page so it can fold away.
  if (date !== shown) {
    setShown(date)
    setFlip({ from: shown, key: (flip?.key ?? 0) + 1 })
  }

  useEffect(() => {
    if (!flip) return
    const t = window.setTimeout(() => setFlip(null), FLIP_MS + 60)
    return () => window.clearTimeout(t)
  }, [flip])

  const now = parse(date)
  const old = flip ? parse(flip.from) : null
  const label = now ? `Shop date: ${now.weekday}, ${now.month} ${now.day}, ${now.year}` : 'Shop date not loaded yet'

  return (
    <div className={`cal ${compact ? 'cal-compact' : ''} ${flip ? 'is-flipping' : ''}`} role="img" aria-label={label} title={label}>
      <svg className="cal-hanger" viewBox="0 0 116 18" aria-hidden="true" focusable="false">
        <path d="M30 18 L58 4 L86 18" />
        <circle cx="58" cy="4" r="3" />
      </svg>
      <div className="cal-body" aria-hidden="true">
        <span className="cal-ring cal-ring-left" />
        <span className="cal-ring cal-ring-right" />
        <div className="cal-page">
          <Half day={now} half="top" />
          <Half day={flip ? old : now} half="bottom" />
          {flip && (
            <div key={flip.key} className="cal-flap">
              <Half day={old} half="top" className="cal-flap-front" />
              <Half day={now} half="bottom" className="cal-flap-back" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
