# Campus Customs — HW 5: Multi-Agent Operations

A team of five AI agents (boss, inventory, accounting, facilities, customer service) runs the back office of Campus Customs, a Yale merch shop. The owner (you) watches them on a React dashboard and approves every payment and decision.

- **MCP server** (`mcp_server/server.py`): every shop tool and every shop rule, enforced in code. It reads and writes the working database only.
- **FastAPI backend** (`backend/main.py`): runs the agent team (Pydantic AI on `gpt-6-luna` through Portkey) and serves the dashboard.
- **React board** (`frontend/`): the office floor, the ticket corkboard and the owner's desk.

The agents never email or call anyone; every customer reply is a draft that stays on the board. No money moves without the owner's approval, and cash can never go below $0.

## Layout

```
hw5/
├── AI_prompts.md            every prompt used, by problem
├── requirements.txt         Python packages for the backend and the MCP server
├── .env.example             copy to .env and add your Portkey key
├── .gitignore
├── .mcp.json                starts the MCP server (owner role) for Claude Code
├── README.md
├── data/
│   ├── campus_customs.db        the original; never modified
│   └── campus_customs_new.db    the working copy the agents change
├── mcp_server/
│   ├── server.py
│   └── README.md
├── frontend/                React + Vite + TypeScript dashboard
├── backend/
│   ├── main.py              FastAPI routes
│   ├── models.py            Pydantic models
│   ├── team.py, common.py, audit.py, one file per agent
│   └── prompts/             boss.md, inventory.md, accounting.md, facilities.md, customer_service.md
└── output/
    ├── harness.md           tables, tools, agents, routes, dashboard, safety rules
    ├── mcp_smoke.json
    ├── desk_tickets.html    expected vs actual per ticket, cash, reflection
    ├── design.md
    ├── resolved_tickets.json
    ├── resolved_board.html  (with screenshots/)
    ├── audit_trail.json     append-only, hash-chained log of every agent step
    └── github_url.txt
```

## One-time setup

You need Python 3.11 or newer, Node.js 20 or newer, and a Portkey API key with access to `gpt-6-luna`.

```bash
cd hw5
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
```

Open `.env` and replace `your-portkey-api-key` with your key. `.env` is git-ignored; never commit it.

```bash
cd frontend
npm install
```

On Windows, use `.venv\Scripts\python` and `.venv\Scripts\uvicorn` in place of `.venv/bin/...`, and `copy` in place of `cp`.

## 1. Copy the original database to the working copy (clean run)

`data/campus_customs.db` is the original and is never modified. Everything the agents do lands in `data/campus_customs_new.db`. When you need a clean run, copy the original over the working copy, from `hw5/` with the backend stopped:

```bash
cp data/campus_customs.db data/campus_customs_new.db
```

The working copy in this repo holds the end state of the graded run (all three tickets closed, checking $910.00), so copy (or reset, step 5) before you run the team yourself. On first use the MCP server adds its board tables (notes, assignments, payment requests and so on) to the working copy; it never changes the original tables.

## 2. Start the MCP server

The MCP server speaks MCP over stdio, so it runs as a child process of a client.

- **For the dashboard:** nothing to do. The backend starts one MCP server process per role (boss, inventory, accounting, facilities, customer service, owner, system) by itself, so each agent only sees its own lane's tools.
- **For Claude Code (owner console):** open `hw5/` in Claude Code; `.mcp.json` starts `.venv/bin/python mcp_server/server.py --role owner`.
- **By hand:** from `hw5/`, run the line below. It waits for an MCP client on stdin.

```bash
.venv/bin/python mcp_server/server.py --role owner
```

See `mcp_server/README.md` for the tools by role.

## 3. Start the FastAPI backend

```bash
cd backend
../.venv/bin/uvicorn main:app --port 8000
```

Check it at <http://localhost:8000/api/tickets>. It reads `PORTKEY_API_KEY` from `hw5/.env` (or from the environment) and passes it only to the model client, never to the MCP server.

## 4. Start the React board

In a second terminal:

```bash
cd frontend
npm run dev
```

Open <http://localhost:5173>. The board calls the backend on `localhost:8000` (set `VITE_API_BASE` to change it).

## 5. Reset the database before a full three-ticket run

Before you run tickets 101, 102 and 103 from the start, reset the shop. Click **Reset shop** in the top bar, or run:

```bash
curl -X POST http://localhost:8000/api/reset
```

The reset copies the original database over the working copy (the same as step 1, but done by the backend while it runs). It is refused while a team run is going, and it never clears the audit trail. The board then shows shop date 2026-08-31, checking $3,400, and the three open tickets.

Then run the three tickets:

1. Click **Start the team** on tickets 101, 102 and 103. Up to 3 tickets run at once; each sticky note shows its progress and a "Next:" hint.
2. When a check appears on the owner's desk, click **Sign & pay**. A bill is approved at once but paid on its due date.
3. When the boss sends a memo, pick one of its options. When customer service asks for a deeper discount, the discount card appears; approve or decline it.
4. When a ticket waits on a date (rent due 2026-09-02, deliveries arriving 2026-09-05), use **Move date** next to the calendar.
5. After each owner action, the team picks the ticket up again on its own, until the boss closes all three.

The graded run ended on 2026-09-05 with all three tickets closed and checking at $910.00. See `output/desk_tickets.html` (Actual and Cash tabs).

## Stopping and limits

- Stop the servers with Ctrl+C in each terminal.
- To stop a team run before its next agent turn, create the file `output/STOP` (delete it to run again).
- Every turn and run has token and tool-call limits (see `output/harness.md`, Safety). Optional environment variables: `CC_MAX_RUNS` (tickets at once, default 3), `CC_AUTO_CONTINUE=0` (no automatic continue after owner actions), `OWNER_NAME`, `CAMPUS_CUSTOMS_DB`, `AUDIT_TRAIL_PATH`.

## Where to read more

- `output/harness.md`: the database map, the 16 shop rules, the five agents, all MCP tools, the API routes and rules, the dashboard and the safety rules.
- `output/design.md`: why the dashboard looks and behaves the way it does.
- `output/desk_tickets.html`: the expected plan and what actually happened for each ticket, the cash ledger, and the reflection.
