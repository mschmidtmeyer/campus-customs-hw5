# HW 5 — AI Prompts Log

Log of every prompt typed into the vibe coder (Claude Code) while building the Campus Customs multi-agent operations team (MCP server, FastAPI backend, React dashboard).
Each section has the problem number and title, at least one prompt in my own words, a follow-up prompt when one was needed, and (if needed) one sentence on what the first prompt was missing.

---

## Preliminary: Project Setup and Shop Rules

### Setup prompt (my own words)

> Yo, CC. I'm gonna start working on homework five. Campus customs multi-agent operations. Uh, basically, the idea is to create an agentic team, of agents, that runs the shop, runs custom, campus customs, um, kind of the the shop that I built a website for in homework number four. So this is a separate homework, and it has the state like that. Um, I'm gonna be paying. I'm gonna be creating this um, multi-agent operations that will be able to open tickets, um, on customer orders, rent unpaid bills, discount requests, whatever the shop needs to handle. This agent, these agents will be able to do it. So I'll be creating the three things: an MCP saver, a server, a fast API backend, and a React dashboard, so that the human can see and watch the agents at work and approve any requests they have. The agents have will have full connectivity. So they will be able to talk within each other. Delegate tasks within each other. Um, and I will be building uh, a few agents, including a boss agent, uh, an inventory guy, uh, accounting girl, a facilities girl, and a customer service uh, girl guy, whatever. Um, there's some data in the um, homework number five uh, folder. Just um, it should be a campus underscore customs dot db file. Um, And the tools that I will be creating should be updating that um, campus customs DB file. Um, and we'll be we'll be making a copy of the data base file um, of the DB file. Just so that it it should be called campus underscore customs underscore new dot DB. Um, so that in any case we can kind of reset the um, the DB once we start resolving some tickets. We'll have some rules in this shop. So task.date underscore today will be the today day for the shop. And this will be helpful for determining when certain uh, tasks mm-hmm. are due and overdue. Um, the vendor lead times will be coming from the ben- mm-hmm. vendors table. In the DB doc in the DB document, um, and other stuff, kind of the vendor will not be able to ship any products while they have an un- unpaid uh, invoice. The um, human approval is always in required and necessary for any payments. Um, and uh, this is fundamental so just keep this in mind. If there's not enough cash, the pay tool must refuse. Okay, so we don't have negative balances, don't act on credit, we gotta have cash. Um, we're not gonna be working on revenue sources. We're only gonna be working with our vendors, our providers, we're gonna be using that. Mm-hmm. Um, and As a general safety rule, do not email anyone or call mm-hmm. anyone every single draft has to stay on the board. And of course, use your port API key for any AI calls. Um, just use uh, GPT-6 Luna mm-hmm. uh, for every single, for every single model. Um, and yeah, just keep this in mind as a memory.

---

## Problem 1: Vibe Coder Prompts

### Prompt 1 (my own words)

> Um, we're going to be also working as I did in homework number four within AI underscore prompts.md file. That kind of will be kept updated. Just at this prompt as part of a kind of, um, pre-task or something like that. Now, every time uh, we I tell you something, you'll be um, you'll be updating AI prompts.md. Um, every, every single problem will have in the, this MD file should have the name of the problem, the title, so problem one, double points, vibe coder prompts, so you should include this now. And um, every section has to have one individual problem, each section should include the problem number and title, at least one of the prompts. Um, and then one follow-up prompt if needed. And of course, if needed, one sentence that uh, explains what was lacking after the first one.

### Follow-up prompt

> Hey, just change the prompt um, empty file so that the so you can divide my first prompt into preliminary stuff and only put under prompt one what I specifically um, set for prompt one.

What was lacking: my first prompt didn't say to keep the project setup and shop rules separate from the Problem 1 prompt-log instructions.

---

## Problem 2: Study the Campus Customs Database

### Prompt 1 (my own words)

> Thank you. So problem number two is study the campus custom database. Um, so first, let me just have a overview of every single table and its fields of the campus uh, customs DB file. And then just copy the original file into a um, new DB file that's called campus underscore customs underscore new. Um, so that later problems update that working copy. And we don't we don't um, modify the original document. Show me specifically the three open tickets. So that we can see how they link to the other tables. And we need to study this and then just start also the output slash harness.md file. Um, so that we can know um, just create the document and I'll do a follow up.

### Follow-up prompt

