"""Boss agent: sorts and assigns tickets, decides which bill gets cash first, escalates real
trade-offs to the owner with 2-3 options, and is the only one who closes tickets (after the
lead agent asks).

Tools (only from its own MCP process, server.py --role boss): read_ticket, my_work, send_message,
add_note, request_close, list_open_tickets, assign_ticket, set_payment_priority,
escalate_to_owner, close_ticket, confirm_restock, cancel_restock, decide_partial_shipment,
read_audit_trail, list_open_bills, cash_overview.
"""

from __future__ import annotations

from pydantic_ai import Agent

from common import build_model, load_prompt, mcp_toolset, model_settings
from models import Limits, TurnReport

NAME = "boss"


def build_agent(limits: Limits | None = None) -> Agent[None, TurnReport]:
    return Agent(
        build_model(),
        name=NAME,
        instructions=load_prompt(f"{NAME}.md"),
        toolsets=[mcp_toolset(NAME)],
        output_type=TurnReport,
        model_settings=model_settings(limits),
        retries={"output": 2},
    )
