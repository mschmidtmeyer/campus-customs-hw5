// The ticket board: every ticket is a sticky note pinned to a cork board with a Yale-blue pushpin.
// A note shows the lead's mini Handsome Dan, what is waiting on the owner, a 5-step progress strip
// and, under it, the owner's next step ("Next: Move the shop date to 2026-09-05").
// The team works on up to 3 tickets at once; start another while all run slots are busy and it is
// queued: the team takes it as soon as one of its runs ends. The strip shows real work even when no run
// is live (after a run or a backend restart): a ticket the agents already wrote notes on stays "Working"
// and its button says "Continue the team".
// Resolved tickets get a rubber "RESOLVED" stamp, look filed away, and drop below a "Resolved" divider
// once the stamp has landed, so open work stays on top.
import { useMemo } from 'react'
import type { CSSProperties, MouseEvent } from 'react'
import { AGENT_BY_ID } from './agents'
import type { AgentInfo } from './agents'
import { Costume } from './Costumes'
import { Dan } from './Dan'
import type { TicketView } from './types'
import './corkboard.css'

const STEPS = ['Assigned', 'Working', 'Waiting for you', 'Ready to close', 'Resolved']

const TYPE_LABEL: Record<string, string> = {
  customer_order: 'Customer order',
  rent_notice: 'Rent notice',
  price_override: 'Price change',
  facility_issue: 'Facility issue',
}

const NOTE_COLOR: Record<string, string> = {
  customer_order: 'yellow',
  rent_notice: 'pink',
  price_override: 'blue',
  facility_issue: 'mint',
}

function typeLabel(type: string): string {
  const known = TYPE_LABEL[type]
  if (known) return known
  const words = type.replace(/_/g, ' ').trim()
  return words ? words[0].toUpperCase() + words.slice(1) : 'Ticket'
}