> Okay, now in the output hardness of the file, just for each single table, list the fields. And only one short line on why that table matters for the agent. And then let me review it I'll make the changes necessary just make sure it's a short line describing specifically this and do not consider anything else but the relevance

What was lacking: my first prompt asked to start harness.md but didn't say what goes in it: each table's fields plus one short line on why it matters to the agents.

### Follow-up prompt 2

> Hey, you should create this in the new harness.md file that you should have created in the lecture homework five folder. And only that um, don't change anything for the homework three or homework four. Just make a new file.

---

## Problem 3: Build the MCP Server

### Prompt 1 (my own words)

> Okay, great. So now problem three, build the MCP server. Um, just we're gonna write in MCP server file. In MCP underscore server, using fast MCP. Um, the objective is that it will be talking to the campus customs new DB file. Just don't connect it. Don't run it yet. Uh, the idea is that every agent that will be creating, so every worker of the company, will be using the tools in this MCP file. Uh, server. We'll be adding some tools later on. For now, we'll be writing three tools that we know that will be needing for the tickets in the database. Just um, make sure that the names are clear, that they never invade data. And they only use info in the database. Given the information that we currently have, um, and that will be these three tools, we'll have to interact with the open tickets. We'll be creating one tool for the customer orders. Um, one tool for the rent notice and one tool for the price override. So make sure we create those. And um, do that now.

### Follow-up prompt

> Okay, the um, tools should also be able to resolve the tickets. Um, so it should be a tool that actually reads the information, talk ticket, and does what is required to, okay? For example, the customer order if someone wants a specific uh, product then it should go into the inventory and um, change that it should for example um, then the rent notice the same it should um, change for example the cash accounts the same with the customer order if we have a customer order it means that cash came in Uh, the price override just keep it with the same idea. Um, and now we'll we will be creating um, a document that's called. Uh, we'll be working with the harness.md file, just le list each of the MCP tools that we created, and just let us include what tables it reads, which tickets it helps to unlock. So. For the customer order one, one oh one for the for notice, um, the one oh two uh for example, but also let let these let these tools be more general so it shouldn't necessarily be named um in accordance to the tickets. For example, the customer order, yes, but the rent notice maybe not. And then just let's one in the MD file add one sentence on why the tool is right for that specific ticket. Um, we shouldn't be generalists, so let's let's add that. And then add a short MCP underscore server slash readme.md file um, to explain what the MCP server is for, which database file it uses, and the tools that it has.

What was lacking: my first prompt didn't say the tools must resolve tickets (update inventory and cash), have general names, and be documented in harness.md and a README.

### Follow-up prompt 2

> make sure that if you show me the harness.md file you show me correct for HW5

---

## Problem 4: Add the MCP Server to the Vibe Coder and Test Each Tool

### Prompt 1 (my own words)

> Okay, now let's work on problem number four, which is called add the MCP server to Vibecoder and test each tool. So um, we'll be adding a MCP server to this specific project. that we've created and um, so that we can call the tools, right? Just let's save the connection in a JSON file in JSON text in a JSON file called .mcp.json. Add the project uh, root Let's do that.

### Follow-up prompt

> you sure that everythings fine so far? Have an agent review it

### Follow-up prompt 2

> As to the still open - leave them as is. Will fix them later. As to the Approval easy to fake explaon.
>
> As to the ticket quantiy of 0 or less is refused. Explain
>
> Discounted price and rent go back

### Follow-up prompt 3

> Okay, now continuing as part of problem four, um, we have our vibe coder connected. Let's test every single of the MCP tools that we created. And save the evidence on a JSON file that is called output slash MCP underscore smoke. And for every tool, we should include we'll include the following um, so first we're gonna I'm gonna tell you the prompt I ask the vibe coder the tool name and the tool output. The tool output must match the values and data slash under campus underscore customs underscore new dot db file. And as to the um, prompts that I'm gonna be asking the MCP file are the following. So first, we're just got a customer order from Dawid Samad. He's ordering a specific item. Just Fulfill the customer order, please. As to the second one, that is the pay bill, we just the prompt is hey, rent is due. Please make sure that we that we pay it. And as to the apply discount, That's also at the prompt that we gave it. Just add one.

### Follow-up prompt 4

> How do I know it worked?

### Follow-up prompt 5

> why is the result of fulfill customer order refusd. And what is the specific result of apply_discount

## Problem 5: Build the Agent Team and Grow the MCP Tools

### Prompt 1 (my own words)

