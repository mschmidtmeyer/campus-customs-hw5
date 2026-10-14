// One hook holds the desk's state and keeps it fresh by polling the backend:
// faster while the team is running, slower when idle. The team can work on up to 3 tickets at once
// (runningTickets); more wait in the backend's queue (queued) and start as soon as a run slot frees up.
// After an owner click (sign a check, answer a memo, allow or decline a discount, move the date) the backend may
// hand tickets back to the team on its own; the result's team_continues lists them, and a short notice
// says so, so the owner never has to press "Start the team" again to get a ticket to Resolved.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiError } from './api'
import type {
  BossPlan,
  AgentEvent, ApproveResult, CashView, DateMoveResult, DecideResult, DecisionsResponse, DiscountDeclineResult,
  DiscountResult, ForecastResponse, RunStatus, TicketView,
} from './types'

const MAX_EVENTS = 800
const ACTION_ERROR_MS = 8000 // a refusal of the owner's own click stays in the banner at least this long
const NOTICE_MS = 6000 // a good-news notice ("The team picks up ticket #101 again.") hides after this long

// 'ticket #101' or 'tickets #101, #102 and #103'
function ticketList(ids: number[]): string {
  const tags = ids.map((id) => `#${id}`)
  if (tags.length === 1) return `ticket ${tags[0]}`
  return `tickets ${tags.slice(0, -1).join(', ')} and ${tags[tags.length - 1]}`
}

// Who put the message in the error banner. A poll clears only its own message (so the two polls don't
// make it flicker); an action's message (a backend refusal) goes after ACTION_ERROR_MS or the next good action.
type ErrorSource = 'events' | 'board' | 'action'

export interface Desk {
  tickets: TicketView[]
  shopToday: string | null
  run: RunStatus | null // the newest run (running or finished)
  runs: RunStatus[] // every active run plus the latest finished run per ticket, newest first
  runningTickets: number[] // tickets the team works on right now (several at once)
  running: boolean // at least one run is active
  queued: number[] // tickets waiting for a free run slot, in order
  events: AgentEvent[]
  cash: CashView | null
  decisions: DecisionsResponse | null // the boss's open escalations + pending discount requests for the owner
  plan: BossPlan | null // the boss's recommended order for resolving the tickets
  forecast: ForecastResponse | null // the boss's cash plan: payments and expected sales ahead, deadlines at risk
  error: string | null
  notice: string | null // short good news, separate from errors; hides by itself
  busy: string | null
  freshFrom: number | null // events with seq above this arrived while the page was open
  startRun: (ticketId: number) => Promise<void>
  approve: (requestId: number) => Promise<ApproveResult | null>
  decide: (escalationId: number, choice: number, note?: string) => Promise<DecideResult | null>
  approveDiscount: (ticketId: number, minUnitPrice: number, note?: string) => Promise<DiscountResult | null>
  declineDiscount: (ticketId: number, note?: string) => Promise<DiscountDeclineResult | null>
  advanceDate: (days: number) => Promise<DateMoveResult | null>
  reset: () => Promise<void>
  refresh: () => Promise<void>
}

