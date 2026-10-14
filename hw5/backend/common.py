"""Shared wiring for the five Campus Customs agents.

- Paths and config: HW 5 folders, working DB (env CAMPUS_CUSTOMS_DB), STOP file, prompts folder
- MODEL_NAME = "gpt-6-luna" (hard-coded, no override) and build_model(): Portkey -> OpenAI Responses API
- load_prompt(name): backend/prompts/<name>
- mcp_toolset(role): an agent's ONLY tools, served by its own MCP process (server.py --role <role>)
- system_client() / call_tool(): the orchestrator's --role system client (pending_work, post_turn_summary)
- owner_client(): the dashboard's --role owner client (main.py: board, approvals, cash)
- run_turn(): one agent turn via agent.iter(), one audit entry per loop node (audit.py)

The backend has no shop tools of its own and never opens the database: every shop fact and every
change goes through the MCP server.
"""

from __future__ import annotations

import os
import sys

os.environ.setdefault("PYDANTIC_AI_NO_BANNER", "1")

import json
import time
from collections.abc import Iterable
from pathlib import Path
from typing import Any

from dotenv import dotenv_values
from fastmcp import Client
from fastmcp.client.transports import StdioTransport
from openai import AsyncOpenAI
from pydantic_ai import Agent
from pydantic_ai.exceptions import UsageLimitExceeded
from pydantic_ai.mcp import MCPToolset
from pydantic_ai.messages import RetryPromptPart, TextPart, ThinkingPart, ToolCallPart, ToolReturnPart
from pydantic_ai.models.openai import OpenAIResponsesModel, OpenAIResponsesModelSettings
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.usage import UsageLimits

import audit
from models import AGENT_NAMES, Limits, TurnReport, TurnResult, UsageSummary

BACKEND_DIR = Path(__file__).resolve().parent
HW5_DIR = BACKEND_DIR.parent
COURSE_DIR = HW5_DIR.parent
# .env with PORTKEY_API_KEY (only that one key is read): hw5/.env in a clone, else the course-root .env.
ENV_FILE = next((p for p in (HW5_DIR / ".env", COURSE_DIR / ".env") if p.is_file()), HW5_DIR / ".env")
MCP_SERVER_DIR = HW5_DIR / "mcp_server"
# The MCP server's own venv if it has one, else this Python (one shared venv from hw5/requirements.txt).
MCP_PYTHON = next((p for p in (MCP_SERVER_DIR / ".venv" / "bin" / "python",) if p.exists()), Path(sys.executable))
MCP_SERVER = MCP_SERVER_DIR / "server.py"
WORKING_DB = HW5_DIR / "data" / "campus_customs_new.db"
ORIGINAL_DB = HW5_DIR / "data" / "campus_customs.db"
DEFAULT_STOP_FILE = HW5_DIR / "output" / "STOP"
DEFAULT_PROMPTS_DIR = BACKEND_DIR / "prompts"

MODEL_NAME = "gpt-6-luna"  # the only model; deliberately not configurable
PORTKEY_BASE_URL = "https://api.portkey.ai/v1"
SYSTEM_ROLE = "system"
OWNER_ROLE = "owner"
MCP_INIT_TIMEOUT = 30  # seconds to start a server process and finish the handshake
MCP_CALL_TIMEOUT = 120  # seconds per tool call


# ---------- paths ----------


def _abs(path: str | os.PathLike[str]) -> Path:
    return Path(os.path.abspath(os.path.expanduser(str(path))))


def db_path() -> Path:
    """The working database the MCP servers use (env CAMPUS_CUSTOMS_DB, else data/campus_customs_new.db)."""
    return _abs(os.environ.get("CAMPUS_CUSTOMS_DB") or WORKING_DB)


def check_db(path: Path | None = None) -> Path:
    """Refuse to start without the working DB, or on the original DB (that one is only ever copied)."""
    path = path or db_path()
    if not path.is_file():
        raise FileNotFoundError(f"Working database not found: {path}")
    if ORIGINAL_DB.exists() and path.resolve() == ORIGINAL_DB.resolve():
        raise RuntimeError(f"Refusing to run on the original database {path}. Use a working copy.")
    return path


def stop_file() -> Path:
    """Kill switch: when this file exists the team stops before the next turn."""
    return DEFAULT_STOP_FILE


def prompts_dir() -> Path:
    return DEFAULT_PROMPTS_DIR


def load_prompt(name: str) -> str:
    """Text of prompts/<name>, e.g. load_prompt("boss.md")."""
    if Path(name).name != name or not name.endswith(".md"):
        raise ValueError(f"Prompt name must be a plain .md file name, got {name!r}")
    path = prompts_dir() / name
    if not path.is_file():
        raise FileNotFoundError(f"Prompt file not found: {path}")
    text = path.read_text(encoding="utf-8").strip()
    if not text:
        raise ValueError(f"Prompt file is empty: {path}")
    return text


