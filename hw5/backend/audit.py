"""Append-only audit trail of every agent loop step -> output/audit_trail.json.

Adapted from "HW 4/backend/audit.py". Path: env AUDIT_TRAIL_PATH, else HW 5/output/audit_trail.json.

FILE FORMAT: a JSON array, one entry per line, valid JSON after every append:

    [
    {"seq": 1, "time": "2026-10-12T19:00:00.000Z", "run_id": "9f2c41aa", "turn_id": null, "agent": "system",
     "ticket_ids": [], "kind": "run_start", ..., "prev_hash": "000...", "hash": "..."},
    {"seq": 2, ...}
    ]

Entry fields (models.AuditEntry): seq, time, run_id, turn_id, agent, ticket_ids, kind, plus optional
step, node, text, tool, tool_call_id, args, result, usage, model, finish_reason, latency_ms, status,
detail, and prev_hash, hash. Kinds: run_start, turn_start, user_prompt, model_response, tool_call,
tool_result, turn_end, budget_stop, stop_requested, error, run_end.

Append = lock the file (fcntl.flock + a thread lock), find the closing "\\n]", write
",\\n{entry}\\n]\\n" over it, fsync. Earlier bytes are never rewritten, the file is never truncated,
and this module has no delete or clear function. A file that is not an array this module wrote
is refused and left exactly as it is. Tamper evidence: `hash` = SHA-256 of the entry's canonical
JSON without `hash` (sorted keys, compact, ASCII); `prev_hash` = the previous entry's hash, so
editing, removing, inserting or reordering entries breaks the chain. `verify()` checks it
(`python audit.py` runs it).

Every value is cleaned HERE, so a caller cannot leak data by mistake: text is clipped (args 600,
result 800, text 1200 chars) and API keys, other secrets, emails and phone numbers are redacted.
"""

from __future__ import annotations

import fcntl
import hashlib
import json
import logging
import math
import os
import re
import secrets
import sys
import threading
from collections.abc import Iterable, Mapping
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ValidationError

from models import AUDIT_KINDS, AuditEntry, UsageSummary

log = logging.getLogger("campus_customs.audit")

BACKEND_DIR = Path(__file__).resolve().parent
DEFAULT_PATH = BACKEND_DIR.parent / "output" / "audit_trail.json"

ZERO_HASH = "0" * 64
TAIL_BYTES = 65536  # an entry is a few KB at most, so the last entry is always inside this tail
ARGS_MAX, RESULT_MAX, TEXT_MAX, NAME_MAX, ID_MAX = 600, 800, 1200, 64, 80
OPTIONAL_FIELDS = (
    "step", "node", "text", "tool", "tool_call_id", "args", "result", "usage", "model",
    "finish_reason", "latency_ms", "status", "detail",
)

_write_lock = threading.Lock()  # threads in this process; flock covers other processes
_secrets_lock = threading.Lock()
_registered_secrets: set[str] = set()


def trail_path() -> Path:
    return Path(os.environ.get("AUDIT_TRAIL_PATH") or DEFAULT_PATH)


def new_run_id() -> str:
    """Short random id that groups the entries of one team run."""
    return secrets.token_hex(4)


def new_turn_id() -> str:
    """Short random id that groups the entries of one agent turn."""
    return secrets.token_hex(4)


# --------------------------------------------------------------------------
# Privacy: redaction and clipping
# --------------------------------------------------------------------------

_SECRET_ENV_NAME = re.compile(r"KEY|TOKEN|SECRET|PASSWORD|PASSWD|SALT", re.I)
_BEARER = re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~+/\-]{8,}=*")
_PREFIXED_KEY = re.compile(r"\b(?:sk|pk|rk)-[A-Za-z0-9_\-]{16,}")
_EMAIL = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}")
_TOKEN = re.compile(r"[A-Za-z0-9_\-]{32,}")
_HEX = re.compile(r"[0-9a-fA-F]{32,}")
# Phone shapes: (203) 555-0142, 203-555-0142, 203.555.0142, +1 203 555 0142, +44 20 7946 0958,
# 2035550142. ISO dates (2026-09-02), amounts and ticket lists ("101 102 103") do not match.
_PHONE = re.compile(
    r"(?<![\w.+])(?:\+\d{1,3}[\s.\-]?)?(?:\(\d{2,4}\)\s?|\d{2,4}[\s.\-]?)\d{3,4}[\s.\-]?\d{4}(?![\w])"
)
_SENSITIVE_KEY = re.compile(
    r"(?i)^(?:.*_)?(?:password|passwd|secret|api_?key|authorization|auth|cookie|session_?id|"
    r"card_?number|cvv|ssn|token|access_token|refresh_token)$"
)
_IDENT_CHARS = re.compile(r"[^A-Za-z0-9_.:\-]")


