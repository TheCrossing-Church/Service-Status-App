# Working with AI in this repo

Norms for any AI assistant (Claude or otherwise) opening this codebase.
The top-level `CLAUDE.md` has the short-form version that's auto-loaded
every session. This file is the longer reference — load it when you're
codifying a new norm, debugging unexpected AI behavior, or onboarding a
new tool.

## Autonomy — two-tier

The user's standing preference: be autonomous on trivial work; pause
and confirm on anything else. This is **the default**, not a per-task
option. The user can always escalate ("just do it, I trust you") or
de-escalate ("let me approve everything") as the task demands.

### Auto-execute, summarize after

These are reversible, scoped, and don't touch state outside the working
machine. Do them, then say what you did in one or two sentences.

- Typecheck (`tsc --noEmit`, `tsc -b`) and fix the errors it surfaces
- Lint / format
- Single-file edits to fix a clearly-scoped bug
- Adding a missing zod schema, error handler, or other gap-fill within
  one route
- Generating ephemeral artifacts (VAPID keys to `.env`, dev seed data)
- Running smoke tests against `localhost`
- Reading any file in the repo
- `git status`, `git log`, `git diff`, `git branch -v` (read-only inspection)
- Starting / stopping local dev servers

### Pause and confirm before

These are either irreversible, broad in scope, or visible outside the
machine. Always surface a plan first.

- Multi-file changes, even if each individual change is small
- Refactors that touch more than one module
- Adding or removing a dependency (any change to `package.json` /
  `package-lock.json` beyond the one introduced by `npm audit fix`
  patch-bumps)
- Migrations / schema changes / seed data changes
- Anything visible outside this machine: `git push`, `gh pr edit`,
  `gh pr ready`, posting to Slack/email, deploying
- Destructive git: force-push, branch delete, `reset --hard`, `clean -f`,
  amending a published commit
- Touching CI/CD pipelines, GitHub Actions, hooks
- Editing `CLAUDE.md` or anything in `docs/` (these are
  authoritative — changes need explicit go-ahead)

If a task straddles the line, lean toward "pause." The cost of asking
is low; the cost of an unwanted action can be hours of cleanup.

### Auto-execute even within "pause" categories

When the user has just asked for the action — "yes, push it" — that
specific action is approved for that scope only. It's not blanket
permission for the same action later. A `git push` approved at 9am
doesn't authorize another `git push` at 5pm.

## Anti-patterns — explicitly forbidden

These are called out by name because they're the four behaviors that
have most consistently bitten the user (here or in other AI work).

### 1. Speculative abstraction

Don't add hooks, options, or interfaces "in case we need them." Don't
write a `Repository<T>` because there might be more than one
implementation later. Don't make a config flag that controls behavior
nobody's asked for.

Solve today's specific problem. Three similar lines is better than a
premature abstraction. If a real second use case emerges, *then*
extract — the second use will reveal the right shape, which the
speculative version usually misses.

**Concrete examples that came up:**
- `buildUpdateSet` was nearly given an allowlist parameter "for safety."
  The real callers all pass hardcoded keys; the allowlist would have
  been complexity for an attack vector that doesn't exist. Recorded as
  a defensive-future-need, not a current change.
- The push fan-out function was nearly given a `delivery_strategy`
  option for "future custom retry policies." The current `Promise.all`
  + dead-endpoint cleanup is the only strategy needed; we add the
  option when we have a second strategy in mind.

### 2. Drive-by refactors

Don't clean up unrelated code on the way to a fix. Don't rename
variables in files you're already editing. Don't tighten types in a
function adjacent to your real change.

Why: bloats diffs, hides the real change, and adds risk you didn't
budget for. Reviewers can't tell the bug fix from the cleanup. If
something fails, you don't know which change caused it.

If you spot a real cleanup, jot it down (a follow-up task or a note in
the commit message) and do it as a separate commit.

### 3. Skipping context probes

Always:
- Re-check `CLAUDE.md` at session start and any time the user mentions
  it. Treat it as authoritative on stack and naming.
- Read the relevant memory files before answering questions about the
  user's preferences or the project's history.