> Perfect. So now we are going to be working on problem number five, which is called build the agent team and grow the MCP tools. Um, so we need to keep on building the agentic team for the custom company for the Compass Customs um, work. So using the um, Pydantic AI, we, as we said before, we have five different agents. Boss, inventory, accounting, facilities, and customer service. Perfect. So they need to run the back office of the campus customs. Um, the team works on kind of the following way. Every single ticket is on a shared board. which the boss should sort and assign to the specific agent or agents that are going to handle this um, agents at first kind of start in their own lane on their own work but if there needs something from another agent that another agent controls it sends that agent a message on the same ticket um, and it never never never never works around the other agent so if it's some other agent's territory it has to go through that agent specifically every step is locked on the ticket as a node so the person myself can read the full history of any ticket and also the boss can read the history of the ticket in case something happens um I'm the owner, so everything comes to me. Uh, so not everything, sorry. Every payment and any decision that has a real trade-off that the boss can handle itself. Um, and the boss is the one who brings me those decisions to my knowledge. And it gives me two specific or three specific options that I have to choose from. So in that sense, the boss first has to sort the tickets, right? It assigns the work, it decides, well, which bill gets cash first. And escalates to me if required. It can see every ticket it has the tools regarding it has it has to have a tool that lists open tickets it has to have a tool that assigns the ticket it has to have a tool that kind of sets the payment priority and another tool that escalates to owner if required and another tool that closes the ticket so he's the only one that can close an actual ticket after the agent who is in charge of the ticket tells it to. Then the second agent is inventory. It will handle the stock, the vendors, the restocks, and receiving deliveries. It has to have different tools, such as check the stock, check the vendor, order the, the restock, and receive stock. Um, it really has to consider that it would only receive stock Um, it would only use that tool after the vendor's invoice is paid and the lead time has actually passed. If not, the tool returns an error saying that a condition is missing. Accounting, the agent accounting handles the cash, the invoices, and the payments. It lists open bills. It can use cash overview. And it requests payments and has another that uh, tool that is payment status. The rule basically is that request payment never, never pays on its own. So it creates a request that waits for my approval. And um, when the boss has set a priority, the accounting agent has to follow it. Then the facilities agent handles the lease, the rent, and everything related to the space. It has a tool that is check the lease, run the schedule, run schedule, and report facility issue. Um, Basically, this this guy has to report to can confirm what is owned, and then hands the payment to accounting. It never never pays anything itself. And then the customer service agent they handle the orders, the discounts, and replies to customers. It has different tools such as check the order, the fulfill fulfill the order, apply any discount, draft reply, and kind of it fulfill orders that sell part of an order. So the fulfill order can sell part of an order. It can only sell stock that it has actually received. Um, and if it needs to draft a reply, the reply gets kind of saved on the board. It's never sent to the customer. Um, in customer service, agent never promises something that it can't. Um, that inventory hasn't confirmed. A SIM-specific kind of rules, no money moves without my approval. No stock has can be sold before it has been received. Um, though we can be a bit flexible with this, I think, now that I think about it. Maybe If we have an actual confirmation that we are receiving the stock on a specific date, think about it. Um, of course, accounting uses the pay bill tool. Um, in customer service, uses the fulfill customer order tool and the apply discount that I've already created with this. Um, So put every agent prompt in the back end slash prompt slash files um, it has to be one file per agent put the data types in the back end slash models.pi um, this is fundamental and then the agent files under back end slash it has to have one agent one file per agent we are going to be using our port key underscore api underscore key and only ChatGPT six luna for every single agent the shop fax fax come from the mcp server over data uh, slash campus underscore customs underscore new dot db um we shouldn't invent a second shop tools layer that by bypasses the mcp file the mcp server this is fundamental the agent should be wired as a way so that they append to output slash audit underscore trail dot json as they run So for each agent loop step, we need to record enough to audit later. This is fundamental also for the boss to be able to audit it. It has to append to this file and never wipe each run with each run, never wipe it. In the um, document named output slash harness.md, we need to list, list every single agent and each MCP uh, tool including the ones that we've added in this problem along with which table the tool uses, so this is also fundamental. And just we're gonna be adding a short safety section including some of the stuff that I've already given to you like here, um, let's keep some limits in terms of token usage. Um, in terms of real customer and real money, I think I've, I've already said enough, enough safety checks here. Uh, but let's think about it if we need to add some more. Um, just it has those have to be some basic guardrails that we expect a real business to have. When they're touching real customers and real money. And finally, update the MCP underscore server slash readme.md file. So the tool list matches what we actually have uh, now working in this store.

