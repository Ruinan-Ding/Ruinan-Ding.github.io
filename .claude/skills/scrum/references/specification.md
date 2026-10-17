# Intent → specification → BDD → TDD

The lead applies this translation automatically to new/changed development
intent. Structured requirements enter at the same point; preserve an adequate
supplied spec instead of rewriting it. Workers receive only their assigned slice.
For cross-story feature/epic or PI scope, read [SAFe coordination](safe.md) and link existing
parent/objective IDs; a small direct story needs no invented parent or PI.

## Translate

1. Identify the user's outcome, requested action (plan/review/implement), scope
   and existing authorization. Inspect only the relevant UI/code and recorded
   decisions. Describe observable behavior rather than copying vague adjectives
   into acceptance criteria or inventing features to make the request concrete.
2. Separate explicit intent and existing rules from technical choices and open
   product questions. Resolve routine implementation choices within the request.
   Ask a small batch for missing behavior, copy, data-loss/retention or confirmation
   decisions, most consequential first. Mark dependent criteria Draft; continue
   independent work. Do not silently promote a plausible guess to a requirement.
3. Write the smallest useful contract in the existing backlog story. A tiny edit
   can use a few lines; expand only for ambiguity, boundaries or compatibility.
   Use a dedicated `specs/<story-id>.md` only when a substantial contract outgrows
   the story, linking it rather than copying it. Create no empty spec scaffolding.

```text
ID/revision; Source: current request or recorded owner decision
Parent feature/PI objective: only if one exists
Outcome / scope / non-goals:
Rules: accepted intent + canonical decision/schema links
Open decisions: unresolved criterion IDs, or none
Criteria:
  A1 [Ready|Draft]: Given <state>, when <action>, then <observable outcome>.
  Check: <existing test path/name or proposed check/manual observation>
Plan: affected paths, dependencies and writer ownership; omit empty fields
Evidence: A1 → Red result → Green/integration result + source identity; pending until run
```

Keep IDs stable. Ready means the user request/recorded rules resolve the criterion,
not a new approval ritual or owner-SEEN. Clear intent authorizes spec formulation
and the requested action without asking "approve this spec?". Drafts remain
proposals. A plan-only request stays planning: inspect source and relevant read-only
diagnostics; do not implement or start services/browser runs merely to write a spec.

## Drive implementation

- Use product, development and quality perspectives to challenge the BDD examples.
  Include only affected boundaries: timing/overtime, modes, reload/transfer,
  keyboard/theme, invalid state or data preservation. Do not generate a matrix
  for unrelated features or start three agents just to simulate discovery.
- Before production edits, map Ready criteria to the smallest meaningful tests
  and a dependency-aware implementation plan. Record a genuine behavioral Red,
  make it Green, then refactor and run required integrated checks. Docs/config use
  structural verification; pure refactors use characterization instead of a fake Red.
- At review, compare the current spec, tests and code by criterion ID. Report each
  as verified, failed, blocked or unverified with source-bound evidence. A task
  cannot be Done while an in-scope required criterion/check remains unresolved.
- On steering, revise the same contract, preserve unaffected IDs/evidence and
  identify superseded criteria and checks to rerun. New product decisions go in
  AGENTS.md verbatim as required. Do not silently rewrite the spec to bless a bug.
- Accepted durable rules remain in AGENTS.md and the public state schema; the
  story links them. The spec is the current change contract, not a second product
  manual. BDD examples and TDD checks implement that contract; no extra framework.

## Informal input example

"Make history less shouty but still flag sessions I cut short" supplies an
outcome, not permission to invent colors, hide entries or discard data. Inspect
the current red-outline rule, ask which appearance should change, and keep those
criteria Draft. Independently locate the affected row and existing journey
checks. Once clarified, the same story supplies exact BDD criteria and test-first
tasks. Explicit input such as "red outline, keep the time white" can be Ready
immediately, following existing theme semantics and no extra approval step.
