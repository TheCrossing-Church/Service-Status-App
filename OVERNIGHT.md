# Overnight Autonomous Run — Summary

**Started:** 2026-05-08, after the local-verify + PR #1 promotion.
**Branch:** `scaffold/backend` — same branch as before; **5 new commits, none pushed**.
**Mode:** Autonomous queue execution (12 pre-approved tasks). Stopped on completion of the queue; no decision points required interrupting.

---

## TL;DR

- Two real correctness fixes landed (one backend, one frontend) — both small, both committed locally.
- Three additive items committed (robots.txt, PWA install hook, docker-compose mount swap).
- Both projects typecheck and the frontend production build is clean.
- No tests broke; final smoke test against the live backend is green.
- VAPID keypair generated and written to `backend/.env` (gitignored) so the real-device push test is unblocked when you have a phone in hand.
- A handful of recommendations were *recorded* rather than auto-applied — see "Recommendations" below.

---

## New commits (local only — not pushed)

```
764b1b3 Use <Navigate> instead of navigate() during render in LoginPage
abfcb76 Validate unsubscribe token with zod for envelope consistency
a21586c Mount frontend/dist into nginx for prod profile
c217651 Add useInstallPrompt() hook for PWA install UX
64babcf Add robots.txt disallowing all crawlers
```

Push when you're satisfied:

```bash
git push origin scaffold/backend
```

PR #1 is set up to receive these on push (it's already promoted to ready).

---

## What changed, file by file

| File | Why |
|---|---|
| `frontend/public/robots.txt` *(new)* | Defense-in-depth alongside the existing noindex meta + nginx X-Robots-Tag. |
| `frontend/src/pwa/install.ts` *(new)* | Captures `beforeinstallprompt` and exposes `useInstallPrompt()`. iOS branch documented (Add to Home Screen, no programmatic prompt). UI placement is a TODO for you. |
| `backend/docker-compose.yml` | nginx now mounts `../frontend/dist` instead of the placeholder `./web/`. Comment notes the build prereq. |
| `backend/src/lib/schemas.ts` | Added `unsubscribeSchema`. |
| `backend/src/routes/subscribers.ts` | Replaced inline `String(req.body?.token ?? "")` + manual length check with `unsubscribeSchema.parse(req.body)` for envelope consistency. |
| `frontend/src/pages/LoginPage.tsx` | Replaced `navigate(dest)` during render with `return <Navigate to={dest} replace />`. React anti-pattern fix. |
| `backend/.env` *(gitignored)* | Real VAPID public/private keypair generated and written. |

No schema migrations. No package.json changes. No CLAUDE.md / memory edits.

---

## Tasks 1–12 detail

### Task 4 — VAPID keys
- Generated keypair via `npm run vapid:generate`, wrote to `backend/.env` (gitignored, no commit).
- Real-device push test is unblocked.

### Task 5 — Typecheck
- Backend `tsc --noEmit`: clean.
- Frontend `tsc -b --force`: clean.
- No fixes needed.

### Task 6 — Frontend build
- `npm run build`: clean, 47 modules, 785 ms.
- Main bundle: 173 kB / 56.7 kB gzipped.
- StatusPage chunk: 2.36 kB / 1.10 kB gzipped (lazy split working as designed).

### Task 7 — robots.txt
- `User-agent: * / Disallow: /`. Committed `64babcf`.

### Task 8 — PWA install hook
- `frontend/src/pwa/install.ts` — captures `beforeinstallprompt`, exposes `useInstallPrompt()` React hook with `available` + `prompt()`.
- Detects already-installed via `display-mode: standalone` + Safari `navigator.standalone`.
- iOS branch documented (no programmatic prompt; user must Share → Add to Home Screen, also a prerequisite for web push on iOS 16.4+).
- TODO in file: surface in SubscribePage banner or Shell header — placement is a UX call.
- Typecheck after add: clean.
- Committed `c217651`.