# ---------- model ----------


def portkey_api_key() -> str:
    """PORTKEY_API_KEY from the environment, else from ENV_FILE. Never printed or logged."""
    key = (os.environ.get("PORTKEY_API_KEY") or "").strip()
    if not key and ENV_FILE.is_file():
        key = (dotenv_values(ENV_FILE).get("PORTKEY_API_KEY") or "").strip()
    if not key:
        raise RuntimeError(f"PORTKEY_API_KEY is not set (checked the environment and {ENV_FILE}).")
    audit.register_secret(key)  # the audit trail redacts it even if it ever showed up in text
    return key


def build_model() -> OpenAIResponsesModel:
    # Responses API: gpt-6-luna rejects function tools + reasoning on /chat/completions.
    key = portkey_api_key()
    client = AsyncOpenAI(
        api_key=key,
        base_url=PORTKEY_BASE_URL,
        timeout=120,
        max_retries=2,
        default_headers={"x-portkey-api-key": key, "x-portkey-provider": "openai"},
    )
    return OpenAIResponsesModel(MODEL_NAME, provider=OpenAIProvider(openai_client=client))


def model_settings(limits: Limits | None = None) -> OpenAIResponsesModelSettings:
    limits = limits or Limits.from_env()
    return OpenAIResponsesModelSettings(max_tokens=limits.max_output_tokens, openai_reasoning_effort="low")


# ---------- MCP ----------


def mcp_env() -> dict[str, str]:
    """The only environment an MCP server process gets (never PORTKEY_API_KEY or other secrets)."""
    env = {"CAMPUS_CUSTOMS_DB": str(db_path()), "AUDIT_TRAIL_PATH": str(_abs(audit.trail_path()))}
    for key in ("OWNER_NAME", "PATH", "HOME"):
        value = os.environ.get(key)
        if value:
            env[key] = value
    return env


def _transport(role: str) -> StdioTransport:
    if not MCP_PYTHON.exists():
        raise FileNotFoundError(f"Python for the MCP server not found: {MCP_PYTHON}")
    return StdioTransport(
        command=str(MCP_PYTHON),
        args=[str(MCP_SERVER), "--role", role],
        env=mcp_env(),
        cwd=str(MCP_SERVER_DIR),
        keep_alive=False,  # the process ends when the agent/client context exits
    )


def mcp_toolset(role: str) -> MCPToolset:
    """The agent's own MCP server process: it registers only that lane's tools."""
    if role not in AGENT_NAMES:
        raise ValueError(f"Unknown agent role {role!r}")
    client = Client(_transport(role), name=f"campus-customs-{role}",
                    init_timeout=MCP_INIT_TIMEOUT, timeout=MCP_CALL_TIMEOUT)
    return MCPToolset(client, tool_error_behavior="failed", max_retries=3, id=f"mcp-{role}")


def system_client() -> Client:
    """The orchestrator's --role system client (pending_work, post_turn_summary, read_ticket).
    Never given to an LLM."""
    return Client(_transport(SYSTEM_ROLE), name="campus-customs-system",
                  init_timeout=MCP_INIT_TIMEOUT, timeout=MCP_CALL_TIMEOUT)


def owner_client() -> Client:
    """The dashboard's --role owner client (board reads, approvals, cash). Never given to an LLM."""
    return Client(_transport(OWNER_ROLE), name="campus-customs-owner",
                  init_timeout=MCP_INIT_TIMEOUT, timeout=MCP_CALL_TIMEOUT)


async def call_tool(client: Client, name: str, args: dict[str, Any] | None = None) -> Any:
    """Call a tool on a fastmcp Client and return its JSON result (raises fastmcp ToolError on errors)."""
    result = await client.call_tool(name, args or {})
    if isinstance(result.structured_content, dict):
        return result.structured_content
    for block in result.content or ():
        text = getattr(block, "text", None)
        if text:
            try:
                return json.loads(text)
            except ValueError:
                return text
    return result.data


# ---------- one agent turn ----------


def _tickets_in(value: Any) -> list[int]:
    if isinstance(value, dict):
        t = value.get("ticket_id")
        if isinstance(t, int) and not isinstance(t, bool):
            return [t]
        if isinstance(t, str) and t.strip().isdigit():
            return [int(t)]
    return []


