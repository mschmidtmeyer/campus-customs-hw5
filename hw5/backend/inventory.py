"""Inventory agent: checks stock and vendors, orders restocks a ticket needs (never pays),
links existing invoices as incoming stock, receives stock once confirmed, paid and past the lead time, and confirms arrival
dates to customer service.

Tools (only from its own MCP process, server.py --role inventory): read_ticket, my_work,
send_message, add_note, request_close, check_stock, check_vendor, order_restock,
link_invoice_stock, receive_stock.
"""

from __future__ import annotations

from pydantic_ai import Agent

from common import build_model, load_prompt, mcp_toolset, model_settings
from models import Limits, TurnReport

NAME = "inventory"


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
