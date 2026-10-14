// Calls to the FastAPI backend (HW 5/backend/main.py) on localhost:8000.
import type {
  BossPlan,
  ApproveResult, CashView, DateMoveResult, DecideResult, DecisionsResponse, DiscountDeclineResult, DiscountResult,
  EventsResponse, ForecastResponse, ResetResult, RunStatus, TicketsResponse,
} from './types'

export const API_BASE: string = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    })
  } catch {
    throw new ApiError(0, `Can't reach the backend at ${API_BASE}. Is uvicorn running?`)
  }
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      if (body?.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
    } catch { /* keep statusText */ }
    throw new ApiError(res.status, detail)
  }
  return res.json() as Promise<T>
}

export const api = {
  tickets: () => request<TicketsResponse>('/api/tickets'),
  run: (ticketId: number) => request<RunStatus>(`/api/tickets/${ticketId}/run`, { method: 'POST' }),
  events: (after: number, limit = 200, ticketId?: number) => {
    const q = new URLSearchParams({ after: String(after), limit: String(limit) })
    if (ticketId != null) q.set('ticket_id', String(ticketId))
    return request<EventsResponse>(`/api/events?${q}`)
  },
  approve: (requestId: number) => request<ApproveResult>(`/api/payments/${requestId}/approve`, { method: 'POST' }),
  cash: () => request<CashView>('/api/cash'),
  reset: () => request<ResetResult>('/api/reset', { method: 'POST' }),
  decisions: () => request<DecisionsResponse>('/api/decisions'),
  decide: (escalationId: number, choice: number, note = '') =>
    request<DecideResult>(`/api/decisions/${escalationId}`, {
      method: 'POST', body: JSON.stringify({ choice, note }),
    }),
  approveDiscount: (ticketId: number, minUnitPrice: number, note = '') =>
    request<DiscountResult>(`/api/discounts/${ticketId}/approve`, {
      method: 'POST', body: JSON.stringify({ min_unit_price: minUnitPrice, note }),
    }),
  declineDiscount: (ticketId: number, note = '') =>
    request<DiscountDeclineResult>(`/api/discounts/${ticketId}/decline`, {
      method: 'POST', body: JSON.stringify({ note }),
    }),
  forecast: () => request<ForecastResponse>('/api/forecast'),
  plan: () => request<BossPlan>('/api/plan'),
  advanceDate: (days: number) =>
    request<DateMoveResult>('/api/shop-date/advance', { method: 'POST', body: JSON.stringify({ days }) }),
}
