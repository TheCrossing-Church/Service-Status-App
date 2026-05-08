# Rock RMS integration

What's known and what's still in your head. Fill in the TODOs as you
work through the integration. The code lives in `backend/src/lib/rock.ts`
and is currently *code-tested only* — never exercised against a live
Rock instance with a real user.

## Environments

| Env | URL | Used for |
|---|---|---|
| Production | `https://rock.wcrossing.org` (also `https://rock.thecrossing.church`) | Live identity / data |
| Dev / Testing | `https://jimrock.wcrossing.org` | Development against real-shaped data |

`ROCK_BASE_URL` in `backend/.env` controls which one the app talks to.
**Currently empty in dev** — the app falls back to local password auth.

## Auth flow (as currently implemented)

1. Backend receives `POST /api/auth/login` with `{username, password}`.
2. If `ROCK_BASE_URL` is set, calls `authenticateAgainstRock()`:
   1. `POST {ROCK_BASE_URL}/api/Auth/Login` with the credentials, expecting
      a `200` and a `Set-Cookie: .ROCK=…` header.
   2. With the `.ROCK` cookie, calls `GET {ROCK_BASE_URL}/api/People/GetCurrentPerson`
      to fetch person details (id, email, display name).
   3. Returns `{ok: true, rockPersonId, email, displayName}` on success.
3. Backend upserts a row in `users` keyed on `rock_person_id`. Username,
   email, and display_name come from Rock and overwrite local values on
   each login.
4. If Rock auth fails or `ROCK_BASE_URL` is unset, falls back to comparing
   `password` against `users.password_hash` (bcrypt).
5. Backend mints its own JWT and returns it. The `.ROCK` cookie is
   discarded — we don't store or proxy it.

## TODO — fill these in as you exercise it

### Auth gotchas
- [ ] What's Rock's behavior on **wrong password** vs **unknown user**?
  Different status codes? Different timing?
- [ ] Does Rock rate-limit login attempts? What's the lockout policy?
- [ ] What does the `.ROCK` cookie's `expires` look like? Are we relying
  on it for anything? *(currently no — we drop it)*
- [ ] Are there Rock accounts that *can't* log in via REST (e.g. SSO-only
  accounts, locked accounts, accounts with no password set)?
- [ ] Does Rock require any specific User-Agent or headers we're not
  sending?

### Person record fields we consume
The `GetCurrentPerson` response is large. We currently use:
- `Id` → `users.rock_person_id`
- `Email` → `users.email`
- `FullName` (or similar) → `users.display_name`

- [ ] Confirm exact field names (`FullName` vs `NickName` vs first/last
  concat). Worth a Rock REST trace to lock down.
- [ ] Are there fields we *should* be consuming for authorization?
  (Example: a "Production Team" group membership that should auto-grant
  the `sender` role.)

### Stretch: Rock-driven authorization
Currently, role assignment (admin / sender / which campuses) is
manually managed in the admin panel. Rock has groups and campuses too.

- [ ] Are Crossing's volunteers organized in Rock groups that map cleanly
  to the `subscriber_groups` table here? If yes, an automated sync would
  reduce admin work.
- [ ] What's the field on Rock that identifies someone's home campus?
  Could `users.campus_id` come from Rock instead of being manually assigned?
- [ ] Does Rock have an "is staff" or "production team" boolean that
  should auto-grant the `sender` role?

### Network / firewall
- [ ] Does the production VM have outbound HTTPS access to
  `rock.wcrossing.org`? (Probably yes, but worth confirming —
  jimrock.wcrossing.org may also need to be reachable for testing.)
- [ ] Is there an internal DNS name for Rock that's preferable to the
  public one?

## Code pointers

- `backend/src/lib/rock.ts` — REST client + person-record parser
- `backend/src/routes/auth.ts:22-39` — Rock branch of the login handler

## Known limitations

- No MFA. Rock auth via REST doesn't expose MFA challenges. If The
  Crossing ever requires MFA on staff accounts, this integration breaks
  for those users. Mitigation path: M365 SSO (which would be a separate
  project — see `decisions.md` #5).

---

*This file is org-specific. If/when the repo is shared more broadly,
URLs and any Rock person IDs in examples should be redacted.*
