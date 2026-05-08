# Service Progress Update Tool — Handoff

**Date:** 2026-05-08 (early morning, written mid-`/loop` session)
**Branch:** `scaffold/backend` (PR [#1](https://github.com/TheCrossing-Church/Service-Status-App/pull/1), draft)
**Last commit:** `04cbe82` — public `/api/groups` endpoint
**Author:** Built by Claude Opus 4.7 (1M context) under Shawn Ross's direction; this doc is for the next session to resume cleanly.

---

## 1. Current project state

### What's built

**Backend (`backend/`)** — fully functional, smoke-tested end-to-end against `./tmp/dev.db`:
- SQLite schema covering campuses, users, status types, groups, subscribers, push subscriptions, API tokens, status updates
- Migration runner + idempotent seed (4 campuses with codes CFD/FEN/GRT/MID, 3 default status types per campus, 3 default groups per campus, admin user, per-campus sender users, 1 demo subscriber)
- Full API surface:
  - Public: `/health`, `/api/campuses`, `/api/status[?campus=]`, `/api/status/:slug`, `/api/campuses/:slug/status-types`, `/api/campuses/:slug/history`, `/api/groups`, `/api/events` (SSE), `/api/push/public-key`
  - Auth: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
  - Send: `POST /api/status` (JWT-auth, campus-scoped)
  - Webhook: `POST /api/trigger` (Stream Deck, bcrypt-hashed token)
  - Subscribers: `POST /api/subscribers`, `POST /api/subscribers/push`, `POST /api/subscribers/unsubscribe`
  - Admin (admin role only): CRUD for campuses, status types, groups, API tokens; read-only subscribers + history
- JWT auth (Bearer header, 12h default expiry) with Rock RMS strategy when `ROCK_BASE_URL` is set, local password fallback otherwise
- Web push fan-out (VAPID) — gracefully no-ops when VAPID keys aren't set
- SSE pub/sub with per-campus rooms + wildcard `"*"` for the public live page

**Frontend (`frontend/`)** — scaffolded, builds clean, typechecks:
- Vite + React 18 + TypeScript + Tailwind v3 + react-router-dom v6
- 5 pages: StatusPage (public, SSE-driven), LoginPage, SenderPage (mobile-first big-button + 2-tap confirm), SubscribePage (campus + group picker + push handshake), AdminPage (3 tabs: tokens, subscribers, history)
- JWT-aware fetch client that unwraps `{success, data}` envelopes and clears local session on 401
- Cross-tab session sync via `useSyncExternalStore` over `localStorage` `storage` events
- Lazy-loaded routes so the public `StatusPage` bundle is tiny
- Service worker that handles `push` and `notificationclick` events
- PWA manifest (placeholder SVG icon) — the page also sets `noindex,nofollow` everywhere
- Vite dev server proxies `/api/*` and `/health` to backend on `:3000`

**Infra (in `backend/`)**:
- `Dockerfile` — multi-stage Node 20-alpine, runs as non-root, includes python3/make/g++ for better-sqlite3 native build
- `docker-compose.yml` — `default` profile (none) is empty (SQLite needs no container; use `npm run dev` locally); `prod` profile brings up `app` + `nginx` + one-shot `migrate`; `seed` profile for `--rm seed`
- `nginx.conf` — reverse proxy, dedicated SSE location with buffering off + 24h timeouts, SPA `try_files`, immutable cache for hashed assets, noindex header. HTTP-only on :80; TLS deferred to deploy time (Cloudflare-front recommended in comments)
- Service Progress Update Tool stack matches CLAUDE.md exactly: SQLite + JWT + nginx + `backend/`+`frontend/` directory layout

### What works (verified by curl during the build)
- `npm run migrate` → schema applied
- `npm run seed` → 4 campuses + status types + groups + admin/sender users + demo subscriber
- `/health` returns DB-connectivity-verified `{success:true, data:{ok:true}}`
- Login round-trips with both admin and `sender-chesterfield` accounts; `/me` echoes user with correct `campus_ids`
- `POST /api/status` with a sender JWT publishes a status update; webhook `POST /api/trigger` does the same with a bcrypt-verified API token; both flow through `publishStatusUpdate()` which broadcasts SSE + fires push (no-op without VAPID keys)
- `GET /api/admin/history` shows web and webhook entries with full attribution
- Vite dev → frontend serves index.html + manifest + sw.js, and the proxy forwards `/api/*` to backend

### What doesn't work yet / hasn't been verified
- **No real-device push test.** The web-push code is wired and the service worker handles events, but no human has actually received a push on a phone. Most likely fragile point.
- **Docker stack never built or run.** `Dockerfile` and `docker-compose.yml` typecheck-equivalent (config-correct) but the Mac in this build doesn't have Docker installed, so `docker compose --profile prod up` is unverified. Likely works; nothing exotic.
- **Rock RMS auth never tested against a live Rock.** `ROCK_BASE_URL` is unset; the local-password fallback covers all current login attempts. Code in `backend/src/lib/rock.ts` follows the published Rock auth flow but hasn't seen a real cookie response.
- **Frontend visual design** is functional Tailwind defaults — slate grays, neutral typography, no Crossing branding. Shawn pre-approved that visual rework is on his to-do.
- **No tests** (no Vitest, no Playwright). Smoke testing is manual via curl.
- **iOS PWA install** flow not exercised; iOS Safari requires "Add to Home Screen" before push works at all.

---

## 2. Architecture decisions and rationale

| Decision | Why |
|---|---|
| **SQLite over Postgres** | The Crossing is an MSSQL-shop with limited Linux experience and ≤100 concurrent users on this app. SQLite needs no service to administer, backups are `cp service-status.db`, and at this scale none of the planned stretch goals (Rock sync, ProPresenter, Planning Center, status analytics) need anything Postgres-only. Decided 2026-05-07 over an earlier Postgres scaffold. |
| **JWT over express-session** | With SQLite locked in, sessions would have meant either a SQLite-backed session store dep or an in-memory store that loses logins on restart. JWT is statelessly verified — no session table at all. Aligns with CLAUDE.md. |
| **nginx over Caddy** | Familiar to most IT shops, what CLAUDE.md specifies, pure config swap. Caddy's auto-LE is replaceable with Cloudflare-front or certbot. |
| **`uid` JWT claim, not `sub`** | The standard `sub` claim is conventionally a string per the JWT RFC; using a custom `uid` numeric claim keeps user IDs typed as numbers end-to-end without coercion games. |
| **JWT in `localStorage`** | Simpler than HttpOnly cookies for v1 — frontend reads on every fetch, handles 401 by clearing. Trade-off: vulnerable to XSS token theft if we ever introduce an XSS bug. Acceptable for an internal tool; revisit if we add user-generated content. |
| **`{ success, data } / { success, error }` envelope** | CLAUDE.md spec. Lets the frontend handle errors uniformly without parsing HTTP status codes. |
| **Postgres-flavored async wrapper around better-sqlite3** | Routes still call `await pool.query(sql, params).then(({rows}) => …)`. Keeps the diff for the SQLite swap localized to `backend/src/db.ts`. Translates `$N` placeholders to `:pN` named params, coerces booleans/undefined/Date. |
| **Manual `BEGIN/COMMIT` in `withTransaction`** | better-sqlite3's native `db.transaction(fn)` is synchronous and can't span `await`. Manual control lets the callback run async helpers (bcrypt etc.) inside the transaction. Single-process workload makes the lack of true isolation acceptable. |
| **Bearer auth (no cookies)** | Auth state lives in the request header; CORS is simpler (no `credentials: 'include'`); SSE doesn't need cookie passthrough. |
| **SSE over WebSockets** | One-way push is all we need. EventSource handles reconnect for free; nginx config is one `proxy_buffering off` block. |
| **Two-tap sender pattern** | PRD §2: "A 'Send Update' confirmation step to prevent accidental triggers." First tap selects a status type, second tap confirms with optional message edit. Stream Deck path stays one-shot (PRD §3). |
| **Tailwind v3** | Stable, well-documented, fast to build. v4 was newer and not necessary. |
| **Lazy-loaded routes** | Public StatusPage is the most common audience (lobby screens, anonymous viewers). It should be the smallest bundle they fetch. |
| **No tests for v1** | Manual smoke testing via curl was sufficient to ship. Tests are valuable but the user explicitly asked for build-velocity. |

Memory files in `~/.claude/projects/-Users-shawnr-SourceCode-ServiceProgressUpdateTool/memory/` capture the running history of these decisions.

---

## 3. File structure

### Repo root
```
ServiceProgressUpdateTool/
├── CLAUDE.md                       # ← canonical project context (Shawn-authored)
├── service-status-app-prd.md       # ← original PRD
├── HANDOFF.md                      # ← this document
├── LICENSE
├── backend/                        # Node + Express + SQLite API
└── frontend/                       # Vite + React + Tailwind PWA
```

### `backend/`
```
backend/
├── package.json                    # tsx for dev, tsc for build
├── tsconfig.json                   # strict, noUncheckedIndexedAccess
├── Dockerfile                      # multi-stage, alpine + python3/make/g++
├── docker-compose.yml              # prod/seed/migrate profiles
├── .env.example                    # SQLite, JWT, VAPID, Rock RMS
├── .gitignore                      # tmp/ for the local SQLite file
├── .dockerignore
├── nginx.conf                      # SSE-aware reverse proxy
├── web/index.html                  # placeholder until frontend builds into here
├── migrations/
│   └── 001_init.sql                # full schema (SQLite syntax)
├── scripts/
│   ├── migrate.ts                  # idempotent migration runner
│   ├── seed.ts                     # default campuses/statuses/groups/admin
│   └── generate-vapid.ts           # prints VAPID keypair to stdout
└── src/
    ├── index.ts                    # Express bootstrap, error handler, /health
    ├── db.ts                       # better-sqlite3 + Postgres-shape async wrapper
    ├── env.ts                      # env config; refuses dev JWT secret in prod
    ├── auth.ts                     # JWT sign/verify, requireUser, requireAdmin
    ├── realtime.ts                 # SSE pub/sub (rooms + broadcast)
    ├── webpush.ts                  # VAPID fan-out for a campus + dead-endpoint cleanup
    ├── lib/
    │   ├── asyncHandler.ts         # wraps async handlers → forwards to Express err handler
    │   ├── httpError.ts            # HttpError class + badRequest/unauthorized/forbidden/notFound/conflict
    │   ├── publish.ts              # INSERT status_update + broadcast SSE + fire push (single source of truth)
    │   ├── queries.ts              # fetchCurrentStatuses (window function), fetchCampusBySlug/ById, fetchStatusTypesForCampus
    │   ├── rock.ts                 # Rock RMS REST auth client (cookie + GetCurrentPerson)
    │   ├── schemas.ts              # zod input validators for all routes
    │   └── sqlUpdate.ts            # buildUpdateSet helper for partial PATCHes
    └── routes/
        ├── auth.ts                 # /api/auth/* (login/logout/me)
        ├── status.ts               # public reads + SSE + groups
        ├── send.ts                 # POST /api/status (auth)
        ├── trigger.ts              # POST /api/trigger (Stream Deck)
        ├── subscribers.ts          # enrollment + push subscription + unsubscribe
        └── admin.ts                # CRUD + tokens + subscribers + history
```

Key files to read first (in order):
1. `backend/src/index.ts` — see how the app wires together
2. `backend/migrations/001_init.sql` — the full data model
3. `backend/src/db.ts` — understand the query wrapper before touching any route
4. `backend/src/lib/publish.ts` — the central status-update flow
5. `backend/src/routes/status.ts` — public reads + SSE + the `/groups` endpoint

### `frontend/`
```
frontend/
├── package.json                    # vite, react, react-router-dom, tailwind
├── tsconfig.json                   # references app + node configs
├── tsconfig.app.json               # strict + noUncheckedIndexedAccess
├── tsconfig.node.json              # for vite.config.ts
├── vite.config.ts                  # /api + /health proxy to :3000
├── tailwind.config.js              # status colors mirror seeded defaults
├── postcss.config.js
├── index.html                      # noindex, manifest link, theme color
├── .gitignore                      # *.tsbuildinfo
├── public/
│   ├── icon.svg                    # placeholder Crossing icon
│   ├── manifest.webmanifest        # PWA manifest
│   └── sw.js                       # service worker (push + notificationclick)
└── src/
    ├── main.tsx                    # bootstraps React + registers SW
    ├── App.tsx                     # routes + Suspense + AuthGuard
    ├── styles.css                  # @tailwind directives
    ├── api/
    │   ├── client.ts               # typed fetch wrapper, ApiError, all api.* methods
    │   └── types.ts                # mirrors backend response shapes
    ├── auth/
    │   ├── store.ts                # localStorage-backed session, cross-tab sync
    │   ├── useUser.ts              # React subscription via useSyncExternalStore
    │   └── AuthGuard.tsx           # role-gated route guard
    ├── components/
    │   ├── Shell.tsx               # nav header + sign-out
    │   └── StatusBadge.tsx         # pill-shaped status indicator
    ├── pages/
    │   ├── StatusPage.tsx          # public live status (SSE)
    │   ├── LoginPage.tsx           # username/password form
    │   ├── SenderPage.tsx          # mobile-first sender UI (2-tap)
    │   ├── SubscribePage.tsx       # enrollment + push handshake
    │   └── AdminPage.tsx           # tokens / subscribers / history tabs
    └── pwa/
        └── push.ts                 # VAPID key fetch + permission prompt + subscribe
```

Key files to read first (in order):
1. `frontend/src/api/client.ts` — every page goes through this
2. `frontend/src/auth/store.ts` + `useUser.ts` — session model
3. `frontend/src/App.tsx` — routing topology
4. Any specific page you want to modify

---

## 4. Coding patterns and conventions

### TypeScript
- **Strict mode + `noUncheckedIndexedAccess`.** Always destructure `const first = arr[0]; if (first) …` rather than `arr[0].foo`. Optional chaining `arr[0]?.foo` is fine for one-deep reads.
- **No `any`** — if you need one, isolate it behind a small typed cast.
- **Composite project on the frontend** (`tsconfig.app.json` + `tsconfig.node.json`). `tsc -b` runs both.

### Backend
- **Every route handler uses `asyncHandler(...)`.** It forwards async errors to the Express error handler instead of crashing the process.
- **Every input is `zodSchema.parse(req.body)`.** Schemas live in `backend/src/lib/schemas.ts`. Zod failures throw `ZodError` which the global handler converts to a 400 with field-level details.
- **Every response is wrapped in the envelope.** Success: `res.json({ success: true, data: { … } })`. Errors: thrown via `HttpError` (`badRequest(...)`, `notFound(...)`, etc.) and serialized by the global handler as `{ success: false, error, details? }`.
- **Every DB write uses parameterized SQL** through the `pool.query(sql, params)` wrapper. **No string concatenation of user input.** Dynamic IN clauses are built by generating `$N` placeholder strings (see `backend/src/routes/subscribers.ts` and `backend/src/webpush.ts`).
- **PATCH endpoints use `buildUpdateSet`** so they only update fields actually present in the body. `undefined` skips, `null` clears.
- **Booleans are stored as INTEGER 0/1** with `CHECK` constraints. The wrapper coerces JS `true/false` on input. On output, query helpers like `fetchCampusBySlug` coerce back to `boolean`; admin list endpoints return raw 0/1 (the frontend treats them as truthy/falsy).
- **Timestamps are ISO 8601 UTC TEXT.** Default values use `(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`. Updates set `updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))` explicitly (defaults only fire on INSERT). The string `NOW_SQL` is defined locally in files that need it.
- **Slugs are lowercase-hyphenated** (regex `^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$`).
- **All list responses are stable-ordered** (never rely on insertion order).
- **All publish-side effects flow through `publishStatusUpdate`** (`backend/src/lib/publish.ts`) so SSE broadcast and push fan-out stay consistent across web and webhook senders.

### Frontend
- **All API calls go through `api.*`** (`frontend/src/api/client.ts`). The wrapper attaches the JWT, unwraps the envelope, throws `ApiError` for failures, and clears the session on 401.
- **Session state via `useUser()`** hook — components re-render on login/logout, including from another tab.
- **`AuthGuard role="admin|sender"`** wraps protected routes. Admins implicitly pass any role gate.
- **Lazy imports** for every page so the public StatusPage stays minimal.
- **Tailwind utility classes** for everything; no CSS modules. Status colors come from seeded values; component-level overrides via inline `style={{backgroundColor: ...}}` for admin-customized colors.
- **Mobile-first UI** in SenderPage (big tap targets, two-tap confirm). Other pages are responsive but not mobile-prioritized.

### Git
- **Branch:** `scaffold/backend`. Direct push to `main` is blocked; PR #1 will be the merge path.
- **Commit messages** explain the **why**, not just the what. Body wraps at ~72 chars, bullet list of major changes, `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` trailer.
- **No force-pushes.** No deletions of remote branches. Resume on the same branch.
- **Memory files** (`~/.claude/projects/.../memory/`) capture decisions across sessions so future Claude doesn't re-derive them.

---

## 5. Where the loop stopped

**Last commit:** `04cbe82` — _"Add public /api/groups endpoint; SubscribePage fetches groups dynamically"_ — pushed to `origin/scaffold/backend`.

**The loop's stated 5-step plan is fully complete:**
1. ✅ SQLite refactor (commit `d28d8a9`)
2. ✅ Lower-priority alignments (folded into `d28d8a9` and `a6e0a0b`)
3. ✅ Frontend scaffold + Vite + JWT-aware API client + routing + AuthGuard (commit `50ae08e`)
4. ✅ All 5 pages: StatusPage, LoginPage, SenderPage, SubscribePage, AdminPage (commit `50ae08e`)
5. ✅ Service worker + PWA manifest with placeholder icons (commit `50ae08e`)

**Plus one polish commit:**
6. ✅ Public `/api/groups` endpoint so SubscribePage doesn't hardcode group slugs (commit `04cbe82`)

**At interruption, no work was in progress.** Working tree is clean. Everything pushed.

The loop was about to consider these as next candidates (ordered by value):
- Update PR #1 description on GitHub to reflect the now-complete refactors (was a "draft" with "refactor pending" language)
- Add a `README.md` at repo root with run instructions
- Run the Docker stack once locally to verify `Dockerfile` actually builds
- Add `frontend/src/pwa/install.ts` for an "Add to Home Screen" prompt on iOS

None were required by the loop spec.

---

## 6. Next 3–5 concrete steps

Listed in the order I'd tackle them on resume:

### Step 1 — Pull + verify locally (5 min)

```bash
cd /Users/shawnr/SourceCode/ServiceProgressUpdateTool
git checkout scaffold/backend
git pull
# Backend
cd backend
cp .env.example .env       # if not already done
rm -rf tmp                 # clean slate
DATABASE_PATH=./tmp/dev.db JWT_SECRET=dev npm run migrate
DATABASE_PATH=./tmp/dev.db JWT_SECRET=dev npm run seed
DATABASE_PATH=./tmp/dev.db JWT_SECRET=dev npm run dev      # leaves running on :3000
# In another terminal:
cd ../frontend
npm install
npm run dev                # :5173
# In a browser: http://localhost:5173
# Login: admin / ChangeMeNow!
```

If anything breaks, the SQLite refactor smoke test in commit `d28d8a9`'s message is the canonical reference for what should work. Most likely culprits if it doesn't:
- Missing `.env` → check `JWT_SECRET` is set (any dev string works locally)
- Missing `tmp/` dir for SQLite → migrations create it; if not, `mkdir -p tmp`
- Port 3000 in use → set `PORT=3001` in `.env` and update `vite.config.ts` proxy

### Step 2 — Update PR #1 description (5 min)

The PR was opened as a draft with "refactor pending" language. All three refactors are done. Update via:

```bash
gh pr edit 1 --title "Backend + frontend v1: SQLite + JWT + nginx + React PWA"
gh pr ready 1   # promote draft → ready
```

For the body, mention:
- All three CLAUDE.md alignment refactors completed
- Backend smoke-tested end-to-end against SQLite
- Frontend builds and dev-proxies correctly
- Outstanding: real-device push test, Docker stack verification, brand assets

### Step 3 — Verify the prod Docker stack (15–30 min, requires Docker Desktop)

This was deferred because Docker wasn't installed. After Shawn installs Docker Desktop:

```bash
cd backend
docker compose --profile prod up -d --build
docker compose --profile seed run --rm seed
# Should serve nginx on http://localhost — check the placeholder web/index.html
# Then mount the frontend build:
cd ../frontend
npm run build              # outputs to dist/
# Update backend/docker-compose.yml: replace `./web:/usr/share/nginx/html:ro`
# with `../frontend/dist:/usr/share/nginx/html:ro` (or copy build artifacts).
docker compose --profile prod up -d   # recreates nginx with the real frontend
# http://localhost should now show the React app proxying to the Node app.
```

If `better-sqlite3` fails to build in alpine, the Dockerfile already has `python3`/`make`/`g++`. If it still fails, the alpine `node:20-alpine` may need `linux-headers` — add to the `apk add` line.

### Step 4 — Real-device push notification test (30 min, requires VAPID + a phone)

```bash
cd backend
npm run vapid:generate
# Copy the printed lines into backend/.env:
#   VAPID_PUBLIC_KEY=…
#   VAPID_PRIVATE_KEY=…
# Restart `npm run dev`.
```

Then on your phone:
1. Connect to the same network as your Mac
2. `ifconfig | grep 'inet ' | grep -v 127.0.0.1` → note the Mac's LAN IP
3. Phone browser to `http://<lan-ip>:5173/subscribe`
4. Enter name + email, pick Chesterfield + In-Service, submit
5. Accept the notification permission prompt
6. From the Mac: `curl -X POST http://localhost:3000/api/status -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"campus_slug":"chesterfield","status_slug":"running-late","message":"push test"}'`
7. Phone should buzz with the notification

iOS specifics:
- Safari only allows push if the user installs the PWA first ("Share → Add to Home Screen")
- iOS 16.4+ is required for web push
- Background pushes only fire when the PWA is closed; foreground pushes go through the service worker but don't always show a system banner

If the notification doesn't arrive, in order of likelihood:
1. VAPID keys mismatched between server and what the browser registered with — re-register the subscription
2. Service worker not active — DevTools → Application → Service Workers; should show "activated"
3. Browser permission denied — re-prompt by clearing the site permissions
4. Backend silently failing — check `npm run dev` logs for `[webpush]` errors

### Step 5 — Real campus group structure + brand assets (1–2 hr, depends on Shawn's input)

Two parallel tracks the loop couldn't do alone:

**Group structure check.** The seeded groups (in-service / hospitality / kids) come from CLAUDE.md but may not match what each campus actually wants. Walk through the admin panel (`/admin` → groups; or directly via DB) and confirm or adjust. The `Add group` UI doesn't exist yet at the admin route level — add a form to the AdminPage if you want web-based group management, or use the existing API:

```bash
curl -X POST http://localhost:3000/api/admin/groups \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"campus_id":1,"slug":"worship-team","name":"Worship Team"}'
```

**Brand assets.**
- Replace `frontend/public/icon.svg` with The Crossing's logo (keep dimensions 192×192 maskable-safe)
- Add `frontend/public/icon-192.png` and `frontend/public/icon-512.png` (PNG, for iOS apple-touch-icon and Android home screen)
- Update `frontend/public/manifest.webmanifest` to reference the PNGs alongside the SVG
- Update `frontend/index.html` `apple-touch-icon` to point to `icon-192.png`
- Adjust Tailwind theme in `frontend/tailwind.config.js` if you want different brand accents

---

## 7. Gotchas, blockers, open questions

### Gotchas

- **`uid` vs `sub` JWT claim.** `auth.ts` uses `uid` (custom integer claim) instead of the standard `sub` (which is conventionally a string). Don't change without updating both `signUserToken` and `verifyUserToken`.
- **better-sqlite3 transactions can't span awaits.** `withTransaction` uses manual `BEGIN`/`COMMIT` for this reason. Don't refactor to `db.transaction(fn)` — it'll silently break async callbacks.
- **SQLite booleans.** Stored as INTEGER 0/1. Helper queries (`fetchCampusBySlug`, `loadUser`) coerce to JS booleans on read; admin list endpoints return the raw 0/1. Frontend is permissive (truthy/falsy checks), but if you `=== true`, expect bugs.
- **`buildUpdateSet` skips undefined, preserves null.** Zod's `.partial()` produces `undefined` for unset fields — this is intentional. Don't pass `null` accidentally; it will clear the column.
- **Migration runner reads `migrations/` from `process.cwd()`.** Run from `backend/` locally; the prod container's `WORKDIR /app` has migrations alongside.
- **`tmp/` is gitignored.** Local SQLite dev DB lives at `tmp/dev.db`. If you wipe it, re-run `npm run migrate && npm run seed`.
- **Service worker is at `/sw.js`** (root scope). Don't move it to `/assets/` or it'll lose access to subpaths.
- **Vite dev proxies `/api` and `/health`.** If the backend isn't running, every fetch hangs. Start backend first.
- **`session` table was removed.** Don't try to reintroduce session-based auth — everything else (CORS, middleware, frontend client) assumes Bearer-header auth now.
- **iOS push requires PWA install.** A regular Safari tab on iOS cannot receive push notifications, even if the user grants permission, until the user adds the page to the home screen.
- **The `web/index.html` placeholder** under `backend/web/` is what nginx serves at `/` until the frontend is built and mounted. It's intentionally minimal; replace the volume mount with `../frontend/dist` in production.

### Open / blocked items

- **TLS strategy** — `nginx.conf` is HTTP-only. The commented block at the bottom shows how to add `listen 443 ssl;`. Three paths: Cloudflare-front (recommended starter — set up Cloudflare proxy, run nginx as origin on port 80), certbot sidecar (auto-LE inside Docker), or manual certs (mount `letsencrypt/` from elsewhere). Decision pending Shawn's preference; flagged in `nginx.conf` comments.
- **Backup strategy** — SQLite file at `/data/service-status.db`. Options: VMware snapshot only, cron + scp to another host, Litestream to S3-compatible. PRD doesn't specify; pick when deploying to VMware.
- **iOS push reliability** — the only way to know is to test on a real iPhone. Likely needs iteration on `frontend/public/sw.js` and possibly the manifest.
- **Real campus group structure** — `in-service / hospitality / kids` is from CLAUDE.md but may not match each campus's actual teams. Confirm with Shawn before any user-facing rollout.
- **Multi-campus senders** — `SenderPage.tsx` shows a campus dropdown when the user has more than one campus. Works in code, untested with real users.
- **Rock RMS auth** — never tested against `https://jimrock.wcrossing.org`. Set `ROCK_BASE_URL` and try a real Rock account; `backend/src/lib/rock.ts` is plausible but not field-tested.
- **Shawn's password manager has been promised the production secrets.** When deploying, generate via `openssl rand -base64 48` for each of `JWT_SECRET`, `SEED_ADMIN_PASSWORD`, and store in his manager.

### Open questions

- Does Shawn want to squash-merge PR #1, or merge with the full commit history?
- Are CFD/FEN/GRT/MID codes needed externally (Rock RMS sync? other integrations?), or just labels? They have a column but no enforcement of format beyond the zod schema (`/^[A-Z]+$/`).
- For the public status page on a lobby screen (`/?campus=chesterfield` URL pattern), does Shawn want a kiosk-mode CSS pass (huge type, no nav, full-screen)? Currently the same Shell + nav renders in all viewports.
- Does the frontend need an offline mode (service-worker precaching) for v1, or is online-only acceptable? Currently online-only.
- Should the admin panel expose CRUD for campuses themselves (currently only API tokens / groups / status types are managed)? Backend supports it; frontend doesn't surface it.

---

## Appendix: Useful commands

```bash
# Backend dev
cd backend
DATABASE_PATH=./tmp/dev.db JWT_SECRET=dev npm run dev
DATABASE_PATH=./tmp/dev.db JWT_SECRET=dev npm run migrate
DATABASE_PATH=./tmp/dev.db JWT_SECRET=dev npm run seed
npx tsc --noEmit                                       # typecheck
npm run vapid:generate                                  # print VAPID keys

# Frontend dev
cd frontend
npm run dev                                             # vite, :5173
npm run build                                           # → dist/
npx tsc -b                                              # typecheck

# Local end-to-end smoke
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"ChangeMeNow!"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["token"])')
curl -s http://localhost:3000/api/auth/me -H "authorization: Bearer $TOKEN"
curl -s -X POST http://localhost:3000/api/status \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"campus_slug":"chesterfield","status_slug":"running-late","message":"hello"}'

# Git / PR
git -C /Users/shawnr/SourceCode/ServiceProgressUpdateTool log --oneline scaffold/backend
gh pr view 1
gh pr ready 1
```

---

_End of handoff._