// Stable pseudo-random number in [0, 1) per ticket id, so a note keeps its tilt between renders.
function jitter(id: number, salt = 0): number {
  const x = Math.sin(id * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

/**
 * Where a ticket is on its way through the office:
 * 0 new · 1 assigned · 2 working (running, queued, or assigned and the agents already left notes on it)
 * · 3 waiting for you (a check, a memo, or a delivery that needs the shop date moved) · 4 ready to close
 * · 5 resolved. The furthest stage that applies wins.
 */
export function progressStep(t: TicketView, runningTickets: readonly number[], queued: readonly number[] = []): number {
  if (t.state === 'resolved') return 5
  if (t.status === 'ready_to_close') return 4
  if (t.pending_payments.length > 0 || t.open_escalations > 0 || t.waiting_on_date) return 3
  if (runningTickets.includes(t.id) || queued.includes(t.id)) return 2
  if (t.status === 'assigned' && t.agent_notes > 0) return 2
  if (t.status === 'open') return 0
  return 1
}

export interface CorkboardProps {
  tickets: TicketView[]
  selectedId: number | null
  runningTickets: number[] // tickets the team works on right now (up to 3 at once)
  queued: number[] // tickets waiting for a free run slot, in order
  busy: string | null
  stampIds: Set<number>
  onSelect: (id: number) => void
  onStart: (id: number) => void
}

export function Corkboard(p: CorkboardProps) {
  // Open tickets first, then resolved ones. A ticket that was just stamped keeps its place
  // until the stamp animation is over (its id leaves stampIds), then moves down.
  const { open, filed } = useMemo(() => {
    const byId = [...p.tickets].sort((a, b) => a.id - b.id)
    const isFiled = (t: TicketView) => t.state === 'resolved' && !p.stampIds.has(t.id)
    return { open: byId.filter((t) => !isFiled(t)), filed: byId.filter(isFiled) }
  }, [p.tickets, p.stampIds])

  const slot = (t: TicketView, isFiled: boolean) => {
    const resolved = t.state === 'resolved'
    const isRunning = p.runningTickets.includes(t.id)
    const isQueued = !isRunning && p.queued.includes(t.id)
    return (
      <li key={t.id} className={`cork-slot ${isFiled ? 'is-filed' : ''}`}>
        <Note
          t={t}
          step={progressStep(t, p.runningTickets, p.queued)}
          selected={p.selectedId === t.id}
          isRunning={isRunning}
          isQueued={isQueued}
          teamBusy={p.runningTickets.length > 0}
          starting={p.busy === `run-${t.id}`}
          disabled={resolved || isRunning || isQueued || p.busy !== null}
          thump={p.stampIds.has(t.id)}
          onSelect={p.onSelect}
          onStart={p.onStart}
        />
      </li>
    )
  }

  // One flat keyed list, so a note that turns resolved is moved, not remounted.
  const items = [
    ...open.map((t) => slot(t, false)),
    ...(filed.length > 0 ? [
      <li key="filed-divider" className="cork-divider">
        <span>Resolved · {filed.length}</span>
      </li>,
    ] : []),
    ...filed.map((t) => slot(t, true)),
  ]

  return (
    <section className="cork" aria-label="Ticket board">
      {/* Shared ink texture for the RESOLVED stamps: wobbly edges plus tiny gaps where the ink missed. */}
      <svg className="cork-defs" width="0" height="0" aria-hidden="true" focusable="false">
        <defs>
          <filter id="cork-stamp-ink" x="-8%" y="-20%" width="116%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.07" numOctaves="2" seed="7" result="warp" />
            <feDisplacementMap in="SourceGraphic" in2="warp" scale="3" xChannelSelector="R" yChannelSelector="G" result="rough" />
            <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed="3" result="grain" />
            <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  6 0 0 0 -1.85" result="speckle" />
            <feComposite in="rough" in2="speckle" operator="in" />
          </filter>
        </defs>
      </svg>

      <div className="cork-frame">
        <h2 className="cork-title">Ticket board</h2>
        <div className="cork-surface">
          {p.tickets.length === 0 ? (
            <div className="cork-empty">
              <span className="note-pin" aria-hidden="true" />
              No tickets on the board yet.
            </div>
          ) : (
            <ul className="cork-notes">{items}</ul>
          )}
        </div>
      </div>
    </section>
  )
}

interface NoteProps {
  t: TicketView
  step: number
  selected: boolean
  isRunning: boolean
  isQueued: boolean
  teamBusy: boolean // the team is working on other tickets: this one starts if a run slot is free, else it queues
  starting: boolean
  disabled: boolean
  thump: boolean
  onSelect: (id: number) => void
  onStart: (id: number) => void
}

function Note({ t, step, selected, isRunning, isQueued, teamBusy, starting, disabled, thump, onSelect, onStart }: NoteProps) {
  const resolved = t.state === 'resolved'
  // The agents already worked on it: the button picks their work back up. Never on an open ticket (the
  // backend's next step says 'Start the team' there) or a resolved one.
  const worked = !resolved && t.status !== 'open' && t.agent_notes > 0
  const lead: AgentInfo | undefined = t.lead ? AGENT_BY_ID[t.lead] : undefined
  const style = {
    '--tilt': `${(jitter(t.id) * 5 - 2.5).toFixed(2)}deg`,
    '--pin-x': `${(44 + jitter(t.id, 1) * 12).toFixed(1)}%`,
    '--stamp-tilt': `${(-17 + jitter(t.id, 2) * 10).toFixed(1)}deg`,
  } as CSSProperties
  const cls = [
    'note',
    `note-${NOTE_COLOR[t.type] ?? 'cream'}`,
    selected ? 'is-selected' : '',
    resolved ? 'is-resolved' : '',
    isRunning ? 'is-running' : '',
    resolved && thump ? 'is-thumped' : '',
  ].filter(Boolean).join(' ')

  const start = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    onStart(t.id)
  }

  return (
    <article className={cls} style={style}>
      <span className="note-pin" aria-hidden="true" />
      {/* One invisible button covers the whole note, so a click anywhere selects it. */}
      <button type="button" className="note-select" aria-pressed={selected} onClick={() => onSelect(t.id)}>
        <span className="note-sr">Show ticket #{t.id}: {t.subject}</span>
      </button>

      <div className="note-body">
        <header className="note-head">
          <span className="note-id">#{t.id}</span>
          <span className="note-type">{typeLabel(t.type)}</span>
        </header>
        <h3 className="note-subject">{t.subject}</h3>
        <p className="note-from">from {t.requester}</p>

        {(lead || isQueued || t.pending_payments.length > 0 || t.open_escalations > 0) && (
          <div className="note-row">
            {lead && (
              <span className="note-lead" title={`Lead: ${lead.name}`}>
                <span className="note-lead-dog">
                  <Dan size={34} outfit={lead.outfit} accent={lead.accent} working={isRunning}
                       costume={<Costume agent={lead.id} />} label={`Lead: ${lead.name}`} />
                </span>
                <span className="note-lead-text">
                  <small>Lead</small>
                  {lead.name}
                </span>
              </span>
            )}
            <span className="note-badges">
              {isQueued && (
                <span className="note-badge note-badge-queued" title="The team takes this ticket as soon as one of its runs ends">
                  Queued
                </span>
              )}
              {t.pending_payments.length > 0 && (
                <span className="note-badge note-badge-ok"
                      title={`${t.pending_payments.length} payment${t.pending_payments.length === 1 ? '' : 's'} waiting for your approval`}>
                  Needs your OK
                </span>
              )}
              {t.open_escalations > 0 && (
                <span className="note-badge note-badge-ask" title="The boss brought a question to you">Asked the owner</span>
              )}
            </span>
          </div>
        )}

        <ol className="note-steps" aria-label={`Progress: ${step === 0 ? 'new, not started yet' : STEPS[step - 1]}`}>
          {STEPS.map((label, i) => {
            const n = i + 1
            const on = n <= step
            const now = n === step && isRunning && !resolved
            return (
              <li key={label} className={`note-step ${on ? 'is-on' : ''} ${now ? 'is-now' : ''}`}
                  aria-current={n === step ? 'step' : undefined}>
                <span className="note-dot" />
                <span className="note-step-label">{label}</span>
              </li>
            )
          })}
        </ol>

        {!resolved && t.next_step && (
          <p className="note-next" title="Your next step on this ticket">
            <b>Next:</b> {t.next_step}
          </p>
        )}

        <button type="button" className={`note-start ${isRunning ? 'is-running' : ''} ${isQueued ? 'is-queued' : ''}`}
                disabled={disabled} onClick={start}
                title={teamBusy && !isRunning && !isQueued && !resolved
                  ? 'Up to 3 tickets run at once: this one starts if a slot is free, else it waits in the queue'
                  : undefined}>
          {isRunning ? 'Working…' : starting ? 'Starting…' : isQueued ? 'Queued' : worked ? 'Continue the team' : 'Start the team'}
        </button>
      </div>

      {resolved && (
        <svg className={`note-stamp ${thump ? 'is-new' : ''}`} viewBox="0 0 200 70" aria-hidden="true" focusable="false">
          <g filter="url(#cork-stamp-ink)">
            <rect x="5" y="5" width="190" height="60" rx="8" fill="none" stroke="currentColor" strokeWidth="5" />
            <rect x="13" y="13" width="174" height="44" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
            <text x="100" y="46" textAnchor="middle" fill="currentColor" fontSize="29"
                  textLength="156" lengthAdjust="spacingAndGlyphs">RESOLVED</text>
          </g>
        </svg>
      )}
    </article>
  )
}
