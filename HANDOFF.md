# Handoff — 2026-05-08 (end of day, repo flipped public)

**Branch:** `main` (clean)
**Last commit:** `e5070de` — real PWA brand asset set
**Repo visibility:** flipped from private → public at end of session

This is a session-end snapshot for clean resumption. Authoritative
content lives in `docs/`; this file is *not* authoritative.

## What landed today (afternoon session)

- ✅ **Real PWA brand assets.** Replaced placeholder slate-square SVG with
  a green-concentric-rings icon (Gemini-rendered, watermark cleaned up
  in Preview, resized via `sips`). Source PNG lives at
  `frontend/brand-source/icon-source.png`; served set in
  `frontend/public/brand/` (192/512/180/32/16 PNGs). Combined
  `any maskable` purpose since the design respects the safe zone.
- ✅ **Fork-friendly swap point established.** `BRANDING.md` at repo
  root documents the directory split, drop-in replacement, single-shot
  Gemini prompt for The Crossing's set + a fork template, and `sips` /
  ImageMagick / online-tool regeneration paths. README links to it.
- ✅ **Manifest + index.html wired up.** Build (`vite build`) verifies
  all 5 PNGs ship to `dist/brand/`.
- ✅ **Public-prep sweep.** Confirmed no secrets in tracked files or
  git history (`backend/.env` properly gitignored, `.env.example` only
  placeholders, no private keys ever committed). Threat model: don't
  leak credentials; "thinking" / decision logs / domain docs are fine
  to share.
- ✅ **CLAUDE.md updated** to reflect now-public repo (dropped the
  "currently private + future redaction" note).

## Earlier today (morning session, already in HANDOFF history)

- Login-loop bug fix (`useSyncExternalStore` snapshot identity)
- CLAUDE.md → `docs/` refactor with 11 ADRs
- SubscribePage UX overhaul
- Real-device push verified on Android (cloudflared tunnel)
- Docker prod stack verified end-to-end
- README + portability clarification
- Four PRs merged (#1 v1 scaffold, #2 docker fix, #3 README, #4 portability, #5 morning HANDOFF refresh)

## Open candidates for the next session

Same list as morning HANDOFF, minus brand assets which are now done:

1. **iOS push test** — Android verified; iOS needs PWA install + 16.4+
2. **Real campus group structure** — current seed is in-service /
   hospitality / kids; each campus may want different groups. See
   `docs/domain/campus-workflows.md` (mostly empty TODOs to fill).
3. **Domain-knowledge interviews** — three skeleton files in
   `docs/domain/` (Rock RMS, campus workflows, network topology).
4. **Deploy to the real VMware VM.** Stack is verified locally;
   moving to the production VM is the next operational step.
5. **Address `OVERNIGHT.md` recommendations** — rate limiting on
   auth/trigger, JWT_SECRET min-length, login-timing equalization,
   Dockerfile virtual-package shrink, etc.
6. **First Vitest test** — narrowly cover the
   `useSyncExternalStore` snapshot identity bug.

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
Android push verified, real brand assets shipped); auto-loads.

## Local environment state at session end

- Docker prod stack: stopped
- Dev servers: stopped
- Working tree: clean, on `main`
- VAPID keys: in `backend/.env` (gitignored, generated 2026-05-08)
- Test data in dev DB: persists in `backend/tmp/dev.db`
- Repo visibility: **public** (flipped end of session 2026-05-08)

---

*OVERNIGHT.md is in the repo as a historical artifact from the
overnight autonomous run. Both that file and earlier HANDOFF revisions
are point-in-time snapshots, not living docs.*
