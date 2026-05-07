# Service Status App — Project Context

## What This Is
A real-time service progress update tool for The Crossing, a 4-campus church in the St. Louis area. Production staff trigger status updates (e.g. "Running Late", "Ending Early") that broadcast instantly to subscribed staff and volunteers via push notification and a live status webpage. Designed to be faster and simpler than Teams for in-service communication.

## Campuses
| Name | Code | Slug |
|---|---|---|
| Chesterfield | CFD | chesterfield |
| Fenton | FEN | fenton |
| Grant's Trail | GRT | grants-trail |
| Mid Rivers | MID | mid-rivers |

## Tech Stack
- **Backend:** Node.js + Express + SQLite (better-sqlite3)
- **Frontend:** React + Vite — built as a PWA (enables push notifications without an app store)
- **Push notifications:** Web Push with VAPID keys (no third-party push service)
- **Real-time status page:** Server-Sent Events (SSE)
- **Auth:** JWT sessions; credentials validated against Rock RMS REST API
- **Deployment:** Docker Compose on Ubuntu Server LTS VM (VMware)
- **Reverse proxy:** nginx (serves frontend static files, proxies /api/* to backend)
- **Target URL:** servicestatus.thecrossing.church

## Rock RMS
- **Production:** https://rock.wcrossing.org (also reachable at https://rock.thecrossing.church)
- **Dev/Testing:** https://jimrock.wcrossing.org — use this for development and testing
- Rock RMS auth works via `POST /api/Auth/Login` with username/password — returns a `.ROCK` session cookie. Backend validates credentials against Rock and issues its own JWT. This is not true SSO but keeps Rock as the identity source.

## Project Structure
```
service-status/
├── CLAUDE.md
├── docker-compose.yml
├── .env.example
├── README.md
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.js
│       ├── db.js
│       ├── seed.js
│       ├── middleware/
│       │   └── auth.js
│       ├── routes/
│       │   ├── auth.js       # POST /api/auth/login, logout, me
│       │   ├── status.js     # GET /api/status, GET /api/status/stream (SSE), POST /api/status/update
│       │   ├── trigger.js    # POST /api/trigger (Stream Deck webhook)
│       │   ├── subscribe.js  # Push subscription management
│       │   └── admin.js      # Admin endpoints (tokens, subscribers, history)
│       └── services/
│           └── push.js       # Web Push / VAPID send service
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   ├── public/
│   │   ├── manifest.json
│   │   └── sw.js             # Service worker for push + PWA
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── api.js
│       ├── pages/
│       │   ├── StatusPage.jsx    # Public live status page
│       │   ├── LoginPage.jsx
│       │   ├── SenderPage.jsx    # Protected — sender UI
│       │   ├── SubscribePage.jsx # Public — push enrollment
│       │   └── AdminPage.jsx     # Protected, admin only
│       └── components/
└── nginx/
    └── nginx.conf
```

## Database Schema (SQLite)
Key tables:
- `campuses` — id (CFD/FEN/GRT/MID), name, slug, timezone
- `status_types` — slug, label, default_message, color, icon, sort_order, is_active
- `campus_status` — one row per campus, current status + message + updated_at
- `subscriber_groups` — per-campus groups (In-Service, Hospitality, Kids)
- `users` — username, password_hash, role (admin/sender), campus_id
- `api_tokens` — per-campus tokens for Stream Deck / Bitfocus Companion
- `push_subscriptions` — endpoint, p256dh, auth, campus_ids (JSON), group_ids (JSON)
- `status_history` — append-only log of all status changes
- `app_config` — key/value store (VAPID keys live here)

## Default Status Types
| Slug | Label | Color |
|---|---|---|
| on-time | On Time | green |
| running-late | Running Late | yellow/amber |
| ending-early | Ending Early | blue |

Admins can add more status types via the admin panel without a code change.

## User Roles
- **admin** — IT only to start; access to admin panel; campus_id is null (all campuses)
- **sender** — production staff; scoped to one campus; access to sender UI only

## Key API Endpoints
```
GET  /api/status                  — all campuses current status (public)
GET  /api/status/stream           — SSE stream for live updates (public)
POST /api/status/update           — update status (requires JWT, campus-scoped)
POST /api/trigger                 — Stream Deck webhook (requires API token header)
POST /api/auth/login              — returns JWT
POST /api/auth/logout
GET  /api/auth/me
GET  /api/subscribe/vapid-public-key
POST /api/subscribe               — register push subscription
DELETE /api/subscribe             — unsubscribe
GET  /api/admin/tokens            — list API tokens (admin JWT)
POST /api/admin/tokens            — create API token (admin JWT)
DELETE /api/admin/tokens/:id      — revoke token (admin JWT)
GET  /api/admin/history           — status history (admin JWT)
GET  /api/admin/subscribers       — subscriber list (admin JWT)
```

## Stream Deck / Bitfocus Companion Integration
Stream Deck buttons map to HTTP POST requests via Bitfocus Companion:
```
POST /api/trigger
Headers: Authorization: Bearer <api-token>
Body: { "campus": "chesterfield", "status": "running-late", "message": "" }
```
- API tokens are per-campus, generated in the admin panel, revocable
- No freeform message on this path by design — keeps the trigger atomic
- Tokens are static (no OAuth), suitable for Bitfocus Companion HTTP action

## Frontend Pages
- `/` — StatusPage: public, all campuses, live SSE updates, noindex/nofollow
- `/status?campus=chesterfield` — filtered to one campus (for lobby screens)
- `/login` — LoginPage
- `/send` — SenderPage: protected, shows current campus status + big status buttons + optional message
- `/subscribe` — SubscribePage: public, push enrollment, campus + group picker
- `/admin` — AdminPage: protected admin-only, token management, subscriber list, history

## Status Page Requirements
- Publicly accessible (staff may be on guest Wi-Fi — no login required)
- Must NOT be indexed by search bots: `noindex`/`nofollow` meta tags, `X-Robots-Tag` header, `robots.txt` disallow
- Real-time updates via SSE (no polling)

## Sender UI Requirements
- Mobile-first — must work on a phone
- One tap to trigger a status — confirmation step before sending to prevent accidents
- Optional freeform message field in web UI (not required for Stream Deck path)
- Shows current active status for the sender's campus
- Send history visible to sender (last N updates for their campus)

## Push Notification Behavior
- On status change, push goes to ALL subscribers for that campus simultaneously
- No group-level targeting by sender — broadcast only
- Notification content: campus name + status label + message (if set)
- Subscriber groups (In-Service, Hospitality, Kids) are per-campus

## Deployment Notes
- Runs on Ubuntu Server LTS VM deployed from The Crossing's VMware template
- Docker Compose: `backend` service + `nginx` service (no separate DB container — SQLite file on mounted volume)
- nginx serves frontend static build and proxies `/api/*` to backend
- Data directory mounted as Docker volume at `/data` (contains SQLite file)
- VAPID keys generated on first run and stored in `app_config` table
- Admin user seeded from environment variables on first run

## Environment Variables (.env)
```
NODE_ENV=production
PORT=3000
JWT_SECRET=<strong-random-string>
ROCK_RMS_URL=https://jimrock.wcrossing.org   # swap to prod when ready
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<set-on-first-deploy>
DB_PATH=/data/service-status.db
FRONTEND_URL=https://servicestatus.thecrossing.church
```

## What Is NOT In Scope (v1)
- SMS delivery
- Email delivery
- Rock RMS subscriber sync (subscribers self-enroll manually for now)
- M365 SSO (Rock RMS auth is the primary path)
- Smart bulb / Alexa integration (stretch goal)
- ProPresenter 7 or Planning Center automation (stretch goal)
- Per-group targeting by sender (always broadcasts to all campus subscribers)

## Stretch Goals (do not build unless asked)
- Smart bulb integration for kids wing (Alexa-connected, color = status)
- Rock RMS subscriber sync from serving teams
- ProPresenter 7 REST/WebSocket API hooks (auto-trigger on slide cues)
- Planning Center REST API — seed service windows from plan times
- Scheduled/window-based auto-reset to On Time
- M365 SSO for senders
- Admin panel access for campus production leads (IT only for v1)

## Coding Conventions
- Keep it simple — this is a low-traffic internal tool, not a scaled SaaS
- Prefer readability over cleverness
- Comment non-obvious logic
- All API responses: `{ success: true, data: ... }` or `{ success: false, error: "..." }`
- Dates/times stored as ISO 8601 UTC strings in SQLite
- Campus timezone is America/Chicago
