"""FastAPI backend for the Campus Customs dashboard.

Run from HW 5/backend:  .venv/bin/uvicorn main:app --reload --port 8000

Every shop fact and action goes through the MCP server: the app keeps one
`--role owner` client (the owner's console: board, approvals, cash) and starts
the agent team (team.py) in the background. The only thing done outside the
MCP server is the reset, which copies the original database over the working
copy. The audit trail is never touched by a reset.

The team works on up to 3 tickets at once (CC_MAX_RUNS), one team run per ticket; starting more lines
them up in a queue that moves as runs end. Each run only sees its own ticket, and each agent works on one
ticket at a time (team.py). After each owner click (approve a payment, answer the boss, OK or decline a
discount, move the shop date) the team picks the affected tickets up again on its own, so a ticket reaches
Resolved with only owner clicks. CC_AUTO_CONTINUE=0 turns that off (then the owner starts the team by hand).

Routes:
  GET  /api/tickets                        every ticket, open or resolved, with lead, pending payments,
                                           agent notes, the next step and the delivery date it waits for;
                                           plus the team runs (running and latest finished) and the queue
  POST /api/tickets/{ticket_id}/run        run the agent team on one ticket (in the background; up to 3
                                           at once, more are queued)
  GET  /api/events                         recent agent steps from the audit trail (?after=&limit=&ticket_id=)
  POST /api/payments/{request_id}/approve  owner approves a payment request and it is paid: moves cash
  GET  /api/cash                           checking balance
  GET  /api/forecast                       the cash plan for the next 31 shop days: bills by planned or due
                                           date, expected sales, running balances, deadlines at risk
  GET  /api/decisions                      the boss's open escalations and the tickets where customer service
                                           asked the owner for a deeper discount (pending requests only)
  POST /api/decisions/{escalation_id}      owner picks one of the boss's options ({choice, note})
  POST /api/discounts/{ticket_id}/approve  owner allows a discount down to {min_unit_price, note}
  POST /api/discounts/{ticket_id}/decline  owner declines the requested discount ({note}): the policy price stays
  POST /api/shop-date/advance              owner moves the shop date forward ({days}, 1-31; not while any run is on);
                                           tickets where a planned payment fell due continue too
  POST /api/reset                          copy the original database over the working copy (not while any run is on)
"""

from __future__ import annotations

import asyncio
import math
import os
import shutil
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastmcp.exceptions import ToolError

import audit
import common
import team
from models import (
    CLOSED,
    AdvanceDateRequest,
    ApproveResult,
    CashView,
    DateMoveResult,
    DecideRequest,
    DecideResult,
    DecisionOption,
    DeadlineAtRisk,
    DecisionsResponse,
    DeclineDiscountRequest,
    DeclineDiscountResult,
    DiscountRequest,
    DiscountResult,
    DiscountTicket,
    Escalation,
    EventsResponse,
    EventView,
    BossPlanResponse,
    ForecastItem,
    ForecastResponse,
    PendingPayment,
    ResetResult,
    RunStatus,
    TicketsResponse,
    TicketView,
)

DASHBOARD_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]  # Vite dev server
EVENT_KINDS = {"model_response", "tool_call", "tool_result", "turn_end", "budget_stop", "error"}
ORDER_TYPES = frozenset({"customer_order", "price_override"})  # tickets check_order works on
AUTO_CONTINUE = os.getenv("CC_AUTO_CONTINUE", "1") != "0"  # team picks tickets up again after owner clicks
EARLY_STOPS = frozenset({"max_rounds", "max_turns", "token_budget", "stop_requested", "error"})  # work may be left
MAX_RUNS = max(1, int(os.getenv("CC_MAX_RUNS", "3")))  # tickets the team works on at the same time
FORECAST_DAYS = 31  # shop days the owner's cash plan looks ahead


class _State:
    client: Any = None
    lock: asyncio.Lock | None = None

    def __init__(self) -> None:
        self.active: dict[int, asyncio.Task] = {}  # ticket -> its running team run
        self.runs: dict[int, RunStatus] = {}  # ticket -> its latest run (running or finished), in start order
        self.queue: list[int] = []  # tickets waiting for a free slot, in order
        self.follow_up: set[int] = set()  # owner acted on a running ticket: run it once more afterwards
        self.stopped_early: dict[int, str] = {}  # ticket -> why its last run stopped before the work ran out


