// Above the owner's desk: the decisions only the owner makes besides payments.
// Memos from the boss are escalated trade-offs, with one button per option; clicking one sends that choice.
// Calendar memos: a ticket waits for a delivery after today's shop date; one click moves the date there.
// Discount approvals appear only when an agent asked for a price beyond its policy limit (list price under
// 10 units, up to 10% off at 10+ units, up to 15% at 20+) and the shop put that request on the owner's desk:
// the owner approves it down to a price (prefilled with the one asked for) or declines it.
// Renders nothing when there is nothing to decide.
import { useState, type FormEvent } from 'react'
import { agentName } from './agents'
import type {
  DateMoveResult, DecideResult, DecisionsResponse, DiscountDeclineResult, DiscountResult, DiscountTicket, Escalation,
  TicketView,
} from './types'
import './decisions.css'

export interface OwnerDecisionsProps {
  decisions: DecisionsResponse | null
  tickets: TicketView[]
  shopToday: string | null
  running: boolean
  busy: string | null
  onDecide: (escalationId: number, choice: number) => Promise<DecideResult | null>
  onApproveDiscount: (ticketId: number, minUnitPrice: number) => Promise<DiscountResult | null>
  onDeclineDiscount: (ticketId: number) => Promise<DiscountDeclineResult | null>
  onAdvanceDate: (days: number) => Promise<DateMoveResult | null>
}

const MAX_DATE_MOVE = 31 // the backend moves the shop date at most 31 days per click

const usd = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const pct = (n: number) => `${Number(n.toFixed(1))}%` // 15 -> '15%', 12.5 -> '12.5%'

// 'YYYY-MM-DD' read as a local date (no time-zone shift), plus some days.
function localDate(iso: string, plusDays = 0): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? new Date(+m[1], +m[2] - 1, +m[3] + plusDays) : null
}

// Whole days from one shop date to another (rounded, so a daylight-saving hour never counts).
function daysBetween(fromIso: string, toIso: string): number | null {
  const a = localDate(fromIso)
  const b = localDate(toIso)
  return a && b ? Math.round((b.getTime() - a.getTime()) / 86400000) : null
}

function niceDate(iso: string, plusDays = 0): string {
  const d = localDate(iso, plusDays)
  return d ? d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : iso
}

export function OwnerDecisions(p: OwnerDecisionsProps) {
  const { decisions, busy, onDecide, onApproveDiscount, onDeclineDiscount } = p
  const memos = decisions?.escalations ?? []
  // Only real requests: a ticket shows up here when an agent asked for a price the shop refused it.
  const discounts = (decisions?.discount_tickets ?? []).filter((t) => t.requested_unit_price != null)
  const today = p.shopToday
  const deliveries = today == null ? [] : p.tickets
    .filter((t) => t.state !== 'resolved' && t.waiting_on_date && (daysBetween(today, t.waiting_on_date) ?? 0) >= 1)
    .sort((a, b) => (a.waiting_on_date ?? '').localeCompare(b.waiting_on_date ?? '') || a.id - b.id)
  if (!memos.length && !deliveries.length && !discounts.length) return null

  return (
    <section className="dec" aria-label="Decisions waiting for you">
      {memos.length > 0 && (
        <div className="dec-group">
          <h3 className="dec-title">Memos from the boss <b>{memos.length}</b></h3>
          {memos.map((m) => (
            <Memo key={m.escalation_id} memo={m} busy={busy} onDecide={onDecide} />
          ))}
        </div>
      )}
      {today != null && deliveries.length > 0 && (
        <div className="dec-group">
          <h3 className="dec-title">Deliveries on the calendar <b>{deliveries.length}</b></h3>
          {deliveries.map((t) => (
            <DateMemo key={t.id} ticketId={t.id} date={t.waiting_on_date ?? today} today={today}
                      locked={p.running || busy !== null} moving={busy === 'date'} onAdvanceDate={p.onAdvanceDate} />
          ))}
        </div>
      )}
      {discounts.length > 0 && (
        <div className="dec-group">
          <header className="dec-head">
            <h3 className="dec-title">Discount approvals <b>{discounts.length}</b></h3>
            <p className="dec-policy">
              Agents' limit: list price under 10 units, up to 10% off at 10+, up to 15% at 20+, one price per
              ticket. They asked for more:
            </p>
          </header>
          {discounts.map((t) => (
            <DiscountCard key={t.ticket_id} ticket={t} busy={busy}
                          onApprove={onApproveDiscount} onDecline={onDeclineDiscount} />
          ))}
        </div>
      )}
    </section>
  )
}

