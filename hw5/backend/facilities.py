"""Facilities agent: confirms what rent is owed (lease, amount, due date) and tells accounting,
reports problems with the space as new tickets, and asks to close rent tickets once accounting
confirms payment. Never pays.

Tools (only from its own MCP process, server.py --role facilities): read_ticket, my_work,
send_message, add_note, request_close, check_lease, rent_schedule, report_facility_issue.
"""

from __future__ import annotations

from pydantic_ai import Agent

from common import build_model, load_prompt, mcp_toolset, model_settings
from models import Limits, TurnReport

NAME = "facilities"


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
