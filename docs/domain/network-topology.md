# Network topology

Where the VM lives, how traffic reaches it, where the Stream Decks
plug into all this. Internal-only; most of this is org-specific and
should be redacted before any broader sharing of the repo.

## The VM

- [ ] **VMware cluster** — which one?
- [ ] **VM name / hostname**
- [ ] **VM template used** — Ubuntu Server LTS (which version?)
- [ ] **Resources allocated** — vCPU, RAM, disk
- [ ] **VM IP address(es)** — internal LAN
- [ ] **VLAN(s) the VM sits on**
- [ ] **VM owner / VMware admin contact** (for capacity / migration questions)

## Traffic path — public to app

```
Browser
  ↓  HTTPS to https://servicestatus.thecrossing.church
[ Cloudflare DNS + proxy (recommended starter for TLS) ]
  ↓  HTTP to origin VM
[ Firewall / NAT — TBD topology ]
  ↓  port 80
[ nginx in Docker on the VM ]
  ↓  proxy /api/* and /health to localhost:3000
[ Express app in Docker on the VM ]
  ↓  reads/writes
[ /data/service-status.db on the VM (Docker volume) ]
```

- [ ] **DNS** — `servicestatus.thecrossing.church` is a CNAME / A record
  pointing at what?
- [ ] **Cloudflare** — is the proxy enabled (orange cloud)? Plan tier?
  Account owner?
- [ ] **Firewall rules** — what ports are open inbound to the VM from
  the Cloudflare edge IP ranges?
- [ ] **Origin TLS** — currently planned as HTTP-only with TLS at
  Cloudflare (recommended starter). If/when this changes, document the
  cert provisioning here.

## Traffic path — Stream Deck to app

```
Stream Deck device
  ↓  USB to host workstation
[ Bitfocus Companion on the workstation ]
  ↓  HTTP POST /api/trigger to the VM
[ same nginx → app path as above ]
```

- [ ] **Bitfocus Companion host machine** per campus (which workstation,
  IP, who admins it)
- [ ] **Companion module / version** — confirm it's the HTTP action that
  doesn't need a custom module
- [ ] **Token rotation procedure** — when a token is rotated in the
  admin panel, who updates the Companion config on each campus?

## Traffic path — Rock RMS auth

```
Express app on the VM
  ↓  HTTPS outbound to https://rock.wcrossing.org or jimrock.wcrossing.org
[ The Rock VM / instance ]
```

- [ ] Outbound HTTPS from the app VM to Rock — confirmed working?
- [ ] Internal DNS aliases preferred over public hostnames?

## Traffic path — Web Push (VAPID)

```
Express app on the VM
  ↓  HTTPS outbound to push provider endpoints
[ Firebase Cloud Messaging (Chrome / Edge / Android) ]
[ Apple Push Notification Service (Safari / iOS PWA) ]
[ Mozilla autopush (Firefox) ]
  ↓  push delivery to the user's device (out of our control)
[ Service Worker on user's browser ]
```

The push provider endpoints are stored per-subscription in the
`push_subscriptions.endpoint` column. The app needs outbound HTTPS to
those domains:

- `*.googleapis.com` (FCM)
- `*.push.apple.com` (APNs)
- `updates.push.services.mozilla.com` (Firefox)

- [ ] Are outbound rules permissive enough? (Most enterprise firewalls
  allow all HTTPS by default; some don't.)

## Local dev — how does this sit on the IT laptop?

Currently:
- Backend: `npm run dev` → `localhost:3000`
- Frontend: `npm run dev` → `localhost:5173`, Vite proxies `/api` and
  `/health` to `:3000`
- SQLite: `backend/tmp/dev.db` (gitignored)

For testing push from a phone over the LAN:
- Mac LAN IP: `ifconfig | grep 'inet ' | grep -v 127.0.0.1`
- Phone connects to `http://<lan-ip>:5173/`
- Vite needs `--host` flag for LAN access:
  `npm run dev -- --host` *(currently the script doesn't pass this; add
  `--host` if you want LAN access)*
- The phone will refuse Service Worker registration over plain HTTP
  unless the host is `localhost`. **For real-device push testing on a
  phone, you need either:**
  - HTTPS on the dev server (e.g. `vite-plugin-mkcert`)
  - Or test on a deployed staging environment with proper TLS

## Known network gotchas

- [ ] *(Add as you find them — VLAN-crossing issues, MTU oddities, etc.)*

---

*This file is org-specific. Almost every section here is internal
infrastructure and should not appear in any externally-shared version
of the repo.*
