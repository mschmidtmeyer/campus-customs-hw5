// The owner's desk: every payment the team asks for lands in the in-tray as a paper check.
// "Sign & pay" draws a signature, approves the payment, and a paid check flies off the desk.
// Under the tray (which scrolls on its own), the bank counter rolls the balance and shows how much
// cash is already promised; under it, the boss's cash plan (CashPlan.tsx) lists the payments and expected
// sales ahead and any deadline at risk, so the owner sees every deadline is covered before signing.
import { useEffect, useRef, useState } from 'react'
import { agentName } from './agents'
import { CashPlan } from './CashPlan'
import { Odometer } from './Odometer'
import type { ApproveResult, CashView, ForecastResponse, PendingPayment } from './types'
import './owner.css'

export interface OwnerPayment extends PendingPayment {
  ticketId: number
}

export interface OwnerDeskProps {
  payments: OwnerPayment[]
  cash: CashView | null
  busy: string | null
  memos?: number // open memos and discount requests (answered above the desk); they count as waiting too
  forecast?: ForecastResponse | null // the boss's cash plan, shown under the bank counter
  onApprove: (requestId: number) => Promise<ApproveResult | null>
  onPaid?: (r: ApproveResult) => void
}

type Phase = 'signing' | 'leaving' | 'failed'

// A check the desk keeps on screen on its own (while signing, flying away, or showing an error),
// even if the next board refresh already dropped it from `payments`.
interface Held {
  pay: OwnerPayment
  index: number
  phase: Phase
  error: string | null
}

const SIGN_MS = 950
const LEAVE_MS = 1500
const SIGNATURE =
  'M6 30 C10 14 18 6 22 12 C26 18 16 34 12 36 C8 38 14 24 24 22 C30 21 30 30 34 30 C38 30 40 20 44 20 ' +
  'C48 20 46 30 50 30 C54 30 56 18 60 18 C63 18 61 28 65 29 C70 30 74 16 78 16 C82 16 79 28 84 28 ' +
  'C90 28 94 14 100 14 C104 14 102 26 107 26 C112 26 116 20 122 18 M14 38 C40 34 80 33 132 30'

const usd = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const plain = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

function shortDate(iso: string | null): string | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven',
  'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
const SCALES = [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']] as const

function words(n: number): string {
  if (n < 20) return ONES[n]
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '')
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${words(n % 100)}` : ''}`
  for (const [size, name] of SCALES) {
    if (n >= size) return `${words(Math.floor(n / size))} ${name}${n % size ? ` ${words(n % size)}` : ''}`
  }
  return String(n)
}

// "Four hundred twelve and 50/100 dollars", the way a check spells out its amount.
function amountInWords(amount: number): string {
  const cents = Math.round(Math.abs(amount) * 100)
  const w = words(Math.floor(cents / 100))
  return `${w[0].toUpperCase()}${w.slice(1)} and ${String(cents % 100).padStart(2, '0')}/100 dollars`
}

