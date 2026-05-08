# Architecture

The full technical spec. For the *why* behind these picks, see
[`decisions.md`](decisions.md).

## Tech stack

- **Backend** — Node.js + Express + SQLite (better-sqlite3). TypeScript
  with strict mode + `noUncheckedIndexedAccess`.
- **Frontend** — React 18 + TypeScript + Vite + Tailwind v3 + react-router-dom v6, built as a PWA.
- **Push** — Web Push with VAPID keys (no third-party push service).
- **Real-time** — Server-Sent Events (SSE).
- **Auth** — JWT (Bearer header). Credentials validated against Rock RMS REST
  API; backend issues its own JWT after Rock confirms.
- **Reverse proxy** — nginx; SSE-aware location with buffering off.
- **Deployment** — Docker Compose on Ubuntu Server LTS VMware VM.

## Project structure

```
ServiceProgressUpdateTool/
├── backend/
│   ├── package.json                   # tsx for dev, tsc for build
│   ├── tsconfig.json                  # strict, noUncheckedIndexedAccess
│   ├── Dockerfile                     # multi-stage, alpine + python3/make/g++
│   ├── docker-compose.yml             # prod / seed / migrate profiles
│   ├── .env.example
│   ├── nginx.conf                     # SSE-aware reverse proxy
│   ├── migrations/001_init.sql        # full schema (SQLite syntax)
│   ├── scripts/
│   │   ├── migrate.ts                 # idempotent migration runner
│   │   ├── seed.ts                    # default campuses/statuses/groups/admin
│   │   └── generate-vapid.ts          # prints VAPID keypair
│   └── src/
│       ├── index.ts                   # Express bootstrap, /health
│       ├── db.ts                      # better-sqlite3 + Postgres-shape async wrapper
│       ├── env.ts                     # env config; refuses dev secret in prod
│       ├── auth.ts                    # JWT sign/verify, requireUser, requireAdmin
│       ├── realtime.ts                # SSE pub/sub
│       ├── webpush.ts                 # VAPID fan-out + dead-endpoint cleanup
│       ├── lib/
│       │   ├── asyncHandler.ts
│       │   ├── httpError.ts
│       │   ├── publish.ts             # central status-update flow (SSE + push)
│       │   ├── queries.ts
│       │   ├── rock.ts                # Rock RMS REST client
│       │   ├── schemas.ts             # zod input validators
│       │   └── sqlUpdate.ts           # buildUpdateSet helper
│       └── routes/
│           ├── auth.ts                # /api/auth/*
│           ├── status.ts              # public reads + SSE + groups
│           ├── send.ts                # POST /api/status (auth)
│           ├── trigger.ts             # POST /api/trigger (Stream Deck)
│           ├── subscribers.ts         # enrollment + push + unsubscribe
│           └── admin.ts               # CRUD + tokens + subscribers + history
└── frontend/
    ├── vite.config.ts                 # /api + /health proxy to :3000
    ├── public/
    │   ├── icon.svg                   # placeholder Crossing icon
    │   ├── manifest.webmanifest
    │   ├── robots.txt                 # Disallow: /
    │   └── sw.js                      # service worker (push + notificationclick)
    └── src/
        ├── main.tsx                   # React bootstrap + SW register
        ├── App.tsx                    # routes + Suspense + AuthGuard
        ├── api/{client.ts,types.ts}   # typed fetch wrapper
        ├── auth/{store.ts,useUser.ts,AuthGuard.tsx}
        ├── components/{Shell.tsx,StatusBadge.tsx}
        ├── pages/                     # 5 pages (see below)
        └── pwa/{push.ts,install.ts}
```

## Database schema

SQLite. ISO 8601 UTC TEXT for timestamps. Booleans stored as INTEGER 0/1
with CHECK constraints; the query wrapper coerces JS booleans on input.

