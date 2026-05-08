# Service Progress Update Tool

A real-time service progress update tool for [The Crossing](https://thecrossing.church),
a 4-campus church in the St. Louis area. Production staff trigger status
updates ("Running Late", "Ending Early", etc.) that broadcast instantly to
subscribed staff and volunteers via web push notification and a live
status webpage. Designed to be faster and simpler than Teams for
in-service communication.

## Stack

Node.js + Express + SQLite backend; React + TypeScript + Tailwind PWA
frontend; Web Push (VAPID); Server-Sent Events; JWT auth (with Rock RMS
strategy); nginx reverse proxy; Docker Compose.

## Quick start — local dev

Two terminals.

**Backend** (`localhost:3000`):

```bash
cd backend
cp .env.example .env
npm install
npm run migrate    # idempotent, creates tmp/dev.db
npm run seed       # seeds 4 campuses, default status types & groups, admin user
npm run dev
```

**Frontend** (`localhost:5173`):

```bash
cd frontend
npm install
npm run dev
```

Then visit http://localhost:5173. Bootstrap admin login: `admin` /
`ChangeMeNow!` (override via `SEED_ADMIN_PASSWORD` in `backend/.env`).

## Quick start — production stack (Docker)

Runs on any Linux host with Docker + Docker Compose installed — bare
metal, any hypervisor (VMware, Hyper-V, KVM, Proxmox), or a cloud VM
(EC2, GCE, DigitalOcean, Hetzner, etc.). The Crossing deploys to an
Ubuntu Server LTS VM on VMware, but nothing in this stack is
VMware-specific. The same `docker compose --profile prod up` command
also runs locally on Docker Desktop (macOS / Windows) — what you
verify locally is what runs in production, just rebuilt for the host
architecture.

From the `backend/` directory:

```bash
# Build the frontend (the prod profile mounts ../frontend/dist into nginx)
(cd ../frontend && npm ci && npm run build)

# Bring up the stack
docker compose --profile prod up -d --build

# One-shot data seed (only needed first time)
docker compose --profile seed run --rm seed

# Visit http://localhost
```

To stop:

```bash
docker compose --profile prod down
```

Data persists in the `service_progress_data` Docker volume between runs.

## Documentation

| File | What's in it |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Top-level context; auto-loaded by Claude Code; working norms for AI assistants |
| [`docs/architecture.md`](docs/architecture.md) | Full spec — schema, API surface, frontend pages, deploy topology |
| [`docs/decisions.md`](docs/decisions.md) | The "why" log — anchored decisions with rationale and trigger conditions for revisit |
| [`docs/operations.md`](docs/operations.md) | Runbook — first-time deploy, updates, backup, restore, incident response |
| [`docs/working-with-ai.md`](docs/working-with-ai.md) | Norms for any AI assistant (autonomy tiers, anti-patterns, memory protocol) |
| [`docs/domain/`](docs/domain) | Org-specific domain knowledge (Rock RMS, campus workflows, network topology) |
| [`service-status-app-prd.md`](service-status-app-prd.md) | Original product requirements document |

## License

[MIT](LICENSE) — © 2026 The Crossing.

---

Built during the **Church IT Network AI Context Engineering workshop**.
