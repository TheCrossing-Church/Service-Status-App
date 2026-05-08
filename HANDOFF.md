# Handoff — 2026-05-08 (afternoon, end of session)

**Branch:** `main` (clean, no feature branches, all PRs merged)
**Last commit:** `36dfe3c` — PR #4 merge, README deployment portability

This is a session-end snapshot for clean resumption. Authoritative
content lives in `docs/`; this file is *not* authoritative — read it
to remember where we stopped, then dive into the docs.

## What landed today

- ✅ **Login-loop bug fix** — `useSyncExternalStore` snapshot identity
  issue in `frontend/src/auth/store.ts`. Browser login now works.
- ✅ **CLAUDE.md → docs/ refactor.** Top-level CLAUDE.md compact;
  deeper content in `docs/architecture.md`, `docs/decisions.md`,
  `docs/operations.md`, `docs/working-with-ai.md`. 11 architectural
  decisions captured ADR-style.
- ✅ **SubscribePage UX overhaul.** Per-device callout, helper text on
  Name + Email, collapsible campus picker, install help section.
- ✅ **Real-device push verified on Android** via cloudflared tunnel.
  iOS still untested.
- ✅ **Docker prod stack verified end-to-end.** One nginx fix landed
  (`/health` was SPA-falling-through). `docker compose --profile prod
  up` boots clean.
- ✅ **README.md added** at repo root + portability clarification.
- ✅ **Four PRs merged**: #1 v1 scaffold, #2 docker fix, #3 README,
  #4 README portability.

## Where we left off — the open question

You asked to **discuss next steps** in the next session. Strong
candidates, in rough order of value:

1. **iOS push test** — Android verified; iOS needs PWA install (Add
   to Home Screen) + iOS 16.4+. Would re-use the cloudflared workflow.
2. **Brand assets** — placeholder SVG icon in `frontend/public/`. Real
   logo + PNG icons for proper PWA install.
3. **Real campus group structure** — current seed is in-service /
   hospitality / kids per CLAUDE.md. Each campus may want different
   groups; see `docs/domain/campus-workflows.md` for the prompts.
4. **Domain-knowledge interviews** — three skeleton files in
   `docs/domain/` (Rock RMS, campus workflows, network topology),
   each with concrete TODOs to fill.
5. **Deploy to the real VMware VM.** The stack is verified locally;
   moving to the production VM is the next operational step.
6. **Address recommendations from `OVERNIGHT.md`** (still in repo as
   a historical artifact): rate limiting on auth/trigger, JWT_SECRET
   min-length, Dockerfile virtual-package shrink, login-timing
   equalization, etc.
7. **First Vitest test** — narrowly cover the bug that bit us
   (`useSyncExternalStore` snapshot identity). Still no general test
   suite (PRD §"no tests in v1" is anchored, but case-by-case carve-outs are reasonable).

## Open decisions in `docs/operations.md`

- TLS strategy (Cloudflare-front recommended starter)
- Backup tooling (VMware snapshot vs scp+cron vs Litestream)
- Multi-IT-admin rotation roster + escalation
- Monitoring (none yet)

## Resume sequence

```bash
cd /Users/shawnr/SourceCode/ServiceProgressUpdateTool
git status                  # confirm clean
git log --oneline -10       # see recent activity
```

Then in a new Claude session:
1. CLAUDE.md auto-loads
2. Read this `HANDOFF.md` for the session-end snapshot
3. Pick from the candidates above and start a discussion

Memory has the latest cross-session entries (cloudflared workaround,
push verified) and auto-loads.

## Local environment state at session end

- Docker prod stack: **stopped** (`docker compose --profile prod down`)
- Dev servers: **stopped**
- Working tree: **clean**, on `main`
- VAPID keys: in `backend/.env` (gitignored, generated 2026-05-08)
- Test data in dev DB: a few status updates and 2 test subscribers
  (will persist in `backend/tmp/dev.db`)
- Docker volume `service_progress_data`: persists between Docker
  runs but the stack is down so it's idle
- Memory files: cloudflared HTTP/2 workaround + push verified
  recorded today; auto-loaded by Claude Code

---

*OVERNIGHT.md is also in the repo as a historical artifact from the
overnight autonomous run. Both that file and earlier HANDOFF revisions
are point-in-time snapshots, not living docs.*