Key tables:
- `campuses` — id, slug (`chesterfield` / `fenton` / `grants-trail` /
  `mid-rivers`), name, code (CFD/FEN/GRT/MID), timezone (default
  `America/Chicago`), service_window_start/end, active.
- `status_types` — per-campus. slug, label, default_message, color, icon,
  sort_order, active. Admin can add more without a code change.
- `subscriber_groups` — per-campus (in-service / hospitality / kids by default).
- `users` — username, password_hash (nullable; null = Rock-only),
  email, display_name, role (admin/sender), rock_person_id.
- `user_campuses` — many-to-many; admins typically have no rows (all access).
- `subscribers` — email, display_name, unsubscribe_token, active.
- `subscriber_memberships` — `(subscriber_id, campus_id, group_id)` rows.
- `push_subscriptions` — endpoint, p256dh, auth, user_agent.
- `api_tokens` — per-campus, bcrypt-hashed, prefix (for display), label,
  last_used_at, revoked_at.
- `status_updates` — append-only history. campus_id, status_type_id,
  message, sent_via (`web` | `webhook`), user_id (nullable),
  api_token_id (nullable), created_at.
- `app_config` — key/value store (VAPID keys here on first run).

Full DDL: `backend/migrations/001_init.sql`.

## Default seed data

