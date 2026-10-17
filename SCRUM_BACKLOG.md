# Scrum backlog

Updated 17 Oct 2026. Read the active item only; completed records are historical.
The human owner orders this backlog and owns product
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

## Active: WF-004 — Focused Claude plugin support

- **Source/revision:** owner's plugin request in AGENTS.md; r1, Done for
  installation/configuration. Context7 retains Claude's normal user trust step.
- **Outcome:** install relevant Claude plugins for the current SAFe/SDD/BDD/TDD
  workflow, including Ralph, while limiting duplicate orchestration and context.
- **Scope:** project plugin settings, WSL/Windows installations and prerequisites,
  on-demand usage guidance and records. Preserve the existing dirty SAFe work.
  No app/CI behavior changes or external messages. The owner's publication
  follow-up below authorizes Git delivery and the existing deploy-on-main CI.
- **Plan/ownership:** lead owns configuration/docs; inspect plugin sources/hooks,
  install serially, validate both environments and exercise bounded hook/LSP checks
  privately. Installation does not activate a development loop or grant Git authority.

| ID | Ready Given / When / Then | Check / evidence |
|---|---|---|
| A1 | Given the two local Claude environments, when installed, then Ralph, focused reviews, TypeScript navigation, UI design and library documentation are project-scoped alongside Ponytail. | Both native inventories confirm all six plugins and intended defaults. TypeScript and Ralph checks pass in WSL/Windows. Context7 uses the public project MCP entry; native trust is pending. |
| A2 | Given a normal story, when plugins are available, then the existing spec/BDD/TDD path remains authoritative; only relevant tools/review aspects load and Ralph uses a finite limit. | Settings/source and routing checks pass; isolated hooks verify idle behavior, session isolation, retry, completion and iteration cap. PR toolkit stays off until requested. |
| A3 | Given reload or a fresh checkout, when setting up, then marketplace sources, install commands and environment limitations are explicit and no local loop state enters Git. | Sources/defaults, native component discovery, links/LF, ignore patterns and setup guide verified. No loop state was created in the repo. |

**Evidence, 17 Oct:** `pnpm run check` and `pnpm test` pass. Both native plugin
inventories match the shared defaults; all nine existing project profiles retain
their inherited models. Sources/settings, links, LF, loop-state ignores,
preservation of the prior dirty work and `git diff --check` pass. Five standalone
plugin manifests validate (three upstream missing-version warnings). The standalone
directory validator reports `No manifest found` for TypeScript LSP: it is an
intentional `strict:false` marketplace entry, whose registered server is verified
through native inventory and actual definition/type-error checks in both environments.
Initial smoke-harness failures from WSL-to-Windows environment propagation and
Windows URI normalization were corrected; the final hook and LSP checks pass.

The bundled Context7 URL returned HTTP 401; the canonical public endpoint accepts
anonymous initialization and lists both documentation tools. `.mcp.json` uses that
endpoint; its duplicate plugin stays off. Both Claude installations report the
project MCP server **Pending approval**; user trust in Claude is still required.
The PR toolkit also stays off: CLI estimates ~1,600 idle tokens, versus ~42 for
Ralph and ~59 for design. MCP/runtime costs are extra; no task-bill saving is claimed.

WSL now has Ponytail 5.3.2; existing Windows Ponytail 4.8.4/user scope is preserved.
TypeScript tooling is outside app dependencies; Windows jq and the npm user-PATH
entry are installed. Installed Ponytail guidance was applied in Codex; no native
slash-command invocation, model-driven plugin review or end-to-end Claude team run
is claimed. Browser/build checks were skipped for unchanged app/test/CI sources.
No independent reviewer was used for this plugin/configuration delta. Source:
main at 7e74fe5 plus the preserved SAFe delta and this task; private source/manifest
and results: `/tmp/write-timer-plugins-20261017-qy2hjnhj/RESULTS.md`.

**Next:** restart Windows Claude for PATH changes, reload plugins, and approve
Context7 through Claude's project-server trust prompt when using documentation.
Use the next owner-selected story to measure actual token cost and delivery.
No app behavior or owner-SEEN status changed.

**Publication follow-up, 17 Oct:** owner: "commit push merge". Publish WF-003 and
WF-004 together as the owner, preserving unrelated branches/work. The work is
already on `main`; no separate branch merge is needed. Fetch/compare the remote,
reuse the exact source-bound passing checks, commit and push with Windows Git,
then verify CI and live assets. Post-publication results/source identity are kept
in `/tmp/write-timer-plugins-20261017-qy2hjnhj/PUBLISH_RESULTS.md`.

## Completed: WF-003 — Token-efficient SAFe alignment

- **Source/revision:** owner's SAFe request recorded in AGENTS.md; r1, Done for
  workflow configuration. Actual PI/team operation remains untried.
- **Outcome:** connect intent, optional epics, features and story specs to PI/iteration
  planning and integrated delivery, preserving SDD/BDD/TDD and owner authority.
- **Scope/non-goals:** workflow, on-demand guidance, four role bodies, safe preview
  cleanup instructions and records;
  no app/CI behavior, extra profiles, model/permission changes or publication.
- **Plan/ownership:** lead owns these files; structural/link/size checks, independent
  scenario review and type/unit checks. Browser/build checks are unnecessary for
  unchanged app/test/CI sources. No real ART or PI is being launched.

