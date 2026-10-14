"""Accounting agent: tracks open bills and cash, follows the boss's payment priority, requests
payments (the owner approves every one) and pays a bill only after the owner approved it.

Tools (only from its own MCP process, server.py --role accounting): read_ticket, my_work,
send_message, add_note, request_close, list_open_bills, cash_overview, request_payment,
payment_status, pay_bill.
"""

from __future__ import annotations

from pydantic_ai import Agent

from common import build_model, load_prompt, mcp_toolset, model_settings
from models import Limits, TurnReport

NAME = "accounting"


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
