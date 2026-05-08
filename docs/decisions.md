# Decisions log

Why we picked what we picked. The goal is that future-you (and future
Claude, and any other AI) doesn't accidentally re-litigate a decision
that was already weighed.

Each entry has a status:

- **Anchored** — locked in. Don't undo without a deliberate revisit, and
  don't undo unilaterally during a refactor or "cleanup."
- **Open to revisit** — current pick, but the trade-off is real and we
  may swap if conditions change. The trigger conditions are listed.

If you find a new decision that's been made implicitly, add it here.
If a decision turns out to be wrong, change the status to "Reversed"
and write a new entry below explaining what replaced it.

---

## 1. SQLite over Postgres — *Anchored*

**Context.** Day-1 scaffold used Postgres + `pg`. Locked decision on
2026-05-07 over the original choice.

**Why SQLite won.**
- The Crossing is an MSSQL-shop with limited Linux service-administration
  experience. SQLite needs no service to administer.
- ≤100 concurrent users on this app — well below any SQLite ceiling.
- Backups are `cp service-status.db` to another host. Restores are the
  same command, reversed.
- None of the planned stretch goals (Rock sync, ProPresenter,
  Planning Center, status analytics) need Postgres-specific features.

**What we gave up.**
- `array_agg`, JSONB operators, mature concurrent-write story. None
  bite at our scale.
- A proper backup/replication ecosystem (PgBackRest, streaming replication).
  Mitigated by file-level backups + Litestream as an option.

**Don't accidentally undo.** Old commits and the original PRD reference
Postgres. A future helper might "fix" the inconsistency by migrating back.
Don't. The query wrapper in `backend/src/db.ts` is intentionally
Postgres-shaped (`pool.query(sql, params).then(({rows}) => …)`) precisely
to keep the door open without requiring it.

**Trigger to revisit.** Concurrent-write contention bites in production
*and* our scale grew unexpectedly *and* a stretch goal needs Postgres-only
features. None of those are likely.

---

## 2. JWT over server sessions — *Anchored*

**Context.** Day-1 scaffold used `express-session` with an in-memory store.
With SQLite locked in, sessions would have meant either a SQLite-backed
session store dependency or an in-memory store that loses logins on
restart.

**Why JWT won.**
- Statelessly verified. No session table, no extra package.
- CORS is simpler — no `credentials: 'include'`.
- SSE doesn't need cookie passthrough.
- JWT carries only `uid` (custom integer claim, not standard `sub`); the
  user record is rehydrated from the DB on every request, so deactivating
  a user works without managing a token denylist.

**What we gave up.**
- HttpOnly cookies' XSS resistance. JWT in `localStorage` is exploitable
  if we ever introduce an XSS bug. Acceptable for an internal tool with
  no user-generated content; revisit if that changes.
- Server-side session revocation. Workaround: rotate `JWT_SECRET` to
  invalidate every outstanding token at once.

**Don't accidentally undo.** Don't reintroduce a `session` table or
`express-session` middleware. The frontend and CORS middleware both
assume Bearer header auth.

**Trigger to revisit.** XSS-bearing user-generated content lands; or we
need per-token revocation more granular than the 12h expiry.

---

## 3. nginx over Caddy — *Anchored*

**Context.** Day-1 scaffold used Caddy with auto-Let's Encrypt.

**Why nginx won.**
- Familiar to most IT shops, including The Crossing's. Caddy's not
  unfamiliar but isn't the muscle memory.
- Pure config swap — no application code change.
- `CLAUDE.md` specifies nginx; aligning the docs to the implementation
  was the smaller refactor.

**What we gave up.**
- Caddy's auto-LE convenience. Replaceable with Cloudflare-front (origin
  on `:80`, TLS at the edge) or a certbot sidecar.

**Trigger to revisit.** TLS provisioning becomes painful enough that
auto-LE is worth the muscle-memory cost. For now, Cloudflare-front is
the planned starter.

---

## 4. Self-hosted web push (VAPID) — *Anchored*

**Context.** Considered Pusher, OneSignal, Firebase Cloud Messaging.

**Why self-hosted won.**
- Zero third-party dependency. No vendor that can change pricing,
  rate-limit us, or shut down.
- VAPID is a well-supported standard. Browsers handle the actual push
  channel (FCM under the hood for Chrome, APNs for Safari) — our backend
  just signs and sends.
- Fits the "minimal moving parts" goal of the PRD.

**What we gave up.**
- Vendor analytics dashboards.
- Rich features like image attachments, action buttons, A/B testing.
  None are PRD requirements; web push handles the basics natively.
- Vendor-managed delivery retries and backoff. We do this ourselves in
  `backend/src/webpush.ts` — fan-out is `Promise.all`-shaped and dead
  endpoints (404/410) get pruned automatically.

**Trigger to revisit.** Per-user delivery analytics become a real
requirement. Or volume grows past what a single Node process can fan out
in a reasonable time (single-VM deploy → plenty of headroom).

---

## 5. Rock RMS as identity (not M365 SSO) — *Anchored*

