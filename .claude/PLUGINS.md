# Claude plugins — load this guide on demand

These support [the workflow](../SCRUM_WORKFLOW.md); they do not replace its
SDD → BDD → TDD loop, owner decisions, required checks or Git authorization.
The nine project profiles remain the team. Installed plugins add capabilities,
not mandatory reviewers or another orchestration layer.

| Plugin | Default / use |
|---|---|
| `ponytail@ponytail` | Enabled; `/ponytail full` for minimal complete solutions. |
| `ralph-loop@claude-plugins-official` | Enabled, idle until invoked; bounded iteration on a Ready spec. |
| `typescript-lsp@claude-plugins-official` | Enabled; definitions/references and diagnostics for affected TS/JS symbols. |
| `frontend-design@claude-plugins-official` | Enabled; use for requested visual design, preserving the existing UI and owner rules elsewhere. |
| `context7@claude-plugins-official` | Installed, disabled; the same documentation service uses the public HTTP MCP entry in `.mcp.json` instead. |
| `pr-review-toolkit@claude-plugins-official` | Installed, disabled; enable locally for a specific review concern. |

## Focused use

- Ralph is optional, not the default response to every request. Start only with
  Ready criteria, owned files, observable completion and a **positive finite**
  `--max-iterations` (start with 3). Keep the prompt to story/revision, criterion
  IDs, checks and permitted scope; do not repeat the full backlog/process.
  Preserve genuine Red/Green evidence and independent review. A repeated blocker
  or missing owner rule means cancel and report it, not another identical attempt.
- Use `/ralph-loop:ralph-loop "Complete <story/revision and criteria> within its
  scope; run its checks and resolve review findings. Output <promise>VERIFIED</promise>
  only when that is true." --max-iterations 3 --completion-promise "VERIFIED"`.
  Replace the placeholders with the actual current story. Stop with
  `/ralph-loop:cancel-ralph`; never claim success merely to exit. Never nest loops,
  start them in workers or run competing sessions against the project state file.
- Enable the PR toolkit only when its specialty adds something to the existing
  review. In the repo, run `claude plugin enable pr-review-toolkit@claude-plugins-official --scope local`,
  reload plugins in Claude, then select aspects such as
  `/pr-review-toolkit:review-pr tests errors` or `comments`. Use the current dirty
  diff **and new files**, assigned criteria and actual results; review is read-only.
  Do not run `all`/parallel reviews by default. Upstream `code-reviewer` and
  `code-simplifier` specify Opus; use existing project reviewers/Ponytail for routine
  work. Model/tool/delegation policy still applies. Afterward run
  `claude plugin disable pr-review-toolkit@claude-plugins-official --scope local`
  and reload again. Enabling a plugin does not authorize external PR comments.
- Use Context7 for public library/version questions, with a bounded response;
  do not upload source, state exports or private writing. It connects to
  `https://mcp.context7.com/mcp`; anonymous access has shared rate limits. Reuse
  loaded docs. The plugin's `?client=claude-code-plugin` URL returned HTTP 401
  during setup, while the canonical endpoint initialized and listed both tools
  anonymously. Keep the plugin disabled to avoid duplicate connections/login.

The CLI's estimates on 17 Oct 2026 were ~42 idle tokens for Ralph, ~59 for design
and ~1,600 for the PR toolkit. Keeping the toolkit off avoids its idle context.
MCP schemas/results and actual iterations have additional runtime costs; these
estimates do not prove lower task bills. Recheck with `claude plugin details <id>`.

## Install in each Claude environment

Run these shell commands **from this repo**, separately in WSL and Windows.
Project settings declare sources/defaults; they do not install binaries/caches
on another machine. Preserve any existing user-scope installations.

```text
claude plugin marketplace add anthropics/claude-plugins-official --scope project
claude plugin marketplace add DietrichGebert/ponytail --scope project
claude plugin install ponytail@ponytail --scope project
claude plugin install ralph-loop@claude-plugins-official --scope project
claude plugin install typescript-lsp@claude-plugins-official --scope project
claude plugin install frontend-design@claude-plugins-official --scope project
claude plugin install context7@claude-plugins-official --scope project
claude plugin disable context7@claude-plugins-official --scope project
claude plugin install pr-review-toolkit@claude-plugins-official --scope project
claude plugin disable pr-review-toolkit@claude-plugins-official --scope project
claude plugin list
```

The shared [MCP config](../.mcp.json) already declares the canonical Context7
endpoint. It needs no second `mcp add` on the same checkout; check it through
Claude's `/mcp` panel. Both installations currently report **Pending approval**:
approve Context7 through Claude's normal one-time project-server trust prompt.
No API key or personal credentials belong in these files.

TypeScript LSP needs `typescript-language-server` and TypeScript on that
environment's PATH. This setup uses server **5.3.0** (Node >=20) and TypeScript
**5.6.3**, matching the repo; server 6.0.2 needs a newer Node than this WSL has.
In WSL: `npm install --global --prefix ~/.local typescript-language-server@5.3.0 typescript@5.6.3`,
with `~/.local/bin` on PATH. In Windows: `npm install --global typescript-language-server@5.3.0 typescript@5.6.3`,
with the directory from `npm prefix --global` on the user PATH. These are tooling
dependencies outside the app; do not replace the repo's dependency lockfile.

Ralph needs Bash, jq and Perl. WSL has them; Windows uses Git Bash and jq
(`winget install --id jqlang.jq --exact --source winget --scope user`). Restart
Windows Claude after installing/PATH changes, then check the binaries in its Bash.
Keep machine-specific paths out of shared settings. Reload plugins or start a new
Claude session after plugin changes. This Codex session reads installed skills;
it cannot invoke Claude slash commands natively. Loop state is ignored by Git.

Do not stack Superpowers/feature-dev over the existing orchestrator, duplicate
PR review packs, automatic LLM Stop reviews or Git automation. Existing Chrome
suites remain the BDD/browser authority; no second browser installation is needed.
Connect Jira/Linear or other external systems only for a real requested integration.

Sources: [Claude plugin management](https://code.claude.com/docs/en/discover-plugins),
[Ralph](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/ralph-loop),
[review toolkit](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/pr-review-toolkit),
[TypeScript LSP](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/typescript-lsp),
[Context7](https://github.com/upstash/context7), [jq](https://jqlang.org/download/).
