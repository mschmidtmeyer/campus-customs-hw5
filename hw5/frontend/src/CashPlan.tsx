// The boss's cash plan, under the bank counter on the owner's desk (GET /api/forecast, the next 31 shop days):
// the next payments with their day (the boss's planned pay_on date, else the due date; overdue bills today),
// the payee and amount, a 'planned' tag when the boss set the date; expected sales in lighter type (not
// guaranteed); a red 'Deadline at risk' line for every bill the cash on hand can't pay by its due date; and
// the low point of the cash-only balance. The list scrolls on its own, so the column keeps its room.
// Renders nothing until the backend sends a plan.
import type { DeadlineRisk, ForecastItem, ForecastResponse } from './types'
import './cashplan.css'

const usd = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

// 'YYYY-MM-DD' -> 'Sep 12' (read as a local date, so a time zone never shifts the day); the shop date -> 'Today'.
function day(iso: string | null | undefined, today?: string): string {
  if (!iso) return '—'
  if (today && iso.slice(0, 10) === today.slice(0, 10)) return 'Today'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : iso
}

const riskName = (r: DeadlineRisk) => r.label ?? r.bill ?? 'A bill'

export function CashPlan({ forecast }: { forecast: ForecastResponse | null }) {
  if (!forecast) return null
  const today = forecast.shop_today
  // By date; the sort is stable, so the backend's order within a day (payments first) stays.
  const items = [...(forecast.timeline ?? [])].sort((a, b) => a.date.localeCompare(b.date))
  const risks = forecast.deadlines_at_risk ?? []
  const low = forecast.cash_only_low_point

  return (
    <section className="plan" aria-label="Cash plan">
      <header className="plan-head">
        <span className="plan-title">Cash plan</span>
        <span className="plan-span">
          {forecast.until ? `through ${day(forecast.until)}` : 'next 31 days'} · {usd(forecast.balance)} now
        </span>
      </header>

      {risks.map((r, i) => <RiskLine key={`${riskName(r)}-${r.due}-${i}`} risk={r} today={today} />)}

      {items.length === 0
        ? <p className="plan-empty">No bills or expected sales in the next 31 days.</p>
        : (
          <ol className="plan-list">
            {items.map((it, i) => <PlanRow key={`${it.date}-${it.kind}-${it.label}-${i}`} item={it} today={today} />)}
          </ol>
        )}

      <p className="plan-foot">
        <span>
          Low point, cash only{' '}
          <b className={low != null && low < 0 ? 'is-short' : ''}>{usd(low)}</b>
          {forecast.cash_only_low_point_date && <> on {day(forecast.cash_only_low_point_date, today)}</>}
        </span>
        {forecast.relies_on_expected_sales && (
          <span className="plan-relies">Every deadline is met only if the expected sales come in.</span>
        )}
      </p>
    </section>
  )
}

function RiskLine({ risk, today }: { risk: DeadlineRisk; today: string }) {
  const withSales = risk.short_by_with_expected_sales
  return (
    <p className="plan-risk" role="alert">
      <b>Deadline at risk:</b> {riskName(risk)}, due {day(risk.due, today)}, short {usd(risk.short_by)} on cash alone
      {withSales != null && (withSales > 0.004
        ? <>, still short {usd(withSales)} with expected sales</>
        : <>; expected sales would cover it</>)}
      .
    </p>
  )
}

function PlanRow({ item, today }: { item: ForecastItem; today: string }) {
  const inflow = item.kind === 'inflow'
  const overdue = !inflow && !!item.due && item.due.slice(0, 10) < today.slice(0, 10)
  const who = inflow ? item.label : (item.payee ?? item.label)
  const title = [item.label, item.due && !inflow ? `deadline ${day(item.due)}` : null, inflow ? 'expected, not guaranteed' : null]
    .filter(Boolean).join(' · ')
  return (
    <li className={`plan-row ${inflow ? 'is-in' : 'is-out'}`} title={title}>
      <span className="plan-date">{day(item.date, today)}</span>
      <span className="plan-who">
        <span className="plan-name">{inflow ? `Expected: ${who}` : who}</span>
        {item.planned && !inflow && <span className="plan-tag">planned</span>}
        {overdue && <span className="plan-tag is-late">overdue</span>}
      </span>
      <span className="plan-amt">{inflow ? '+' : '−'}{usd(item.amount)}</span>
    </li>
  )
}
