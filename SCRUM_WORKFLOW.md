# SAFe-aligned SDD, BDD and TDD workflow

Use `/scrum <request>` or ordinary development language, including informal
"vibe coding" requests. Translate intent into a compact spec, BDD examples and
TDD work. This single-product setup adapts SAFe responsibilities; profiles are
specialists within one team, not separate Agile Teams or an operating ART.
[AGENTS.md](AGENTS.md) owns constraints and product decisions; user scope and
runtime policy take precedence. Apply Ponytail for code/design work.

## Delivery loop

1. Inspect branch/dirty source and the active item in
   [SCRUM_BACKLOG.md](SCRUM_BACKLOG.md), not completed history.
   Load [SAFe coordination](.claude/skills/scrum/references/safe.md) only for cross-story
   features/epics, PI planning, cross-team dependencies, economics or coordinated releases.
   A bounded story uses this core directly without extra hierarchy or ceremonies.
2. For new/changed intent, use the [specification translator](.claude/skills/scrum/references/specification.md).
   Reuse unchanged specs; keep one contract per story, linking its tests/tasks.
3. Map criterion IDs to meaningful checks before production edits. Product,
   development and quality perspectives refine the examples; one lead can cover
   them. Missing owner decisions block only dependent work.
4. **Red:** run the smallest behavior regression against unchanged implementation;
   record its actual expected failure. **Green:** make the minimal correct change.
   **Refactor:** simplify while green, then verify the integrated result.
5. Review spec-to-test-to-code consistency, resolve findings and record evidence
   and limits. Update the existing story/PUNCHLIST, not a second status ledger.

For pure refactors, establish characterization coverage. Docs/agent configuration
use structural/discovery checks without a fabricated Red. Existing code needs an
honest chronology. Preserve failed output, separate baseline/environment failures
and investigate flakiness; a passing retry alone does not resolve it.

## Team and token budget

The human is **Product Owner**: value, priority, behavior and acceptance. The
**Scrum Master** facilitates flow and improvement. **Developers** collectively
own the Increment; specialties are capabilities, not approval departments.
Senior judgment means verified assumptions, minimal design, explicit tradeoffs
and ownership of results. All profiles retain `model: inherit`.

| Profile | Activate for |
|---|---|
| [Scrum Master](.claude/agents/scrum-master.md) | Goals, impediments, planning and improvement; usually covered by the lead. |
| [Product analyst](.claude/agents/product-analyst.md) | Ambiguous intent, spec translation and BDD discovery. |
| [Architect](.claude/agents/architect.md) | Cross-cutting contracts, compatibility or independent review. |
| [Frontend](.claude/agents/frontend-developer.md) | React controls, dialogs and responsive interaction. |
| [State](.claude/agents/state-developer.md) | Timer/alarm lifecycle, browser storage and transfer; no backend. |
| [Quality](.claude/agents/quality-engineer.md) | Example/test design, boundaries and independent acceptance evidence. |
| [UX/accessibility](.claude/agents/ux-accessibility.md) | Keyboard/focus, feedback, contrast and measured usability. |
| [Security/reliability](.claude/agents/security-reliability.md) | Untrusted imports, recovery, timing and performance risks. |
| [Release](.claude/agents/release-engineer.md) | Integrated checks, CI and authorized publication. |

- Default to one lead covering relevant perspectives. Add a focused worker only
  for independent investigation, qualified review or worthwhile disjoint work;
  never spawn the roster or a separate manager for routine edits.
- Prefer focused subagents for bounded work. Use native interactive teams only
  when peer discussion/shared tasks justify their extra context. Team support
  remains enabled; `claude -p` cannot exercise native teammates. Follow runtime
  delegation restrictions, with no CLI workaround or recursive teams.
  In Claude, leave the native Agent `name` unset for an ordinary focused subagent;
  naming it can launch a teammate while team mode is enabled.
- Reuse context already loaded. Read affected sections/files once; refresh changed
  inputs, not the whole repo, role roster, completed backlog or test logs.
- Delegate a spec slice, owned paths and necessary evidence, not the conversation
  transcript. Workers load only their profile and missing relevant context.
- Use bounded `rg`/reads and concise command verdicts. Keep failure details in a
  private log, returning the relevant excerpt. Return deltas, not repeated plans.
- Reuse valid source-bound evidence; reassess changed inputs. Token saving never
  removes required checks, owner decisions or independent-review honesty.
