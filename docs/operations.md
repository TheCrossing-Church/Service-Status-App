# Operations runbook

For operators who run the deployed system. Some of this is concrete; some
is currently TBD and clearly marked. The goal is that anyone on the
on-call rotation can read this top-to-bottom and know what to do.

## On-call rotation

**Model.** Multiple IT admins on rotation (not single-person on-call,
not "production team falls back to Teams when broken").

**TBD — fill in:**

- [ ] Who's on the rotation (names + roles)
- [ ] Rotation cadence (weekly? monthly? service-by-service?)
- [ ] Handoff procedure (how does the next person know they're up?)
- [ ] Paging mechanism (Teams? PagerDuty? Slack? phone?)
- [ ] Escalation path (when does the on-call person escalate, and to whom?)
- [ ] Access matrix (who has VM SSH access, deploy permissions, Rock RMS
  admin, JWT_SECRET in their password manager?)

These are real org-specific decisions. Recording them here means the
person on call at 8am Sunday isn't trying to figure out whom to text.

## Where things live

| Thing | Location |
|---|---|
| Source repo | `git@github.com:TheCrossing-Church/Service-Status-App.git` |
| Production VM | *(org-specific — see [`domain/network-topology.md`](domain/network-topology.md))* |
| SQLite database file | `/data/service-status.db` on the VM (Docker volume) |
| Docker compose file | `/{deploy-path}/backend/docker-compose.yml` |
| Logs | `docker compose logs app` and `docker compose logs nginx` |
| nginx config | `/{deploy-path}/backend/nginx.conf` |
| `.env` | `/{deploy-path}/backend/.env` (chmod 600) |
| TLS certs | *(deferred — Cloudflare-front recommended starter)* |

## First-time deploy

```bash
# On the VM:
git clone git@github.com:TheCrossing-Church/Service-Status-App.git
cd Service-Status-App/backend

# Create production .env from the template
cp .env.example .env
# Generate strong secrets (do this in a place you can copy to your password manager):
echo "JWT_SECRET=$(openssl rand -base64 48)" >> .env
echo "SEED_ADMIN_PASSWORD=$(openssl rand -base64 24)" >> .env
# Edit .env to set ROCK_BASE_URL, CORS_ORIGINS, FRONTEND_URL, VAPID keys
chmod 600 .env

# Generate VAPID keys (one-time)
docker compose --profile prod build app
docker compose run --rm app npm run vapid:generate
# Copy the printed VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY into .env

# Build the frontend (the prod profile mounts ../frontend/dist)
cd ../frontend
npm ci
npm run build
cd ../backend

# Apply migrations (one-shot, idempotent)
docker compose --profile prod run --rm migrate

# Seed defaults (campuses, status types, groups, admin user)
docker compose --profile seed run --rm seed

# Bring up the stack
docker compose --profile prod up -d --build

# Smoke test
curl -sf http://localhost/health
```

After this, store in your password manager:
- `JWT_SECRET`
- `SEED_ADMIN_PASSWORD` (the bootstrap admin's password)
- `VAPID_PRIVATE_KEY` (regenerable, but only by re-onboarding all push subscribers)
- VM SSH credentials

## Deploying an update

```bash
# On the VM:
cd /{deploy-path}
git pull origin main

# Rebuild the frontend if frontend/ changed
(cd frontend && npm ci && npm run build)

# Apply any new migrations (idempotent — safe to run when nothing changed)
docker compose --profile prod run --rm migrate

# Rebuild and restart the app (nginx restarts only if config changed)
docker compose --profile prod up -d --build

# Verify
curl -sf http://localhost/health
docker compose logs --tail 20 app
```

If the deploy lands within 30 minutes of a service start, **don't deploy.**
Wait for the service window to end. The trade is small upside (latest fix)
vs catastrophic downside (broken status during service).

## Backups

**TBD — fill in.** Three options worth choosing between:

1. **VMware snapshot only.** Simplest. Restore = revert to snapshot.
   Downside: VM-level granularity, hard to scope to "just the database."
2. **Cron + scp to another host.** `cp /data/service-status.db
   /backup/service-status-$(date +%Y%m%dT%H%M).db && rsync …`. SQLite's
   `.backup` command is safer than `cp` if there might be writes in flight:
   ```
   sqlite3 /data/service-status.db ".backup /backup/service-status.db"
   ```
3. **Litestream to S3-compatible.** Continuous streaming replication.
   Better RPO (Recovery Point Objective), more setup.

Pick one and document the cadence + retention policy here.

## Restore

Procedure depends on the backup choice above. Once chosen:

```bash
# Stop the app so nothing's writing while we restore
docker compose --profile prod stop app

# Replace the SQLite file
cp /backup/service-status-{timestamp}.db /data/service-status.db
chown <docker-user> /data/service-status.db

# Restart
docker compose --profile prod start app

# Verify
curl -sf http://localhost/health
```

## Rollback

If a deploy went bad:

```bash
# Identify the last-known-good commit
git log --oneline -10

# Roll the working tree back
git checkout <good-commit-sha>

# Rebuild
(cd frontend && npm ci && npm run build)
docker compose --profile prod up -d --build

# If a migration was applied that caused the problem:
# *Do not* attempt to "roll back" a SQLite migration with manual SQL —
# restore from backup instead. Migrations are forward-only by design.
```

If the bad deploy already wrote bad data: restore from backup.

## Day-of-service incident response

Service starts at $TIME. App breaks at $TIME minus N minutes.

**Triage in this order:**

1. **Is the status page reachable?** `curl -sf https://{target-url}` from
   off-VM. If 5xx, the app or nginx is down.
2. **Is `/health` returning 200?** If not, backend is down or DB is wedged.
3. **Are SSE clients connected?** `docker compose logs app | grep "[server]"`
   shows connection counts implicitly.
4. **Did push fan-out break?** `docker compose logs app | grep "[webpush]"`
   shows send failures.

**Decide between:**

- **Restart-fix.** `docker compose --profile prod restart app`. Often
  enough. Takes ~5 seconds.
- **Rollback.** Revert to a known-good commit (see "Rollback" above).
  Takes 2-3 minutes including frontend rebuild.
- **Bypass.** If the app can't be saved in time: production team uses
  Teams as the comm channel for that service. Communicate this to the
  production team via whatever paging channel you've established.

**Don't:**
- Push hot-fixes during the service window. The window for "I see the
  bug, I push the fix" is the previous Tuesday, not 8:55am Sunday.
- Run migrations during a service window.
- Restart the entire VM unless you're certain the app-level restart
  isn't enough.

## Routine maintenance

| Task | Frequency | Notes |
|---|---|---|
| Apply OS updates | Monthly | `unattended-upgrades` for security patches; reboot during a non-service window |
| Rotate `JWT_SECRET` | Annually or on suspicion of leak | Invalidates every outstanding JWT — users re-login |
| Rotate VAPID keys | Annually or on suspicion | All push subscribers must re-enroll. Painful — only when warranted |
| Review API tokens | Quarterly | Admin panel → tokens → revoke any without recent `last_used_at` |
| Review subscribers list | Quarterly | Inactive emails or test entries can be cleared via the admin UI |
| Database backup verify | Monthly | Restore to a non-prod location, confirm app boots against it |
| Dependency updates | Monthly review | `npm audit` in both `backend/` and `frontend/`. Patch + minor bumps OK to apply directly. Major bumps deliberated separately. |

## Monitoring

**TBD — currently nothing.** Worth deciding:

- **Uptime ping.** Cloudflare Healthchecks / UptimeRobot / similar to alert
  if `/health` stops returning 200.
- **Log aggregation.** Currently `docker compose logs` only. For an
  internal tool at this scale, may not be necessary.
- **Push delivery metrics.** Backend logs successes/failures via
  `console.error("[webpush]")`. Could surface as a Grafana panel if we
  ever stand up Grafana.

## Open questions

These are flagged in `HANDOFF.md` but worth tracking here too:

- [ ] **TLS strategy.** Cloudflare-front (recommended starter), certbot
  sidecar, or manual certs?
- [ ] **Backup tooling.** Pick from the three options above.
- [ ] **iOS push reliability.** Has not been tested on a real iPhone.
  PWA install + iOS 16.4+ are required, but real-world reliability
  varies. Plan a test session.
- [ ] **Multi-campus senders.** Code path exists in `SenderPage.tsx` for
  users with `campus_ids.length > 1`. Untested with real users.
- [ ] **Rock RMS auth in prod.** Code path exists, code-tested. Never
  exercised against a live Rock instance with a real user.
