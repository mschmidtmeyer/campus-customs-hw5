// The Campus Customs back-office desk on one screen: the ticket corkboard on the left, the office
// floor (the boss's glass corner office and four desks) above the selected ticket in the middle,
// and on the right the owner's decisions (the boss's memos, discount requests from the agents) above the
// owner's desk with checks, the bank counter and the boss's cash plan. Only the owner moves the shop date,
// from the top bar (or from a calendar memo when a ticket waits on a delivery). After the owner's clicks the backend hands the
// tickets back to the team by itself, and a short notice under the top bar says which ones.
// The team can work on up to 3 tickets at once: several desks light up, each with its ticket's '#id'.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AGENT_BY_ID } from './agents'
import { BossPlan } from './BossPlan'
import { Confetti } from './Confetti'
import { Corkboard } from './Corkboard'
import { Desk } from './Desk'
import { handoffs, liveAgents } from './derive'
import { FlipCalendar } from './FlipCalendar'
import { OwnerDecisions } from './OwnerDecisions'
import { OwnerDesk, type OwnerPayment } from './OwnerDesk'
import { PaperPlanes, type Flight } from './PaperPlanes'
import { ReportCards } from './ReportCards'
import { useSound } from './sound'
import { TicketStory } from './TicketStory'
import type { AgentId, ApproveResult } from './types'
import { useDesk } from './useDesk'

const usd = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

// 'YYYY-MM-DD' plus some days, read as a local date so the text never shifts a day by time zone.
function shopDate(iso: string, plusDays = 0): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  return new Date(+m[1], +m[2] - 1, +m[3] + plusDays)
    .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