interface MemoProps {
  memo: Escalation
  busy: string | null
  onDecide: OwnerDecisionsProps['onDecide']
}

// A cream memo slip clipped to the board: the boss's question, the recommendation, and the options.
function Memo({ memo, busy, onDecide }: MemoProps) {
  const [picked, setPicked] = useState<number | null>(null)
  const sending = busy === `decide-${memo.escalation_id}`

  const pick = async (choice: number) => {
    setPicked(choice)
    const r = await onDecide(memo.escalation_id, choice)
    if (!r) setPicked(null) // refused: the memo stays and the banner says why
  }

  return (
    <article className={`dec-memo ${sending ? 'is-sending' : ''}`}
             aria-label={`Memo from the boss about ticket #${memo.ticket_id}`}>
      <span className="dec-clip" aria-hidden="true" />
      <header className="dec-memo-head">
        <span className="dec-memo-kind">MEMO</span>
        <span className="dec-memo-no">Ticket #{memo.ticket_id}</span>
      </header>
      <p className="dec-memo-from">
        <b>From:</b> {agentName(memo.raised_by ?? 'boss')} <span aria-hidden="true">·</span> <b>To:</b> You
      </p>
      <p className="dec-memo-q">{memo.question}</p>
      {memo.recommendation && (
        <p className="dec-memo-rec">
          <span className="dec-rec-label">Boss recommends</span>
          <i>{memo.recommendation}</i>
        </p>
      )}
      <div className="dec-options" role="group" aria-label="Your decision">
        {memo.options.map((o) => (
          <button key={o.choice} type="button" className={`dec-option ${picked === o.choice ? 'is-picked' : ''}`}
                  disabled={busy !== null} onClick={() => pick(o.choice)}>
            <span className="dec-option-n">{o.choice}</span>
            <span className="dec-option-text">{o.option}</span>
          </button>
        ))}
      </div>
      {sending && <p className="dec-note" role="status">Sending your decision to the boss…</p>}
    </article>
  )
}

interface DateMemoProps {
  ticketId: number
  date: string // the delivery date the ticket waits on, after today
  today: string // the shop date
  locked: boolean // the team is running or another click is on its way
  moving: boolean
  onAdvanceDate: OwnerDecisionsProps['onAdvanceDate']
}

// A tear-off calendar page: the delivery date a ticket waits on, and one click to move the shop date there.
// The backend then wakes the team, so the ticket goes on to Resolved without "Start the team".
function DateMemo({ ticketId, date, today, locked, moving, onAdvanceDate }: DateMemoProps) {
  const n = daysBetween(today, date) ?? 0
  const days = Math.min(n, MAX_DATE_MOVE)
  const d = localDate(date)

  const move = async () => {
    if (!confirm(`Move the shop date from ${niceDate(today)} to ${niceDate(today, days)}? `
      + `The delivery for ticket #${ticketId} arrives ${niceDate(date)}.`)) return
    await onAdvanceDate(days)
  }

  return (
    <article className="dec-cal" aria-label={`Delivery for ticket #${ticketId}`}>
      <span className="dec-cal-page" aria-hidden="true">
        <span className="dec-cal-month">{d ? d.toLocaleDateString('en-US', { month: 'short' }) : '—'}</span>
        <span className="dec-cal-day">{d ? d.getDate() : '?'}</span>
      </span>
      <div className="dec-cal-body">
        <p className="dec-cal-text">
          Delivery for <b>#{ticketId}</b> arrives <b>{niceDate(date)}</b>.
          {' '}Move the shop date +{n} day{n === 1 ? '' : 's'}?
        </p>
        <button type="button" className="dec-cal-go" disabled={locked} onClick={move}
                title={locked ? 'Wait until the team finishes to move the date' : undefined}>
          {moving ? 'Moving…' : `Move date +${days} day${days === 1 ? '' : 's'}`}
        </button>
        {n > MAX_DATE_MOVE && (
          <p className="dec-hint">The date moves at most {MAX_DATE_MOVE} days per click; click again after.</p>
        )}
      </div>
    </article>
  )
}