export function useDesk(): Desk {
  const [tickets, setTickets] = useState<TicketView[]>([])
  const [shopToday, setShopToday] = useState<string | null>(null)
  const [run, setRun] = useState<RunStatus | null>(null)
  const [runs, setRuns] = useState<RunStatus[]>([])
  const [teamRunning, setTeamRunning] = useState(false) // from the events poll: any run active
  const [queued, setQueued] = useState<number[]>([])
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [cash, setCash] = useState<CashView | null>(null)
  const [decisions, setDecisions] = useState<DecisionsResponse | null>(null)
  const [forecast, setForecast] = useState<ForecastResponse | null>(null)
  const [plan, setPlan] = useState<BossPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [freshFrom, setFreshFrom] = useState<number | null>(null)
  const lastSeq = useRef(0)
  const wasRunning = useRef(false)
  const errorFrom = useRef<{ source: ErrorSource | null; until: number }>({ source: null, until: 0 })
  const boardGen = useRef(0)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const showError = useCallback((source: ErrorSource, e: unknown) => {
    errorFrom.current = { source, until: source === 'action' ? Date.now() + ACTION_ERROR_MS : 0 }
    setError(e instanceof ApiError ? e.message : String(e))
  }, [])

  const clearError = useCallback((source: ErrorSource) => {
    const f = errorFrom.current
    if (source !== 'action' && f.source !== source && !(f.source === 'action' && Date.now() > f.until)) return
    errorFrom.current = { source: null, until: 0 }
    setError(null)
  }, [])

  const showNotice = useCallback((text: string) => {
    clearTimeout(noticeTimer.current)
    setNotice(text)
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS)
  }, [])
  useEffect(() => () => clearTimeout(noticeTimer.current), [])

  // Tickets, cash, the owner's decisions and the cash plan. If only the decisions or the forecast call
  // fails, the board still refreshes and that error goes to the banner (the last cash plan stays; a backend
  // without /api/forecast just shows none). Only the newest load writes its data,
  // so a slow poll can't bring back a memo the owner just answered.
  const loadBoard = useCallback(async () => {
    const gen = ++boardGen.current
    const [t, c, d, f, p] = await Promise.all([
      api.tickets(),
      api.cash(),
      api.decisions().then((r) => ({ r, err: null }), (err: unknown) => ({ r: null, err })),
      api.forecast().then((r) => ({ r, err: null }), (err: unknown) => ({ r: null, err })),
      api.plan().catch(() => null),
    ])
    if (gen !== boardGen.current) return
    setTickets(t.tickets)
    setShopToday(t.shop_today)
    const all = t.runs ?? (t.run ? [t.run] : []) // an older backend only sends run
    setRuns(all)
    setRun(t.run ?? all[0] ?? null)
    setQueued(t.queued ?? [])
    setCash(c)
    if (p) setPlan(p)
    const noForecast = f.err instanceof ApiError && f.err.status === 404
    setForecast((prev) => f.r ?? (noForecast ? null : prev))
    if (d.err) throw d.err
    setDecisions(d.r)
    if (f.err && !noForecast) throw f.err
  }, [])

  // Board refresh for the board poll and after an owner action. A failed refresh goes to the banner,
  // but it never makes an action that went through look failed.
  const reloadBoard = useCallback(async () => {
    try {
      await loadBoard()
      clearError('board')
    } catch (e) {
      showError('board', e)
    }
  }, [loadBoard, clearError, showError])

  const loadEvents = useCallback(async () => {
    const r = await api.events(lastSeq.current)
    if (r.events.length) {
      lastSeq.current = r.events[r.events.length - 1].seq
      setEvents((prev) => [...prev, ...r.events].slice(-MAX_EVENTS))
    } else if (r.last_seq < lastSeq.current) {
      lastSeq.current = r.last_seq
    }
    setTeamRunning(r.running)
    setFreshFrom((f) => (f == null ? lastSeq.current : f))
    return r.running
  }, [])

  const refresh = useCallback(async () => {
    try {
      await Promise.all([loadBoard(), loadEvents()])
      clearError('board')
      clearError('events')
    } catch (e) {
      showError('board', e)
    }
  }, [loadBoard, loadEvents, clearError, showError])

  // Events: every second while running, every 4 s when idle. Board + cash: every 2 s / 5 s.
  useEffect(() => {
    let stop = false
    let timer: ReturnType<typeof setTimeout>
    const tick = async () => {
      try {
        const isRunning = await loadEvents()
        if (wasRunning.current && !isRunning) await loadBoard() // run just finished: show resolved tickets
        wasRunning.current = isRunning
        clearError('events')
      } catch (e) {
        showError('events', e)
      }
      if (!stop) timer = setTimeout(tick, wasRunning.current ? 1000 : 4000)
    }
    tick()
    return () => { stop = true; clearTimeout(timer) }
  }, [loadEvents, loadBoard, clearError, showError])

  useEffect(() => {
    let stop = false
    let timer: ReturnType<typeof setTimeout>
    const tick = async () => {
      await reloadBoard()
      if (!stop) timer = setTimeout(tick, wasRunning.current ? 2000 : 5000)
    }
    tick()
    return () => { stop = true; clearTimeout(timer) }
  }, [reloadBoard])

  // The backend hands tickets back to the team after an owner click (it starts them while a run slot
  // is free and queues the rest). Say so, and poll at the fast rate so the board shows them working right away.
  const teamContinues = useCallback((ids: number[] | undefined) => {
    if (!ids?.length) return
    showNotice(`The team picks up ${ticketList(ids)} again.`)
    setTeamRunning(true)
    wasRunning.current = true
  }, [showNotice])

  // Start the team on a ticket. It starts right away while a run slot is free (up to 3 tickets at once);
  // otherwise the backend queues it and starts it as soon as one of the runs ends.
  const startRun = useCallback(async (ticketId: number) => {
    setBusy(`run-${ticketId}`)
    try {
      const r = await api.run(ticketId)
      clearError('action')
      if (r.status === 'queued') {
        setQueued((q) => (q.includes(ticketId) ? q : [...q, ticketId]))
        showNotice(`Ticket #${ticketId} is queued: the team starts it as soon as one of its runs ends.`)
      } else {
        setRuns((rs) => [r, ...rs.filter((x) => x.ticket_id !== ticketId)])
        setRun(r)
        setTeamRunning(true)
        wasRunning.current = true
      }
      await reloadBoard()
    } catch (e) {
      showError('action', e)
    } finally {
      setBusy(null)
    }
  }, [reloadBoard, clearError, showError, showNotice])

  const approve = useCallback(async (requestId: number) => {
    setBusy(`approve-${requestId}`)
    try {
      const r = await api.approve(requestId)
      if (r.paid || !r.reason) clearError('action')
      else showError('action', r.reason)
      await reloadBoard()
      teamContinues(r.team_continues)
      return r
    } catch (e) {
      showError('action', e)
      return null
    } finally {
      setBusy(null)
    }
  }, [reloadBoard, clearError, showError, teamContinues])

  // The owner's answer to one of the boss's escalations (option number as listed).
  const decide = useCallback(async (escalationId: number, choice: number, note = '') => {
    setBusy(`decide-${escalationId}`)
    try {
      const r = await api.decide(escalationId, choice, note)
      clearError('action')
      await reloadBoard()
      teamContinues(r.team_continues)
      return r
    } catch (e) {
      showError('action', e)
      return null
    } finally {
      setBusy(null)
    }
  }, [reloadBoard, clearError, showError, teamContinues])

  // Allow a discount deeper than the agents' policy limit on a ticket where an agent asked for one
  // (agents: list price under 10 units, up to 10% off at 10+ units, up to 15% at 20+).
  const approveDiscount = useCallback(async (ticketId: number, minUnitPrice: number, note = '') => {
    setBusy(`discount-${ticketId}`)
    try {
      const r = await api.approveDiscount(ticketId, minUnitPrice, note)
      clearError('action')
      await reloadBoard()
      teamContinues(r.team_continues)
      return r
    } catch (e) {
      showError('action', e)
      return null
    } finally {
      setBusy(null)
    }
  }, [reloadBoard, clearError, showError, teamContinues])

  // Say no to an agent's request for a price beyond its limit: the agents keep the policy price.
  const declineDiscount = useCallback(async (ticketId: number, note = '') => {
    setBusy(`discount-${ticketId}`)
    try {
      const r = await api.declineDiscount(ticketId, note)
      clearError('action')
      await reloadBoard()
      teamContinues(r.team_continues)
      return r
    } catch (e) {
      showError('action', e)
      return null
    } finally {
      setBusy(null)
    }
  }, [reloadBoard, clearError, showError, teamContinues])

  // Move the shop date forward (the backend refuses with 409 while any run is active).
  // The backend then wakes every ticket the team already started (a delivery may have arrived).
  const advanceDate = useCallback(async (days: number) => {
    setBusy('date')
    try {
      const r = await api.advanceDate(days)
      clearError('action')
      await reloadBoard()
      teamContinues(r.team_continues)
      return r
    } catch (e) {
      showError('action', e)
      return null
    } finally {
      setBusy(null)
    }
  }, [reloadBoard, clearError, showError, teamContinues])

  const reset = useCallback(async () => {
    setBusy('reset')
    try {
      await api.reset()
      clearError('action')
      await reloadBoard()
    } catch (e) {
      showError('action', e)
    } finally {
      setBusy(null)
    }
  }, [reloadBoard, clearError, showError])

  const runningTickets = useMemo(
    () => runs.filter((r) => r.status === 'running').map((r) => r.ticket_id),
    [runs],
  )
  const running = teamRunning || runningTickets.length > 0

  return {
    tickets, shopToday, run, runs, runningTickets, running, queued, events, cash, decisions, forecast, plan, error, notice,
    busy, freshFrom, startRun, approve, decide, approveDiscount, declineDiscount, advanceDate, reset, refresh,
  }
}
