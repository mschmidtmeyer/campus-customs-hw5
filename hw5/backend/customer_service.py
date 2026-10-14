"""Customer service agent: checks customer orders, sells received stock, sets one agreed price per
ticket within the shop's order-size policy (list price under 10 units, up to 10% off for 10-19,
up to 15% for 20+; deeper only with the owner's approval), and drafts customer replies that are
saved on the board and never sent.

Tools (only from its own MCP process, server.py --role customer_service): read_ticket, my_work,
send_message, add_note, request_close, check_order, fulfill_customer_order, apply_discount,
draft_reply.
"""

from __future__ import annotations

from pydantic_ai import Agent

from common import build_model, load_prompt, mcp_toolset, model_settings
from models import Limits, TurnReport

NAME = "customer_service"


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