interface DiscountCardProps {
  ticket: DiscountTicket
  busy: string | null
  onApprove: OwnerDecisionsProps['onApproveDiscount']
  onDecline: OwnerDecisionsProps['onDeclineDiscount']
}

// An agent's request for a price beyond its limit: what was asked, by whom and why, the ticket's prices,
// and the lowest unit price the owner allows (prefilled with the price asked for), or a decline.
function DiscountCard({ ticket, busy, onApprove, onDecline }: DiscountCardProps) {
  const [draft, setDraft] = useState<string | null>(null) // null: the field shows the price asked for
  const [problem, setProblem] = useState<string | null>(null)
  const saving = busy === `discount-${ticket.ticket_id}`
  const asked = ticket.requested_unit_price
  const value = draft ?? (asked != null ? asked.toFixed(2) : '')
  const amount = value.trim() === '' ? NaN : Math.round(Number(value) * 100) / 100 // in cents, as sent
  const valid = Number.isFinite(amount) && amount > 0
  const pctOff = valid && ticket.list_price ? ((ticket.list_price - amount) / ticket.list_price) * 100 : null
  const belowCost = valid && ticket.unit_cost != null && amount < ticket.unit_cost
  const askedPct = ticket.requested_discount_pct
    ?? (asked != null && ticket.list_price ? ((ticket.list_price - asked) / ticket.list_price) * 100 : null)
  const who = ticket.requested_by ? agentName(ticket.requested_by) : 'An agent'

  const submit = async (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault()
    if (!valid) {
      setProblem('Enter a unit price above $0.')
      return
    }
    setProblem(null)
    const r = await onApprove(ticket.ticket_id, amount)
    if (r) setDraft(null)
    else setProblem('Not saved, see the message above.')
  }

  const decline = async () => {
    setProblem(null)
    const r = await onDecline(ticket.ticket_id)
    if (!r) setProblem('Not declined, see the message above.')
  }

  return (
    <form className="dec-disc" onSubmit={submit} noValidate
          aria-label={`Discount request for ticket #${ticket.ticket_id}`}>
      <p className="dec-disc-head" title={`#${ticket.ticket_id} · ${ticket.requester} · ${ticket.subject}`}>
        <b>#{ticket.ticket_id}</b> · {ticket.requester}
      </p>
      <p className="dec-ask">
        Asks <b>{usd(asked)}</b> per unit{askedPct != null && <> · <b>{pct(askedPct)} off</b></>}
        {ticket.limit_pct != null && <span className="dec-limit">agent limit {pct(ticket.limit_pct)}</span>}
      </p>
      <dl className="dec-prices">
        <div><dt>List price</dt><dd>{usd(ticket.list_price)}</dd></div>
        <div><dt>Unit cost</dt><dd>{usd(ticket.unit_cost)}</dd></div>
        {ticket.agreed_unit_price != null && (
          <div><dt>Agreed</dt><dd>{usd(ticket.agreed_unit_price)}</dd></div>
        )}
        {ticket.owner_min_unit_price != null && (
          <div className="is-owner"><dt>Your minimum</dt><dd>{usd(ticket.owner_min_unit_price)}</dd></div>
        )}
      </dl>
      <p className="dec-why">
        <b>{who}:</b> {ticket.reason ?? 'No reason given.'}
      </p>
      <div className="dec-disc-row">
        <label className="dec-price">
          <span className="dec-sr">Lowest unit price you allow for ticket #{ticket.ticket_id}</span>
          <span aria-hidden="true">$</span>
          <input type="number" inputMode="decimal" min="0.01" step="0.01" placeholder="0.00" value={value}
                 disabled={saving}
                 onChange={(e) => { setDraft(e.target.value); setProblem(null) }} />
        </label>
        <button type="submit" className="dec-ok" disabled={busy !== null}>
          {saving ? 'Saving…' : `Approve down to ${valid ? usd(amount) : '$'}`}
        </button>
        <button type="button" className="dec-no" disabled={busy !== null} onClick={decline}>Decline</button>
      </div>
      {pctOff != null && (
        <p className={`dec-hint ${belowCost ? 'is-warn' : ''}`}>
          {pctOff >= 0 ? `${pctOff.toFixed(1)}% off list` : 'Above list price'}
          {belowCost ? ' · below unit cost, the shop will refuse it' : ''}
        </p>
      )}
      {problem && <p className="dec-problem" role="alert">{problem}</p>}
    </form>
  )
}