| ID | Ready Given / When / Then | Check / evidence |
|---|---|---|
| A1 | Given planning/coordination work, when routed, then SAFe accountabilities, feature/story links, PI objectives, dependencies, risks and integrated review have concrete owners and outcomes. | Official-reference/instruction review and independent scenarios pass. |
| A2 | Given a small direct request, when translated, then the existing compact SDD/BDD/TDD path works without extra hierarchy/ceremonies or loading the SAFe reference. | Independent small-story scenario passes; entry/core text 10,766 → 10,685 characters. |
| A3 | Given the role setup, when loaded, then the same nine profiles, model/tool choices and settings remain available; SAFe responsibilities reuse existing roles. | Parsed frontmatter and settings match HEAD; skill validation and local links pass. |
| A4 | Given unknown PI dates, values, risks or release authority, when planning, then proposals stay explicit, business decisions stay human and no meeting, ART, deployment or acceptance is invented. | Independent PI-planning and constrained release scenarios pass; no simulated work executed. |

**Evidence, 17 Oct:** `pnpm run check`, `pnpm test`, both affected skill validators,
profile/settings preservation, local links, LF, existing product/architecture-rule
preservation and `git diff --check` pass. Independent instruction scenarios cover
a direct appearance story, unscheduled PI planning with unknown capacity/value,
and release timing under unchanged deploy-on-main CI. Review found an existing
preview cleanup command that could stop unrelated servers; the instructions now
retain and stop only the task-started PID/session. Read-only follow-up passes.

Entry/core instructions are 0.8% smaller. The measured operating-file set grows
20,762 → 28,094 characters, including the new 6,566-character on-demand SAFe guide;
this is text size, not a measured runtime token saving. All nine profile headers
and settings are unchanged, so native discovery was not rerun. App/test/CI source
is unchanged; browser/build checks were skipped. Cached Ponytail guidance was
applied; no plugin invocation is claimed. Source: main at 7e74fe5 plus this delta;
private evidence/manifest: `/tmp/write-timer-safe-20261017-h9mlme_y/RESULTS.md`.

**Next:** try the workflow on the next owner-selected story; agree any real PI
cadence/capacity before activating it and measure task-level tokens alongside
quality. No ART, stakeholder planning, live-team trial or owner-SEEN status is
claimed. Publication was subsequently authorized by the follow-up under WF-004.

## Completed: WF-002 — Compact SDD/BDD/TDD delivery

- **Source:** 17 Oct owner request quoted under Development workflow in AGENTS.md.
- **Revision/status:** r1, Done for workflow configuration. Unscheduled item;
  actual task-level token cost and live-team delivery remain a future trial.
- **Outcome/scope:** automatically translate informal development intent into a
  compact specification, BDD examples and TDD work; reduce repeated context and
  staffing overhead while preserving the nine senior capabilities and repo rules.
- **Non-goals:** app behavior, new spec/testing frameworks, model/permission
  changes, live-team performance claims, commit/push/deploy. No open product decisions.
- **Plan/ownership:** lead owns workflow, skill/translator, profiles and shared
  records. Structural checks, native discovery and independent scenario evaluation;
  type/unit checks, no unchanged app/browser/build rerun. No simulated feature is
  an actual backlog request or owner decision.

| Criterion | Ready Given / When / Then | Check / evidence |
|---|---|---|
| A1 | Given an informal or structured development request, when received normally or through `/scrum`, then the lead creates/reuses one scoped spec with stable BDD criterion IDs and test mapping. | Skill/routing inspection, native discovery and independent scenario evaluation pass. |
| A2 | Given clear intent, when translating, then requested work proceeds without another spec approval; given missing product rules, only dependent criteria remain Draft. Planning-only scope stays planning-only. | Independent clear, ambiguous, plan-only and steering scenarios pass; no product changes executed. |
| A3 | Given a behavior change or later steering, when implementing/reviewing, then tests precede production edits, current criteria trace to evidence, and affected spec/test/code drift is resolved. | Instruction/role evaluation; no app TDD execution claimed. |
| A4 | Given a bounded task, when staffing/loading context, then only needed roles/context are used, shared rules/evidence remain intact, and all nine profiles stay available without model/permission changes. | Operating text 36.4% smaller including the translator; native agent listing 487 → 235 tokens. YAML/JSON, links and discovery pass. |

**Evidence, 17 Oct:** `pnpm run check`, `pnpm test`, skill validation, profile
frontmatter/tool/model preservation, links, LF and product-rule preservation pass.
Claude Code 2.1.285 discovers all nine profiles and four project skills in an
isolated copy. Same-version `/context` reports 487 → 235 agent-listing tokens
(51.7% reduction); memory remains rounded to 3.9k. Operating files plus the new
translator total 32,661 → 20,762 characters (36.4% reduction); this is text size,
not a guarantee of total runtime token/cost savings. An independent agent's three
simulated requests preserved clear intent, unresolved rules, planning scope and
steering; no actionable instruction defect was found. No app/test/CI source
changed, so browser/build checks were skipped. Native auto-selection on a real
task, live-team TDD delivery and actual billable cost were not benchmarked.
Cached Ponytail guidance was applied; no invocation is claimed. Private source
snapshots/native output/manifest: `/tmp/write-timer-sdd-20261017-y4o3qg7z/RESULTS.md`.

**Next:** use the next real owner-selected story to measure task-level token use,
automatic translation and delivery behavior. Publication is authorized by the
owner's follow-up, "push commit and merge"; the work is already on main.

## Completed history

WF-001 below is the 15 Oct setup snapshot, not current SDD policy. WF-002
supersedes its future-SDD wording; do not reload old verification by default.

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