### Follow-up prompt 2

> I dont' undertand the problem with 501

### Follow-up prompt 3

> show me exactly the invoice

### Follow-up prompt 4

> but isnt in weird that a tee costs 840?

### Follow-up prompt 5

> How to we know it costs 8?

### Follow-up prompt 6

> We dont have any info on rush fees right? In that case, we will keep the unit cost as the restock price. However, we will ask the boss if this is the case and he has to give the approval or give it to me to me. Just to me make sure. That we are actually paying the 8 usd it has we will use that 8 usd unless tolf otherwise

### Follow-up prompt 7

> Yes

### Follow-up prompt 8

> Eliminate any testing that you've done, unless explotuluy isntructed to it. Add the cancel restock. If a customer orders something it should and we have partial stock, elevate to the boss who will decide.

---

## Problem 6: Plan the Three Tickets

### Prompt 1 (my own words)

> Okay, so now we're working on problem six, which is called plan the three tickets. Let's create the file output/desk_tickets.html. It should be a page where we can double click, with one tab per ticket, so 101, 102, and 103. Add also cash and reflection tabs that we'll be using later on. Each ticket tab should have an expected section only, and we'll leave room for an actual section once we actually run the agents. In the expected section, the boss will first decide who needs to work on the ticket. For ticket 101, the one size S tee, customer service will find there's no stock, ask inventory for the stock and save a draft reply with no date. Inventory will link the invoice of the tees that are already incoming, so no new order is needed. Accounting will request the payment and I approve it. The tees ship once all the vendor's invoices are paid, including the hoodie invoice from ticket 103. Then inventory receives the tees, customer service sells the tee and asks to close, and the boss closes the ticket. For ticket 102, the rent, facilities will check the lease, how much is due and when, and message accounting. Accounting requests the rent payment, waits for my approval and pays. Facilities confirms and asks to close, and the boss closes the ticket. For ticket 103, customer service sets a price within the 20% limit, sees only 8 of the 20 hoodies are in stock, sells nothing, and asks the boss whether to sell part now and the rest later. Inventory orders the 12 missing hoodies. The boss decides, based on whether we need the money for other things. Customer service sells the 8, the vendor is paid, inventory receives the 12 and customer service sells them.

### Follow-up prompt

> Okay, so we're gonna have to change what we did. And I mean, I it's already in the prompt, but we should specifically say in the words that I've already used and you've used in the thing, who the boss should call first and why. All the agents' delegations that I expect, not the thing that boss calls everyone. And which MCP tools I expect the, to, the run to use. Um, the um,

What was lacking: my first prompt described the steps but didn't ask the page to name who the boss calls first and why, the agent-to-agent delegations, and the MCP tools the run should use.


---

## Problem 7: Backend Routes

### Prompt 1 (my own words)

> Great. So now we're working on problem number seven, which is back-end routes. Oops. We're going to be working on our React front-end dashboard. In problem seven, so we need to create now the backend that it can call. So in the in the file backend slash main.py, we'll be using fast API um, and we'll be adding some routes to do the following. So basically we need to return the three tickets and whether each one is open and resolved. depending on the actions of the agents. We need to take a ticket ID, and run our agent team on that ticket. Whether it is one of the ones that we have a sample or whether they are other tickets. We should return a recent agent event. So what agent said what the agents did which tools they use so that the board can actually refresh. It should be able to approve the payment or purchases after a human clicks approve. Clicks approve. So kind of in this case, of course, the agent uh, only prepares to pay um, and this is the route is that actually changes cash. It should also return the current checking balance from the cash accounts. It should be able to reset the database to the original values. When I want to try a fresh run, I should be able to start from the backend folder start the server with ubicorn main dot dot app reload port 8000 um, this is the way to turn the backend so the front end dashboard can call those routes then output slash harness.md file let's just list each of the routes and what in one line so what you're what URL and what it does.

---

## Problem 8: Agent Dashboard

### Prompt 1 (my own words)

