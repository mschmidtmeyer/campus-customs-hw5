// The boss's recommended order for resolving the open tickets, pinned above the corkboard.
import type { BossPlan as Plan } from './types'
import './bossplan.css'

export function BossPlan({ plan, onSelect }: { plan: Plan | null; onSelect: (id: number) => void }) {
  if (!plan || !plan.steps.length) {
    return <div className="bp bp-empty">Boss's plan: start any ticket and the boss posts the order to resolve them in.</div>
  }
  return (
    <section className="bp" aria-label="The boss's plan">
      <header><strong>Boss's plan</strong><span>shop date {plan.shop_date}</span></header>
      {plan.summary && <p className="bp-sum">{plan.summary}</p>}
      <ol>
        {plan.steps.map((s) => (
          <li key={`${s.order}-${s.ticket_id}`}>
            <button className="bp-ticket" onClick={() => onSelect(s.ticket_id)}>#{s.ticket_id}</button>
            <div><b>{s.action}</b><span>{s.why}</span></div>
          </li>
        ))}
      </ol>
    </section>
  )
}