def register_secret(value: str | None) -> None:
    """Remember a secret value (e.g. the Portkey key read from .env) so it is always redacted."""
    value = (value or "").strip()
    if len(value) >= 8:
        with _secrets_lock:
            _registered_secrets.add(value)


def _secret_values() -> list[str]:
    values = {v.strip() for k, v in os.environ.items() if _SECRET_ENV_NAME.search(k) and len(v.strip()) >= 8}
    with _secrets_lock:
        values |= _registered_secrets
    return sorted(values, key=len, reverse=True)


def _phone_sub(m: re.Match) -> str:
    digits = sum(c.isdigit() for c in m.group())
    return "[phone]" if 9 <= digits <= 15 else m.group()


def _token_sub(m: re.Match) -> str:
    s = m.group()
    mixed = any(c.isupper() for c in s) and any(c.islower() for c in s) and any(c.isdigit() for c in s)
    return "[secret]" if mixed or _HEX.fullmatch(s) else s  # snake_case words and SKUs stay readable


def redact(text: str) -> str:
    """Remove secrets, emails and phone numbers from a string."""
    for value in _secret_values():
        if value in text:
            text = text.replace(value, "[secret]")
    text = _BEARER.sub("Bearer [secret]", text)
    text = _PREFIXED_KEY.sub("[secret]", text)
    text = _EMAIL.sub("[email]", text)
    text = _TOKEN.sub(_token_sub, text)  # before phones, so digits inside a key don't split it
    return _PHONE.sub(_phone_sub, text)


def _cut(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[: limit - 3] + "..."


def _clean(value: Any, limit: int) -> str:
    return _cut(redact(str(value)), limit)


def clean_text(value: Any, limit: int = TEXT_MAX) -> str:
    """Redacted and clipped text, safe for logs, the audit trail and the ticket board."""
    return _clean(value, limit)


def _ident(value: Any, limit: int = ID_MAX) -> str:
    """Ids we or the model provider generated: safe characters only, never redacted."""
    return _IDENT_CHARS.sub("", str(value))[:limit]


def _json_default(value: Any) -> Any:
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, (set, frozenset, tuple)):
        return list(value)
    if hasattr(value, "__dataclass_fields__"):
        return {k: getattr(value, k) for k in value.__dataclass_fields__}
    return f"<{type(value).__name__}>"


def _mask(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {str(k): ("[redacted]" if _SENSITIVE_KEY.search(str(k)) else _mask(v)) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_mask(v) for v in value]
    return value


def compact(value: Any, limit: int) -> str:
    """Compact JSON (sensitive keys masked), redacted, clipped. Strings that hold JSON are parsed first."""
    if isinstance(value, str):
        try:
            value = json.loads(value) if value.strip()[:1] in ("{", "[") else value
        except ValueError:
            pass
        if isinstance(value, str):
            return _clean(value, limit)
    if isinstance(value, BaseModel):
        value = value.model_dump(mode="json")
    try:
        text = json.dumps(_mask(value), separators=(",", ":"), ensure_ascii=False, default=_json_default)
    except (TypeError, ValueError):
        text = f"<{type(value).__name__}>"
    return _clean(text, limit)


def _ticket_ids(values: Any) -> list[int]:
    out: list[int] = []
    for v in values or ():
        if isinstance(v, bool):
            continue
        try:
            n = int(v)
        except (TypeError, ValueError):
            continue
        if n not in out:
            out.append(n)
    return out[:50]


def _int(value: Any) -> int | None:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, float) and not math.isfinite(value):
        return None
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return None


_CLEANERS = {
    "step": _int,
    "node": lambda v: _clean(v, 40),
    "text": lambda v: _clean(v, TEXT_MAX),
    "tool": lambda v: _clean(v, NAME_MAX),
    "tool_call_id": _ident,
    "args": lambda v: compact(v, ARGS_MAX),
    "result": lambda v: compact(v, RESULT_MAX),
    "usage": lambda v: UsageSummary.of(v).model_dump(),
    "model": lambda v: _clean(v, NAME_MAX),
    "finish_reason": lambda v: _clean(v, 32),
    "latency_ms": _int,
    "status": lambda v: _clean(v, 40),
    "detail": lambda v: compact(v, TEXT_MAX),
}