> In the meantime, we'll, we will start working on problem eight, which is the agent dashboard. We'll be building a front end dashboard in front end slash with React, Vite, and TypeScript. Um, the agent should, the, um, the page should call the routes that we built in problem seven. And at the minimum, the idea is the board includes the list of all three tickets. It should let us pick which ticket we start with and start the agent team on it. Show what every single agent is doing, what they're saying and doing while the ticket runs. So it should be updated uh, as the agents are working. It should be able to mark a ticket resolved when the run finishes. Of course, we want a summary of what each agent did on the ticket. It should let the humans approve a pay or purchase when asked. It should also show the check-in balance and it should drop, of course, after an approved paid. The um, dashboard should be creative. I want it to have some, each agent should be a handsome Dan dressed in something different and dressed as the kind of the, the, the agent that it is. Um, it should be kind of, it should feel like a real desk where people actually said, I want some nice Yale colors. I want some interactive stuff. Um, build it in a way that things move around. Um, agent um, is highlighted when it is working. The thoughts are shown in the meantime. The front end should use the backend information, the localhost 8000. Um, and on the back end, we should allow the Vite page origin. Uh, so the browser is allowed to call those routes. Um, we should really think about the layout, the how agents read differently, how the resolved tickets show up. It should be something that we enjoy using. So before going ahead with it, I'm going to ask you for some ideas as to what we can put. Um, and before think of those ideas or start building whatever you can, give me some ideas in the meantime with a different agent, and then we'll implement those ideas in your build.

### Follow-up prompt

> stop the brainstorming and show me the ideas you've already got

### Follow-up prompt 2

> Um, as part of the customization, use the office floor and if idea. Then use the dance, the different costumes. Use the spotlight when one of the dance is working, then the lamps. The lamp and turns on and also the computer at every dan has a small computer and also turns on instead of using a thought bubble add the thoughts in the computer the tools should pop up maybe also in the computer when use the paper airplanes i mean when one agent messages another use the paper airplane paper airplane that flies between the desks. Use the waiter, the waiting signs. Instead of, as for the tickets, use a corkboard have a progress strip. Yes, add the resolved. The money checks to sign, add the, the rolling balance as well. The report cuts, add them, the ticket story, add them. And let's do a fun extras, just add yellow and blue white confetti when a ticket resolved. Flip the calendar on the wall. To show the dates. Um, hover over a Dan to see its job. Yes. Sounds off by resolved, but you can you can turn it on with a click. Just work on all of these. Um And then in output slash design.md, write um, what we chose for the dashboard look, look. So the layout, how agents read differently, everything, how we resolved in every single customization. Including the creative choices, um, and explain why we chose them. Work on this. And then just connect both the front end with the back end. Um, and open it.

### Follow-up prompt 3

> So, I, I like what you did and how you designed it. However, um, I I wanted I want to take it forward not to be that long, maybe it should be more horizontal, if possible, instead of being like way down. Because I don't like having to go down to see tickets that are in the tickets that I have. And if a ticket is resolved, then it should be moved to the bottom of it. Right. Um, just change that because I don't like it.

---

## Problem 9: Resolve the Tickets

### Prompt 1 (my own words)

> Let's work now on problem number nine, which is called resolve the tickets. Um, I'm going to do the testing on my own on the front end. But before we do that, I need you to reset the working database, um, the, um, which is a data slash campus underscore customs underscore new dot db. So we start clean. Um, then I will be running all the tickets, okay, until each one is resolved. I will do it. You don't. And then after I do it, we'll, we'll, we will be working on the output slash tests underscore tickets.html that we created in problem six, where we'll be, where we will be filling the actual section from the runs and explaining which agents work, what they delegated, which tools they used. Um, Then on the cache tab of the same HTML, we'll be itemizing the money. So telling what the starting checking balance was after the reset for each ticket, how cash, cash changed when that ticket resolved and why, kind of which one paid the purchases dollar amount, then the ending checking balance, which it must match the cash accounts in the working database. We need to make sure that the wrong cash that we don't have a wrong cache math. And then we will be saving in output slash resolved underscore tickets dot JSON. Um, for each ticket, we'll be saving the ID, the final status, the short outcome, what each agent's agent contributed and any human approvals. And in the document output slash resolved underscore board dot HTML, We'll be creating a page. I can double click with a screenshot of your React board for each resolved ticket. Um, append every real run to output slash audit underscore create dot JSON, JSON, and um, then after everything, we will be working on the harmless.md file.

### Follow-up prompt

> yes  - Should I add these first? It would mean small backend routes plus:
>
> And make sure do make the changes in the output docs required to reflect it