def _retry_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    try:  # validation errors: field locations and types only, never the rejected input
        errs = list(content)
        locs = "; ".join(f"{'.'.join(map(str, e.get('loc', ())))}: {e.get('type', '')}" for e in errs[:3])
        return f"invalid args ({len(errs)}): {locs}"
    except Exception:
        return "invalid args"


def _result_status(part: ToolReturnPart) -> str:
    outcome = getattr(part, "outcome", None) or "success"
    if outcome != "success":
        return outcome  # failed (the tool raised: the model sees the message) / denied / interrupted
    content = part.content
    if isinstance(content, dict):
        if content.get("preview") is True:
            return "preview"
        if content.get("done") is False and str(content.get("reason", "")).startswith("Refused"):
            return "refused"
    return "success"


def _request_parts(run: Any) -> list[Any]:
    try:
        messages = run.all_messages()
    except Exception:
        return []
    return [p for m in messages if getattr(m, "kind", None) == "request" for p in m.parts]


def _usage_of(run: Any) -> UsageSummary:
    try:
        return UsageSummary.of(run.usage) if run is not None else UsageSummary()
    except Exception:
        return UsageSummary()


def _prompt_text(prompt: Any) -> str:
    if isinstance(prompt, str):
        return prompt
    if isinstance(prompt, Iterable):
        return "\n".join(p if isinstance(p, str) else f"<{type(p).__name__}>" for p in prompt)
    return str(prompt)


class TurnLog:
    """Turns agent.iter() nodes into audit entries, written as one batch per node:
    UserPromptNode -> user_prompt; ModelRequestNode -> one tool_result per ToolReturnPart /
    RetryPromptPart; CallToolsNode -> model_response + one tool_call per ToolCallPart;
    End -> tool_result for returns no request node carried (tools that ran alongside the output
    tool) + turn_end (output and run usage)."""

    def __init__(self, run_id: str, turn_id: str, agent: str, ticket_ids: list[int]):
        self.run_id, self.turn_id, self.agent, self.ticket_ids = run_id, turn_id, agent, ticket_ids
        self.step = 0
        self.started = self.mark = time.monotonic()
        self.model: str | None = None
        self._returns_logged: set[str] = set()
        self._call_tickets: dict[str, list[int]] = {}

    def elapsed_ms(self) -> int:
        return int((time.monotonic() - self.started) * 1000)

    def body(self, kind: str, *, ticket_ids: list[int] | None = None, **fields: Any) -> dict[str, Any]:
        return audit.make_body(kind, run_id=self.run_id, agent=self.agent, turn_id=self.turn_id,
                               ticket_ids=self.ticket_ids if ticket_ids is None else ticket_ids, **fields)

    def event(self, kind: str, **fields: Any) -> None:
        audit.log_events([self.body(kind, **fields)])

    def node(self, node: Any, run: Any) -> None:
        self.step += 1
        now = time.monotonic()
        elapsed, self.mark = int((now - self.mark) * 1000), now
        name = type(node).__name__
        bodies: list[dict[str, Any]] = []
        if Agent.is_user_prompt_node(node):
            bodies.append(self.body("user_prompt", step=self.step, node=name, text=_prompt_text(node.user_prompt)))
        elif Agent.is_model_request_node(node):
            bodies += self._results(node.request.parts, name)
        elif Agent.is_call_tools_node(node):
            bodies += self._response(node.model_response, name, elapsed)
        elif Agent.is_end_node(node):
            bodies += self._results(_request_parts(run), name)
            bodies.append(self._turn_end(node.data.output, run, name))
        if bodies:
            audit.log_events(bodies)

    def stop(self, kind: str, run: Any, *, status: str, detail: str) -> None:
        """Terminal entry for a turn that did not reach End (budget_stop / error)."""
        bodies = self._results(_request_parts(run), None) if run is not None else []
        bodies.append(self.body(kind, step=self.step, usage=_usage_of(run), model=self.model,
                                latency_ms=self.elapsed_ms(), status=status, detail=detail))
        audit.log_events(bodies)

    def _response(self, response: Any, name: str, elapsed: int) -> list[dict[str, Any]]:
        texts = [p.content for p in response.parts if isinstance(p, TextPart) and p.content]
        calls = [p for p in response.parts if isinstance(p, ToolCallPart)]
        thinking = sum(1 for p in response.parts if isinstance(p, ThinkingPart))
        self.model = response.model_name or self.model
        usage = UsageSummary(input_tokens=response.usage.input_tokens or 0,
                             output_tokens=response.usage.output_tokens or 0, requests=1, tool_calls=len(calls))
        bodies = [self.body(
            "model_response", step=self.step, node=name, text="\n".join(texts) or None, usage=usage,
            model=response.model_name, finish_reason=response.finish_reason, latency_ms=elapsed,
            detail=f"{thinking} reasoning part(s)" if thinking else None,
        )]
        for call in calls:
            try:
                args: Any = call.args_as_dict()
            except Exception:
                args = call.args
            tickets = _tickets_in(args) or self.ticket_ids
            self._call_tickets[call.tool_call_id] = tickets
            bodies.append(self.body("tool_call", ticket_ids=tickets, step=self.step, node=name,
                                    tool=call.tool_name, tool_call_id=call.tool_call_id, args=args))
        return bodies

    def _results(self, parts: Iterable[Any], name: str | None) -> list[dict[str, Any]]:
        bodies = []
        for part in parts:
            if not isinstance(part, (ToolReturnPart, RetryPromptPart)) or part.tool_call_id in self._returns_logged:
                continue
            self._returns_logged.add(part.tool_call_id)
            tickets = list(self._call_tickets.get(part.tool_call_id) or self.ticket_ids)
            if isinstance(part, RetryPromptPart):
                status, result = "retry", _retry_text(part.content)
            else:
                status, result = _result_status(part), part.content
                tickets += [t for t in _tickets_in(result) if t not in tickets]
            bodies.append(self.body("tool_result", ticket_ids=tickets, step=self.step, node=name,
                                    tool=part.tool_name, tool_call_id=part.tool_call_id,
                                    result=result, status=status))
        return bodies

    def _turn_end(self, output: Any, run: Any, name: str) -> dict[str, Any]:
        if isinstance(output, TurnReport):
            text, status = output.summary, output.status
            result: Any = output.model_dump(mode="json", exclude={"summary"})
        else:
            text, status, result = str(output), None, None
        return self.body("turn_end", step=self.step, node=name, text=text, result=result, status=status,
                         usage=_usage_of(run), model=self.model, latency_ms=self.elapsed_ms())


