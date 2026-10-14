"""Every data type the Campus Customs agent team uses (pydantic).

- Names and states: AgentName, TicketStatus, TurnStatus, TurnOutcome, StopReason, AuditKind
- Agent output: TurnReport (the output_type of all five agents) with TicketUpdate rows
- Orchestrator: NoteBrief, WorkItem, PendingWork, TicketBrief, UsageSummary, TurnResult, TeamRunResult
- Limits: per response, per turn and per team run (env may override every value; the model is fixed)
- AuditEntry: one line of output/audit_trail.json
- Dashboard API (main.py): TicketView, TicketsResponse, RunStatus, EventView, EventsResponse,
  ApproveResult, CashView, ResetResult; the cash plan: ForecastItem, DeadlineAtRisk, ForecastResponse;
  the owner's other decisions: DecisionOption, Escalation, DiscountTicket, DecisionsResponse,
  DecideRequest, DecideResult, DiscountRequest, DiscountResult, DeclineDiscountRequest,
  DeclineDiscountResult, AdvanceDateRequest, DateMoveResult (owner results list the tickets the team
  picks up again)

Facts about the shop never live here: they come from the MCP server.
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from typing import Annotated, Any, Literal, get_args

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field

AgentName = Literal["boss", "inventory", "accounting", "facilities", "customer_service"]
AGENT_NAMES: tuple[str, ...] = get_args(AgentName)
WORKERS: tuple[str, ...] = tuple(a for a in AGENT_NAMES if a != "boss")

TicketStatus = Literal["open", "assigned", "ready_to_close", "closed", "resolved"]
CLOSED = frozenset({"closed", "resolved"})  # legacy "resolved" (Problem 4) counts as closed

TurnStatus = Literal["progress", "waiting", "done", "blocked"]
TurnOutcome = Literal["progress", "waiting", "done", "blocked", "budget_stop", "error"]
StopReason = Literal[
    "no_work", "max_rounds", "max_turns", "token_budget", "stop_requested", "error", "interrupted"
]

AuditKind = Literal[
    "run_start", "turn_start", "user_prompt", "model_response", "tool_call", "tool_result",
    "turn_end", "budget_stop", "stop_requested", "error", "run_end",
]
AUDIT_KINDS = frozenset(get_args(AuditKind))


def _clipped(limit: int) -> BeforeValidator:
    """Trim and shorten agent text instead of failing the whole turn over a long sentence."""

    def clip(value: Any) -> Any:
        if isinstance(value, str):
            value = value.strip()
            if len(value) > limit:
                value = value[: limit - 3].rstrip() + "..."
        return value

    return BeforeValidator(clip)


# ---------- agent output ----------


class TicketUpdate(BaseModel):
    """One short board update for one ticket you worked on in this turn."""

    ticket_id: int = Field(description="Id of the ticket this update is about.")
    note: Annotated[
        str,
        _clipped(400),
        Field(
            min_length=1,
            max_length=400,
            description="What you did or found on this ticket and what happens next (max 400 characters). "
            "Facts only from tool results.",
        ),
    ]


class TurnReport(BaseModel):
    """Your report at the end of this turn. The orchestrator posts it on the ticket board."""

    summary: Annotated[
        str,
        _clipped(600),
        Field(
            min_length=1,
            max_length=600,
            description="What you did this turn, what you are waiting for, and who acts next "
            "(max 600 characters). Facts only from tool results.",
        ),
    ]
    status: TurnStatus = Field(
        description="progress = you did work and more remains; waiting = you are waiting on another agent "
        "or the owner; done = your part on these tickets is finished; blocked = you cannot continue "
        "without the boss or the owner."
    )
    ticket_updates: list[TicketUpdate] = Field(
        default_factory=list,
        description="One update per ticket you were called about.",
    )


# ---------- orchestrator ----------


class NoteBrief(BaseModel):
    """A ticket note as pending_work reports it (body already shortened by the server)."""

    model_config = ConfigDict(extra="ignore")

    id: int
    author: str
    kind: str
    body: str = ""


class WorkItem(BaseModel):
    """One reason for one agent to take a turn on one ticket (from the system tool pending_work)."""

    model_config = ConfigDict(extra="ignore")

    agent: AgentName
    ticket_id: int
    reasons: list[str] = Field(default_factory=list)
    new_notes: list[NoteBrief] = Field(default_factory=list)


class PendingWork(BaseModel):
    """What pending_work returned: shop today plus the work items that passed validation."""

    shop_today: str | None = None
    items: list[WorkItem] = Field(default_factory=list)


class TicketBrief(BaseModel):
    """Ticket facts the turn prompt shows (from read_ticket via the system role)."""

    model_config = ConfigDict(extra="ignore")

    id: int
    type: str | None = None
    subject: str | None = None
    status: str | None = None
    lead: str | None = None
    support: list[str] = Field(default_factory=list)


class UsageSummary(BaseModel):
    """Token and call counts for one model response, one turn or a whole run."""

    input_tokens: int = 0
    output_tokens: int = 0
    requests: int = 0
    tool_calls: int = 0

    @property
    def total_tokens(self) -> int:
        return self.input_tokens + self.output_tokens

    @classmethod
    def of(cls, usage: Any) -> UsageSummary:
        """From a pydantic-ai RunUsage / RequestUsage (or a dict). Missing counts are 0."""
        if usage is None:
            return cls()
        if isinstance(usage, Mapping):
            get = usage.get
        else:
            def get(key: str, default: int = 0) -> Any:
                return getattr(usage, key, default)
        return cls(**{k: int(get(k, 0) or 0) for k in cls.model_fields})

    def __add__(self, other: UsageSummary) -> UsageSummary:
        return UsageSummary(**{k: getattr(self, k) + getattr(other, k) for k in UsageSummary.model_fields})


class TurnResult(BaseModel):
    """One agent turn: what it reported (or why it stopped), what it cost."""

    turn_id: str
    round_no: int = 0
    agent: AgentName
    ticket_ids: list[int] = Field(default_factory=list)
    outcome: TurnOutcome
    report: TurnReport | None = None
    usage: UsageSummary = Field(default_factory=UsageSummary)
    latency_ms: int = 0
    error: str | None = None
    summary_note_ids: list[int] = Field(default_factory=list)


class TeamRunResult(BaseModel):
    """One orchestrator run over the ticket board."""

    run_id: str
    rounds: int = 0
    turns: list[TurnResult] = Field(default_factory=list)
    usage: UsageSummary = Field(default_factory=UsageSummary)
    stop_reason: StopReason
    error: str | None = None
    audit_path: str
    db_path: str

    @property
    def total_tokens(self) -> int:
        return self.usage.total_tokens


# ---------- limits ----------


class Limits(BaseModel):
    """Usage limits. Every field can be overridden by the env var of the same name in capitals
    (TURN_REQUEST_LIMIT, ..., TEAM_MAX_ROUNDS). The model itself can not be overridden."""

    model_config = ConfigDict(frozen=True)

    turn_request_limit: int = Field(10, ge=1)  # model requests per turn
    turn_tool_calls_limit: int = Field(16, ge=1)  # tool calls per turn
    turn_total_tokens_limit: int = Field(80_000, ge=1)  # input + output tokens per turn
    max_output_tokens: int = Field(1500, ge=1)  # per model response
    team_max_turns: int = Field(30, ge=1)  # turns per team run
    team_token_budget: int = Field(600_000, ge=1)  # input + output tokens per team run
    team_max_rounds: int = Field(6, ge=1)  # default rounds per team run

    @classmethod
    def from_env(cls, environ: Mapping[str, str] | None = None) -> Limits:
        env = os.environ if environ is None else environ
        values: dict[str, int] = {}
        for name in cls.model_fields:
            raw = (env.get(name.upper()) or "").strip()
            if not raw:
                continue
            try:
                values[name] = int(raw.replace("_", "").replace(",", ""))
            except ValueError:
                raise ValueError(f"{name.upper()} must be a whole number, got {raw!r}") from None
        return cls(**values)


# ---------- audit trail ----------


class AuditEntry(BaseModel):
    """One entry of output/audit_trail.json. `hash` = SHA-256 of the entry without `hash`
    (canonical JSON), `prev_hash` = hash of the entry before, so edits break the chain."""

    model_config = ConfigDict(extra="forbid")

    seq: int
    time: str  # UTC ISO with milliseconds
    run_id: str
    turn_id: str | None = None
    agent: str
    ticket_ids: list[int] = Field(default_factory=list)
    kind: AuditKind
    step: int | None = None
    node: str | None = None
    text: str | None = None
    tool: str | None = None
    tool_call_id: str | None = None
    args: str | None = None  # compact JSON, redacted, max 600 chars
    result: str | None = None  # compact JSON or text, redacted, max 800 chars
    usage: UsageSummary | None = None
    model: str | None = None
    finish_reason: str | None = None
    latency_ms: int | None = None
    status: str | None = None
    detail: str | None = None
    prev_hash: str
    hash: str


# ---------- dashboard API (main.py) ----------


class PendingPayment(BaseModel):
    """A payment request waiting for the owner's approve click."""

    request_id: int
    kind: str
    ref_id: int
    payee: str | None = None
    amount: float
    due: str | None = None
    reason: str | None = None
    requested_by: str | None = None
    priority_rank: int | None = None
    cash_covers_it: bool | None = None


