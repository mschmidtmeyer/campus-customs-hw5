// Shapes returned by the backend (HW 5/backend/models.py, dashboard API section).

export type AgentId = 'boss' | 'inventory' | 'accounting' | 'facilities' | 'customer_service'

export interface PendingPayment {
  request_id: number
  kind: string
  ref_id: number
  payee: string | null
  amount: number
  due: string | null
  reason: string | null
  requested_by: string | null
  priority_rank: number | null
  cash_covers_it: boolean | null
}

export interface LastNote {
  author: string
  kind: string
  body: string
}

export interface TicketView {
  id: number
  type: string
  requester: string
  subject: string
  status: string // open | assigned | ready_to_close | closed | resolved
  state: 'open' | 'resolved'
  lead: string | null
  support: string[]
  last_note: LastNote | null
  pending_payments: PendingPayment[]
  open_escalations: number
  next_step: string | null // plain-English hint for the owner, e.g. 'Sign the check on your desk'
  waiting_on_date: string | null // YYYY-MM-DD: the earliest delivery the ticket waits on, after the shop date
  agent_notes: number // notes the five agents left on this ticket: > 0 means the team already worked on it
}

export interface RunStatus {
  ticket_id: number
  status: 'running' | 'finished' | 'error' | 'queued' // 'queued': POST /run while every run slot is busy
  started_at: string
  finished_at: string | null
  run_id: string | null
  stop_reason: string | null
  turns: number
  tokens: number
  error: string | null
}

export interface TicketsResponse {
  shop_today: string
  tickets: TicketView[]
  runs: RunStatus[] // every active run plus the latest finished run per ticket, newest first (up to 3 run at once)
  run: RunStatus | null // the newest of runs (kept for compatibility)
  queued: number[] // ticket ids waiting for a free run slot, in order
}

export type EventKind = 'model_response' | 'tool_call' | 'tool_result' | 'turn_end' | 'budget_stop' | 'error'

export interface AgentEvent {
  seq: number
  time: string
  run_id: string
  agent: string
  ticket_ids: number[]
  kind: EventKind | string
  tool: string | null
  text: string | null
  args: string | null
  result: string | null
  status: string | null
}

export interface EventsResponse {
  events: AgentEvent[]
  last_seq: number
  running: boolean
}

export interface ApproveResult {
  request_id: number
  approved: boolean
  paid: boolean
  reason: string | null
  amount: number | null
  payee: string | null
  balance_after: number | null
  team_continues: number[] // ticket ids the team picks up again because of this click
}

export interface CashView {
  shop_today: string
  account: string
  balance: number
  committed: number | null
  available: number | null
}

export interface ResetResult {
  done: boolean
  message: string
}

// The owner's other decisions: the boss's escalations and the agents' requests for a deeper discount.
export interface DecisionOption {
  choice: number
  option: string
}

export interface Escalation {
  escalation_id: number
  ticket_id: number
  question: string
  options: DecisionOption[]
  recommendation: string | null
  raised_by: string | null
  created_at: string | null
}

// A price_override ticket where an agent asked for a price beyond its limit (a pending discount request).
// Percentages are in percent (15 = 15% off list).
export interface DiscountTicket {
  ticket_id: number
  subject: string
  requester: string
  list_price: number | null
  unit_cost: number | null
  agreed_unit_price: number | null
  owner_min_unit_price: number | null
  requested_unit_price: number | null // the price the agent asked for
  requested_discount_pct: number | null // its discount off list
  limit_pct: number | null // the agents' limit for this order size
  reason: string | null // why the shop refused it (above the limit, below the agreed price)
  requested_by: string | null // agent id, e.g. customer_service
  requested_at?: string | null
}

export interface DecisionsResponse {
  escalations: Escalation[]
  discount_tickets: DiscountTicket[] // only tickets with a pending discount request
}

export interface DecideResult {
  escalation_id: number
  ticket_id: number | null
  decision: string
  team_continues: number[]
}

export interface DiscountResult {
  ticket_id: number
  min_unit_price: number
  message: string
  team_continues: number[]
}

export interface DiscountDeclineResult {
  ticket_id: number
  message: string
  team_continues: number[]
}

// The boss's cash plan (GET /api/forecast, backend models.py ForecastResponse): every unsettled bill and
// expected sale over the next 31 shop days, with the running balance on cash alone and counting expected sales.
export interface ForecastItem {
  date: string // YYYY-MM-DD: the planned day (pay_on), else the due date; overdue bills and sales on hand are today
  kind: 'payment' | 'inflow' | string
  label: string // the bill (and payee) for a payment, the order ticket for an expected sale
  amount: number // always positive; kind says which way the money moves
  planned: boolean // payment: the boss set a pay_on date for it
  due?: string | null // payment: the bill's deadline
  payee?: string | null
  cash_only?: number | null // running balance after this day, no expected sales
  with_expected_sales?: number | null // running balance after this day, counting expected sales
}

// A bill the plan can't pay by its due date with the cash on hand alone.
export interface DeadlineRisk {
  label?: string | null
  bill?: string | null // same as label (older name)
  due: string | null
  amount?: number | null
  short_by: number // cash only
  short_by_with_expected_sales?: number | null // 0: the expected sales would cover it (not guaranteed)
}

export interface ForecastResponse {
  shop_today: string
  until?: string | null
  balance: number
  committed: number // already promised to pending or approved payment requests
  timeline: ForecastItem[] // by date; payments before inflows on a day
  cash_only_low_point: number | null // lowest balance with payments only (no expected sales)
  cash_only_low_point_date?: string | null
  with_expected_sales_low_point?: number | null
  deadlines_at_risk: DeadlineRisk[]
  relies_on_expected_sales: boolean // every deadline is met only if the expected sales come in
}

export interface DateMoveResult {
  before: string
  after: string
  team_continues: number[]
}

// The boss's recommended order for resolving the open tickets (GET /api/plan).
export interface PlanStep {
  order: number
  ticket_id: number
  action: string
  why: string
}

export interface BossPlan {
  plan_id: number | null
  steps: PlanStep[]
  summary: string | null
  shop_date: string | null
  created_at: string | null
}
