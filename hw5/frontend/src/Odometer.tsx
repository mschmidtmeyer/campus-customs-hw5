// A mechanical counter for the bank balance: every digit is a little drum of 0-9 that rolls to
// its new number. Digits are keyed by their place from the right, so cents stay cents when the
// balance gains or loses a digit. Styles live in owner.css (prefix odo-).
import type { CSSProperties } from 'react'
import './owner.css'

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

function OdoDigit({ digit, place }: { digit: number; place: number }) {
  const style = {
    transform: `translateY(${-digit * 10}%)`,
    transitionDelay: `${place * 45}ms`,
  } as CSSProperties
  return (
    <span className={`odo-digit ${place < 2 ? 'is-cents' : ''}`}>
      <span className="odo-strip" style={style}>
        {DIGITS.map((d) => <span key={d}>{d}</span>)}
      </span>
    </span>
  )
}

export function Odometer({ value }: { value: number | null }) {
  if (value == null || !Number.isFinite(value)) {
    return (
      <span className="odo odo-empty">
        <span className="odo-sr">No balance yet</span>
        <span aria-hidden="true">—</span>
      </span>
    )
  }
  const amount = Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const chars = [...`${value < 0 ? '−' : ''}$${amount}`]
  const label = value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  return (
    <span className="odo">
      <span className="odo-sr">{label}</span>
      <span className="odo-reel" aria-hidden="true">
        {chars.map((c, i) => {
          const place = chars.length - 1 - i
          const d = c.charCodeAt(0) - 48
          return d >= 0 && d <= 9
            ? <OdoDigit key={`d${place}`} digit={d} place={place} />
            : <span key={`s${place}`} className="odo-sep">{c}</span>
        })}
      </span>
    </span>
  )
}
