// The story of one ticket, told in time order like a group chat: messages between the Dans as
// bubbles, each finished turn as a small summary card, and the important tool calls as one-line
// actions with friendly verbs. Shows the latest 60 entries; older ones load on request.
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { AGENT_BY_ID, agentName } from './agents'
import type { AgentEvent } from './types'
import './reports.css'

type Args = Record<string, unknown>

interface Base { seq: number; time: string; agent: string }
type Entry =
  | (Base & { type: 'message'; to: string; text: string })
  | (Base & { type: 'turn'; text: string | null; status: string | null })
  | (Base & { type: 'action'; tool: string; verb: string; detail: string | null; preview: boolean; outcome: string | null })
  | (Base & { type: 'alert'; text: string })

const PAGE = 60

const VERBS: Record<string, string> = {
  assign_ticket: 'assigned the ticket',
  set_payment_priority: 'set the payment priority',
  request_payment: 'asked the owner to approve a payment',
  pay_bill: 'paid a bill',
  link_invoice_stock: 'linked an invoice as incoming stock',
  order_restock: 'ordered a restock',
  confirm_restock: 'confirmed a restock',
  cancel_restock: 'cancelled a restock',
  decide_partial_shipment: 'decided a partial shipment',
  receive_stock: 'received a delivery',
  fulfill_customer_order: 'worked on the sale',
  apply_discount: 'set a price',
  draft_reply: 'saved a draft reply (not sent)',
  request_close: 'asked to close',
  close_ticket: 'closed the ticket',
  escalate_to_owner: 'asked the owner',
  add_note: 'added a note',
  report_facility_issue: 'reported a facility issue',
  my_work: 'checked its to-do list',
  payment_status: 'checked a payment status',
  cash_overview: 'checked the cash',
  rent_schedule: 'checked the rent schedule',
}

const CHECKED: Record<string, string> = {
  check_stock: 'the stock',
  check_vendor: 'the vendor',
  check_lease: 'the lease',
  check_order: 'the order',
  list_open_tickets: 'the open tickets',
  list_open_bills: 'the open bills',
  read_ticket: 'the ticket',
  read_audit_trail: 'the audit trail',
}

const OUTCOME_LABEL: Record<string, string> = {
  refused: 'refused',
  failed: 'failed',
  denied: 'denied',
  retry: 'retried',
  interrupted: 'interrupted',
}

const TURN_LABEL: Record<string, string> = {
  progress: 'progress',
  waiting: 'waiting',
  done: 'done',
  blocked: 'blocked',
}

// ---------- helpers ----------

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}

const str = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v) : '')

// args is compact JSON; if it was clipped and no longer parses, pull out the simple key/values.
function parseArgs(raw: string | null): Args {
  if (!raw) return {}
  try {
    const v = JSON.parse(raw)
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Args
  } catch {
    /* fall through to the forgiving parser */
  }
  const out: Args = {}
  const re = /"(\w+)"\s*:\s*("(?:[^"\\]|\\.)*"?|-?\d+(?:\.\d+)?|true|false|null)/g
  for (const m of raw.matchAll(re)) {
    const [, key, val] = m
    if (key in out) continue
    if (val.startsWith('"')) {
      const quoted = val.length > 1 && val.endsWith('"') && !val.endsWith('\\"') ? val : `${val}"`
      try {
        out[key] = JSON.parse(quoted)
      } catch {
        out[key] = val.slice(1).replace(/"$/, '')
      }
    } else {
      out[key] = val === 'true' ? true : val === 'false' ? false : val === 'null' ? null : Number(val)
    }
  }
  return out
}

function verbFor(tool: string): string {
  if (VERBS[tool]) return VERBS[tool]
  if (CHECKED[tool]) return `checked ${CHECKED[tool]}`
  const m = /^(check|list|read)_(.+)$/.exec(tool)
  if (m) return `checked the ${m[2].replace(/_/g, ' ')}`
  return `used ${tool.replace(/_/g, ' ')}`
}

function money(v: unknown): string {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : ''
}