def make_body(
    kind: str,
    *,
    run_id: str,
    agent: str,
    turn_id: str | None = None,
    ticket_ids: Iterable[Any] = (),
    **fields: Any,
) -> dict[str, Any]:
    """Entry without seq/time/prev_hash/hash, every value cleaned, readable key order."""
    if kind not in AUDIT_KINDS:
        raise ValueError(f"unknown audit kind {kind!r}")
    unknown = sorted(set(fields) - set(OPTIONAL_FIELDS))
    if unknown:
        raise ValueError(f"unknown audit fields: {', '.join(unknown)}")
    body: dict[str, Any] = {
        "run_id": _ident(run_id, 40) or "unknown",
        "turn_id": _ident(turn_id, 40) if turn_id else None,
        "agent": _clean(agent or "unknown", 40),
        "ticket_ids": _ticket_ids(ticket_ids),
        "kind": kind,
    }
    for key in OPTIONAL_FIELDS:
        value = fields.get(key)
        if value is None:
            continue
        cleaned = _CLEANERS[key](value)
        if cleaned is not None:
            body[key] = cleaned
    return body


# --------------------------------------------------------------------------
# The append-only writer (hash chain)
# --------------------------------------------------------------------------


def entry_hash(entry: Mapping[str, Any]) -> str:
    """SHA-256 of the entry's canonical JSON without "hash" (includes prev_hash -> chain)."""
    body = {k: v for k, v in entry.items() if k != "hash"}
    blob = json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False)
    return hashlib.sha256(blob.encode("ascii")).hexdigest()


def _line(entry: Mapping[str, Any]) -> bytes:
    return json.dumps(entry, separators=(", ", ": "), ensure_ascii=True, allow_nan=False).encode("ascii")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _tail_state(fd: int, size: int) -> tuple[int, str, int, bool]:
    """(last seq, last hash, byte offset to write at, file has entries) from the file's tail.
    Raises ValueError (and writes nothing) when the file is not an array this module wrote."""
    start = max(0, size - TAIL_BYTES)
    tail = os.pread(fd, size - start, start)
    stripped = tail.rstrip(b" \t\r\n")
    if not stripped.endswith(b"]"):
        raise ValueError("audit trail does not end with ']' (not appending; nothing was changed)")
    close = len(stripped) - 1
    pos = close - 1 if close > 0 and tail[close - 1 : close] == b"\n" else close
    before = tail[:pos].rstrip()
    if start == 0 and before.strip() == b"[":  # an empty array
        return 0, ZERO_HASH, pos, False
    last_line = before.rsplit(b"\n", 1)[-1].strip().rstrip(b",")
    try:
        last = json.loads(last_line)
    except ValueError:  # hand-formatted file: fall back to a full parse
        try:
            data = json.loads(os.pread(fd, size, 0))
        except ValueError:
            raise ValueError("audit trail is not valid JSON (not appending; nothing was changed)") from None
        if not isinstance(data, list):
            raise ValueError("audit trail is not a JSON array (not appending; nothing was changed)")
        if not data:
            return 0, ZERO_HASH, start + pos, False
        last = data[-1]
    if not isinstance(last, dict) or not isinstance(last.get("seq"), int) or not last.get("hash"):
        raise ValueError("last audit entry has no seq/hash (not appending; nothing was changed)")
    return last["seq"], str(last["hash"]), start + pos, True


def append(bodies: list[dict[str, Any]], path: str | os.PathLike[str] | None = None) -> list[dict[str, Any]]:
    """Append entries (from make_body) under an exclusive lock and return them as written.
    Creates the file if it is missing. Raises on any problem; then nothing was written."""
    if not bodies:
        return []
    p = Path(path) if path else trail_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    with _write_lock:
        fd = os.open(p, os.O_RDWR | os.O_CREAT, 0o644)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX)
            size = os.fstat(fd).st_size
            if size == 0:
                seq, prev, pos, has_entries = 0, ZERO_HASH, 0, False
            else:
                seq, prev, pos, has_entries = _tail_state(fd, size)
            written: list[dict[str, Any]] = []
            out = bytearray(b"[" if size == 0 else b"")
            for body in bodies:
                seq += 1
                entry = {"seq": seq, "time": _now(), **body, "prev_hash": prev}
                entry["hash"] = prev = entry_hash(entry)
                AuditEntry.model_validate(entry)  # schema check before anything is written
                out += (b",\n" if has_entries else b"\n") + _line(entry)
                has_entries = True
                written.append(entry)
            out += b"\n]\n"
            os.pwrite(fd, bytes(out), pos)  # overwrites only the closing "\n]\n"; the file only grows
            os.fsync(fd)
            return written
        finally:
            os.close(fd)  # also releases the flock