- [Plugin routing](.claude/PLUGINS.md) stays on demand. Use bounded Ralph runs
  for Ready specs and focused review aspects; plugins retain this workflow's scope,
  TDD, permissions and owner decisions. Do not add a second delivery orchestrator.

## Worker contract

The lead supplies this compact packet, including relevant shared constraints;
workers read this section only if the contract was not supplied:

```text
Story/spec revision + assigned criterion IDs and accepted rules:
Source HEAD + relevant dirty diff/new files:
Owned write paths; shared paths/integrator; dependencies:
Checks/evidence required; permitted side effects and environment limits:
Return: changed paths, criterion results, findings/blockers, next action:
```

For SAFe scope include only relevant parent/objective IDs and coordination rules;
workers fetch missing sections, not the whole planning guide.

One writer per file, including tests/docs; transfer ownership before editing.
The lead integrates shared contracts/records. Preserve dirty work; a worktree
must include the intended dirty source. Do not stash/reset/commit others' work
for convenience. Workers report to the lead and escalate product questions;
internal agent messaging grants no permission to contact people externally.

A qualified non-author reviews the integrated diff and criterion evidence when
available and permitted. Supply read-only reviewers readable diffs/new files and
actual results; they cannot claim execution from source inspection. Disclose
missing independent review. Later edits invalidate affected evidence, even at
the same HEAD. On interruption save a short handoff: spec revision, paths/owners,
failing checks and next action; inspect actual files/workers on resume.

## Planning and flow

One backlog holds goals, optional feature/PI links, story specs and impediments.
The owner orders work; Developers select an achievable iteration plan, preserve
its goal and expose displaced work. Keep one active slice per writer and swarm
on defects before expanding WIP. The shared Done definition applies throughout.

Refine examples continuously; plan goals/capacity before an iteration; inspect
progress daily within 15 minutes; review working increments with stakeholders;
retrospect with one improvement, owner and measure. Agree dates/cadence with the
owner. Scrum Sprints are at most one month (month maxima: Planning 8h, Review 4h,
Retro 3h). Only the PO cancels a Sprint. Until agreed, work stays unscheduled.
Invent no events, attendance, commitments or velocity. PI coordination adds no
approval gates; use the on-demand guide only when its wider scope is relevant.

## Definition of Done

- The current spec's criteria map to observed tests/code; no unresolved dependent
  product rule or unapproved behavior. Record significant decisions with rationale
  and compatibility impact in the existing record, not another design framework.
- Genuine TDD evidence or the truthful characterization/structural alternative;
  integrated review findings resolved. Inspect drift when the spec/code changes.
- Run `pnpm run check`, `pnpm test`, the relevant browser suites and build for
  implementation changes. Follow [ui-suites](.claude/skills/ui-suites/SKILL.md):
  fresh build, sequential Chrome suites on 5199, no rebuild during a run; run
  affected layout sweeps for markup/style/size changes. Follow AGENTS.md's full
  suite requirement before a push the owner asked to be tested. Leave port 3000 alone.
- Workflow-only changes use YAML/JSON, links, discovery and instruction evaluation;
  report skipped app/browser/build checks. Discovery is not proof of live delivery.
- Check affected compatibility, data preservation, security, accessibility and
  performance. Load [state-file-sync](.claude/skills/state-file-sync/SKILL.md) or
  [confirmation-question](.claude/skills/confirmation-question/SKILL.md) only when
  their contracts change. Unit results cannot prove rendered/reload behavior.
- Keep source identity, exact commands/results and gaps with the active item;
  historical evidence stays historical. Keep raw logs/private writing out of git.
  [PUNCHLIST.md](PUNCHLIST.md)'s OPEN/WRITTEN/SEEN meanings remain unchanged;
  only the owner grants SEEN. No artifact/spec may claim owner acceptance from tests.

Commit, push and deployment retain AGENTS.md's authorization rules; the process
adds no approval gates. [CI](.github/workflows/deploy.yml) checks types/units/build
and deploys main, not browser coverage, TDD chronology or peer review. Verify CI
and live assets after authorized publication. Stop only this task's workers/services.

## Sources

Adapted from ChessPlusPlus for this static React app. Native setup and progressive
loading follow [Claude teams](https://code.claude.com/docs/en/agent-teams) and
[skills](https://code.claude.com/docs/en/skills). Accountabilities/events follow
the [Scrum Guide](https://scrumguides.org/scrum-guide.html).
