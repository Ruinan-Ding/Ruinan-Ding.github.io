# Scrum backlog

Updated 15 Oct 2026. The human owner orders this backlog and owns product
decisions. [SCRUM_WORKFLOW.md](SCRUM_WORKFLOW.md) defines delivery;
[AGENTS.md](AGENTS.md) records accepted behavior and
[PUNCHLIST.md](PUNCHLIST.md) retains owner-observation checkpoints.

## Product Goal

Proposed for first planning: maintain a dependable writing-session timer with
clear controls, recoverable browser state and verifiable user journeys. This is
a planning proposal, not an owner-approved new feature or release commitment.

## Current Sprint

No Sprint dates, cadence or Sprint Goal have been agreed. The authorized workflow
setup below is an unscheduled item. No Sprint, Daily Scrum, stakeholder Review or
Retrospective is claimed to have occurred.

## Ordered work

### WF-001 — Adapt the Claude Scrum team for Write Timer

- **Source:** owner's 15 Oct 2026 request and target confirmation recorded in AGENTS.md.
- **Outcome:** a discoverable senior cross-functional Claude team using BDD/TDD,
  adapted from ChessPlusPlus with SDD left as a future option.
- **Scope:** project profiles/settings, `/scrum`, shared process, backlog and
  discoverability/documentation. No app behavior, schema, dependency or delivery change.
- **Owner/paths:** lead implementing session owns workflow files and shared records.
- **Status:** Done for workflow configuration; structural and native discovery
  checks pass. Independent planning walkthrough completed; no live-team delivery
  story or product acceptance is claimed.
- **Dependencies:** a suitable Claude installation for discovery; an interactive
  session for native team operation. Ponytail installation varies by environment.

| Example | Given / When / Then | Verification |
|---|---|---|
| WF-001-A | Given a fresh project Claude session, when development is requested, then `/scrum` and nine specialist profiles load without a model/permission override. | YAML/JSON, links and native discovery; report runtime limits. |
| WF-001-B | Given a behavior change, when refined, then product/development/quality agree observable examples and the implementer records genuine Red/Green/Refactor evidence. | Workflow and role-contract inspection; a real behavior story is a later trial. |
| WF-001-C | Given uncertain product behavior or dirty source, when delegated, then the owner retains decisions and workers have the intended source and disjoint ownership. | Instruction review of task packets, ownership and handoff rules. |
| WF-001-D | Given workflow-only work, limited runtime or a possible SDD adoption, when planned, then checks remain proportionate, missing review is visible and no SDD framework is activated. | Structural checks and independent scenario review if available. |

**Verification, 15 Oct 2026:** all nine profiles pass YAML/frontmatter/tool/model
checks; settings preserve Ponytail and add only the native team options. Skill
validation, local links, LF and preservation of existing product rules pass.
Claude Code 2.1.300 discovers nine agents through `/context` and project `scrum`,
`ui-suites`, `state-file-sync` and `confirmation-question` through `/skills` in an
isolated copy without the owner's local settings. `pnpm run check` and `pnpm test`
pass. Browser suites and build were skipped because app/test/build sources did
not change. An independent agent followed a realistic planning-only request with
the new skill and found no actionable workflow defect; this was a read-only
instruction walkthrough, not a Claude-team or product-behavior test. Private
evidence and source manifest: `/tmp/write-timer-scrum-discovery-yhlb5bw4/RESULTS.md`.
Implementation checkpoint: PUNCHLIST 3.1.

Ponytail's instructions were read from the existing local cache; the WSL Claude
installation reports no installed plugins. Existing project plugin settings are
preserved. Install Ponytail in that environment before claiming actual invocation.

**Next handoff:** use the next owner-selected behavior story to evaluate the
workflow in practice, with Ponytail available in the chosen Claude environment.
Do not invent a feature, Sprint dates or owner-SEEN status for this evaluation.

## Impediments and improvement

- Product Goal confirmation and first Sprint planning are pending; these do not
  block the authorized workflow setup or independent development work.
- Native agent-team collaboration has not been exercised by this configuration
  change. Review discovery evidence separately from actual delivery quality.
- First proposed improvement experiment: on the next owner-selected behavior
  story, the facilitator traces an accepted example through Red/Green, relevant
  integration and independent review where permitted, then records missing
  capabilities and avoidable handoff delays. Inspect at the first actual
  retrospective; select a correction from observed friction.
