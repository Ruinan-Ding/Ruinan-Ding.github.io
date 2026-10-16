# Claude Scrum workflow

Write Timer uses BDD to agree observable behavior and TDD to implement it. One
cross-functional Scrum team owns a working Increment: React UI, timer/state
logic, persistence, tests, documentation and delivery. [AGENTS.md](AGENTS.md)
remains the authority for repo constraints and owner decisions. Current user
instructions and runtime policy take precedence over this workflow.

## Run the team

Start a fresh Claude Code session here and use `/scrum <request>`, or describe
the development task normally. The [skill](.claude/skills/scrum/SKILL.md) applies
this process. Project [settings](.claude/settings.json) enable experimental native
agent teams in-process, preserving the existing Ponytail setting and adding no
model or permission overrides. A setting does not install Ponytail; follow
AGENTS.md for the installation in the Claude environment actually being used.

Use native teammates when independent responsibilities benefit from direct
discussion and shared tasks. Reference the `.claude/agents/` profile by agent
type when spawning each teammate. Focused subagents suit bounded investigation
or review. Sequence dependent work and edits to the same file. Native teams need
an interactive Claude session; `claude -p` cannot prove they work. In a runtime
that cannot delegate, perform the relevant responsibilities sequentially and
disclose the missing independent review. Respect higher-priority delegation
restrictions; do not work around them by starting another CLI or session.

The main conversation coordinates and integrates. Workers return results to it;
they do not recursively start another team or pull unrelated backlog items.
Profiles are reusable capabilities, not nine workers required for every edit.
Start with the smallest useful group within runtime capacity. Multiple instances
of a developer role are appropriate only for independent, disjoint work.

| Work | Staffing and collaboration |
|---|---|
| Docs or agent configuration | One writer; structural checks and a qualified reviewer when warranted. |
| A behavior change | A developer pairs with quality on examples and tests; another qualified participant reviews the integrated result when available. |
| UI plus persistence/timer changes | Frontend and state developers agree the contract, then own disjoint paths. Quality pairs throughout; involve UX, architecture, reliability and release for affected concerns. |

## Accountabilities and senior capabilities

The **human owner is Product Owner** and owns value, priorities and product
decisions. The product analyst assists with discovery and refinement but cannot
approve behavior, decide what is discarded, or accept work on the owner's behalf.
Developers resolve routine implementation choices within that intent.

The **Scrum Master** facilitates effectiveness, inspection and improvement and
helps remove impediments. The lead can cover this responsibility without adding
a management layer. **Developers** collectively create and maintain the Increment;
quality, UX, architecture, reliability and delivery are capabilities within that
team. Pair across specialties and swarm on unfinished work instead of passing it
through departments or approval queues.

Every profile calls for senior judgment: trace the actual lifecycle, challenge
assumptions, explain material tradeoffs, preserve compatibility, surface uncertainty
and own evidence for the outcome. All profiles use `model: inherit`; titles do
not upgrade the model or prove expertise. Assess the work and peer feedback.

| Profile | Contribution |
|---|---|
| [Scrum Master](.claude/agents/scrum-master.md) | Goals, flow, impediments, facilitation and improvement. |
| [Product analyst](.claude/agents/product-analyst.md) | Owner support, writing journeys, BDD examples and traceability. |
| [Architect](.claude/agents/architect.md) | Minimal design, React/state boundaries, compatibility and independent review. |
| [Frontend developer](.claude/agents/frontend-developer.md) | React controls, dialogs, responsive layout and user interactions. |
| [State developer](.claude/agents/state-developer.md) | Countdown/alarm lifecycle, storage, import/export and schema contracts. |
| [Quality engineer](.claude/agents/quality-engineer.md) | BDD discovery, TDD pairing, browser acceptance and exploratory testing. |
| [UX/accessibility](.claude/agents/ux-accessibility.md) | Writing-session usability, keyboard/focus, contrast and responsive behavior. |
| [Security/reliability](.claude/agents/security-reliability.md) | Untrusted state, data loss, timing, recovery and performance. |
| [Release engineer](.claude/agents/release-engineer.md) | Integration, CI/build, release readiness and verified GitHub Pages delivery. |

