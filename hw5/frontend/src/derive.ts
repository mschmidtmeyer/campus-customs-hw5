// Turn the raw audit-trail events into what the desk shows: who is working (several agents at once
// when the team runs several tickets), on which ticket, what they think, which tool they use, who they
// hand work to, and a per-agent summary for a ticket.
import { AGENTS } from './agents'
import type { AgentEvent, AgentId } from './types'

export interface AgentLive {
  id: AgentId
  lastEvent: AgentEvent | null
  thought: string | null // latest thing the agent said
  tool: string | null // latest tool it called
  toolSeq: number // seq of that tool call (changes every call, so pop-ups can re-animate)
  working: boolean // the agent acting right now
  waiting: boolean // its last turn ended "waiting" or "blocked"
  turns: number
  ticketId: number | null // the ticket of its latest event (the one it works on while working)
}

export interface Handoff {
  seq: number
  from: string
  to: string
  ticketId: number | null
  text: string
}

const WORKING_WINDOW_MS = 20_000

function parseArgs(args: string | null): Record<string, unknown> {
  if (!args) return {}
  try {
    const v = JSON.parse(args)
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

// Each agent works one ticket at a time, but different agents can work different tickets at once.
// An agent is working while a run is active, its latest event is not the end of its turn, that event is
// recent, and (when the active tickets are known) it belongs to one of them, so an agent whose run just
// ended stops glowing even while other tickets keep running.
export function liveAgents(
  events: AgentEvent[], running: boolean, now = Date.now(), activeTickets: readonly number[] = [],
): Record<AgentId, AgentLive> {
  const out = Object.fromEntries(
    AGENTS.map((a) => [a.id, {
      id: a.id, lastEvent: null, thought: null, tool: null, toolSeq: 0, working: false, waiting: false, turns: 0,
      ticketId: null,
    }]),
  ) as Record<AgentId, AgentLive>
  for (const e of events) {
    const a = out[e.agent as AgentId]
    if (!a) continue
    a.lastEvent = e
    a.waiting = false
    // Tool events carry the tool's own ticket argument (the boss may read #99 during a turn on #101), so the
    // turn's ticket comes from the other events; each turn's first logged event is a model_response.
    const toolEvent = e.kind === 'tool_call' || e.kind === 'tool_result'
    if (!toolEvent || a.ticketId == null) a.ticketId = e.ticket_ids[0] ?? null
    if (e.kind === 'model_response' && e.text) a.thought = e.text
    if (e.kind === 'tool_call' && e.tool) {
      a.tool = e.tool
      a.toolSeq = e.seq
    }
    if (e.kind === 'turn_end') {
      a.turns += 1
      if (e.text) a.thought = e.text
      a.waiting = e.status === 'waiting' || e.status === 'blocked'
    }
  }
  if (!running) return out
  for (const a of Object.values(out)) {
    const e = a.lastEvent
    if (!e || e.kind === 'turn_end') continue
    if (activeTickets.length && (a.ticketId == null || !activeTickets.includes(a.ticketId))) continue
    const age = now - new Date(e.time).getTime()
    if (Number.isNaN(age) || age < WORKING_WINDOW_MS) a.working = true
  }
  return out
}

export function handoffs(events: AgentEvent[]): Handoff[] {
  return events
    .filter((e) => e.kind === 'tool_call' && e.tool === 'send_message')
    .map((e) => {
      const a = parseArgs(e.args)
      return {
        seq: e.seq,
        from: e.agent,
        to: String(a.to_agent ?? ''),
        ticketId: typeof a.ticket_id === 'number' ? a.ticket_id : (e.ticket_ids[0] ?? null),
        text: String(a.text ?? ''),
      }
    })
    .filter((h) => h.to)
}

export function agentSummaries(events: AgentEvent[], ticketId: number): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const e of events) {
    if (e.kind !== 'turn_end' || !e.text || !e.ticket_ids.includes(ticketId)) continue
    ;(out[e.agent] ??= []).push(e.text)
  }
  return out
}

export function toolsUsed(events: AgentEvent[], ticketId: number): Record<string, string[]> {
  const out: Record<string, Set<string>> = {}
  for (const e of events) {
    if (e.kind !== 'tool_call' || !e.tool || !e.ticket_ids.includes(ticketId)) continue
    ;(out[e.agent] ??= new Set()).add(e.tool)
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v]]))
}