state = _State()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    state.lock = asyncio.Lock()
    state.client = common.owner_client()
    async with state.client:
        yield
    state.queue.clear()  # nothing new starts while the server stops
    state.follow_up.clear()
    tasks = [task for task in state.active.values() if not task.done()]
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)


app = FastAPI(title="Campus Customs back office", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=DASHBOARD_ORIGINS, allow_methods=["GET", "POST"],
                   allow_headers=["*"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _running() -> bool:
    """True while any team run is on."""
    return any(not task.done() for task in state.active.values())


def _is_running(ticket_id: int) -> bool:
    """True while a team run works on this ticket."""
    task = state.active.get(ticket_id)
    return task is not None and not task.done()


def _free_slots() -> int:
    return MAX_RUNS - sum(not task.done() for task in state.active.values())


async def owner_call(name: str, args: dict[str, Any] | None = None) -> Any:
    """One tool call through the owner's MCP client; tool refusals become HTTP 400."""
    async with state.lock:
        try:
            return await common.call_tool(state.client, name, args)
        except ToolError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc


# ---------- board ----------

async def _waiting_on_date(ticket_id: int, shop_today: str) -> str | None:
    """The earliest expected arrival (after shop today) of a restock order this order ticket still waits
    for, or None. A ticket check_order can't read (missing order fields) just gets None."""
    try:
        order = await owner_call("check_order", {"ticket_id": ticket_id})
    except Exception:  # the board still shows; only the hint is missing
        return None
    if order.get("remaining", 0) <= order.get("on_hand", 0):
        return None  # everything still owed is on the shelf (or already sold): no delivery to wait for
    dates = [o["expected_arrival"] for o in order.get("incoming", [])
             if not o.get("ready_to_receive") and o.get("expected_arrival") and o["expected_arrival"] > shop_today]
    return min(dates, default=None)


def _next_step(t: dict[str, Any], payments: list[PendingPayment], waiting_on_date: str | None) -> str | None:
    """One plain-English hint for the owner: what has to happen next on this ticket."""
    if t["status"] in CLOSED:
        return None
    if payments:
        return "Sign the check on your desk"
    if t.get("open_escalations", 0) > 0:
        return "Answer the boss on your desk"
    if waiting_on_date:
        return f"Move the shop date to {waiting_on_date}"
    if _is_running(t["id"]) or t["id"] in state.queue:
        return "The team is working on it"
    if t["id"] in state.stopped_early:
        return "Start the team again (the last run stopped early)"
    if t["status"] == "ready_to_close":
        return "Waiting for the boss to close it"
    if t["status"] == "assigned" and t.get("agent_notes", 0) > 0:  # read from the database: survives restarts
        return "Start the team again to finish it"
    if t["status"] == "open":
        return "Start the team"
    return None


@app.get("/api/tickets", response_model=TicketsResponse)
async def tickets() -> TicketsResponse:
    """Every ticket with its status (open or resolved), lead, last note, the payments waiting for approval,
    how many notes the agents wrote, the next step and the delivery date an order waits for; plus the team
    runs (every running one and the latest finished one per ticket, newest first) and the queued tickets."""
    board = await owner_call("list_open_tickets", {"include_closed": True})
    approvals = await owner_call("list_pending_approvals")
    pending: dict[int, list[PendingPayment]] = {}
    for r in approvals.get("payment_requests", []):
        bill = r.get("bill", {})
        pending.setdefault(r["ticket_id"], []).append(PendingPayment(
            request_id=r["request_id"], kind=bill.get("kind", ""), ref_id=bill.get("ref_id", 0),
            payee=bill.get("payee"), amount=bill.get("amount", 0.0), due=bill.get("due"), reason=r.get("reason"),
            requested_by=r.get("requested_by"), priority_rank=r.get("priority_rank"),
            cash_covers_it=r.get("cash_covers_it")))
    views: list[TicketView] = []
    for t in board["tickets"]:
        payments = pending.get(t["id"], [])
        waiting = (await _waiting_on_date(t["id"], board["shop_today"])
                   if t["type"] in ORDER_TYPES and t["status"] not in CLOSED and t["status"] != "open" else None)
        views.append(TicketView(
            id=t["id"], type=t["type"], requester=t["requester"], subject=t["subject"], status=t["status"],
            state="resolved" if t["status"] in CLOSED else "open", lead=t.get("lead"), support=t.get("support", []),
            last_note=t.get("last_note"), pending_payments=payments, open_escalations=t.get("open_escalations", 0),
            agent_notes=t.get("agent_notes", 0), next_step=_next_step(t, payments, waiting), waiting_on_date=waiting))
    runs = list(reversed(state.runs.values()))  # newest first
    return TicketsResponse(shop_today=board["shop_today"], tickets=views, runs=runs, run=runs[0] if runs else None,
                           queued=list(state.queue))


# ---------- agent team ----------

def _start(ticket_id: int) -> None:
    state.runs.pop(ticket_id, None)  # re-inserted last: state.runs stays in start order
    state.runs[ticket_id] = RunStatus(ticket_id=ticket_id, status="running", started_at=_now())
    state.active[ticket_id] = asyncio.create_task(_run_team(ticket_id))


async def _ticket_status(ticket_id: int) -> str | None:
    """The ticket's status, or None if it can't be read."""
    try:
        return (await owner_call("read_ticket", {"ticket_id": ticket_id}))["ticket"]["status"]
    except Exception:
        return None


async def _start_next() -> None:
    """Start queued tickets, oldest first, while a slot is free. Only tickets known to be closed leave the
    queue unstarted; one whose status can't be read (say, a busy database) still starts, and its run ends
    at once (no_work) if nothing is left."""
    while state.queue and _free_slots() > 0:
        ticket_id = state.queue[0]
        status = await _ticket_status(ticket_id)  # it stays queued meanwhile, so nothing else starts it
        if ticket_id not in state.queue:
            continue  # a parallel _start_next took it
        if status in CLOSED:
            state.queue.remove(ticket_id)
            continue
        if _free_slots() <= 0:
            return  # the last slot went to another start meanwhile: it waits for the next run to end
        state.queue.remove(ticket_id)
        if not _is_running(ticket_id):
            _start(ticket_id)


async def _run_team(ticket_id: int) -> None:
    """One team run on one ticket. However it ends, its slot frees up; unless the server is stopping,
    queued tickets then start while slots are free."""
    run = state.runs[ticket_id]
    try:
        result = await team.run_team(ticket_ids=[ticket_id])
        run = run.model_copy(update={
            "status": "error" if result.stop_reason == "error" else "finished", "finished_at": _now(),
            "run_id": result.run_id, "stop_reason": result.stop_reason, "turns": len(result.turns),
            "tokens": result.total_tokens, "error": result.error})
    except asyncio.CancelledError:  # the server is stopping: nothing new starts
        state.runs[ticket_id] = run.model_copy(update={"status": "error", "finished_at": _now(),
                                                       "stop_reason": "interrupted", "error": "Run cancelled."})
        raise
    except Exception as exc:  # the dashboard shows it; the server keeps running
        run = run.model_copy(update={"status": "error", "finished_at": _now(), "error": common.error_text(exc)})
    finally:
        state.active.pop(ticket_id, None)
    state.runs[ticket_id] = run
    why = run.stop_reason or ("error" if run.status == "error" else None)
    if why in EARLY_STOPS:  # work may be left and no owner click will wake it: the board says so
        state.stopped_early[ticket_id] = why
    else:
        state.stopped_early.pop(ticket_id, None)
    if ticket_id in state.follow_up:  # the owner acted on this ticket during the run: one more pass
        state.follow_up.discard(ticket_id)
        if ticket_id not in state.queue:
            state.queue.append(ticket_id)
    await _start_next()


async def _enqueue(ticket_id: int, status: str | None = None, *, follow_up: bool = False) -> bool:
    """Put the team on a ticket: start now if fewer than MAX_RUNS runs are on, else line it up in the queue.
    Closed tickets and tickets already queued are skipped, and so is a ticket being worked on, unless
    follow_up (an owner click on it during its run): then it runs once more after that run, so a run
    that ends just before it sees the owner's note can't leave the ticket stuck.
    Returns True when the team will (again) work on the ticket."""
    if status is None:
        status = await _ticket_status(ticket_id)
    if status is None or status in CLOSED or ticket_id in state.queue:
        return False
    if _is_running(ticket_id):
        if follow_up:
            state.follow_up.add(ticket_id)
        return follow_up
    if _free_slots() > 0:
        _start(ticket_id)
    else:
        state.queue.append(ticket_id)
    return True


async def _continue_team(*ticket_ids: int | None) -> list[int]:
    """After an owner click: the team picks these tickets up again (unless CC_AUTO_CONTINUE=0).
    Returns the ticket ids it will work on."""
    if not AUTO_CONTINUE:
        return []
    picked: list[int] = []
    for ticket_id in ticket_ids:
        if ticket_id is not None and ticket_id not in picked and await _enqueue(ticket_id, follow_up=True):
            picked.append(ticket_id)
    return picked


@app.post("/api/tickets/{ticket_id}/run", response_model=RunStatus, status_code=202)
async def run_ticket(ticket_id: int) -> RunStatus:
    """Start the agent team on one ticket (a sample ticket or any other); poll /api/events for progress.
    Up to MAX_RUNS tickets run at once; while all slots are busy this one is queued and starts when a run
    ends. A ticket already running or queued stays as it is. Returns the ticket's run (running or queued)."""
    detail = await owner_call("read_ticket", {"ticket_id": ticket_id})
    status = detail["ticket"]["status"]
    if status in CLOSED:
        raise HTTPException(status_code=409, detail=f"Ticket {ticket_id} is already resolved.")
    await _enqueue(ticket_id, status)  # starts now or queues; no-op if it already runs or waits
    if _is_running(ticket_id):
        return state.runs[ticket_id]
    if ticket_id in state.queue:
        return RunStatus(ticket_id=ticket_id, status="queued", started_at=_now())
    raise HTTPException(status_code=409, detail=f"The team could not start on ticket {ticket_id}.")


@app.get("/api/events", response_model=EventsResponse)
async def events(after: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=500),
                 ticket_id: int | None = None) -> EventsResponse:
    """Recent agent steps: what each agent said, which tools it called and what came back."""
    entries = await asyncio.to_thread(audit.read_entries)
    picked = [e for e in entries
              if e.get("seq", 0) > after and e.get("kind") in EVENT_KINDS
              and (ticket_id is None or ticket_id in e.get("ticket_ids", []))]
    views = [EventView(seq=e["seq"], time=e["time"], run_id=e["run_id"], agent=e["agent"],
                       ticket_ids=e.get("ticket_ids", []), kind=e["kind"], tool=e.get("tool"),
                       text=e.get("text"), args=e.get("args"), result=e.get("result"), status=e.get("status"))
             for e in picked[-limit:]]
    last = entries[-1]["seq"] if entries else 0
    return EventsResponse(events=views, last_seq=last, running=_running())


# ---------- money ----------

@app.post("/api/payments/{request_id}/approve", response_model=ApproveResult)
async def approve_payment(request_id: int) -> ApproveResult:
    """The owner's approve click: approves the agent's payment request and pays it. This is what moves cash."""
    req = (await owner_call("payment_status", {"request_id": request_id}))["requests"][0]
    status = req["status"]
    if status == "pending":
        await owner_call("approve_payment", {"request_id": request_id, "note": "Approved on the dashboard."})
    elif status != "approved":
        raise HTTPException(status_code=409, detail=f"Payment request #{request_id} is already {status}.")
    try:
        paid = await owner_call("pay_bill", {"request_id": request_id})
    except HTTPException as exc:  # approved but not paid: still hand the ticket back to the team
        paid = {"done": False, "reason": exc.detail}
    return ApproveResult(request_id=request_id, approved=True, paid=bool(paid.get("done")),
                         reason=paid.get("reason"), amount=paid.get("amount"), payee=paid.get("payee"),
                         balance_after=paid.get("balance_after"),
                         team_continues=await _continue_team(req.get("ticket_id")))


@app.get("/api/cash", response_model=CashView)
async def cash() -> CashView:
    """Current checking balance, plus what is already promised to pending or approved requests."""
    ov = await owner_call("cash_overview", {"account": "checking"})
    return CashView(shop_today=ov["shop_today"], account=ov["account"], balance=ov["balance"],
                    committed=ov.get("committed"), available=ov.get("available"))


def _num(value: Any) -> float | None:
    """A finite number from a tool result, else None."""
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        return None
    return float(value)


def _entry_label(e: dict[str, Any]) -> str:
    """What a cash-plan entry is about: its label, else the bill or the order ticket."""
    for key in ("label", "bill", "description"):
        v = e.get(key)
        if isinstance(v, str) and v.strip():
            return v.strip()
        if isinstance(v, dict):
            return _entry_label(v)
    if e.get("ref_id") is not None:
        return f"{e.get('bill_kind') or e.get('kind') or 'bill'} #{e['ref_id']}"
    if e.get("ticket_id") is not None:
        return f"Order ticket #{e['ticket_id']}"
    return "Unnamed entry"


def _entry_field(e: dict[str, Any], *keys: str) -> Any:
    """The first of these keys set on the entry or on its nested bill."""
    bill = e.get("bill") if isinstance(e.get("bill"), dict) else {}
    return next((src[k] for k in keys for src in (e, bill) if src.get(k) is not None), None)


def _forecast_item(e: dict[str, Any], kind: str, day: str, balances: dict[str, Any]) -> ForecastItem | None:
    amount = _num(e.get("amount"))
    if amount is None:
        return None
    pay_on = _entry_field(e, "pay_on")
    return ForecastItem(
        date=str(e.get("date") or day or pay_on or _entry_field(e, "due", "due_date") or ""), kind=kind,
        label=_entry_label(e), amount=round(abs(amount), 2),
        planned=kind == "payment" and bool(e.get("planned", pay_on is not None)),
        due=_entry_field(e, "due", "due_date") if kind == "payment" else None, payee=_entry_field(e, "payee"),
        cash_only=_num(e.get("cash_only", balances.get("cash_only"))),
        with_expected_sales=_num(e.get("with_expected_sales", balances.get("with_expected_sales"))))


def _forecast_timeline(raw: dict[str, Any], balance: float) -> list[ForecastItem]:
    """cash_forecast's timeline as dated items, payments before inflows on a day. It reads days
    ({date, outflows|payments: [...], inflows|expected_inflows: [...], cash_only, with_expected_sales})
    or flat items ({date, kind 'payment'|'inflow', label, amount, planned, due, payee, ...}). Without
    running balances from the server they are computed here: payments lower both, inflows only the one
    counting expected sales."""
    items: list[ForecastItem] = []
    for entry in raw.get("timeline") or []:
        if not isinstance(entry, dict):
            continue
        outs = entry.get("outflows", entry.get("payments"))
        ins = entry.get("inflows", entry.get("expected_inflows"))
        if isinstance(outs, list) or isinstance(ins, list):  # one day with its money movements
            day = str(entry.get("date") or "")
            for kind, moves in (("payment", outs), ("inflow", ins)):
                for m in moves if isinstance(moves, list) else []:
                    if isinstance(m, dict) and (item := _forecast_item(m, kind, day, entry)) is not None:
                        items.append(item)
            continue
        words = " ".join(str(entry.get(k) or "") for k in ("kind", "type", "direction")).lower()
        kind = "inflow" if "inflow" in words or "sale" in words else "payment"
        if (item := _forecast_item(entry, kind, "", {})) is not None:
            items.append(item)
    items.sort(key=lambda i: (i.date, i.kind != "payment"))
    if items and all(i.cash_only is None for i in items):
        cash_only = with_sales = balance
        after_day: dict[str, tuple[float, float]] = {}
        for i in items:
            if i.kind == "payment":
                cash_only, with_sales = cash_only - i.amount, with_sales - i.amount
            else:
                with_sales += i.amount
            after_day[i.date] = (round(cash_only, 2), round(with_sales, 2))  # the day's last item wins
        for i in items:
            i.cash_only, i.with_expected_sales = after_day[i.date]
    return items


def _low_point(raw: Any, items: list[ForecastItem], field: str, start: float,
               today: str) -> tuple[float | None, str | None]:
    """The lowest running balance in the plan and its date (the server's, else read off the timeline)."""
    if isinstance(raw, dict):
        value = next((raw[k] for k in (field, "amount", "balance") if raw.get(k) is not None), None)
        return _num(value), raw.get("date")
    if _num(raw) is not None:
        return _num(raw), None
    low, when = start, today
    for i in items:
        value = getattr(i, field)
        if value is not None and value < low:
            low, when = value, i.date
    return round(low, 2), when


def _deadlines_at_risk(raw: dict[str, Any]) -> list[DeadlineAtRisk]:
    """Bills the plan can't pay by their due date: one row per bill with the shortfall on cash alone and
    counting expected sales. Reads a list of rows ({bill|label, due, amount, short_by,
    short_by_with_expected_sales}) or {cash_only: [...], with_expected_sales: [...]}."""
    risks = raw.get("deadlines_at_risk")
    if isinstance(risks, dict):
        cash_rows, sales_rows = risks.get("cash_only") or [], risks.get("with_expected_sales")
    else:
        cash_rows, sales_rows = risks or [], raw.get("deadlines_at_risk_with_expected_sales")
    told = isinstance(sales_rows, list)  # without word on expected sales, assume they don't cover a shortfall
    rows: dict[tuple[str, Any], DeadlineAtRisk] = {}
    for r in cash_rows if isinstance(cash_rows, list) else []:
        if isinstance(r, dict):
            key = (_entry_label(r), _entry_field(r, "due", "due_date"))
            short = _num(r.get("short_by", r.get("short_by_cash_only"))) or 0.0
            with_sales = _num(r.get("short_by_with_expected_sales"))
            rows[key] = DeadlineAtRisk(label=key[0], due=key[1], amount=_num(_entry_field(r, "amount")),
                                       short_by=short, short_by_with_expected_sales=(
                                           with_sales if with_sales is not None else 0.0 if told else short))
    for r in sales_rows if told else []:
        if isinstance(r, dict):
            key = (_entry_label(r), _entry_field(r, "due", "due_date"))
            short = _num(r.get("short_by", r.get("short_by_with_expected_sales"))) or 0.0
            if key in rows:
                rows[key].short_by_with_expected_sales = short
            else:
                rows[key] = DeadlineAtRisk(label=key[0], due=key[1], amount=_num(_entry_field(r, "amount")),
                                           short_by=short, short_by_with_expected_sales=short)
    return sorted(rows.values(), key=lambda d: d.due or "")


@app.get("/api/forecast", response_model=ForecastResponse)
async def forecast() -> ForecastResponse:
    """The cash plan for the next FORECAST_DAYS shop days (MCP cash_forecast): every unsettled bill on the
    boss's planned pay_on date (else its due date; overdue bills today) and the expected sales of open
    orders (not guaranteed), with the running balance on cash alone and counting expected sales, the
    cash-only low point and the deadlines at risk. 404 while the MCP server has no cash_forecast tool.
    Reads from cash_forecast: shop_today, until, balance (or starting_balance), committed (an amount or the
    committed requests), timeline (see _forecast_timeline), cash_only_low_point, deadlines_at_risk and
    relies_on_expected_sales; whatever is missing is worked out from the timeline."""
    try:
        raw = await owner_call("cash_forecast", {"horizon_days": FORECAST_DAYS})
    except HTTPException as exc:
        if "unknown tool" in str(exc.detail).lower():
            raise HTTPException(status_code=404, detail="The MCP server has no cash plan (cash_forecast).") from exc
        raise
    if not isinstance(raw, dict):
        raise HTTPException(status_code=502, detail="cash_forecast returned no plan.")
    today = str(raw.get("shop_today") or "")
    balance = _num(raw.get("balance", raw.get("starting_balance"))) or 0.0
    committed = raw.get("committed", raw.get("committed_requests"))
    if isinstance(committed, dict):
        committed = committed.get("total", committed.get("amount", committed.get("requests")))
    if isinstance(committed, list):
        committed = sum(_num(r.get("amount")) or 0.0 for r in committed if isinstance(r, dict))
    items = _forecast_timeline(raw, balance)
    low, low_date = _low_point(raw.get("cash_only_low_point"), items, "cash_only", balance, today)
    if raw.get("cash_only_low_point_date"):
        low_date = raw["cash_only_low_point_date"]
    sales_low, _ = _low_point(raw.get("with_expected_sales_low_point"), items, "with_expected_sales", balance, today)
    risks = _deadlines_at_risk(raw)
    relies = raw.get("relies_on_expected_sales")
    if not isinstance(relies, bool):  # every deadline is met only when the expected sales come in
        relies = any(r.short_by > 0 for r in risks) and all(r.short_by_with_expected_sales <= 0 for r in risks)
    return ForecastResponse(
        shop_today=today, until=raw.get("until") or raw.get("horizon_end") or (items[-1].date if items else None),
        balance=round(balance, 2), committed=round(_num(committed) or 0.0, 2), timeline=items,
        cash_only_low_point=low, cash_only_low_point_date=low_date, with_expected_sales_low_point=sales_low,
        deadlines_at_risk=risks, relies_on_expected_sales=relies)


# ---------- the owner's other decisions ----------

@app.get("/api/decisions", response_model=DecisionsResponse)
async def decisions() -> DecisionsResponse:
    """What only the owner decides besides payments: the boss's open escalations, and the open tickets where
    customer service asked for a price beyond its limit (a pending discount request), with what was asked,
    by whom and why, and the ticket's prices. No request, no discount card."""
    approvals = await owner_call("list_pending_approvals")
    escalations = [Escalation(
        escalation_id=e["escalation_id"], ticket_id=e["ticket_id"], question=e["question"],
        options=[DecisionOption(choice=o["choice"], option=o["option"]) for o in e.get("options", [])],
        recommendation=e.get("recommendation"), raised_by=e.get("raised_by"), created_at=e.get("created_at"))
        for e in approvals.get("escalations", [])]
    asks = [r for r in approvals.get("discount_requests", []) if r.get("status", "pending") == "pending"]
    discounts: list[DiscountTicket] = []
    if asks:
        board = {t["id"]: t for t in (await owner_call("list_open_tickets"))["tickets"]}
        for r in asks:
            t = board.get(r.get("ticket_id"))
            asked = _num(r.get("unit_price"))
            if t is None or t["status"] in CLOSED or asked is None:
                continue  # the ticket was closed meanwhile (or the request has no price): nothing to decide
            try:
                price = (await owner_call("check_order", {"ticket_id": t["id"]})).get("price") or {}
            except HTTPException:
                price = {}  # the request still shows, just without the ticket's prices
            pct = _num(r.get("discount_pct"))
            if pct is None and _num(price.get("list_price")):
                pct = round((price["list_price"] - asked) / price["list_price"] * 100, 2)
            discounts.append(DiscountTicket(
                ticket_id=t["id"], subject=t.get("subject") or "", requester=t.get("requester") or "",
                requested_unit_price=asked, requested_discount_pct=pct or 0.0,
                limit_pct=_num(r.get("limit_pct")), reason=r.get("reason"), requested_by=r.get("requested_by"),
                requested_at=r.get("requested_at"), list_price=price.get("list_price"),
                unit_cost=price.get("unit_cost"), agreed_unit_price=price.get("agreed_unit_price"),
                owner_min_unit_price=price.get("owner_min_unit_price")))
    return DecisionsResponse(escalations=escalations, discount_tickets=discounts)


@app.post("/api/decisions/{escalation_id}", response_model=DecideResult)
async def decide(escalation_id: int, body: DecideRequest) -> DecideResult:
    """The owner picks one of the boss's numbered options; the boss gets the decision as a note."""
    asked = next((e for e in (await owner_call("list_pending_approvals")).get("escalations", [])
                  if e["escalation_id"] == escalation_id), {})
    picked = next((o["option"] for o in asked.get("options", []) if o["choice"] == body.choice), "")
    result = await owner_call("decide_escalation", {"escalation_id": escalation_id, "choice": body.choice,
                                                     "note": body.note})
    ticket_id = result.get("ticket_id", asked.get("ticket_id"))
    return DecideResult(escalation_id=escalation_id, ticket_id=ticket_id, decision=result.get("decision") or picked,
                        team_continues=await _continue_team(ticket_id))


@app.post("/api/discounts/{ticket_id}/approve", response_model=DiscountResult)
async def approve_discount(ticket_id: int, body: DiscountRequest) -> DiscountResult:
    """The owner's OK for a deeper discount on a price_override ticket: agents may agree any unit price
    at or above min_unit_price (never below unit cost). The pending request (if any) is marked approved;
    customer service and the boss get the decision as a note."""
    result = await owner_call("approve_discount", {"ticket_id": ticket_id, "min_unit_price": body.min_unit_price,
                                                    "note": body.note})
    floor = result.get("min_unit_price", round(body.min_unit_price, 2))
    pct = result.get("max_discount_pct")
    off = f" ({pct:.1f}% off list)" if pct is not None else ""
    return DiscountResult(ticket_id=ticket_id, min_unit_price=floor,
                          message=f"Customer service may agree prices down to ${floor:,.2f} per unit{off} "
                                  f"on ticket {ticket_id}.",
                          team_continues=await _continue_team(ticket_id))


@app.post("/api/discounts/{ticket_id}/decline", response_model=DeclineDiscountResult)
async def decline_discount(ticket_id: int, body: DeclineDiscountRequest) -> DeclineDiscountResult:
    """The owner's no to the deeper discount customer service asked for: the policy price stays. Customer
    service and the boss get the decision as a note. Refused (400) when no request is pending."""
    result = await owner_call("decline_discount", {"ticket_id": ticket_id, "note": body.note})
    asked = _num(result.get("unit_price")) if isinstance(result, dict) else None
    what = f" (${asked:,.2f} per unit)" if asked is not None else ""
    return DeclineDiscountResult(ticket_id=ticket_id,
                                 message=f"You declined the deeper discount{what} on ticket {ticket_id}; "
                                         f"customer service keeps the policy price.",
                                 team_continues=await _continue_team(ticket_id))


async def _planned_payment_due(ticket_id: int, shop_today: str) -> bool:
    """True when the date move to shop_today left accounting a note on this ticket that a payment the boss
    planned (pay_on) is due now ('Planned payment for <bill> ... is due now ...')."""
    try:
        notes = (await owner_call("read_ticket", {"ticket_id": ticket_id})).get("notes", [])
    except HTTPException:
        return False
    return any(n.get("to_agent") == "accounting" and n.get("shop_date") == shop_today
               and "planned payment" in (n.get("body") or "").lower() for n in notes)


@app.post("/api/shop-date/advance", response_model=DateMoveResult)
async def advance_date(body: AdvanceDateRequest) -> DateMoveResult:
    """Move the shop date forward 1-31 days (vendor lead times count in shop days). Not while any team run is on.
    Afterwards the team picks up every ticket it has started on (status not 'open'), except order tickets
    whose delivery is still after the new date (their inventory note waits for a later move): the date note
    wakes inventory where a restock may have arrived; a ticket with nothing to do ends at once (no_work).
    A ticket where a payment the boss planned (pay_on) falls due on the new date always continues, even an
    order still waiting for its delivery or a ticket the team has not started: accounting got a 'planned
    payment is due now' note there and requests the payment.
    Up to MAX_RUNS of them start at once; the rest wait in the queue."""
    busy = "Wait for the team runs to finish before moving the shop date."
    if _running() or state.queue:
        raise HTTPException(status_code=409, detail=busy)
    async with state.lock:  # checked again under the lock: no run can start between the check and the move
        if _running() or state.queue:
            raise HTTPException(status_code=409, detail=busy)
        try:  # common.call_tool, not owner_call: state.lock is already held and is not reentrant
            moved = await common.call_tool(state.client, "advance_shop_date", {"days": body.days})
        except ToolError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    continues: list[int] = []
    if AUTO_CONTINUE:
        try:
            board = (await owner_call("list_open_tickets"))["tickets"]
        except HTTPException:
            board = []  # the date moved anyway; the owner can still start the team by hand
        for t in board:
            if t["status"] in CLOSED:
                continue
            wake = t["status"] != "open" and not (  # not started, or the delivery is still ahead: no wake-up
                t["type"] in ORDER_TYPES and await _waiting_on_date(t["id"], moved["after"]))
            if not wake:  # unless a bill fell due on it (planned or on its due date): accounting requests it now
                wake = t["id"] in moved.get("accounting_noted_tickets", []) or \
                    await _planned_payment_due(t["id"], moved["after"])
            if wake and await _enqueue(t["id"], t["status"]):
                continues.append(t["id"])
    return DateMoveResult(before=moved["before"], after=moved["after"], team_continues=continues)


# ---------- reset ----------

@app.post("/api/reset", response_model=ResetResult)
async def reset() -> ResetResult:
    """Copy the original database over the working copy for a fresh run. Not while any team run is on.
    The audit trail is kept."""
    busy = "Wait for the team runs to finish before resetting."
    if _running() or state.queue:
        raise HTTPException(status_code=409, detail=busy)
    working = common.db_path()
    if working.resolve() == common.ORIGINAL_DB.resolve():
        raise HTTPException(status_code=500, detail="The working database points at the original; refusing.")
    async with state.lock:  # no tool call reads the file while it is replaced
        if _running() or state.queue:  # a queued ticket may have started while this waited for the lock
            raise HTTPException(status_code=409, detail=busy)
        await asyncio.to_thread(shutil.copyfile, common.ORIGINAL_DB, working)
    state.runs.clear()  # finished runs already left state.active
    state.queue.clear()
    state.follow_up.clear()
    state.stopped_early.clear()
    return ResetResult(done=True, message=f"Working database reset from {common.ORIGINAL_DB.name}. "
                                          f"Audit trail kept.")


@app.get("/api/plan", response_model=BossPlanResponse)
async def plan() -> BossPlanResponse:
    """The boss's newest recommended order for resolving the open tickets (cash, deadlines, dependencies)."""
    r = (await owner_call("boss_plan")).get("plan")
    if not r:
        return BossPlanResponse()
    return BossPlanResponse(plan_id=r["plan_id"], steps=r["steps"], summary=r["summary"],
                            shop_date=r["shop_date"], created_at=r["created_at"])