There is no backend in this app. The state developer covers the persistence and
domain responsibilities that ChessPlusPlus assigns to its backend developer,
without introducing services or another authority for browser state.

Each code/design contributor applies Ponytail. Advisory profiles have read/skill
access and return proposals; developers, quality and release can edit and run
checks within assigned paths and inherited permissions. Read-only review does
not establish test execution or measured browser behavior.

## Goals, backlog and Scrum events

[SCRUM_BACKLOG.md](SCRUM_BACKLOG.md) holds the Product Goal, ordered work,
Sprint Goal/plan, impediments and next handoff. Product Goal, Sprint Goal and
Definition of Done are the commitments for the Product Backlog, Sprint Backlog
and Increment respectively. [PUNCHLIST.md](PUNCHLIST.md) retains the existing
OPEN/WRITTEN/SEEN ledger; do not copy its history into another specification.
Native tasks coordinate current workers; the tracked backlog survives sessions.

Agree Sprint duration, dates and goal with the owner when planning a Sprint;
duration is fixed at one month or less. Until then, work is an unscheduled backlog
item. Do not invent a cadence or call an agent session a completed Sprint.

| Event | Participants and result |
|---|---|
| Refinement, ongoing | Product, development and quality clarify examples, split vertical stories and expose dependencies. The owner orders the backlog. |
| Sprint Planning | The team agrees why the Sprint matters, what it can finish and how to begin. Record dates, goal and Developers' achievable plan, including verification capacity. |
| Daily Scrum | Developers inspect the Sprint Goal each working day, adapt the plan and expose impediments within 15 minutes. An asynchronous update is not fabricated meeting attendance. |
| Sprint Review | Team and available stakeholders inspect the running Increment and evidence and adapt the backlog. Record actual feedback and any missing owner observation. |
| Retrospective | Inspect collaboration and quality; select one improvement with an owner, observable measure and next review date. Check it at the next retrospective. |

Scale event timeboxes to the Sprint: Planning at most eight hours, Review four
and Retrospective three for a one-month Sprint. Do not wait out timeboxes or
manufacture ceremony transcripts. Report events that did not occur honestly.

Stories record an ID, owner request, user outcome, in/out of scope, accepted
decisions, Given/When/Then examples, proposed check mapping, dependencies, current
writer/path ownership, status and source-bound evidence. Use
`Ready → In progress → Review → Done`, or `Blocked` with the exact dependency.
Ready is a refinement aid, not another permission checkpoint. Keep one active
implementation slice per writer; finish, swarm or explicitly park work before
starting more. Developers adapt the plan without silently changing product
priorities or the Sprint Goal; only the Product Owner cancels an obsolete Sprint.

Fold owner steering into the active story and supersede its old examples;
identify affected checks and displaced work. Record a distinct outcome separately.
For a defect, capture expected/actual behavior, reproduction, theme/mode/browser,
source and user impact. Swarm on urgent defects within scope while retaining the
normal regression and review checks. Record significant design/state decisions
with rationale, material alternatives and compatibility impact in the existing
story or relevant guide. Routine naming choices need no separate decision record.

## BDD: discovery, formulation, automation

Use product, development and quality perspectives before a behavior change:
the Three Amigos collaboration can draw on the owner's recorded intent rather
than requiring three agents or another meeting.

1. Discover the writing-session outcome in the request, accepted decisions and
   actual code. Ask the owner about missing product rules in a small batch,
   prioritizing the most consequential question; continue independent work.
2. Formulate concrete Given/When/Then examples with initial state, action and
   observable result. Include meaningful boundaries and affected confirmation
   modes, pause/overtime, reload, transfer, theme and keyboard behavior.