**Context.** Considered M365 SSO via OAuth. The Crossing already runs
M365 for staff identity.

**Why Rock RMS won.**
- Volunteers (a large slice of senders/subscribers) are in Rock, not M365.
  M365 SSO would split the user population.
- Rock's REST `POST /api/Auth/Login` is straightforward and returns a
  `.ROCK` cookie we can throw away after we've issued our own JWT.
- Keeps Rock as the system of record for "who is part of The Crossing."

**What we gave up.**
- True SSO. Users have to log in to this app even if they're already in
  Rock. Acceptable: the app is primarily push-pull, and senders log in
  rarely.
- M365's MFA enforcement. Rock's auth is username/password only.
  Mitigated by JWT_SECRET rotation and 12h token expiry.

**Trigger to revisit.** A staff-only feature emerges that needs MFA-strong
identity (e.g. financial transactions). Not on the roadmap.

---

## 6. PWA over native app — *Anchored*

**Context.** Native apps would give iOS push more reliably.

**Why PWA won.**
- No app store review cycles, no Apple Developer account dance.
- Single codebase for desktop / iOS / Android.
- Volunteers shouldn't have to install a thing — a URL works.
- Web Push works on Chrome/Edge/Firefox today and on iOS 16.4+ via
  installed PWA.

**What we gave up.**
- iOS push reliability under typical Safari browsing. Users must Share
  → Add to Home Screen first; without that, no push at all.
- App-store discoverability. Not relevant for an internal tool.

**Trigger to revisit.** iOS push fragility blocks adoption *and* a native
shell becomes affordable. Capacitor or a thin React Native wrapper around
the existing PWA would be the path; the React app stays.

---

## 7. Stream Deck webhook + static token (not OAuth) — *Anchored*

**Context.** Stream Deck integration via Bitfocus Companion's HTTP action.
Could have done OAuth client credentials.

**Why static token won.**
- Bitfocus Companion's HTTP action handles a static `Authorization` header
  cleanly. OAuth flow would have required custom Companion modules.
- Tokens are per-campus, bcrypt-hashed at rest, revocable from the admin
  panel. Compromise blast radius is one campus until revoked.
- Atomic by design — no freeform text on the trigger path. Stream Deck
  buttons fire one specific status; the optional `message` field is a
  PRD §3 carve-out for the web sender UI.

**What we gave up.**
- Token rotation isn't automatic. Admin has to revoke + regenerate +
  update Companion config. Acceptable at this scale (handful of tokens).

**Trigger to revisit.** Token sprawl across many integrations *and* a
service that natively does OAuth client credentials emerges (Companion's
roadmap, not ours).

---

## 8. No tests in v1 (manual smoke testing only) — *Open to revisit*

**Context.** Conscious build-velocity choice during the workshop.

**Why no tests now.**
- Smoke testing via `curl` was sufficient to ship the v1 surface.
- The schema + zod validators + TypeScript strictness catch a wide class
  of bugs at compile time.
- The user explicitly chose build velocity over test coverage for v1.

**What we gave up.**
- Regression safety. The login-loop bug discovered on 2026-05-08 (a
  `useSyncExternalStore` snapshot identity issue) would have been caught
  by a single component test.
- Refactor confidence. Touching the publish-and-fan-out path is currently
  manual-test-only.

**Trigger to revisit.** First production incident traceable to a bug a
test would have caught. Likely first targets: a Vitest suite covering
`backend/src/lib/publish.ts`, `auth.ts`, and a Playwright smoke run for
login → send → see-it-on-status-page.

---

## 9. Bearer token (not HttpOnly cookie) — *Anchored*

See decision #2; this is the same trade. Listed separately because the
Bearer-vs-cookie decision is independently load-bearing for CORS and SSE.

---

## 10. SSE over WebSockets — *Anchored*

**Context.** Both can do server-push.

**Why SSE won.**
- One-way push is all we need. Status flows server → clients, never the
  other direction.
- Browser `EventSource` handles reconnect automatically. No reconnect
  logic to write or test.
- nginx config is one `proxy_buffering off` block.
- No special protocol upgrade — plain HTTP.

**What we gave up.**
- Bidirectional channel. We don't need it.
- Binary frames. We don't need them.

**Trigger to revisit.** A bidirectional feature requirement emerges
(typing indicators, presence). Unlikely.

---

## Process / convention decisions

These aren't tech-stack picks but are still worth anchoring.

### Branch model
- Feature branches off `main`. No direct push to `main`.
- Direct merge or squash-merge — your call per PR.
- The current scaffold is on `scaffold/backend` (PR #1).

### Commit signing
- All commits GPG-signed. Don't bypass with `--no-gpg-sign` to dodge an
  unresponsive agent — surface the agent issue to the user and pause.

### Co-author trailer on AI-assisted commits
```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

### `HANDOFF.md` / `OVERNIGHT.md` pattern
Sessional records — written when stopping work mid-stream so the next
session can resume cleanly. Not authoritative; the docs in `docs/` are.
Delete or archive when stale; don't update them as living references.