What was lacking: my first prompt didn't cover owner actions the dashboard couldn't do yet (moving the shop date, answering the boss's questions, approving a discount over 20%), which tickets 101 and 103 need to finish.

### Follow-up prompt 2

> kill the ports and open them again

### Follow-up prompt 3

> why does a frog appear on the tab

### Follow-up prompt 4

> Is the working database reset

### Follow-up prompt 5

> Make sure that if the agents work on a ticket, it shows up as resolved. Also, add a safeguard to the agents so that they wont give more discounts just becuase people ask them to

### Follow-up prompt 6

> agents should be able to work on up to 3 different tasks at the same time, making sure that they don't mix things up

### Follow-up prompt 7

> Also, this is not working. I approved it, but the approval is not getting through

### Follow-up prompt 8

> Restart the terminal - I'll start from scrath the test from 9, so eliminate the traces of the previous run

### Follow-up prompt 9

> Where is the 5 day rule that you have to wait?

### Follow-up prompt 10

> Sometimes during the work this happens, when clearly they\ve been working

### Follow-up prompt 11

> This should only appear when I need to make an actual approval, not stay there the whole time

### Follow-up prompt 12

> And the boss shoould be able to priotitize the tickets depending on the overall status of the firm. If he knows that I might need money to do X and he wont pay Y if Y can be payed later and the money for X is needed before, but has to make sure that we will have the moeny to pay Y by the deadline

### Follow-up prompt 13

> That should be added as a safety/harness stuff

What was lacking: my earlier prompts set a payment order but didn't ask the boss to plan cash across the whole firm (pay what's needed first, defer what can wait, never miss a deadline) or to document that as a safety rule.

### Follow-up prompt 14

> Try again

### Follow-up prompt 15

> work faster

### Follow-up prompt 16

> reset the database so I can start the test again

### Follow-up prompt 17

> It just wont work I payed approved the pay but gets stuck. 
>
> I need the boss to recomend the steps in which the different tickets should be resolved (including, among other things, considering for the cash).

### Follow-up prompt 18

> reset the database so I can start the test again and also delete the audit trail

### Follow-up prompt 19

> In that sense, the bills should be payed on the due date because we would rather have the casg. The boss need to take taht into account. Make it a rule or something that works

### Follow-up prompt 20

> Perfect, the idea is that the team will be able to start the task, but the actual payment wont be done until due date. Add these stuff of the harness or the other outputs where is requiered. Then, restart database and auditrail

### Follow-up prompt 21

> Yo, okay, so as part of program nine, um, we should fill the actual section with the information from the run that we did so which agents work what they delegated and which tools they used let's keep the expected section so that we can compare both um and also on the cache tab of the same desk underscore tickets dot html document um just make sure that we itemize the money the starting checking balance for each ticket how cash changed when that ticket was resolved and why which pay purchase dollar amount the ending che checking balance which of course must match the cash accounts in the working database then just also fill out the resolved underscore tickets.json and the resolved underscore board.html I will send you the screenshots of the React board for each resolved ticket.

### Follow-up prompt 22

> add these screenshots to the html

### Follow-up prompt 23

> Great. Now finish the output slash harness.md file so it covers the tables, the MCP tools, the five agents, the API rules, the dashboard, and all the safety rules that we added throughout these past few prompts.

### Follow-up prompt 24

> this html is a bit weird

What was lacking: the "By ticket" table in the Cash tab of `desk_tickets.html` ran past the card's edge and had long, confusing column headers.

### Follow-up prompt 25

> and make sure that the harness.md file is read as a single document

What was lacking: `harness.md` still read like a changelog in places ("Added in Problem 5", "Changed from Problem 4"), and the newest Safety bullets were tacked onto the end instead of sitting with their topics.

## Problem 10: Reflection

### Prompt 1 (my own words)