3. Map each example to existing unit/browser checks or a necessary human
   observation before implementation. Automate examples using the current test
   tooling, then record observed results against the examples.

For example, the accepted history rule can be expressed as: Given a run that
never reached overtime and confirmations are off, when STOP is pressed, then
its history border is red and its time keeps the normal theme text color.
Given that same run reached overtime before being extended, stopping it keeps
the normal border. The owner decision remains in AGENTS.md, and the journey
suite exercises it; this workflow does not introduce a second rule source.

No Cucumber dependency, duplicate `.feature` files or separate behavior DSL is
needed for BDD. Agree examples collaboratively and link them to executable tests.

## TDD: Red → Green → Refactor

For new behavior and bug fixes, establish the relevant baseline first, then:

1. **Red:** add the smallest meaningful behavior regression and run it against
   the unchanged implementation. Record the command, test and expected behavioral
   failure. A missing dependency, import error or browser setup failure is not Red.
2. **Green:** implement the smallest correct change and run the focused checks.
   Keep assertions independent of implementation details; do not weaken them to
   make the new code pass. Apply the relevant existing repo skill for schema or
   confirmation changes.
3. **Refactor:** improve names, duplication and boundaries while green, then run
   the relevant integrated regression and acceptance checks.

Pure refactors use existing or added characterization coverage before edits.
Docs/comments/agent configuration use structural and discovery checks without a
fake failing timer test. If code already exists, say so rather than inventing a
test-first chronology. Do not add tests that only repeat a trivial style class.

Choose the layer that observes the defect. The existing `.check.mjs` files cover
word counting and formatting; `tests/*.test.mjs` exercise actual controls through
Chrome/CDP, including transfer and geometry. A unit result cannot prove keyboard
reachability, reload behavior, accessibility or responsive fit. Extend the existing
appropriate suite rather than adding a new testing framework.

For failures, preserve the command, source and failing output. Separate baseline,
environment and new failures. Use a rerun to investigate a cause, not to seek a
lucky green result. A passing retry does not resolve unexplained flakiness; keep
the unresolved failure visible and investigate timing, isolation and shared state.

## Ownership, delegation and handoff

Inspect branch/HEAD, dirty files and current handoff before assigning work. Every
worker receives a bounded task packet:

```text
Story/goal and acceptance example IDs:
Accepted decisions, scope and unresolved questions:
Source: branch/HEAD plus required dirty files and readable diff/new files:
Owned write paths; shared/read-only paths and integrator:
Dependencies and interface/ordering decisions:
Expected Red/Green/acceptance checks and evidence:
Permitted side effects and environment limits:
Return: changed paths, commands/results, review findings and remaining work:
```

Assign one writer per file, including tests and records. The lead owns shared
metadata/contracts unless assigned otherwise. Transfer ownership before editing
another worker's paths. Peers can resolve technical interfaces directly; owner
questions go through the lead. Runtime communication is internal coordination,
not authorization to email or message people through external services.

Use shared-tree parallelism for disjoint edits only. A separate worktree must
include the intended current dirty source; HEAD alone may omit the actual fix.
Do not commit, stash, reset or overwrite another person's work to make delegation
convenient. A blocked interface does not block unrelated investigation.

A qualified peer who did not author the change reviews the integrated diff and
example-to-test evidence when delegation is available and permitted. A design
author cannot label their own sign-off independent. Supply read-only reviewers
the actual story delta/new files, source identity and readable command results;
they request missing inputs rather than claiming shell execution they lack.
Resolve concrete defects and rerun affected checks after integration. Reassess
later edits before reusing earlier review or test evidence, even if HEAD is unchanged.

On interruption, record status, owned paths, decisions, failed checks and the
exact next action in the active story. On resume, inspect actual files and live
workers; do not assume teammates resumed. At completion shut down only this task's
workers/private servers. Leave the owner's dev server on port 3000 alone.

## Definition of Done and delivery evidence

An Increment meets every applicable condition; an unperformed required check is
remaining work, not passed or silently waived:

