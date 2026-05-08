# Service Progress Update Tool — Project Context

## What this is

A real-time service progress update tool for The Crossing, a 4-campus church
in the St. Louis area. Production staff trigger status updates ("Running
Late", "Ending Early", etc.) that broadcast instantly to subscribed staff
and volunteers via push notification and a live status webpage. Designed to
be faster and simpler than Teams for in-service communication.

Built during the **Church IT Network AI Context Engineering workshop** as
a working artifact. Repo visibility is currently private; some sections of
this doc are clearly marked "org-specific" so a future redaction pass for
broader sharing is straightforward.

## Quick reference

**Campuses**

| Name | Code | Slug |
|---|---|---|
| Chesterfield | CFD | chesterfield |
| Fenton | FEN | fenton |
| Grant's Trail | GRT | grants-trail |
| Mid Rivers | MID | mid-rivers |

**Stack** — Node + Express + SQLite (better-sqlite3) backend; Vite + React
+ TypeScript + Tailwind PWA frontend; Web Push (VAPID); SSE for live status;
JWT auth; nginx reverse proxy; Docker Compose on Ubuntu Server LTS VMware VM.

**Target URL** — `servicestatus.thecrossing.church` *(org-specific)*

**Repo layout**
```
ServiceProgressUpdateTool/
├── CLAUDE.md                          # this file — load on every session
├── HANDOFF.md                         # last session's resume notes (sessional, not authoritative)
├── OVERNIGHT.md                       # autonomous-run summary (sessional)
├── service-status-app-prd.md          # original PRD
├── docs/
│   ├── architecture.md                # full spec — schema, endpoints, frontend
│   ├── decisions.md                   # the "why" log — anchored vs open-to-revisit
│   ├── operations.md                  # runbook — deploy, backup, restore, incident
│   ├── working-with-ai.md             # AI collaboration norms
│   └── domain/
│       ├── rock-rms.md                # Rock RMS integration specifics
│       ├── campus-workflows.md        # per-campus production team realities
│       └── network-topology.md        # VM, network path, Stream Deck, firewall
├── backend/                           # Node + Express + SQLite API
└── frontend/                          # Vite + React + Tailwind PWA
```

## Working norms (apply every session)

### Autonomy — two-tier

**Auto-execute, summarize after:**
- Typecheck / lint / format
- Single-file edits to fix a clearly-scoped bug
- Adding a missing zod schema, error handler, or other gap-fill within one route
- Generating ephemeral artifacts (VAPID keys, dev seed data)
- Running smoke tests against `localhost`

**Pause and confirm before:**
- Multi-file changes
- Refactors that touch more than one module
- Adding or removing a dependency (any change to `package.json`)
- Migrations / schema changes
- Anything visible outside this machine: `git push`, `gh pr edit`, `gh pr ready`,
  Slack, email, deploys
- Destructive git ops: force-push, branch delete, `reset --hard`, `clean -f`

If unsure, lean toward "pause and confirm." The cost of asking is low; the
cost of an unwanted action is sometimes hours of cleanup.

### Anti-patterns — explicitly forbidden

These have bitten enough times to warrant calling out by name.

1. **Speculative abstraction.** No "in-case-we-need-it" hooks, options, or
   interfaces. Solve today's specific problem. Three similar lines is better
   than a premature abstraction.
2. **Drive-by refactors.** Don't clean up unrelated code on the way to a
   fix. Bloats diffs, hides the real change, and adds risk you didn't budget
   for. If you spot something, note it for a follow-up commit.
3. **Skipping context probes.** Always re-check `CLAUDE.md` at session start
   and any time it's mentioned. Read memory files for prior feedback. `git
   pull` before editing if unsure of state. Don't run blind.
4. **Bypassing safety.** Never `--no-verify`, `--no-gpg-sign`, force-push,
   or delete branches without explicit user permission *for that specific
   action* (durable instructions in this file don't count as blanket
   approval). Hook failures get fixed, not skipped.

### Commit hygiene

- Branch model: feature branches off `main`, no direct push to `main`.
- Commit messages explain *why*, not just *what*. Body wraps at ~72.
- Co-author trailer on AI-assisted commits:
  `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
- Commits are signed (GPG). If the agent isn't responding, surface that to
  the user — don't bypass.
- Local commits are fine; **never `git push` without explicit user request.**

### Response style

- Action-first. Brief updates at key moments — find / change direction /
  blocker. No multi-paragraph narration of internal deliberation.
- End-of-turn summary: one or two sentences. What changed and what's next.
- Code comments default to none. Only when *why* is non-obvious.

## Load-on-demand pointers

| Working on… | Read first |
|---|---|
| Architecture / schema / endpoints | `docs/architecture.md` |
| "Why did we pick X?" — or considering changing X | `docs/decisions.md` |
| Deploy / backup / restore / incident response | `docs/operations.md` |
| Setting up a new AI session, codifying a norm | `docs/working-with-ai.md` |
| Rock RMS integration | `docs/domain/rock-rms.md` |
| Anything campus-team-facing (Stream Deck, sender UX) | `docs/domain/campus-workflows.md` |
| Networking / VM / firewall / Bitfocus Companion | `docs/domain/network-topology.md` |
| Resuming after a long gap | `HANDOFF.md`, then `git log` |

`HANDOFF.md` and `OVERNIGHT.md` are session records — useful for
resuming, but not authoritative. The docs in `docs/` are.

## Memory system

A persistent file-based memory system at
`~/.claude/projects/-Users-shawnr-SourceCode-ServiceProgressUpdateTool/memory/`
captures user profile, feedback, and project state across sessions. It's
auto-loaded by the Claude Code harness. Update it when:
- The user gives feedback ("don't do X", "yes that's right, keep doing Y")
- A project decision changes
- A new external system / reference is mentioned

See `docs/working-with-ai.md` for full memory protocol.
