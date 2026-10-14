// "Report cards" for one ticket: what each Handsome Dan did on it. One card per agent that touched
// the ticket, in team order: mini Dan in costume, turns taken, latest turn summary (earlier ones on
// demand), tools used and the messages it sent to teammates.
import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { AGENTS, agentName } from './agents'
import type { AgentInfo } from './agents'
import { Costume } from './Costumes'
import { Dan } from './Dan'
import { agentSummaries, handoffs, toolsUsed } from './derive'
import type { AgentEvent } from './types'
import './reports.css'

interface CardData {
  info: AgentInfo
  turns: number
  status: string | null
  summaries: string[]
  tools: { name: string; count: number }[]
  messages: { seq: number; to: string; text: string }[]
}

const STATUS_LABEL: Record<string, string> = {
  progress: 'Making progress',
  waiting: 'Waiting',
  done: 'Done',
  blocked: 'Blocked',
  budget_stop: 'Out of budget',
  error: 'Hit an error',
}
const MESSAGES_SHOWN = 3

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}

export function ReportCards({ ticketId, events }: { ticketId: number; events: AgentEvent[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({})

  const cards = useMemo<CardData[]>(() => {
    const summaries = agentSummaries(events, ticketId)
    const tools = toolsUsed(events, ticketId)
    const sent = handoffs(events).filter((h) => h.ticketId === ticketId)
    const active = new Set<string>()
    const turns: Record<string, number> = {}
    const status: Record<string, string | null> = {}
    const counts: Record<string, number> = {}
    for (const e of events) {
      if (!e.ticket_ids.includes(ticketId)) continue
      active.add(e.agent)
      if (e.kind === 'turn_end') {
        turns[e.agent] = (turns[e.agent] ?? 0) + 1
        status[e.agent] = e.status
      } else if (e.kind === 'budget_stop' || e.kind === 'error') {
        status[e.agent] = e.kind
      } else if (e.kind === 'tool_call' && e.tool) {
        const key = `${e.agent}:${e.tool}`
        counts[key] = (counts[key] ?? 0) + 1
      }
    }
    return AGENTS.filter((a) => active.has(a.id)).map((info) => ({
      info,
      turns: turns[info.id] ?? 0,
      status: status[info.id] ?? null,
      summaries: summaries[info.id] ?? [],
      tools: (tools[info.id] ?? []).map((name) => ({ name, count: counts[`${info.id}:${name}`] ?? 1 })),
      messages: sent.filter((h) => h.from === info.id).map((h) => ({ seq: h.seq, to: h.to, text: h.text })),
    }))
  }, [events, ticketId])

  const toggle = (key: string) => setOpen((o) => ({ ...o, [key]: !o[key] }))

  return (
    <section className="rep" aria-label={`Report cards for ticket ${ticketId}`}>
      <header className="rep-head">
        <h3>Report cards</h3>
        <span className="rep-ticket">Ticket #{ticketId}</span>
      </header>

      {cards.length === 0 ? (
        <p className="rep-empty">No agent has worked on this ticket yet.</p>
      ) : (
        <div className="rep-grid">
          {cards.map((c) => {
            const key = `${ticketId}:${c.info.id}`
            const isOpen = !!open[key]
            const latest = c.summaries[c.summaries.length - 1]
            const earlier = c.summaries.slice(0, -1)
            const extraMessages = Math.max(0, c.messages.length - MESSAGES_SHOWN)
            const shownMessages = isOpen ? c.messages : c.messages.slice(-MESSAGES_SHOWN)
            const canExpand = earlier.length > 0 || extraMessages > 0
            const style = { '--rep-color': c.info.outfit, '--rep-accent': c.info.accent } as CSSProperties
            return (
              <article key={c.info.id} className="rep-card" style={style}>
                <div className="rep-top">
                  <div className="rep-avatar">
                    <Dan size={44} outfit={c.info.outfit} accent={c.info.accent}
                         costume={<Costume agent={c.info.id} />} label={c.info.name} />
                  </div>
                  <div className="rep-who">
                    <h4>{c.info.name}</h4>
                    <p>{c.info.title}</p>
                    {c.status && (
                      <span className={`rep-status rep-status-${c.status}`}>{STATUS_LABEL[c.status] ?? c.status}</span>
                    )}
                  </div>
                  <div className="rep-turns" title={`${c.turns} finished turn${c.turns === 1 ? '' : 's'} on this ticket`}>
                    <b>{c.turns}</b>
                    <span>{c.turns === 1 ? 'turn' : 'turns'}</span>
                  </div>
                </div>

                <div className="rep-section">
                  <h5>Latest turn</h5>
                  {latest
                    ? <p className="rep-summary">{latest}</p>
                    : <p className="rep-none">Still working on the first turn…</p>}
                  {isOpen && earlier.length > 0 && (
                    <ol className="rep-earlier">
                      {earlier.map((s, i) => (
                        <li key={i}><span className="rep-turn-no">Turn {i + 1}</span> {s}</li>
                      ))}
                    </ol>
                  )}
                </div>

                <div className="rep-section">
                  <h5>Tools used</h5>
                  {c.tools.length === 0 ? (
                    <p className="rep-none">No tools yet.</p>
                  ) : (
                    <div className="rep-chips">
                      {c.tools.map((t) => (
                        <code key={t.name} className="rep-chip">
                          {t.name}{t.count > 1 && <span className="rep-chip-count">×{t.count}</span>}
                        </code>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rep-section">
                  <h5>Messages sent</h5>
                  {c.messages.length === 0 ? (
                    <p className="rep-none">No messages sent.</p>
                  ) : (
                    <ul className="rep-msgs">
                      {!isOpen && extraMessages > 0 && (
                        <li className="rep-more">+{extraMessages} earlier</li>
                      )}
                      {shownMessages.map((m) => (
                        <li key={m.seq} title={m.text}>
                          <span className="rep-msg-to">→ {agentName(m.to)}:</span> {clip(m.text, 120)}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {canExpand && (
                  <button type="button" className="rep-toggle" aria-expanded={isOpen} onClick={() => toggle(key)}>
                    {isOpen ? 'Show less' : 'Show all'}
                  </button>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
