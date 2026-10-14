# Campus Customs Desk — Dashboard Design

The dashboard (`HW 5/frontend/`, React + Vite + TypeScript) is the owner's view of the back office: five AI agents work the ticket board, and the owner watches them, signs off on money and makes the calls only the owner can make (the boss's trade-offs, deep discounts and the shop date). We wanted it to feel like a real office desk you enjoy keeping open, not a data table, while every piece still shows real data from the backend (`HW 5/backend/main.py` on `localhost:8000`).

## Layout: one screen, read left to right

On a laptop or desktop screen (1200 px wide or more) the whole office fits on one screen and the page itself never scrolls. Earlier versions stacked the office floor, the board and the ticket detail on top of each other, so you had to scroll down to find your tickets. Now everything sits side by side: you see the tickets, the team at work, the selected ticket's story and the money at the same time. When a list is longer than its space (many tickets, many checks, a long story), only that box scrolls.

| Area | What is there | Why |
|---|---|---|
| Top bar | Yale pennant, "Campus Customs · Back Office", a live run status line (green pulsing dot while the team works, "Working on #101, #103 · queued #102" with every ticket the team is on and the ones waiting in the queue), a small flip calendar with the shop date and a "Move date" control next to it (+1 day, +5 days), a "Checking $… · n waiting" chip (payments plus open memos from the boss and pending discount requests), Sounds toggle, Reset shop | One glance tells you whether the team is working and on which tickets, what day it is in the shop, how much cash there is and whether payments or decisions are waiting for you. The date control sits on the calendar because that is what it changes. Putting the calendar and the cash in the bar removed a whole row from the page. |
| Left column: ticket board | The corkboard with every ticket as a sticky note, in one tall column that scrolls inside the cork | Your tickets are always in view, without scrolling the page. Open tickets come first (by number). |
| Center, top: office floor | Boss Dan in a glass corner office in the middle (with a window and a YALE pennant on its back wall), inventory and accounting on the top row, facilities and customer service on the bottom row | The boss sits in the middle because it sorts the board, decides cash priority and closes tickets. The desks are drawn a bit smaller so the floor takes about half the column, but every Dan, lamp, computer and waiting sign is still there, and the computer screens keep their full text size so the thoughts stay readable. Hover cards open toward free space (the top row and the boss open theirs downward), so they are never cut off. |
| Center, bottom: ticket detail | "Ticket #id: subject", then the report cards and the ticket story side by side, each scrolling in its own box | The answer to "what happened on this ticket?" sits right under the team that did the work, instead of one scroll away. |
| Right column: owner's desk | Memos from the boss, calendar memos for deliveries and discount approvals on top (only when there are any), then the checks to sign in the in-tray, then the bank counter and, under it, the boss's cash plan, always visible at the bottom; the memo/discount panel (at most about half the column), the in-tray and the cash plan's list each scroll on their own, so the bank counter stays in view | The owner is a separate desk on purpose: approving money, answering the boss and allowing deep discounts are deliberate human steps, not part of the agents' floor. The balance and the next deadlines never scroll out of sight. |

Paper airplanes fly over the whole working area, so a plane from the owner's desk to accounting crosses from the right column into the floor.

**Resolved tickets move to the bottom.** When a ticket is resolved, its note first gets the RESOLVED stamp where it is (so you see it happen), and once the stamp has landed (about 2.6 s) it slides down below a small "Resolved" divider at the bottom of the board. Finished work drops out of the way of the open tickets, but stays visible so the day's work is still on the board.

On narrower screens (below 1200 px) the page scrolls again: the board becomes one row of notes that scrolls sideways at the top, then the office floor, the owner's desk and the ticket detail. Below 760 px everything is a single column.

## The Dans: one bulldog, five jobs

Every agent is Handsome Dan, built from HTML/CSS (no image files), wearing a costume for its job, with a matching desk prop and computer screen. Hovering (or tabbing to) a desk shows a card with the agent's job and its tools.

