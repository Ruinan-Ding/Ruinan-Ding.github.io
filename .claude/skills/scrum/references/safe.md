# SAFe coordination — load on demand

Use for cross-story features/epics, PI planning, cross-team dependencies, economic
ordering or coordinated releases. Routine stories keep the compact SDD → BDD → TDD path.
This is SAFe-aligned practice for one product/team, not a claim of enterprise
adoption. A Claude agent team is not an Agile Release Train (ART). Create an ART
coordination plan only for real cooperating Agile Teams; invent none to fill roles.

## Accountabilities without more profiles

| SAFe responsibility | Existing capability |
|---|---|
| Business Owners / portfolio investment | Human owner decides value, funding, priorities and material business-risk acceptance. |
| Product Management / Product Owner | Human retains feature strategy and story decisions; product analyst prepares hypotheses, examples and ordering proposals. |
| Release Train Engineer (RTE) / Scrum Master | Lead or scrum-master facilitates planning, dependencies, risks and improvement; no management layer. |
| System Architect | Architect defines necessary interfaces, NFRs and near-term enablers, coordinating with state/frontend. |
| Agile Teams / System Team | Current developers, quality and UX deliver; release coordinates integration/CI with reliability. Separate teams require actual ownership boundaries. |

One participant can cover several responsibilities. Role mapping grants no new
tools, product authority, spending or release permission; peer review still needs
a qualified non-author when available. Read only the assigned scope.

## Intent, value and work hierarchy

Link owner intent → feature → story spec → criteria/tests/code. Use an epic only
for a significant initiative needing wider investment oversight: a short value
hypothesis, MVP/learning measure, cost/capacity assumptions and owner decision.
A tiny fix may be a direct story. Add large-solution capabilities/coordination
only when multiple real ARTs require it; do not create placeholder portfolios.

A feature has an ID, benefit hypothesis, observable acceptance, relevant NFRs
and linked stories. Split it into feasible slices; near-term enablers explain
which feature or risk they serve. Maintain one record per item in the existing
backlog, with links instead of parallel portfolio/ART/team copies. Reuse accepted
rules/schema links and the spec translator; no separate requirements framework.

When competing features need economic ordering, propose
`WSJF = (business/user value + time criticality + risk reduction/opportunity) / job size`.
Use comparable, explicitly estimated inputs; never invent owner value scores or
divide by zero. With missing inputs, show qualitative tradeoffs/questions.
WSJF advises the owner's ordering; a single request needs no scoring ceremony.

## PI planning and execution

PI means Planning Interval here. Agree cadence/dates, scope, participating teams
and capacity with the owner before calling a PI active. The usual 8–12-week
guidance is not this repo's schedule. Unscheduled authorized work can proceed.

1. Product supplies vision, ordered features and acceptance. Architecture exposes
   interfaces/NFRs/enablers; Developers identify capacity including integration,
   testing and innovation/planning (IP) time, not just implementation tasks.
2. Split features into story specs and iteration plans. Link each PI objective to
   outcomes, feature IDs and evidence. Distinguish committed/uncommitted objectives
   using actual capacity and agreement; uncommitted is not permission to ignore it.
   Business value comes from the human, never a simulated stakeholder score.
3. Keep a tiny dependency board: producer → consumer, deliverable, owner and
   expected iteration/blocker. Resolve shared interfaces before dependent edits;
   independent work continues. Record actual confidence concerns and replan with
   participants; do not fabricate a vote or promise another team's capacity.
4. ROAM each material risk: Resolved, Owned, Accepted or Mitigated, with owner,
   action and review point. Escalate material business/data-loss acceptance to the
   human; technical mitigations within scope need no new approval ritual.
5. Inspect dependencies/objectives through ART Sync when multiple teams need it;
   combine relevant PO/team coordination into one concise update for this team.
   Demonstrate the integrated system each iteration, recording actual stakeholder
   feedback separately from technical checks. At PI end, Inspect & Adapt reviews
   the demo, outcomes/flow and one improvement with an owner and measure.

Use only populated fields, in the existing backlog:

```text
Feature: ID, benefit/acceptance, NFR links, stories, owner, state
PI: dates/status/participants, capacity/IP allowance, objectives → feature IDs
Dependency/risk: IDs, owners, action/iteration, ROAM state if applicable
Review: integrated evidence, actual feedback/objective results, next improvement
```

Change scope/objectives explicitly when steering changes priorities. Preserve
unaffected criteria/evidence; do not silently rewrite history or equate finished
stories with achieved objectives. No PI, meeting or acceptance exists merely
because its template is available. Flow state: Ready → In progress → Review → Done;
Blocked carries the real dependency. Finish/replan before increasing WIP.

## Built-in quality and delivery

Exploration translates intent into features/specs; integration uses TDD and
current checks; deployment and release follow owner authorization. A story meets
the shared Done definition; a feature additionally needs integrated acceptance
and affected NFR evidence. PI completion reports actual objective outcomes, not
an automatic release or owner-SEEN status. Track defects, blocked/cycle time and
task-level token use alongside quality; do not optimize token counts by dropping checks.

This repo deploys immediately on a push to `main`. Prepare on a feature branch
when release timing must differ; an authorized main push publishes. Independent
release-on-demand controls would require an explicitly requested CI/app change;
this workflow adds no feature flags or automatic publication authority.

## Primary references

[Features](https://framework.scaledagile.com/features-and-capabilities/),
[WSJF](https://framework.scaledagile.com/wsjf/),
[PI Planning](https://framework.scaledagile.com/pi-planning/),
[RTE](https://framework.scaledagile.com/release-train-engineer/),
[Inspect & Adapt](https://framework.scaledagile.com/inspect-and-adapt/),
[delivery pipeline](https://framework.scaledagile.com/continuous-delivery-pipeline/).