def error_text(exc: BaseException) -> str:
    """'ErrorType: message', redacted and clipped (safe for the audit trail and the console)."""
    return audit.clean_text(f"{type(exc).__name__}: {exc}", 400)


async def run_turn(
    agent: Agent[None, TurnReport],
    prompt: str,
    *,
    agent_name: str,
    run_id: str,
    ticket_ids: Iterable[int] = (),
    limits: Limits | None = None,
    token_cap: int | None = None,
    round_no: int = 0,
    reasons: dict[str, list[str]] | None = None,
) -> TurnResult:
    """Run one agent turn with agent.iter(), writing one audit entry per loop node.
    Per-turn usage limits apply (requests, tool calls, tokens; tokens also capped by `token_cap`,
    the team budget left). A UsageLimitExceeded is caught and logged as budget_stop; any other
    exception is logged as error. The turn always returns a TurnResult."""
    limits = limits or Limits.from_env()
    tickets = list(dict.fromkeys(int(t) for t in ticket_ids))
    token_limit = limits.turn_total_tokens_limit
    if token_cap is not None:
        token_limit = max(1, min(token_limit, int(token_cap)))
    usage_limits = UsageLimits(
        request_limit=limits.turn_request_limit,
        tool_calls_limit=limits.turn_tool_calls_limit,
        total_tokens_limit=token_limit,
    )
    turn_id = audit.new_turn_id()
    log = TurnLog(run_id, turn_id, agent_name, tickets)
    log.event("turn_start", detail={
        "round": round_no, "reasons": reasons or {},
        "limits": {"requests": limits.turn_request_limit, "tool_calls": limits.turn_tool_calls_limit,
                   "total_tokens": token_limit, "max_output_tokens": limits.max_output_tokens},
    })
    base = {"turn_id": turn_id, "round_no": round_no, "agent": agent_name, "ticket_ids": tickets}
    run = None
    try:
        async with agent.iter(prompt, usage_limits=usage_limits) as run:
            async for node in run:
                log.node(node, run)
        result = run.result
        if result is None or not isinstance(result.output, TurnReport):
            raise RuntimeError("the agent run ended without a TurnReport")
        report = result.output
        return TurnResult(**base, outcome=report.status, report=report, usage=_usage_of(run),
                          latency_ms=log.elapsed_ms())
    except UsageLimitExceeded as exc:
        detail = audit.clean_text(exc, 300)
        log.stop("budget_stop", run, status="turn_limit", detail=detail)
        return TurnResult(**base, outcome="budget_stop", usage=_usage_of(run), latency_ms=log.elapsed_ms(),
                          error=f"usage limit reached: {detail}")
    except Exception as exc:
        detail = error_text(exc)
        log.stop("error", run, status="error", detail=detail)
        return TurnResult(**base, outcome="error", usage=_usage_of(run), latency_ms=log.elapsed_ms(),
                          error=detail)