class TicketView(BaseModel):
    """One ticket on the dashboard board."""

    id: int
    type: str
    requester: str
    subject: str
    status: str  # open | assigned | ready_to_close | closed | resolved
    state: Literal["open", "resolved"]
    lead: str | None = None
    support: list[str] = Field(default_factory=list)
    last_note: dict[str, Any] | None = None
    pending_payments: list[PendingPayment] = Field(default_factory=list)
    open_escalations: int = 0
    agent_notes: int = 0  # notes the five agents wrote on it (from the database: > 0 = the team has worked on it)
    next_step: str | None = None  # plain-English hint: what has to happen next (None if nothing / resolved)
    waiting_on_date: str | None = None  # earliest expected arrival (after shop today) of a restock it waits for


class RunStatus(BaseModel):
    """One agent team run on one ticket, started from the dashboard (up to 3 at once, CC_MAX_RUNS;
    'queued' = waiting for a free slot)."""

    ticket_id: int
    status: Literal["running", "queued", "finished", "error"]
    started_at: str
    finished_at: str | None = None
    run_id: str | None = None
    stop_reason: str | None = None
    turns: int = 0
    tokens: int = 0
    error: str | None = None


class TicketsResponse(BaseModel):
    shop_today: str
    tickets: list[TicketView]
    runs: list[RunStatus] = Field(default_factory=list)  # running runs + latest finished run per ticket, newest first
    run: RunStatus | None = None  # the newest of runs (kept for older dashboards)
    queued: list[int] = Field(default_factory=list)  # tickets waiting for a free slot, in order