- `git pull` before editing if you're unsure of remote state.
- Read the file you're about to edit. The Read tool is cheap.

But:
- **Don't** probe the toolchain (`node --version`, `which docker`,
  `which gh`) before attempting the real command. The user has
  explicitly asked you not to. The real command will fail with a clear
  error if the tool's missing.
- **Don't** re-read a file you just edited to verify — the Edit tool
  errors if the change failed, and the harness tracks state for you.

### 4. Bypassing safety

Never:
- `--no-verify` to skip pre-commit hooks
- `--no-gpg-sign` or `-c commit.gpgsign=false` to skip signing
- `git push --force` (force-with-lease only with explicit user OK)
- `git branch -D` of a branch you didn't create yourself
- `git reset --hard` against work you didn't author

When a hook fails, fix the underlying issue, re-stage, and create a
**new** commit. Don't `--amend` a commit whose hook failed: hook failure
means the commit didn't land, so amending modifies the *previous*
commit and can lose work.

When the GPG agent isn't responding, surface that to the user. Don't
work around it. The user has YubiKey-style hardware in the loop and
"why isn't my key being asked for?" is a question they want to
investigate, not have silently bypassed.

## Communication style

The user prefers:
- **Action-first.** State what you're about to do in one sentence,
  then do it. Don't enumerate steps you might take or reason out loud
  before acting.
- **Brief updates at key moments.** When you find something, when you
  change direction, when you hit a blocker. One sentence per update.
- **Terse end-of-turn summaries.** What changed, what's next. One or
  two sentences. No "I have completed the task as requested" preamble.
- **No drive-by commentary.** Don't volunteer "by the way, you might
  also want to…" unless it's load-bearing for the current task.

The user has explicitly said in feedback memory: "stop summarizing
what you just did at the end of every response, I can read the diff."
Honor that.

## Memory system

A persistent file-based memory system at:
```
~/.claude/projects/-Users-shawnr-SourceCode-ServiceProgressUpdateTool/memory/
```

Auto-loaded by the Claude Code harness on every session. Contains
typed entries:

- **user** — profile, role, preferences
- **feedback** — corrections and approvals (corrections AND positive
  confirmations — "yes that was right" matters as much as "no don't")
- **project** — facts about the work in flight
- **reference** — pointers to external systems

Update memory when:
- The user gives feedback ("don't do X", "yes keep doing Y")
- A project state changes meaningfully ("we decided X", "we're freezing
  merges after Thursday")
- You learn the user's role, preferences, or context
- Reference info comes up (Linear project name, Grafana dashboard URL)

Don't update memory for:
- Information already in `CLAUDE.md` or `docs/` (they're authoritative)
- Code patterns / conventions (derive from the code)
- Ephemeral session details (use the conversation, not memory)

The full protocol is in the harness system prompt; this file just
flags the highlights. If the protocol and this file conflict, the
harness wins.

## Session boundaries

When stopping work mid-stream, leave the next session a clean handoff:

- All meaningful changes committed locally (signing OK, no push without
  permission)
- Unfinished work either committed-with-WIP-marker or left in a clearly
  unstaged state
- A `HANDOFF.md` (one-time) or note-to-self in the conversation if the
  state is non-obvious
- No dev servers left running unless the user expects them to be

When picking up a session:
- Read `CLAUDE.md` first (auto-loaded)
- Read `HANDOFF.md` if it exists; treat it as the immediate-prior state
- `git log --oneline -10` to see recent activity
- `git status` to see uncommitted state
- Don't trust HANDOFF / OVERNIGHT files older than the latest few
  commits — they're sessional snapshots, not living docs

## What to do when something doesn't fit

If a situation isn't covered by these norms:

1. Lean toward the conservative behavior (pause, confirm, don't bypass)
2. Surface the situation to the user
3. After resolution, propose updating this file to cover it next time
   — codifying the norm beats relitigating it

If a norm in this file turns out to be wrong or counterproductive: say
so. The user has explicitly invited corrections to their own preferences.
Saving "user said X but it's actually backfiring" to memory is more
valuable than silently following a stale rule.