| Agent | Costume | Desk prop | Computer screen | Why |
|---|---|---|---|---|
| Boss Dan | Navy blazer, white shirt, Yale-blue tie, leather chair | Gavel and a coffee mug | Memo (cream page, serif text) | Reads like the person in charge: decisions arrive as memos. |
| Inventory Dan | Yellow hard hat and hi-vis vest | Stack of boxes | Stock (amber on black, barcode stripes) | The stockroom and deliveries; amber terminal like a warehouse scanner. |
| Accounting Dan | Green visor and round glasses | Calculator | Ledger (green on dark, ruled lines) | The classic bookkeeper; a ledger screen for cash and bills. |
| Facilities Dan | Work cap and tool belt with a wrench | Wrench and key ring | Blueprint (white on blue grid) | The shop space and the lease; blueprints for the building. |
| Customer Service Dan | Headset and a "Hi, I'm Dan" badge | Desk phone / "Hi!" sign | Chat (message bubbles) | The front desk talking to customers; replies stay drafts. |
| You (owner) | No dog: a nameplate and an "APPROVED" rubber stamp | — | — | The human is not one of the agents. |

**How agents read differently:** each computer has its own screen style, so you can tell who is "talking" from across the room even before reading the name.

## Watching the agents work

- **Spotlight instead of thought bubbles.** When an agent is working, its desk lamp turns on and casts light on the desk, its computer switches on, and the desks nobody works at dim slightly. When the team runs several tickets, several desks are lit at the same time. You always know who has the floor.
- **Ticket chips.** A lit desk shows a small gold "#101" tag at the top right of its computer screen (and in its hover card, "Working · #101"), so with several lit desks you can tell which ticket each Dan is on. A waiting desk shows the tag under "Waiting…".
- **Thoughts on the computer.** What the working agent says types out on its own screen (the latest model reply or turn summary), so thoughts live where people actually type, not in floating bubbles.
- **Tool pop-ups.** Each tool call pops up as a chip at the top of that agent's screen (`check_stock`, `pay_bill`, …), re-animating on every new call.
- **Paper airplanes.** When one agent messages another (`send_message`), a paper airplane flies from the sender's desk to the receiver's desk with a short label. When the owner approves a payment, a plane flies from the owner's desk to accounting; answering a boss memo sends one to Boss Dan ("Decided: …"), approving a discount sends one to customer service ("#id: OK down to $…"), and declining one does too ("#id: keep the policy price").
- **Waiting signs.** When an agent's last turn ended "waiting" or "blocked", a small "⏳ Waiting" sign swings above its desk and its screen says "Waiting…". The owner's desk shows "Waiting for you" when payments need a signature, the boss is waiting on a memo or an agent asked for a deeper discount.
- Idle Dans bob gently; working Dans rock, flap their ears and their eyes move as if reading.

## Tickets on the corkboard

- **Sticky notes** pinned with Yale-blue pushpins, slightly rotated, colored by type (yellow customer order, pink rent, light blue price override, mint facility issue). Each shows the ticket number, subject, requester and a tiny Dan of the lead agent.
- **Progress strip** on every note: Assigned · Working · Waiting for you · Ready to close · Resolved. The current step pulses while the team works on it. "Working" also lights up while the ticket waits in the queue, and "Waiting for you" also covers a ticket whose delivery arrives after today's shop date (only the owner moves the date, so that wait is the owner's).
- **An honest strip, even with no run live.** Before, a note only said "Working" while a run was going: after a run ended, or after the backend restarted (it keeps runs in memory), a ticket the agents clearly worked on (101 with 105 tees received, 103 with 8 hoodies sold and invoice 502 paid) fell back to "Assigned" with a plain "Start the team" button and no next step. Now the board counts the notes the five agents left on each ticket (`agent_notes` from `list_open_tickets`, which lives in the database and survives restarts): an assigned ticket the agents already wrote on stays at "Working", its next step says "Start the team again to finish it", and its button says "Continue the team".
- **Next step** under the strip, small and in Yale blue: "Next: Sign the check on your desk", "Next: Answer the boss on your desk", "Next: Move the shop date to 2026-09-05", "Next: The team is working on it", "Next: Waiting for the boss to close it", "Next: Start the team again to finish it" (the agents already worked on it, but no run is live) or "Next: Start the team". The backend picks the first one that applies (`next_step` on each ticket). Before, ticket 101 sat at "Assigned" after the tees were paid for and nothing said that the shop date had to move; now the note says exactly what unblocks it.
- **Badges** for "Needs your OK" (payments waiting), "Asked the owner" and "Queued".
- **Start the team / Continue the team** button on the note; clicking a note selects it for the report cards and story in the center. The button says "Continue the team" once the agents have left notes on a ticket that is past "Open" (it picks their work back up) and "Start the team" before that; while the ticket runs it says "Working…", and "Queued" while it waits. If the team already runs 3 tickets, a click puts this one in the queue, where it starts as soon as one of the runs ends (a short notice says so). It is disabled for resolved tickets and for tickets already running or queued.
- **Resolved:** a Yale-blue "RESOLVED" rubber stamp thumps onto the note, the note looks filed, and confetti falls. After the stamp lands, the note moves below the "Resolved" divider at the bottom of the board, so open tickets stay on top and the day's finished work is still visible.