function detailFor(tool: string, a: Args): string | null {
  let d = ''
  switch (tool) {
    case 'assign_ticket': {
      const support = Array.isArray(a.support) ? a.support.map((s) => agentName(String(s))).join(', ') : ''
      d = a.lead ? `lead: ${agentName(str(a.lead))}${support ? ` · support: ${support}` : ''}` : ''
      break
    }
    case 'set_payment_priority':
    case 'request_payment':
      d = str(a.reason)
      break
    case 'pay_bill':
      d = a.request_id != null ? `request #${str(a.request_id)}` : ''
      break
    case 'link_invoice_stock':
      d = a.invoice_id != null ? `invoice #${str(a.invoice_id)}` : ''
      break
    case 'order_restock':
      d = [a.qty != null ? `${str(a.qty)} ×` : '', str(a.sku), str(a.size)].filter(Boolean).join(' ')
      break
    case 'confirm_restock':
    case 'receive_stock':
      d = a.order_id != null ? `order #${str(a.order_id)}` : ''
      break
    case 'cancel_restock':
      d = [a.order_id != null ? `order #${str(a.order_id)}` : '', str(a.reason)].filter(Boolean).join(' · ')
      break
    case 'decide_partial_shipment':
      d = a.approve === true
        ? `yes${a.max_qty != null ? `, up to ${str(a.max_qty)}` : ''}`
        : a.approve === false ? 'no' : ''
      if (str(a.note)) d = [d, str(a.note)].filter(Boolean).join(' · ')
      break
    case 'fulfill_customer_order':
      d = a.qty != null ? `${str(a.qty)} pcs` : ''
      break
    case 'apply_discount':
      d = a.unit_price != null ? `${money(a.unit_price)} each` : ''
      break
    case 'draft_reply':
      d = str(a.to_name) ? `to ${str(a.to_name)}` : ''
      break
    case 'request_close':
    case 'close_ticket':
      d = str(a.summary)
      break
    case 'escalate_to_owner':
      d = str(a.question)
      break
    case 'add_note':
      d = str(a.text)
      break
    case 'check_stock':
      d = [str(a.sku), str(a.size)].filter(Boolean).join(' ')
      break
    case 'report_facility_issue':
      d = str(a.subject)
      break
    default:
      d = ''
  }
  return d ? clip(d, 140) : null
}