### Task 9 — npm audit
- **Backend:** 2 HIGH (`tar`, `@mapbox/node-pre-gyp`). Both transitive of `better-sqlite3@12.9.0` (already at latest). `npm audit fix` cannot resolve without `--force` doing breaking changes. **Skipped per plan.** Real-world risk is low — these vulns require malicious tarballs during native install, not the runtime request path. Track upstream.
- **Frontend:** 2 MODERATE (`esbuild`, `vite`). Fix requires `vite@8.0.11` (major bump from 5.4.21). **Skipped per plan.** Vite 5 → 8 is a real upgrade with config + plugin churn; defer until you can spend time.
- No auto-fixes applied to either project.

### Task 10 — Docker Compose mount
- Swapped `./web:/usr/share/nginx/html:ro` → `../frontend/dist:/usr/share/nginx/html:ro` in the prod profile.
- Comment documents the prereq: `(cd frontend && npm ci && npm run build)` before `docker compose --profile prod up`.
- `backend/web/` placeholder is no longer referenced; left in place.
- Verification deferred until Docker Desktop is installed locally.
- Committed `a21586c`.

### Task 11 — Dockerfile audit
- Current `apk add --no-cache python3 make g++` is reasonable.
- better-sqlite3 12.9.0 ships musl x64 prebuilds; source compilation should not normally trigger on `node:20-alpine`.
- `linux-headers` is NOT typically required for better-sqlite3.
- **Recommendation (NOT applied)**: alpine virtual-package pattern in the runtime stage would shrink the image by ~70 MB:
  ```Dockerfile
  RUN apk add --no-cache --virtual .build-deps python3 make g++ \
   && npm ci --omit=dev && npm cache clean --force \
   && apk del .build-deps
  ```
  Holding because it's unverifiable without Docker.
- No changes committed.

### Task 12 — Backend code review

**Verified clean**
- All `pool.query` calls use `$N` parameterization. The two dynamic IN-clauses (`webpush.ts`, `subscribers.ts`) generate placeholders from array indices, not user input.
- All 23 `res.json` calls use the `{success, data}` envelope. 100% consistent.
- helmet enabled, 100 kB JSON body limit, X-Robots-Tag everywhere, allowlist CORS, graceful shutdown.
- Auth: zod-validated login, generic "Invalid credentials" (no user enumeration via error message), inactive users blocked at `requireUser`, JWT carries only `uid` (rehydrated each request, deactivation works without a denylist).
- SSE: hardcoded event names; rooms validated as slugs; broadcast catches write errors and prunes dead clients.

**Auto-fixed (trivial)**
- `unsubscribe` was the lone route reading `req.body` via inline `String()` coercion + a manual length check. Aligned with the rest: added `unsubscribeSchema` and replaced inline handling. Behavioral change minimal — empty tokens still produce 400, now via ZodError with field-level details, and length is bounded to 256. Committed `abfcb76`.

### Task 13 — Frontend code review