export default function App() {
  const desk = useDesk()
  const sound = useSound()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [flights, setFlights] = useState<Flight[]>([])
  const [stampIds, setStampIds] = useState<Set<number>>(new Set())
  const [burst, setBurst] = useState(0)
  const [clock, setClock] = useState(Date.now())
  const deskEls = useRef<Record<string, HTMLElement | null>>({})
  const seenSeq = useRef(0)
  const lastTick = useRef(0)
  const prevStates = useRef<Record<number, string> | null>(null)
  const soundRef = useRef(sound)
  soundRef.current = sound

  // Re-evaluate "who is working" every 2 s even when no new event arrives.
  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 2000)
    return () => clearInterval(t)
  }, [])

  const runningTickets = desk.runningTickets
  // Queued tickets count too: one may have just started before the next board refresh says so.
  const activeTickets = useMemo(() => [...runningTickets, ...desk.queued], [runningTickets, desk.queued])
  const live = useMemo(() => liveAgents(desk.events, desk.running, clock, activeTickets),
    [desk.events, desk.running, clock, activeTickets])
  const someoneWorking = Object.values(live).some((a) => a.working)

  const ticket = useMemo(() => {
    const byId = desk.tickets.find((t) => t.id === selectedId)
    return byId ?? desk.tickets.find((t) => runningTickets.includes(t.id))
      ?? desk.tickets.find((t) => t.state === 'open') ?? desk.tickets[0]
  }, [desk.tickets, selectedId, runningTickets])

  const payments: OwnerPayment[] = useMemo(
    () => desk.tickets.flatMap((t) => t.pending_payments.map((p) => ({ ...p, ticketId: t.id }))),
    [desk.tickets],
  )
  // Memos from the boss plus the agents' pending requests for a deeper discount: both wait for the owner.
  const memoCount = (desk.decisions?.escalations.length ?? 0) + (desk.decisions?.discount_tickets.length ?? 0)
  const waitingCount = payments.length + memoCount

  // New events since the page opened: paper airplanes for messages, a soft tick for thoughts.
  useEffect(() => {
    if (desk.freshFrom == null) return
    const start = Math.max(seenSeq.current, desk.freshFrom)
    const fresh = desk.events.filter((e) => e.seq > start)
    if (!fresh.length) return
    seenSeq.current = fresh[fresh.length - 1].seq
    const planes = handoffs(fresh).map((h) => ({ id: `msg-${h.seq}`, from: h.from, to: h.to, text: h.text }))
    if (planes.length) {
      setFlights((f) => [...f, ...planes])
      soundRef.current.play('whoosh')
    } else if (fresh.some((e) => e.kind === 'model_response') && Date.now() - lastTick.current > 600) {
      lastTick.current = Date.now()
      soundRef.current.play('tick')
    }
  }, [desk.events, desk.freshFrom])

  // A ticket that turns resolved gets the RESOLVED stamp, confetti and the stamp sound.
  // Layout effect: its id is in stampIds before the first paint, so the note never jumps down early.
  useLayoutEffect(() => {
    const now = Object.fromEntries(desk.tickets.map((t) => [t.id, t.state]))
    const before = prevStates.current
    prevStates.current = now
    if (!before) return
    const resolved = desk.tickets.filter((t) => t.state === 'resolved' && before[t.id] === 'open').map((t) => t.id)
    if (!resolved.length) return
    setStampIds((s) => new Set([...s, ...resolved]))
    setBurst((b) => b + 1)
    soundRef.current.play('stamp')
    setTimeout(() => setStampIds((s) => new Set([...s].filter((id) => !resolved.includes(id)))), 2600)
  }, [desk.tickets])

  const onPaid = useCallback((r: ApproveResult) => {
    soundRef.current.play('chaching')
    setFlights((f) => [...f, { id: `pay-${r.request_id}-${Date.now()}`, from: 'owner', to: 'accounting',
      text: `Approved: ${usd(r.amount)} to ${r.payee ?? 'payee'}` }])
  }, [])

  const start = useCallback(async (id: number) => {
    setSelectedId(id)
    await desk.startRun(id)
  }, [desk])

  // The owner's answers fly off as paper planes: decisions to the boss, discounts to customer service.
  const fly = useCallback((to: AgentId, text: string) => {
    soundRef.current.play('whoosh')
    setFlights((f) => [...f, { id: `own-${to}-${Date.now()}`, from: 'owner', to, text }])
  }, [])

  const decide = useCallback(async (escalationId: number, choice: number) => {
    const r = await desk.decide(escalationId, choice)
    if (r) fly('boss', `Decided: ${r.decision}`)
    return r
  }, [desk, fly])

  const approveDiscount = useCallback(async (ticketId: number, minUnitPrice: number) => {
    const r = await desk.approveDiscount(ticketId, minUnitPrice)
    if (r) fly('customer_service', `#${r.ticket_id}: OK down to ${usd(r.min_unit_price)}`)
    return r
  }, [desk, fly])

  const declineDiscount = useCallback(async (ticketId: number) => {
    const r = await desk.declineDiscount(ticketId)
    if (r) fly('customer_service', `#${r.ticket_id}: keep the policy price`)
    return r
  }, [desk, fly])

  // Only the owner moves the shop date; the calendar flips when the board refresh brings the new date.
  const moveDate = useCallback(async (days: number) => {
    const today = desk.shopToday
    if (!today) return
    if (!confirm(`Move the shop date from ${shopDate(today)} to ${shopDate(today, days)}? `
      + 'Vendor lead times count in shop days.')) return
    await desk.advanceDate(days)
  }, [desk])
  const dateLocked = desk.running || desk.busy !== null || !desk.shopToday

  const deskRef = (id: string) => (el: HTMLElement | null) => { deskEls.current[id] = el }
  const deskFor = (id: AgentId, corner = false) => (
    <div className={`desk-slot ${corner ? 'desk-slot-corner' : ''}`}>
      <Desk agent={AGENT_BY_ID[id]} live={live[id]} dim={someoneWorking && !live[id].working}
            corner={corner} deskRef={deskRef(id)} />
    </div>
  )

  // 'Working on #101, #103 · queued #102' while the team runs, else how the newest finished run ended.
  const tags = (ids: number[]) => ids.map((id) => `#${id}`).join(', ')
  const queuedText = desk.queued.length ? `queued ${tags(desk.queued)}` : ''
  const lastRun = desk.runs.find((r) => r.status === 'finished' || r.status === 'error') // newest first
  const status = desk.running
    ? [runningTickets.length ? `Working on ${tags(runningTickets)}` : 'The team is working', queuedText]
      .filter(Boolean).join(' · ')
    : queuedText ? `Starting ${queuedText}`
      : lastRun?.status === 'finished'
        ? `Last run on #${lastRun.ticket_id} finished (${lastRun.stop_reason ?? 'done'}, ${lastRun.turns} turns)`
        : lastRun ? `Last run on #${lastRun.ticket_id} stopped: ${lastRun.error ?? 'error'}`
          : 'Pick a ticket on the board and start the team'
  return (
    <div className="office">
      <header className="office-top">
        <div className="brand">
          <span className="brand-pennant">Y</span>
          <div>
            <h1>Campus Customs · Back Office</h1>
            <p title={status}>
              {desk.running && <span className="run-dot" />}
              {status}
            </p>
          </div>
        </div>
        <div className="top-mid">
          <FlipCalendar date={desk.shopToday} compact />
          <div className="date-move" role="group" aria-label="Move the shop date"
               title={desk.running ? 'Wait until every team run finishes to move the date'
                 : 'Only you move the shop date. Vendor lead times count in shop days.'}>
            <span className="date-move-label">Move date</span>
            <button type="button" disabled={dateLocked} onClick={() => moveDate(1)}>+1 day</button>
            <button type="button" disabled={dateLocked} onClick={() => moveDate(5)}>+5 days</button>
          </div>
          <div className="top-cash" title="Checking balance · payments, memos and discount requests waiting for you">
            <span>Checking <strong>{usd(desk.cash?.balance)}</strong></span>
            <span className={`top-wait ${waitingCount ? 'is-on' : ''}`}>
              {waitingCount ? `${waitingCount} waiting` : 'none waiting'}
            </span>
          </div>
        </div>
        <div className="top-actions">
          <button className={`sound-toggle ${sound.on ? 'on' : ''}`} onClick={sound.toggle}
                  aria-pressed={sound.on} title={sound.on ? 'Sounds on' : 'Sounds off'}>
            {sound.on ? '🔊 Sounds on' : '🔈 Sounds off'}
          </button>
          <button className="reset-btn" disabled={desk.running || desk.busy !== null}
                  onClick={() => { if (confirm('Reset the shop database to the original values for a fresh run? The audit trail is kept.')) desk.reset() }}>
            Reset shop
          </button>
        </div>
      </header>

      {(desk.error || desk.notice) && (
        <div className="office-banners">
          {desk.error && <div className="office-error" role="alert">{desk.error}</div>}
          {desk.notice && <div className="office-notice" role="status">{desk.notice}</div>}
        </div>
      )}

      <main className={`work ${someoneWorking ? 'work-busy' : ''}`}>
        <div className="work-board">
          <BossPlan plan={desk.plan} onSelect={setSelectedId} />
          <Corkboard tickets={desk.tickets} selectedId={ticket?.id ?? null} runningTickets={runningTickets}
                     queued={desk.queued} busy={desk.busy} stampIds={stampIds}
                     onSelect={setSelectedId} onStart={start} />
        </div>

        <div className="work-center">
          <section className="floor" aria-label="Office floor">
            <div className="spot spot-inv card-below">{deskFor('inventory')}</div>
            <section className="corner-office card-below" aria-label="The boss's corner office">
              <span className="corner-door">Boss · Corner office</span>
              <div className="corner-wall" aria-hidden="true">
                <div className="wall-window"><span /><span /></div>
                <div className="wall-pennant">YALE</div>
              </div>
              {deskFor('boss', true)}
            </section>
            <div className="spot spot-acct card-below">{deskFor('accounting')}</div>
            <div className="spot spot-fac">{deskFor('facilities')}</div>
            <div className="spot spot-cs">{deskFor('customer_service')}</div>
          </section>

          {ticket && (
            <section className="ticket-detail" aria-label={`Ticket #${ticket.id}`}>
              <header>
                <h2 title={ticket.subject}>Ticket #{ticket.id}: {ticket.subject}</h2>
                <p>{ticket.requester} · {ticket.state === 'resolved' ? 'Resolved' : ticket.status.replace(/_/g, ' ')}</p>
              </header>
              <div className="detail-grid">
                <ReportCards ticketId={ticket.id} events={desk.events} />
                <TicketStory ticketId={ticket.id} events={desk.events} />
              </div>
            </section>
          )}
        </div>

        <aside className="work-owner" ref={deskRef('owner')}>
          <OwnerDecisions decisions={desk.decisions} tickets={desk.tickets} shopToday={desk.shopToday}
                          running={desk.running} busy={desk.busy}
                          onDecide={decide} onApproveDiscount={approveDiscount} onDeclineDiscount={declineDiscount}
                          onAdvanceDate={desk.advanceDate} />
          <OwnerDesk payments={payments} cash={desk.cash} busy={desk.busy} memos={memoCount}
                     forecast={desk.forecast} onApprove={desk.approve} onPaid={onPaid} />
        </aside>

        <PaperPlanes flights={flights} getDeskEl={(id) => deskEls.current[id] ?? null}
                     onDone={(id) => setFlights((f) => f.filter((x) => x.id !== id))} />
      </main>

      <Confetti burst={burst} />
    </div>
  )
}
