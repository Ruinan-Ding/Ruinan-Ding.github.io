---
name: scrum
description: Deliver Write Timer development tasks with the project's cross-functional Scrum team, BDD acceptance examples and TDD. Use for features, fixes, engineering reviews and explicit refinement, planning, review or retrospective requests in this repository; not for using the timer or general Scrum questions.
---

# Scrum delivery

Read [AGENTS.md](../../../AGENTS.md),
[SCRUM_WORKFLOW.md](../../../SCRUM_WORKFLOW.md) and the current
[backlog](../../../SCRUM_BACKLOG.md). They own repo constraints, team
responsibilities and delivery rules. The request is `$ARGUMENTS`; if empty,
continue the active request/handoff rather than inventing work.

The main conversation orchestrates. Assigned workers follow their role/task
packet and return results to the lead; loading this skill does not make a worker
another orchestrator or broaden its authorization.

1. Inspect the branch, dirty files, active story and affected code. Preserve
   existing work and user priorities; identify the goal and missing product rules.
2. Refine observable Given/When/Then examples with product, development and
   quality input. Map examples to meaningful checks before implementation. Ask
   the owner about missing decisions while continuing independent work.
3. Use the relevant profiles in `.claude/agents/` and the workflow's ownership
   contract. Delegate independent work only when runtime policy permits. Choose
   native interactive teams, focused subagents or sequential work according to
   actual dependencies and capacity; never activate every role just to fill seats.
4. Follow Red → Green → Refactor for behavior changes. Integrate the UI/state
   paths and obtain qualified independent review when available. Give reviewers
   the actual diff/new files and source-bound check evidence. For docs/agent
   configuration use structural checks, without inventing a failing timer test.
   Preserve failing output and investigate flaky/baseline/environment failures.
5. Complete the applicable Definition of Done checks and update the active story
   and PUNCHLIST truthfully. State missing checks, reviews and owner observations.
   At review identify one concrete improvement. Scrum events add no extra
   permission gates; commits, pushes and deployment retain AGENTS.md's rules.

SDD means specification-driven development in this workflow and remains a future
option. Do not install a framework or create another product-rule authority.