| Slug | Label | Color |
|---|---|---|
| on-time | On Time | green (#22c55e) |
| running-late | Running Late | amber (#f59e0b) |
| ending-early | Ending Early | blue |

Three default groups per campus: in-service, hospitality, kids.

Bootstrap admin (env-configurable): `admin` / `ChangeMeNow!`.
Per-campus senders: `sender-chesterfield`, etc., same default password.

## API surface

Response envelope: `{success: true, data: ...}` on success;
`{success: false, error: "...", details?: ...}` on error.

```
# Public
GET    /health
GET    /api/campuses
GET    /api/status[?campus=]
GET    /api/status/:slug
GET    /api/campuses/:slug/status-types
GET    /api/campuses/:slug/history
GET    /api/groups
GET    /api/events                     # SSE stream
GET    /api/push/public-key

# Auth
POST   /api/auth/login                 # returns JWT + user
POST   /api/auth/logout
GET    /api/auth/me                    # JWT-required

# Send (JWT, campus-scoped)
POST   /api/status

# Webhook (API token, bcrypt-verified, campus-scoped)
POST   /api/trigger

# Subscribers (public)
POST   /api/subscribers                # enrollment
POST   /api/subscribers/push           # device registration
POST   /api/subscribers/unsubscribe    # via opaque token

# Admin (admin role only)
GET    /api/admin/campuses
POST   /api/admin/campuses
PATCH  /api/admin/campuses/:id
GET    /api/admin/status-types[?campus_id=]
POST   /api/admin/status-types
PATCH  /api/admin/status-types/:id
GET    /api/admin/groups[?campus_id=]
POST   /api/admin/groups
PATCH  /api/admin/groups/:id
GET    /api/admin/api-tokens
POST   /api/admin/api-tokens           # returns plaintext once
POST   /api/admin/api-tokens/:id/revoke
GET    /api/admin/subscribers
GET    /api/admin/history[?campus_id=]
```

## Frontend pages

| Route | Component | Auth | Notes |
|---|---|---|---|
| `/` | StatusPage | public | All-campuses live view, SSE-driven, lazy-loaded |
| `/?campus=<slug>` | StatusPage | public | Single-campus filtered view (lobby screens) |
| `/login` | LoginPage | public | username / password form |
| `/subscribe` | SubscribePage | public | Self-enrollment + push handshake |
| `/send` | SenderPage | sender role | Mobile-first, two-tap confirm |
| `/admin` | AdminPage | admin role | Tabs: tokens / subscribers / history |

All pages are lazy-loaded so the public StatusPage bundle stays minimal
(it's the most-fetched audience — lobby screens and anonymous viewers).
Lazy chunks are NOT a security boundary; backend authorization is.

`noindex,nofollow` is set via `<meta>`, nginx `X-Robots-Tag` header, and
`/robots.txt` (defense in depth).

## Push notification flow

1. User visits `/subscribe`, enters name + email + picks campus×group memberships.
2. Frontend calls `POST /api/subscribers` to enroll.
3. Frontend then calls `ensurePushSubscription()` which:
   - Fetches VAPID public key from `/api/push/public-key`
   - Registers service worker (already done at app boot)
   - Calls `PushManager.subscribe()` with the VAPID key
   - POSTs the resulting endpoint + p256dh + auth to `/api/subscribers/push`
4. On status change, `lib/publish.ts` runs `webpush.sendStatusToCampus()`
   which fans out to every push_subscription whose subscriber is a member
   of any group on that campus.
5. Service worker receives the push, shows a system notification with
   campus + status + message.
6. Dead endpoints (404 / 410 from the push provider) are pruned from the DB.

iOS specifics: PWA must be installed via Share → Add to Home Screen
*before* push works at all. iOS 16.4+ required.

## Stream Deck / Bitfocus Companion integration

Stream Deck buttons map to HTTP POST requests via Bitfocus Companion:

```http
POST /api/trigger
Authorization: Bearer <api-token>
Content-Type: application/json

{ "campus": "chesterfield", "status": "running-late", "message": "" }
```

- Tokens are per-campus, generated in the admin panel, revocable.
- Tokens are bcrypt-hashed at rest; only the prefix is displayed after creation.
- The plaintext token is shown **once** at creation — copy or regenerate.
- No freeform message on the trigger path by design (PRD §3 — keep the
  trigger atomic). Falls back to `default_message` on the status type.

## Deployment topology

- VMware Ubuntu Server LTS VM (org-specific: cluster + IP allocation in
  `docs/domain/network-topology.md`).
- Docker Compose with `prod` profile: `app` + `nginx` + one-shot `migrate`.
- nginx serves `frontend/dist` (mounted into the container at
  `/usr/share/nginx/html`) and proxies `/api/*` + `/health` to backend on `:3000`.
- SQLite file lives at `/data/service-status.db` (Docker volume).
- VAPID keys generated on first run and stored in `app_config`.
- Admin user seeded from environment variables on first run.
- TLS strategy: deferred to deploy time. Cloudflare-front recommended starter
  (run nginx as origin on `:80`); certbot sidecar or manual certs are
  alternatives. See `docs/operations.md`.

## Environment variables

```
NODE_ENV=production
PORT=3000
DATABASE_PATH=/data/service-status.db
JWT_SECRET=<openssl rand -base64 48>
JWT_EXPIRES_IN=12h
CORS_ORIGINS=https://servicestatus.thecrossing.church
VAPID_PUBLIC_KEY=<from npm run vapid:generate>
VAPID_PRIVATE_KEY=<from npm run vapid:generate>
VAPID_SUBJECT=mailto:it@thecrossing.church
ROCK_BASE_URL=https://jimrock.wcrossing.org    # swap to prod when ready
ROCK_API_KEY=                                  # if used
SEED_ADMIN_PASSWORD=<override default>
```

## Coding patterns

- Every route handler is wrapped in `asyncHandler(...)` so async errors
  forward to the global handler.
- Every input is `zodSchema.parse(req.body)` — schemas in `lib/schemas.ts`.
- Every DB write uses parameterized SQL through `pool.query(sql, params)`.
  No string concatenation of user input. Dynamic IN-clauses use index-based
  `$N` placeholders, not user values.
- PATCH endpoints use `buildUpdateSet` — `undefined` skips, `null` clears.
- All publish-side effects flow through `publishStatusUpdate` so SSE +
  push stay consistent across web and webhook senders.
- Slugs: lowercase-hyphenated, regex `^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$`.
- All list responses are stable-ordered.
- TypeScript: strict + `noUncheckedIndexedAccess`. No `any`. Optional
  chaining for shallow reads; destructure-and-check for deeper access.