class EventView(BaseModel):
    """One agent step for the board: what an agent said, did, or which tool it used."""

    seq: int
    time: str
    run_id: str
    agent: str
    ticket_ids: list[int] = Field(default_factory=list)
    kind: str
    tool: str | None = None
    text: str | None = None
    args: str | None = None
    result: str | None = None
    status: str | None = None


class EventsResponse(BaseModel):
    events: list[EventView]
    last_seq: int
    running: bool


class ApproveResult(BaseModel):
    """The owner's approve click: approve the request, then pay it (the only route that moves cash)."""

    request_id: int
    approved: bool
    paid: bool
    reason: str | None = None
    amount: float | None = None
    payee: str | None = None
    balance_after: float | None = None
    team_continues: list[int] = Field(default_factory=list)  # tickets the team picks up again


class CashView(BaseModel):
    shop_today: str
    account: str
    balance: float
    committed: float | None = None
    available: float | None = None


class ResetResult(BaseModel):
    done: bool
    message: str


# ---------- dashboard API: the cash plan ----------


class ForecastItem(BaseModel):
    """One dated money movement in the cash plan: a bill payment (on the boss's planned pay_on date, else on
    its due date; overdue bills today) or an expected inflow from an open order (not guaranteed)."""

    date: str
    kind: Literal["payment", "inflow"]
    label: str  # payment: the bill (and payee); inflow: the order ticket and what it would sell
    amount: float  # always positive; kind says which way the money moves
    planned: bool = False  # payment: the boss set a pay_on date for it
    due: str | None = None  # payment: the bill's deadline
    payee: str | None = None
    cash_only: float | None = None  # running balance after this day, counting no expected sales
    with_expected_sales: float | None = None  # running balance after this day, counting expected sales