function hms(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function colorOf(agent: string): string {
  if (agent === 'owner') return '#f2c94c'
  return AGENT_BY_ID[agent]?.outfit ?? '#8aa0bd'
}

function buildStory(events: AgentEvent[], ticketId: number): Entry[] {
  const mine = events.filter((e) => e.ticket_ids.includes(ticketId)).sort((x, y) => x.seq - y.seq)
  const out: Entry[] = []
  const waiting = new Map<string, Entry[]>() // agent|tool -> actions still waiting for their result
  for (const e of mine) {
    const base = { seq: e.seq, time: e.time, agent: e.agent }
    if (e.kind === 'tool_call' && e.tool) {
      const a = parseArgs(e.args)
      if (e.tool === 'send_message') {
        const to = str(a.to_agent)
        if (to || str(a.text)) out.push({ ...base, type: 'message', to, text: str(a.text) })
        continue
      }
      const entry: Entry = {
        ...base, type: 'action', tool: e.tool, verb: verbFor(e.tool), detail: detailFor(e.tool, a),
        preview: a.preview === true, outcome: null,
      }
      out.push(entry)
      const key = `${e.agent}|${e.tool}`
      const queue = waiting.get(key)
      if (queue) queue.push(entry)
      else waiting.set(key, [entry])
    } else if (e.kind === 'tool_result' && e.tool) {
      const entry = waiting.get(`${e.agent}|${e.tool}`)?.shift()
      if (entry && entry.type === 'action') entry.outcome = e.status
    } else if (e.kind === 'turn_end') {
      out.push({ ...base, type: 'turn', text: e.text, status: e.status })
    } else if (e.kind === 'budget_stop') {
      out.push({ ...base, type: 'alert', text: e.text ? clip(e.text, 160) : 'ran out of its turn budget' })
    } else if (e.kind === 'error') {
      out.push({ ...base, type: 'alert', text: e.text ? `hit an error: ${clip(e.text, 160)}` : 'hit an error' })
    }
  }
  return out
}

// ---------- components ----------

function Dot({ agent }: { agent: string }) {
  return <span className="story-dot" style={{ background: colorOf(agent) }} aria-hidden="true" />
}

export function TicketStory({ ticketId, events }: { ticketId: number; events: AgentEvent[] }) {
  // keyed by ticket so "show earlier" and scroll position start fresh on every ticket
  return <StoryBody key={ticketId} ticketId={ticketId} events={events} />
}

function StoryBody({ ticketId, events }: { ticketId: number; events: AgentEvent[] }) {
  const entries = useMemo(() => buildStory(events, ticketId), [events, ticketId])
  const [limit, setLimit] = useState(PAGE)
  const listRef = useRef<HTMLOListElement>(null)
  const stickRef = useRef(true) // follow new entries while the reader is at the bottom
  const visible = entries.slice(-limit)
  const hidden = entries.length - visible.length
  const lastSeq = entries.length ? entries[entries.length - 1].seq : 0

  useLayoutEffect(() => {
    const el = listRef.current
    if (el && stickRef.current) el.scrollTop = el.scrollHeight
  }, [lastSeq])

  const onScroll = () => {
    const el = listRef.current
    if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
  }

  return (
    <section className="story" aria-label={`Story of ticket ${ticketId}`}>
      <header className="story-head">
        <h3>The story of ticket #{ticketId}</h3>
        {entries.length > 0 && <span className="story-count">{entries.length} moments</span>}
      </header>

      {entries.length === 0 ? (
        <p className="story-empty">Nothing has happened on this ticket yet. Start the team and the story will appear here.</p>
      ) : (
        <ol ref={listRef} className="story-list" onScroll={onScroll}>
          {hidden > 0 && (
            <li className="story-earlier">
              <button type="button" onClick={() => setLimit((n) => n + PAGE)}>
                Show earlier ({hidden})
              </button>
            </li>
          )}
          {visible.map((en) => <StoryItem key={en.seq} entry={en} />)}
        </ol>
      )}
    </section>
  )
}

function StoryItem({ entry }: { entry: Entry }) {
  const time = <time className="story-time" dateTime={entry.time}>{hms(entry.time)}</time>
  const who = <b className="story-who">{agentName(entry.agent)}</b>

  if (entry.type === 'message') {
    const style = { '--story-from': colorOf(entry.agent), '--story-to': colorOf(entry.to) } as CSSProperties
    return (
      <li className="story-item story-msg">
        {time}
        <div className="story-bubble" style={style}>
          <div className="story-route">
            <Dot agent={entry.agent} />{who}
            <span className="story-arrow" aria-label="to">→</span>
            <Dot agent={entry.to} /><b className="story-who">{entry.to ? agentName(entry.to) : 'someone'}</b>
          </div>
          {entry.text && <p className="story-text">{clip(entry.text, 700)}</p>}
        </div>
      </li>
    )
  }

  if (entry.type === 'turn') {
    const status = entry.status && TURN_LABEL[entry.status] ? entry.status : null
    return (
      <li className="story-item story-turn">
        {time}
        <div className="story-card" style={{ '--story-from': colorOf(entry.agent) } as CSSProperties}>
          <div className="story-card-head">
            <Dot agent={entry.agent} />{who}<span className="story-muted">finished a turn</span>
            {status && <span className={`story-pill story-pill-${status}`}>{TURN_LABEL[status]}</span>}
          </div>
          {entry.text && <p className="story-text">{entry.text}</p>}
        </div>
      </li>
    )
  }

  if (entry.type === 'alert') {
    return (
      <li className="story-item story-alert">
        {time}
        <div className="story-line"><Dot agent={entry.agent} />{who} <span>{entry.text}</span></div>
      </li>
    )
  }

  const outcome = entry.outcome ? OUTCOME_LABEL[entry.outcome] : undefined
  return (
    <li className={`story-item story-act ${entry.verb.startsWith('checked') ? 'story-act-quiet' : ''}`}>
      {time}
      <div className="story-line">
        <Dot agent={entry.agent} />
        <span>
          {who} {entry.verb}
          {entry.detail && <span className="story-detail"> — {entry.detail}</span>}
        </span>
        {entry.preview && <span className="story-badge story-badge-preview">preview</span>}
        {outcome && <span className="story-badge story-badge-bad">{outcome}</span>}
      </div>
    </li>
  )
}