> Perfect. We'll now be working on problem 10. which is the reflection it is named reflection so in output slash desk underscore tickets.html we're going to fill the reflection type and we'll be entering in kind of i will be telling you what to answer and you should kind of write it out so i think that We as to the evaluation is the performance evaluation of the agents on each ticket and why. I think that we should consider the following. Um so let's let's say that until we added the pre-coordination between the agents and the boss, as to when sometime something was going to have to be paid. Um, it was hard to coordination because they weren't really coordinating. And we had some instances where the um, where the money was negative. So we couldn't continue. So we had to restart it. That's just tell them that. But overall, um, I guess it, every single agent maybe was a bit slow that was probably given that they had ChatGPT Luna. Six instead of another faster faster model um at some other stuff there to complete this evaluation performance for each of the tickets i think the actual exceeded the expected plan it worked really well add some stuff there as well. I think something that would have been simpler as one agent with tools would have been this coordination issue as to when something has to be paid. Because the agent was specifically a facilities agent was paying everything in the same kind of as soon as possible. And that wouldn't allow us to fulfill other tickets um so I think that would have been easier because only one agent would have had to coordinate that instead of having the different agents because the fulfill the the accounting agent maybe didn't specifically know that then ticket number three would have required something else so until we added this coordination between kind of stuff the boss would know um what other stuff was due and everything else, it was it was hard. Then for the problems that this agent team could solve with the tools that we built, um, let's be kind of creative and start from where our run ended, so likw with $910 in checking. So one, um, Yale Dramat orders 30 Yale Caps and they say the owner already promised them 40% off, which is not true, so customer service has to stick to the 15% limit, so $18.70 a cap, and the deeper price goes to my desk as a discount request and I just decline it. Two, the Whiffenpoofs want 5 tees in M and the Yale AI Club wants 6 tees in M at the same time, but there's only 5 on the shelf, so the boss has to decide who gets them and inventory restocks 6 tees from Bulldog Print Co. And three, the Yale Club of New Haven orders 15 XL hoodies, there's only 6 on the shelf, so inventory orders 9 more, that's $198, and then the club says, okay, we'll just take the 6, so the boss cancels the restock before that unpaid invoice freezes Bulldog Print Co and the AI Club can't get their tees. And just show what all of that does to the October rent, the $2,400. Um, paying utilities and salaries, actually we can't do that with our tools because request_payment only takes rent or invoices and there's no staff table, so let's move that to the problems the team could not solve. So one, utilities and student-worker wages, we'd need like a Bookkeeper agent with bills, staff and timesheets tables. Two, customer deposits and refunds, like the AI Club could have paid a deposit to cover the $264 hoodie restock, or if Tauhid wants to return the tee we can't refund it, so we'd need a Receivables agent. And three, choosing between vendors when Bulldog Print Co is blocked or we don't have a price list, so a Purchasing agent. And explain the tools and agents that we would have to create in order to solve them. Let's tie every answer to this app specific and the three tickets that we run. Use the ticket tabs and cache tab on the same page as your evidence. So use the evidence. Um, It will have, it needs to have specific really specific compass customs details as to this problem specifically.


---

## Problem 11: Submit to GitHub

### Prompt 1 (my own words)

> Yo, now finally, problem number 11. We need to submit it to GitHub, the title is submit to GitHub. We're going to be pushing our code to a public GitHub repository. So our graders can clone it. We'll be then submitting the URL in a in Canvas and put the URL in the output slash GitHub underscore URL dot txt file. Of course, don't push to the GitHub our real .env Um, do include both database files under data slash um, I'll just tell you how the file should be layout and the readme should explain um, both the should explain copy original DB to the working copy when you need a clear clean run start MCP server start a fast API backend start the react board reset the DB before a full three ticket run.. The title is Submit to GitHub. We're going to be pushing our code to a public GitHub repository so our graders can clone it. We'll be then submitting the URL in a in the canvas and put the URL in the output slash github underscore URL dot txt file. Of course, don't push to the github our real dot env. Um, do include both database files under data slash. Um, I'll just tell you how the file should be laid out. And the README should explain um, both the cop should explain copy original DB to the working copy when you need a clear clean run, start MCP server, start the fast API backend, start the React board, reset the DB before a full three ticket run.
>
> (Attached: a screenshot of the expected file layout: hw5/ with AI_prompts.md, requirements.txt, .env.example, .gitignore, .mcp.json, README.md, data/ (campus_customs.db, campus_customs_new.db), mcp_server/ (server.py, README.md), frontend/, backend/ (main.py, models.py, prompts/ with boss.md, inventory.md, accounting.md, facilities.md, customer_service.md), output/ (harness.md, mcp_smoke.json, desk_tickets.html, design.md, resolved_tickets.json, resolved_board.html, audit_trail.json, github_url.txt).)

### Follow-up prompt 2

> try a fresh clone to see if it works

What was lacking: the first prompt did not ask to check that a grader's fresh clone actually installs and starts.

### Follow-up prompt 3

> stop the clone

### Follow-up prompt 4

> Is the GitHub repo ready?