## Money moments

- **Checks to sign.** Each payment waiting for approval is a paper check: "Pay to the order of …", the amount, a memo with the agent's reason, the ticket and request numbers, the boss's priority, and a warning if cash would not cover it. "Sign & pay" draws a signature, then calls the approve route; a paid check flies away. If the payment is refused (priority or cash), the reason is written on the check.
- **Rolling balance.** The bank counter shows checking as an odometer whose digits roll to the new value, with a red flash and "▼ $…" when it drops after a payment, plus a bar of cash promised to waiting payments versus free cash.
- **Cash plan.** Under the bank counter, a small ledger slip shows the boss's plan for the next 31 shop days (`GET /api/forecast`, loaded with the board): each upcoming payment with its day ("Today" for overdue bills, else the boss's planned date, else the due date), the payee, the amount and a "planned" tag when the boss picked the date (an "overdue" tag when the deadline already passed); expected sales from open orders in lighter italic, because they are not guaranteed; a red "Deadline at risk" line for every bill the cash on hand can't pay by its due date (and whether expected sales would cover it); and the low point of the cash-only balance, in red when it goes below zero. If the plan works only when the expected sales come in, a line says so. The list scrolls inside the slip, so it stays small in the owner's column. **Why:** a check is not the whole picture. The boss now pays what is needed first and gives later bills a date before their deadline; before signing, the owner sees that every deadline is still covered, or which one is not, without asking anyone.

## The owner's other decisions