**Verified clean**
- Zero uses of `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, `document.write`, `window.open`.
- All path params in `api/client.ts` go through `encodeURIComponent`.
- 401 from any API call atomically clears the session via `clearSession()`.
- AuthGuard correctly handles role gating (admin always passes), preserves `from` location for post-login redirect, uses `replace` to avoid breaking back-button.
- StatusPage SSE: no try-catch leak, EventSource auto-reconnects, cleanup on unmount via cancellation flag + `es.close()`.
- All rendered values are React children → auto-escaped.
- `confirm()` guards the destructive revoke-token action.
- Cross-tab session sync via `storage` event in `auth/store.ts`.

**Auto-fixed (trivial)**
- `LoginPage` called `navigate()` during render in the already-signed-in redirect path. React anti-pattern (StrictMode dev double-render queues twice; React docs explicitly warn). Replaced with `return <Navigate to={dest} replace />`. No user-visible change. Committed `764b1b3`.

### Task 14 — Final smoke test
All endpoints green; no regressions from any of the above commits.

| Check | Result |
|---|---|
| `/health` | 200, db ok |
| Admin login + `/me` | 200, role admin, campus_ids [1,2,3,4] |
| `POST /api/status` (web) | 201, status_update_id=2 |
| `GET /api/status?campus=chesterfield` | reflects the update (`sent_via=web`) |
| `GET /api/groups` | 12 rows (4 campuses × 3 groups) |
| `GET /api/admin/history` | 2 entries with full attribution |
| Sender (campus-scoped) login | 200 |
| `POST /api/trigger` with bogus token | 401 "Invalid token" |
| `POST /api/subscribers/unsubscribe` with empty token | 400 with **zod field-level details** (proves `abfcb76` works) |

---

## Recommendations (NOT applied — your call)

These were surfaced during the review passes. None are bugs you'd ship-block on, but each is something worth deciding about.

### Backend

1. **No rate limiting** on `/api/auth/login`, `/api/trigger`, or `/api/subscribers`. For an internal tool behind Cloudflare/nginx the practical risk is low, but `express-rate-limit` is cheap defense in depth. Skipped because adding new top-level deps was out of scope for the autonomous run.
2. **Login timing leak (minor)**: when a username doesn't exist, `bcrypt.compare` doesn't run, making the response noticeably faster than when it does. A user-enumeration timing oracle. Marginal real-world impact. Fix: `bcrypt.compare` against a dummy hash to equalize timing.
3. **`JWT_SECRET` length not enforced.** `env.ts` only refuses the literal placeholder string in prod. Adding a minimum-length check (≥32 chars) would catch deploys with a too-short secret.
4. **`buildUpdateSet` interpolates column names** into SQL without an allowlist. Currently safe — all three callers in admin.ts pass hardcoded keys — but a defensive allowlist parameter would prevent a future caller accidentally passing user-controlled keys.
5. **Trigger token loop has a theoretical timing oracle.** `bcrypt.compare` is constant-time per call, but the iteration order leaks via total response time. Real-world impact at this scale is negligible.
6. **No audit-fixable upstream** for `tar` / `@mapbox/node-pre-gyp` until better-sqlite3 ships an updated transitive.
7. **Vite 5 → 8 major upgrade** is the only available fix for the `esbuild`/`vite` moderate-severity advisories. Plan a separate effort.

### Infra

8. **Docker runtime image** could shrink ~70 MB via the alpine virtual-package pattern (see Task 11).
9. **TLS strategy** still pending — `nginx.conf` is HTTP-only with a comment block sketching 443. Cloudflare-front is the recommended starter per HANDOFF.

### Frontend

10. **`SenderPage` per-campus `Promise.all` has no error handler.** If `campusStatusTypes`, `currentStatuses`, or `campusHistory` rejects after the user picks a campus, the page silently shows stale/empty data. Adding `.catch(setError)` would surface the failure. UX-only.
11. **`AdminPage` "Create token" form doesn't disable the submit button while the request is in flight** — possible double-submit creates two tokens. UX-only.
12. **Lazy chunks aren't a security boundary.** `<Suspense>` lazy-loads `AdminPage`; the JS chunk is fetched BEFORE `AuthGuard` renders. A non-admin who navigates to `/admin` will download the admin JS even though the component is then redirected away. Backend still enforces auth, so this is a "no information hiding via lazy split" reminder, not a fix-it.
13. **Branding still placeholder** — `frontend/public/icon.svg`, slate Tailwind defaults. Your call when you're ready.

---

## Hard-rule audit (what I did NOT do, by design)

- ❌ No push to remote — PR #1 unchanged on GitHub.
- ❌ No further `gh pr edit` / `gh pr ready` / PR comments.
- ❌ No Rock RMS calls.
- ❌ No schema or seed changes.
- ❌ No new top-level dependencies.
- ❌ No CLAUDE.md / memory edits.
- ❌ Nothing requiring Docker (still not installed) or your phone.
- ❌ No destructive git operations.
- ✅ Five small local commits, each independently revertable.

---

## Suggested next session

1. Skim the 5 commits, push when satisfied (`git push origin scaffold/backend`).
2. Decide on the recommendations above — most can be quick follow-up commits.
3. When you can install Docker Desktop: run `(cd frontend && npm run build)` then `(cd backend && docker compose --profile prod up -d --build)` and confirm nginx serves the React app at `http://localhost`.
4. When you have a phone available: VAPID keys are ready in `.env`; follow HANDOFF Step 4 for the real-device push test.