export function OwnerDesk({ payments, cash, busy, memos = 0, forecast = null, onApprove, onPaid }: OwnerDeskProps) {
  const [held, setHeld] = useState<Held[]>([])
  const [paidIds, setPaidIds] = useState<ReadonlySet<number>>(() => new Set())
  const [press, setPress] = useState(0)
  const timers = useRef<number[]>([])

  useEffect(() => {
    const list = timers.current
    return () => list.forEach((t) => window.clearTimeout(t))
  }, [])

  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      timers.current.push(window.setTimeout(resolve, ms))
    })

  // Checks from the board, minus paid ones, with held checks put back where they were.
  const heldIds = new Set(held.map((h) => h.pay.request_id))
  const list: { pay: OwnerPayment; h: Held | null }[] = payments
    .filter((x) => !paidIds.has(x.request_id) && !heldIds.has(x.request_id))
    .map((pay) => ({ pay, h: null }))
  for (const h of [...held].sort((a, b) => a.index - b.index)) {
    const fresh = h.phase === 'leaving' ? undefined : payments.find((x) => x.request_id === h.pay.request_id)
    list.splice(Math.min(h.index, list.length), 0, { pay: fresh ?? h.pay, h })
  }
  const waiting = list.filter((x) => x.h?.phase !== 'leaving').length
  const locked = busy !== null || held.some((h) => h.phase === 'signing')
  const promised = payments.filter((x) => !paidIds.has(x.request_id)).reduce((s, x) => s + x.amount, 0)

  const setPhase = (id: number, phase: Phase, error: string | null = null) =>
    setHeld((hs) => hs.map((h) => (h.pay.request_id === id ? { ...h, phase, error } : h)))

  const sign = async (pay: OwnerPayment, index: number) => {
    const id = pay.request_id
    setHeld((hs) => [...hs.filter((h) => h.pay.request_id !== id), { pay, index, phase: 'signing', error: null }])
    await wait(reducedMotion() ? 120 : SIGN_MS)
    let result: ApproveResult | null = null
    try {
      result = await onApprove(id)
    } catch {
      result = null
    }
    const scheduled = !!result && !result.paid && !!result.reason?.startsWith('Approved, not paid yet')
    if (result?.paid || scheduled) {
      const paid = result
      if (result?.paid) setPaidIds((s) => new Set(s).add(id))
      setPhase(id, 'leaving')
      setPress((n) => n + 1)
      if (paid?.paid) onPaid?.(paid)
      await wait(LEAVE_MS)
      setHeld((hs) => hs.filter((h) => h.pay.request_id !== id))
    } else {
      setPhase(id, 'failed', result?.reason || "Couldn't pay")
    }
  }

  const dismiss = (id: number) => setHeld((hs) => hs.filter((h) => h.pay.request_id !== id))

  return (
    <section className="own" aria-label="Owner's desk">
      <div className="own-top">
        <div className="own-nameplate">
          <span>Owner — you</span>
        </div>
        <div className="own-props" aria-hidden="true">
          <span className="own-inkpad" />
          <span key={press} className={`own-stamp ${press ? 'is-pressed' : ''}`}>
            <span className="own-stamp-knob" />
            <span className="own-stamp-neck" />
            <span className="own-stamp-base">APPROVED</span>
          </span>
        </div>
      </div>

      {waiting + memos > 0 && (
        <div className="own-sign" role="status">
          <span className="own-sign-board">
            Waiting for you <b>{waiting + memos}</b>
          </span>
        </div>
      )}

      <div className="own-tray">
        <span className="own-tray-label" aria-hidden="true">IN</span>
        <div className="own-tray-list">
          {list.length === 0 && <p className="own-empty">In-tray is empty — nothing to sign.</p>}
          {list.map(({ pay, h }, index) => (
            <Check
              key={pay.request_id}
              pay={pay}
              phase={h?.phase ?? null}
              error={h?.error ?? null}
              locked={locked}
              onSign={() => sign(pay, index)}
              onDismiss={() => dismiss(pay.request_id)}
            />
          ))}
        </div>
      </div>

      <div className="own-money">
        <BankCounter cash={cash} promised={promised} />
        <CashPlan forecast={forecast} />
      </div>
    </section>
  )
}

interface CheckProps {
  pay: OwnerPayment
  phase: Phase | null
  error: string | null
  locked: boolean
  onSign: () => void
  onDismiss: () => void
}