class DeadlineAtRisk(BaseModel):
    """A bill the plan can't pay by its due date with the cash on hand alone."""

    label: str
    due: str | None = None
    amount: float | None = None
    short_by: float  # cash only
    short_by_with_expected_sales: float = 0.0  # 0 = expected sales would cover it (not guaranteed)


class ForecastResponse(BaseModel):
    """The owner's cash plan (MCP cash_forecast, next 31 shop days): every unsettled bill and expected sale,
    day by day, with the running balance on cash alone and counting expected sales."""

    shop_today: str
    until: str | None = None
    balance: float
    committed: float = 0.0  # already promised to pending or approved payment requests
    timeline: list[ForecastItem] = Field(default_factory=list)  # by date; payments before inflows on a day
    cash_only_low_point: float | None = None
    cash_only_low_point_date: str | None = None
    with_expected_sales_low_point: float | None = None
    deadlines_at_risk: list[DeadlineAtRisk] = Field(default_factory=list)
    relies_on_expected_sales: bool = False  # every deadline is met only if the expected sales come in


# ---------- dashboard API: the owner's other decisions ----------


class DecisionOption(BaseModel):
    """One of the boss's numbered options on an escalation."""

    choice: int
    option: str


class Escalation(BaseModel):
    """A trade-off the boss escalated, waiting for the owner's pick."""

    escalation_id: int
    ticket_id: int
    question: str
    options: list[DecisionOption] = Field(default_factory=list)
    recommendation: str | None = None
    raised_by: str | None = None
    created_at: str | None = None


class DiscountTicket(BaseModel):
    """An order ticket where customer service asked for a price beyond its limit (a pending discount
    request): what was asked, by whom and why, with the ticket's prices, for the owner's approve or decline."""

    ticket_id: int
    subject: str
    requester: str
    requested_unit_price: float
    requested_discount_pct: float
    limit_pct: float | None = None  # the agents' discount limit for this order size
    reason: str | None = None  # why apply_discount refused the price
    requested_by: str | None = None
    requested_at: str | None = None
    list_price: float | None = None
    unit_cost: float | None = None
    agreed_unit_price: float | None = None
    owner_min_unit_price: float | None = None


class DecisionsResponse(BaseModel):
    escalations: list[Escalation]
    discount_tickets: list[DiscountTicket]


class DecideRequest(BaseModel):
    choice: int = Field(ge=1, description="Option number as listed in the escalation (1-3).")
    note: str = Field("", max_length=600)


class DecideResult(BaseModel):
    escalation_id: int
    ticket_id: int | None = None
    decision: str
    team_continues: list[int] = Field(default_factory=list)


class DiscountRequest(BaseModel):
    min_unit_price: float = Field(gt=0, allow_inf_nan=False,
                                  description="Lowest unit price agents may agree on this ticket.")
    note: str = Field("", max_length=600)


class DiscountResult(BaseModel):
    ticket_id: int
    min_unit_price: float
    message: str
    team_continues: list[int] = Field(default_factory=list)


class DeclineDiscountRequest(BaseModel):
    note: str = Field("", max_length=600)


class DeclineDiscountResult(BaseModel):
    ticket_id: int
    message: str
    team_continues: list[int] = Field(default_factory=list)


class AdvanceDateRequest(BaseModel):
    days: int = Field(ge=1, le=31, description="Shop days to move forward.")


class DateMoveResult(BaseModel):
    before: str
    after: str
    team_continues: list[int] = Field(default_factory=list)



class PlanStep(BaseModel):
    """One step of the boss's recommended order for resolving the tickets."""

    order: int
    ticket_id: int
    action: str
    why: str


class BossPlanResponse(BaseModel):
    """The boss's newest plan (MCP boss_plan), or plan = None before the boss has made one."""

    plan_id: int | None = None
    steps: list[PlanStep] = Field(default_factory=list)
    summary: str | None = None
    shop_date: str | None = None
    created_at: str | None = None
