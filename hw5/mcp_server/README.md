# Campus Customs MCP Server

Shared toolbox for the Campus Customs back office: five agents (boss, inventory, accounting, facilities, customer service), the owner, and the orchestrator. The shop rules live in one place, the tool code, and every shop fact comes from the database through these tools.

## Run it

From `hw5/`, after `pip install -r requirements.txt` into `.venv` (see `hw5/README.md`):

```bash
.venv/bin/python mcp_server/server.py --role owner
```

It speaks MCP over stdio, so it waits for a client. You rarely start it by hand: the backend starts one process per role on its own, and Claude Code starts the owner process from `hw5/.mcp.json`.

## Roles

`--role` is required: `boss`, `inventory`, `accounting`, `facilities`, `customer_service`, `owner` or `system`. Each process registers only that role's tools, so an agent can't call another lane's tools. Every note the server writes uses the role as its author, and sensitive tools re-check the role inside.

- The backend (`hw5/backend/`) starts one process per agent, plus one `system` process for the orchestrator.
- `hw5/.mcp.json` starts `--role owner` for Claude Code, the owner's console.

## Tools by lane

| Lane | Tools |
|---|---|
| Shared (all five agents + owner) | `read_ticket`, `my_work`, `send_message`, `add_note`, `request_close` |
| Boss | `list_open_tickets`, `assign_ticket`, `set_payment_priority`, `escalate_to_owner`, `close_ticket`, `confirm_restock`, `cancel_restock`, `decide_partial_shipment`, `recommend_plan`, `boss_plan`, `read_audit_trail`, plus read-only `list_open_bills`, `cash_overview`, `cash_forecast` |
| Inventory | `check_stock`, `check_vendor`, `order_restock`, `link_invoice_stock`, `receive_stock` |
| Accounting | `list_open_bills`, `cash_overview`, `cash_forecast`, `request_payment`, `payment_status`, `pay_bill` |
| Facilities | `check_lease`, `rent_schedule`, `report_facility_issue` |
| Customer service | `check_order`, `fulfill_customer_order`, `apply_discount`, `draft_reply` |
| Owner | every tool above, plus `list_pending_approvals`, `approve_payment`, `reject_payment`, `decide_escalation`, `approve_discount`, `decline_discount`, `advance_shop_date` |
| System (orchestrator only, never given to a model) | `pending_work`, `post_turn_summary`, `read_ticket` |

`order_restock`, `link_invoice_stock`, `request_payment`, `pay_bill`, `fulfill_customer_order` and `apply_discount` take `preview=True` to report what they would do without writing. What each tool reads, writes and unlocks is in `hw5/output/harness.md`.

## Database

- Uses `hw5/data/campus_customs_new.db`, the working copy. Set `CAMPUS_CUSTOMS_DB` to use another copy.
- Never touches `hw5/data/campus_customs.db`, the original. To reset, copy the original over the working copy.
- On first connection it adds its board tables (`ticket_notes`, `ticket_assignments`, `payment_priorities`, `payment_requests`, `escalations`, `restock_orders`, `sales`, `price_agreements`, `discount_approvals`, `partial_shipments`, `discount_requests`) with `CREATE TABLE IF NOT EXISTS`. A `payment_priorities` board table from before cash planning gets its `pay_on` column (`ALTER TABLE ... ADD COLUMN`). The original tables are never altered or dropped.
- "Today" is `desk.date_today`, not the system clock. Only the owner's `advance_shop_date` moves it.
- `read_audit_trail` reads `hw5/output/audit_trail.json` (`AUDIT_TRAIL_PATH` overrides). The backend appends to it; the server never writes it.
- `OWNER_NAME` sets the name recorded on owner decisions (default `owner`).

## Rules enforced

- Lanes: one process per role; owner and system tools are never exposed to agents. An agent can act only on a ticket it is assigned to or was messaged on.
- Payments: `request_payment` never moves money; `pay_bill` pays only a request the owner approved, in the boss's priority order. Amounts, payees and due dates come from the database. No payment takes cash below zero (no credit), requests can't exceed uncommitted cash, and a bill can't be requested or paid twice.
- Cash planning: `cash_forecast` lays out the next 31 shop days: every unpaid bill (open invoices, each lease's next rent and the monthly rent after it) on the date it will be paid, expected sales from open orders (not guaranteed), two running balances (cash only, and with expected sales) and every deadline at risk. `set_payment_priority` takes an optional `pay_on` per bill (not before today, never after the due date, never for an overdue or due-today bill) and refuses a plan that misses a deadline paying every bill on its due date would meet; a plan that works only with expected sales is accepted with `relies_on_expected_sales: true` and a warning. `request_payment` refuses a bill before its `pay_on`, a deferred bill does not hold up the others, and `advance_shop_date` notes accounting on the bill's open tickets when a planned date comes.
- Stock: `receive_stock` works only after the boss or owner confirmed the order, its invoice is paid, the vendor has no open invoices and the lead days have passed, and it names every missing condition. Only received stock is sold, stock never goes below zero, and quantities are at least 1. When only part of an order is on the shelf, `fulfill_customer_order` sells nothing and sends the question to the boss; it sells part of the order only after `decide_partial_shipment` approves it. `order_restock` orders only items that exist in inventory and pricing, for a ticket, and never pays.
- Restock estimates: there is no vendor price list, so `order_restock` prices at `pricing.unit_cost`, and `link_invoice_stock` estimates an existing invoice's quantity as amount ÷ unit cost (invoice 501: 105 tees). `request_payment` refuses a new order's invoice, and `receive_stock` refuses any order, until the boss or owner confirms it with `confirm_restock`. Only the boss or owner can `cancel_restock` an order that is not paid, requested or received; a new order's invoice becomes void, an existing bill is never voided.
- Prices: no price below unit cost, for anyone. Agents discount by order size only (`_agent_discount_limit`): list price under 10 units, up to 10% off for 10-19 units, up to 15% for 20 or more. One price per ticket: once a price is agreed, an agent can raise it toward list but not lower it again. Anything deeper or lower needs the owner's `approve_discount` (agents may then go down to its minimum price); the owner role skips only the agent limits. A price `apply_discount` refuses for being beyond the agent limit or below the agreed price (not for being below cost) becomes a pending `discount_requests` row on the owner's desk (`owner_request: 'pending'`, the boss gets a note); the owner approves it with `approve_discount` or declines it with `decline_discount`, and customer service and the boss get the decision. No request, no discount card. `check_order` shows each order's limit and the rule.
- Tickets: only the lead asks to close, and only the boss (or owner) closes, never with an open escalation or a pending or approved payment request. The boss sends an early close request back with `assign_ticket`.
- Customers: `draft_reply` saves a draft on the board; nothing is sent. There are no email, phone or web tools.
- Each call locks the database before reading, so two agents can't spend the same cash or sell the same stock twice.
- Expected refusals reach the agent as plain tool errors; the server logs them without a traceback.

## Run

Set up the venv once:

```bash
cd "hw5/mcp_server"
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Start a server for one role (stdio):

```bash
.venv/bin/python server.py --role owner
```