function Check({ pay, phase, error, locked, onSign, onDismiss }: CheckProps) {
  const signing = phase === 'signing'
  const leaving = phase === 'leaving'
  const due = shortDate(pay.due)
  const payee = pay.payee ?? 'Unnamed payee'
  return (
    <div className={`check-slot ${leaving ? 'is-leaving' : ''}`}>
      <article className={`check ${phase ? `is-${phase}` : ''}`} aria-label={`Check for ${usd(pay.amount)} to ${payee}`}>
        <div className="check-top">
          <span className="check-bank">
            <span className="check-logo" aria-hidden="true">CC</span>
            Campus Customs · Checking
          </span>
          <span className="check-no">No. {String(pay.request_id).padStart(4, '0')}</span>
        </div>
        {pay.priority_rank != null && <span className="check-rank">Priority #{pay.priority_rank}</span>}
        <div className="check-date">
          <span className="check-label">{due ? 'Due' : 'Date'}</span>
          <span className="check-fill">{due ?? ''}</span>
        </div>

        <div className="check-payline">
          <span className="check-label">Pay to the order of</span>
          <span className="check-payee">{payee}</span>
          <span className="check-amount">
            <span className="check-dollar">$</span>
            {plain(pay.amount)}
          </span>
        </div>
        <div className="check-words">{amountInWords(pay.amount)}</div>

        <div className="check-lower">
          <div className="check-memo">
            <span className="check-label">Memo</span>
            <span className="check-memo-text">{pay.reason ?? '—'}</span>
          </div>
          <div className="check-sign">
            {(signing || leaving) && (
              <svg className="check-sig" viewBox="0 0 140 44" aria-hidden="true" focusable="false">
                <path d={SIGNATURE} pathLength={1} />
              </svg>
            )}
            {signing && <span className="check-pen" aria-hidden="true" />}
            <span className="check-sigline" />
            <span className="check-label">Authorized signature</span>
          </div>
        </div>

        <p className="check-meta">
          Ticket #{pay.ticketId} · Request #{pay.request_id}
          {pay.requested_by ? ` · asked by ${agentName(pay.requested_by)}` : ''}
        </p>
        {pay.cash_covers_it === false && (
          <p className="check-warn">Heads up: free cash may not cover this check.</p>
        )}
        {error && <p className="check-error" role="alert">{error}</p>}

        <div className="check-actions">
          {phase === 'failed' && (
            <button type="button" className="check-dismiss" onClick={onDismiss}>Dismiss</button>
          )}
          <button type="button" className="check-btn" disabled={locked || leaving} onClick={onSign}>
            {signing ? 'Signing…' : leaving ? 'Paid' : 'Sign & pay'}
          </button>
        </div>
        <div className="check-micr" aria-hidden="true">
          :011000138: 4821 0057 {String(pay.request_id).padStart(4, '0')}
        </div>
        {leaving && <span className="check-paid" aria-hidden="true">PAID</span>}
      </article>
    </div>
  )
}

function BankCounter({ cash, promised }: { cash: CashView | null; promised: number }) {
  const balance = cash?.balance ?? null
  const [prev, setPrev] = useState<number | null>(balance)
  const [drop, setDrop] = useState<{ amount: number; n: number } | null>(null)
  if (balance !== prev) {
    setPrev(balance)
    if (prev != null && balance != null && balance < prev - 0.004) {
      setDrop({ amount: prev - balance, n: (drop?.n ?? 0) + 1 })
    }
  }
  useEffect(() => {
    if (!drop) return
    const t = window.setTimeout(() => setDrop(null), 2600)
    return () => window.clearTimeout(t)
  }, [drop])

  const committed = cash ? (cash.committed ?? promised) : null
  const available = cash ? (cash.available ?? cash.balance - (committed ?? 0)) : null
  const base = Math.max(balance ?? 0, (committed ?? 0) + Math.max(available ?? 0, 0), 1)
  const usedPct = committed != null ? Math.min(100, (Math.max(committed, 0) / base) * 100) : 0
  const freePct = available != null ? Math.min(100 - usedPct, (Math.max(available, 0) / base) * 100) : 0
  const short = available != null && available < 0

  return (
    <section className="bank" aria-label="Bank account">
      <div className="bank-head">
        <span className="bank-label">Checking</span>
        {cash?.account && <span className="bank-account">{cash.account}</span>}
      </div>
      <div className="bank-window">
        <Odometer value={balance} />
        {drop && <span key={`flash-${drop.n}`} className="bank-flash" aria-hidden="true" />}
        {drop && (
          <span key={`drop-${drop.n}`} className="bank-drop" role="status">
            ▼ {usd(drop.amount)}
          </span>
        )}
      </div>
      <div className={`bank-bar ${short ? 'is-short' : ''}`} aria-hidden="true">
        <span className="bank-bar-used" style={{ width: `${usedPct}%` }} />
        <span className="bank-bar-free" style={{ width: `${freePct}%` }} />
      </div>
      <p className="bank-legend">
        <span><i className="bank-key bank-key-used" />Promised to waiting payments <b>{usd(committed)}</b></span>
        <span className="bank-dot" aria-hidden="true">·</span>
        <span><i className="bank-key bank-key-free" />Free <b className={short ? 'is-short' : ''}>{usd(available)}</b></span>
      </p>
    </section>
  )
}
