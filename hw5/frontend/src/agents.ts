// The five agents as they appear on the office floor: name, job (hover card), tools,
// shirt color (outfit), accessory color (accent) and the theme of their computer screen.
import type { AgentId } from './types'

export type ScreenTheme = 'memo' | 'stock' | 'ledger' | 'blueprint' | 'chat'

export interface AgentInfo {
  id: AgentId
  name: string
  title: string
  job: string
  tools: string[]
  outfit: string
  accent: string
  screen: ScreenTheme
}

export const AGENTS: AgentInfo[] = [
  {
    id: 'boss', name: 'Boss Dan', title: 'The boss',
    job: 'Sorts the tickets, decides which bill gets cash first, decides partial shipments, brings real trade-offs to the owner, and is the only one who closes tickets.',
    tools: ['list_open_tickets', 'assign_ticket', 'set_payment_priority', 'confirm_restock', 'cancel_restock',
      'decide_partial_shipment', 'escalate_to_owner', 'close_ticket', 'read_audit_trail'],
    outfit: '#0b1f3a', accent: '#286dc0', screen: 'memo',
  },
  {
    id: 'inventory', name: 'Inventory Dan', title: 'Stockroom',
    job: 'Checks stock and vendors, orders restocks, links invoices already on the way, and receives deliveries.',
    tools: ['check_stock', 'check_vendor', 'order_restock', 'link_invoice_stock', 'receive_stock'],
    outfit: '#3d5a80', accent: '#ffb000', screen: 'stock',
  },
  {
    id: 'accounting', name: 'Accounting Dan', title: 'Books & cash',
    job: "Watches cash and bills, follows the boss's payment priority, asks the owner to approve payments, and pays only what was approved.",
    tools: ['list_open_bills', 'cash_overview', 'request_payment', 'payment_status', 'pay_bill'],
    outfit: '#5b8fd9', accent: '#2f8f5b', screen: 'ledger',
  },
  {
    id: 'facilities', name: 'Facilities Dan', title: 'The shop space',
    job: 'Looks after the lease, the rent and the shop space, confirms what is owed, and hands payments to accounting.',
    tools: ['check_lease', 'rent_schedule', 'report_facility_issue'],
    outfit: '#2c4a6e', accent: '#a86b2d', screen: 'blueprint',
  },
  {
    id: 'customer_service', name: 'Customer Service Dan', title: 'Front desk',
    job: 'Handles customer orders, prices and discounts, sells received stock, and drafts replies to customers (never sent).',
    tools: ['check_order', 'apply_discount', 'fulfill_customer_order', 'draft_reply'],
    outfit: '#286dc0', accent: '#1b1f24', screen: 'chat',
  },
]

export const SHARED_TOOLS = ['read_ticket', 'my_work', 'send_message', 'add_note', 'request_close']

export const AGENT_BY_ID: Record<string, AgentInfo> = Object.fromEntries(AGENTS.map((a) => [a.id, a]))

export function agentName(id: string): string {
  return AGENT_BY_ID[id]?.name ?? (id === 'owner' ? 'You (owner)' : id)
}