def log_events(bodies: list[dict[str, Any]]) -> None:
    """Append several entries in one locked write. Never raises; a failure is a log warning."""
    try:
        append(bodies)
    except Exception as exc:
        log.warning("Audit trail write failed (%s: %s); %d entries not recorded",
                    type(exc).__name__, _cut(redact(str(exc)), 200), len(bodies))


def log_event(kind: str, *, run_id: str, agent: str, turn_id: str | None = None,
              ticket_ids: Iterable[Any] = (), **fields: Any) -> None:
    """Append one entry. Never raises; a failure is a log warning."""
    try:
        body = make_body(kind, run_id=run_id, agent=agent, turn_id=turn_id, ticket_ids=ticket_ids, **fields)
    except Exception as exc:
        log.warning("Audit entry rejected (%s: %s)", type(exc).__name__, _cut(str(exc), 200))
        return
    log_events([body])


def check_appendable(path: str | os.PathLike[str] | None = None) -> Path:
    """Raise ValueError if the trail exists but is not an array this module can append to.
    A missing or empty file is fine (the first append creates it). Writes nothing."""
    p = Path(path) if path else trail_path()
    if not p.exists():
        return p
    with open(p, "rb") as fh:
        fcntl.flock(fh.fileno(), fcntl.LOCK_SH)
        size = os.fstat(fh.fileno()).st_size
        if size:
            _tail_state(fh.fileno(), size)
    return p


def read_entries(path: str | os.PathLike[str] | None = None) -> list[dict[str, Any]]:
    """All entries (read-only, waits for an in-flight append). Missing file -> []."""
    p = Path(path) if path else trail_path()
    try:
        with open(p, "rb") as fh:
            fcntl.flock(fh.fileno(), fcntl.LOCK_SH)
            raw = fh.read()
    except FileNotFoundError:
        return []
    data = json.loads(raw) if raw.strip() else []
    if not isinstance(data, list):
        raise ValueError("audit trail is not a JSON array")
    return data


# --------------------------------------------------------------------------
# Verification
# --------------------------------------------------------------------------


def verify(path: str | os.PathLike[str] | None = None) -> tuple[bool, str]:
    """Check the file parses as a JSON array, every entry matches AuditEntry, seq is 1,2,3...
    and every hash links. Returns (ok, message); the message names the first broken seq."""
    p = Path(path) if path else trail_path()
    try:
        with open(p, "rb") as fh:
            fcntl.flock(fh.fileno(), fcntl.LOCK_SH)  # wait for an in-flight append
            raw = fh.read()
    except FileNotFoundError:
        return False, f"MISSING: {p}"
    try:
        data = json.loads(raw)
    except ValueError as exc:
        return False, f"INVALID JSON: {exc}"
    if not isinstance(data, list) or not data:
        return False, "INVALID: expected a non-empty JSON array"
    prev = ZERO_HASH
    for i, entry in enumerate(data, 1):
        seq = entry.get("seq") if isinstance(entry, dict) else None
        if seq != i or isinstance(seq, bool):
            return False, f"BROKEN at seq {i}: found seq {seq!r} (entries missing, added, or reordered)"
        if entry.get("prev_hash") != prev:
            return False, f"BROKEN at seq {i}: prev_hash does not match the hash of seq {i - 1}"
        try:
            ok = entry.get("hash") == entry_hash(entry)
        except (TypeError, ValueError):
            ok = False
        if not ok:
            return False, f"BROKEN at seq {i}: hash mismatch (entry was edited)"
        try:
            AuditEntry.model_validate(entry)
        except ValidationError as exc:
            return False, f"SCHEMA at seq {i}: {exc.error_count()} field error(s), first: {exc.errors()[0]['loc']}"
        prev = entry["hash"]
    return True, f"OK: {len(data)} entries, seq 1..{len(data)} contiguous, hash chain intact (head {prev[:16]})"


if __name__ == "__main__":
    ok, message = verify(sys.argv[1] if len(sys.argv) > 1 else None)
    print(message)
    sys.exit(0 if ok else 1)