- Accepted examples are implemented and mapped to observed results. Product
  questions affecting them are resolved or explicitly excluded by the owner.
- Behavior changes have genuine Red/Green/Refactor evidence, or an honest reason
  for characterization/structural checks. Material review findings are resolved.
- Run `pnpm run check` and `pnpm test` for implementation changes, plus the relevant
  browser suites and build. Follow the [ui-suites skill](.claude/skills/ui-suites/SKILL.md)
  for the WSL/Windows split; run browser suites sequentially against a fresh build
  on port 5199. Never rebuild during a browser run. Panel markup/style/size changes
  require the affected layout sweeps. Follow AGENTS.md's full-suite requirement
  before a push the owner asked to be tested; discover the current suite list
  rather than assuming its historical count never changes.
- For workflow-only documentation/configuration, validate YAML/JSON, links,
  discovery and behavior contracts. No unchanged UI means no browser/layout rerun;
  report what was skipped. Do not equate configuration discovery with a live-team
  trial, or an instruction walkthrough with an executed model evaluation.
- Review affected data preservation, schema compatibility, timing, security,
  accessibility and performance paths. Use the existing
  [state-file-sync](.claude/skills/state-file-sync/SKILL.md) and
  [confirmation-question](.claude/skills/confirmation-question/SKILL.md) skills
  where relevant. Preserve the single-route/static/localStorage architecture.
- Keep README, decisions, backlog and punchlist consistent, with no debug artifacts,
  credentials, speculative dependencies or unused scaffolding. Record exact commands,
  environment, source identity, results and limitations with the active story;
  raw logs can stay private, while the tracked outcome remains reproducible.
- Obtain independent review when available and permitted; otherwise disclose the
  limit and any remaining required review. The integrator verifies the combined
  current source, not just separate earlier green branches.

[CI](.github/workflows/deploy.yml) checks types, unit checks and build, then deploys
on pushes to `main`; it does not run browser suites or enforce BDD/TDD chronology
or peer review. After an authorized push, verify the actual workflow and live
assets before claiming a deployment. Workflow setup does not establish enterprise
identity, managed permissions or organizational audit controls.

Technical Done, committed, pushed, deployed and owner-SEEN are distinct states.
Only the owner can move PUNCHLIST entries to SEEN. Prepare the complete reviewable
change before asking for genuinely missing authorization; preserve authorization
already granted for the active action. AGENTS.md still requires explicit commit
and push requests, and one push approval does not authorize another commit.

Inspect outcomes such as escaped defects, blocked/cycle time, acceptance gaps
and the Sprint Goal. Estimates support capacity planning, not agent rankings;
do not invent velocity or optimize for lines, test counts or role count. Use the
next owner-selected behavior story as a real BDD/TDD and collaboration trial,
then improve the workflow from observed friction. Do not invent a feature merely
to exercise every role or claim a stakeholder event occurred.

## SDD later

As in the reference workflow, SDD means **specification-driven development**.
It is a future option. If the owner adopts it, start from accepted BDD examples,
AGENTS.md decisions and the existing public state schema. Agree a small versioned
contract, map it to tests/code and check drift, retaining one authority for each
rule. Do not install spec tooling, duplicate product rules or add approval gates
in advance. Clarify the acronym if the owner intends another meaning.

## References

Adapted from the local ChessPlusPlus Claude workflow, reviewed 15 Oct 2026;
this repo's workflow runs independently of that sibling checkout.

- [Scrum Guide](https://scrumguides.org/scrum-guide.html): accountabilities, events and commitments.
- [Claude agent teams](https://code.claude.com/docs/en/agent-teams): native team setup and runtime limits.
- [Claude subagents](https://code.claude.com/docs/en/sub-agents) and [skills](https://code.claude.com/docs/en/skills): project discovery and file formats.
- [BDD practices](https://cucumber.io/docs/bdd/): discovery, formulation and automation.