Paying bills is not the only thing that waits for the owner. The shop date only moves when the owner moves it, and only the owner answers the boss's trade-offs and allows a discount deeper than the agents' policy (below). Before, those three steps needed Claude Code; now they are on the owner's desk, so tickets 101 (the tee waits for invoice 501's 5-day lead time) and 103 (the Yale AI Club's bulk price and partial shipment) can be finished from the dashboard alone.

- **Memos from the boss.** Each open escalation is a cream memo slip on the owner's desk: "From: Boss Dan", the ticket number, the question and the boss's recommendation in italics, with one button per option showing the option's text. A click sends that choice (`POST /api/decisions/{id}`), the memo leaves the desk, and the boss gets the decision as a note at the next team run. Buttons are disabled while a click is being sent.
- **Calendar memos.** When a ticket waits for a delivery that arrives after today's shop date (`waiting_on_date`, e.g. ticket 101's tees from invoice 501), a tear-off calendar page appears on the owner's desk: "Delivery for #101 arrives Sat, Sep 5, 2026. Move the shop date +N days?" N is counted from today's shop date to the delivery date using only the year, month and day, so a time zone or daylight-saving change never adds or drops a day. The button moves the date after a confirmation and is disabled while the team runs or another click is on its way. The backend moves at most 31 days per click; a later delivery says to click again.
- **Discount approvals, only when an agent asks.** A card appears only when an agent asked for a price the shop refused it (above the agents' limit for the order size, or below the price already agreed), which puts a pending request on the owner's desk (`GET /api/decisions` sends only pending requests). Each card shows "#id · requester", the price asked for and its % off next to the agent limit, the list price, the unit cost, the agreed price and the current owner minimum (when they exist), who asked and the reason, and a price field prefilled with the price asked for. "Approve down to $X" allows agents to agree any price at or above it (`POST /api/discounts/{ticket_id}/approve`); "Decline" keeps the policy price (`POST /api/discounts/{ticket_id}/decline`). Either click closes the request and hands the ticket back to the team. The dashboard checks the price is above $0 before sending; the backend refuses anything below unit cost, and that reason shows in the usual error banner (a refusal of the owner's own click stays there at least 8 seconds) while the card says "Not saved". **Why:** before, every open price-override ticket got a card even when nobody asked for anything, so the owner could not tell a real decision from a reminder. Now the desk shows only real decisions, and the card says what was asked, by whom and why.
- **The discount safeguard, as the owner sees it.** A line in the section header states the policy the agents keep: orders under 10 units sell at list price, 10+ units get up to 10% off, 20+ units up to 15%, one price per ticket, and anything deeper only with the owner's OK on this card. The MCP server enforces it in code, not just in the prompts: an agent's `apply_discount` above the tier is refused, and once a price is agreed an agent cannot lower it again just because the customer asks again, complains or says it is urgent. When customer service's price is refused for being too deep, the server itself files the request for the owner and tells the boss, so the boss does not write a separate memo for it, and customer service tells the customer nothing about a deeper price until the owner decides. Only the owner's approval on this card lets agents go below their tier. The unit-cost floor holds even for the owner (a price below unit cost is simply refused and never reaches the desk).
- **Move date.** Next to the flip calendar, "+1 day" and "+5 days" move the shop date after a confirmation ("Move the shop date from A to B? Vendor lead times count in shop days."). The calendar flips to the new page on the next board refresh. The buttons are disabled while any team run is active (the backend refuses too), so the date never changes in the middle of an agent's turn.
- If there are no memos, no calendar memos and no discount requests, the section is not shown at all, so the checks keep the space.

## From "Start the team" to Resolved with only the owner's clicks

A ticket used to stop halfway: the team ran, asked for a payment or ran into a vendor lead time, and the run ended with "no work". After the owner signed the check or moved the date, nothing happened until the owner found the ticket again and pressed "Start the team", and the note still said "Assigned". Now the backend picks the work back up by itself after each owner click, so once the team has started a ticket it reaches Resolved with only the owner's approvals, decisions and date moves.

- **Automatic continue.** Signing a check, answering a boss memo or allowing or declining a discount hands that ticket back to the team. Moving the shop date wakes every ticket the team has already started, because a delivery may have arrived, except order tickets whose delivery is still after the new date (their inventory note waits for a later move, so a +1 click does not spend model calls on "lead time not passed"); tickets with nothing to do finish at once and cost no model calls. A run that stops early (round, turn or token limit, a stop request or an error) leaves the hint "Start the team again (the last run stopped early)" on the note. Each of these clicks returns `team_continues` (the ticket numbers), and a short Yale-blue notice under the top bar says "The team picks up ticket #101 again." for about 6 seconds. It is separate from the red error banner, which keeps its own rules. The backend can switch this off with `CC_AUTO_CONTINUE=0`.
- **Run queue.** Up to 3 team runs go at once (one per ticket); more tickets that need the team wait in a queue (`queued` in `GET /api/tickets`) and start as soon as a run slot frees up. The board shows them as "Working" with a "Queued" badge, and the top bar lists them after the running tickets ("· queued #102"). Reset shop and moving the date are refused while any run is active; Reset shop clears the queue.
- **Why:** the owner should only be asked for what only the owner can do. Restarting the team by hand was a step the owner had to remember, and nothing on the screen said so.

## Several tickets at once

The team can work on up to 3 tickets at the same time, so the owner no longer waits for 101 to finish before 103 gets going.

- **Lit desks with ticket chips.** Every agent busy on some ticket has its lamp on and its computer awake, with the ticket's "#id" on the screen; the other desks dim. The ticket detail opens on a running ticket until you pick another note.
- **One ticket per Dan.** Each Dan works one ticket at a time: if Inventory Dan is busy on #101, the run on #103 waits for him before his turn, while Customer Service Dan may already be selling hoodies for #103. So two desks can be lit for two different tickets, but never one Dan on two tickets at once.
- **No mix-ups.** Each run is only given its own ticket: its turns list only that ticket, the agents are told to work only on it, and their summaries are posted only on it. Money and stock changes are serialized in the database, so two runs can't spend the same cash twice.
- **The queue.** A 4th ticket waits in the queue ("Queued" badge, "queued #…" in the top bar) and starts by itself when one of the 3 runs ends.

## End of a run

- **Report cards:** one card per agent that worked on the selected ticket: its turns, its latest summary (with "show all"), the tools it used and the messages it sent.
- **Ticket story:** the ticket's history in order, chat style: messages between agents, turn summaries and key actions in plain words ("asked the owner to approve a payment", "received a delivery", "closed the ticket").

## Fun extras

- **Confetti** in Yale blue, light blue and white when a ticket is resolved.
- **Flip calendar** in the top bar that flips its page when the shop date changes.
- **Hover cards** on every Dan with its job and tools.
- **Sounds, off by default.** One click turns them on: a soft tick for thoughts, a whoosh for paper airplanes, a stamp thud on resolve, a cash-register "cha-ching" on payment. They are synthesized in the browser (no audio files), and the choice is remembered.

## Look and feel

- **Colors:** Yale blue (#00356b) and its lighter blues carry the interface; warm wood desks, cork and cream paper make it feel like a physical office. Accent colors only appear on costumes and sticky notes.
- **Type:** a serif for headings, nameplates and the checking balance (collegiate, Yale feel), a clean sans-serif for content, monospace for tool names.
- **Motion:** small and purposeful (lamp light, typing, planes, stamp, rolling digits). Everything respects the system "reduce motion" setting.
- **No image assets:** the Dans, props, calendar, checks and confetti are all HTML/CSS (plus tiny inline SVG), as the project asks.

## Data behind it

| Piece | Route | Refresh |
|---|---|---|
| Corkboard, run status, checks | `GET /api/tickets` (`runs`: every active run plus the latest finished run per ticket) | every 2 s while running, 5 s idle |
| Desks (who works, thoughts, tools, waiting), planes, report cards, story | `GET /api/events?after=` | every 1 s while running, 4 s idle |
| Bank counter | `GET /api/cash` | with the board, and right after a payment |
| Next step, delivery date, queue, "Working" without a live run | `GET /api/tickets` (`next_step`, `waiting_on_date`, `queued`, `agent_notes`) | with the board |
| Start the team / Continue the team | `POST /api/tickets/{id}/run` (answers `running`, or `queued` while 3 tickets already run) | on click |
| Sign & pay | `POST /api/payments/{request_id}/approve` | on click (the only action that moves cash) |
| Memos from the boss, discount cards (pending requests only), waiting count | `GET /api/decisions` | with the board |
| Cash plan under the bank counter | `GET /api/forecast` | with the board |
| Memo option button | `POST /api/decisions/{escalation_id}` | on click |
| Approve down to $X | `POST /api/discounts/{ticket_id}/approve` | on click |
| Decline (discount card) | `POST /api/discounts/{ticket_id}/decline` | on click |
| +1 day / +5 days, calendar memo | `POST /api/shop-date/advance` | on click, with a confirmation; not while any run is active |
| "The team picks up ticket #… again." | `team_continues` in the result of sign & pay, memo, discount and date clicks | after each of those clicks, hides after about 6 s |
| Reset shop | `POST /api/reset` | on click, with a confirmation |

## Not included

- Rejecting a payment and the boss's own calls (confirming restock estimates, partial shipments) are not buttons on the dashboard; the owner can still make them from Claude Code.
- Removing a ticket from the queue is not a button; the queue empties itself as the runs finish, and Reset shop clears it.
- Keyboard shortcuts were left out.

## Start early, pay on the due date

The team prepares a bill as soon as it is confirmed and you can sign its check right away, but the money only leaves on the bill's due date, because the shop would rather keep its cash. A check signed early flies off as approved without the cash-register sound, and the balance drops on the due date, when you move the shop date there and accounting pays it.
