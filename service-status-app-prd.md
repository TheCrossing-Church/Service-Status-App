# PRD: Service Progress Update Tool
**The Crossing — IT / Workshop Concept**
**Status:** Draft · **Version:** 0.1

---

## Overview

A lightweight web application that allows production staff to broadcast real-time service status updates to staff and volunteers across all four campuses. Designed to be faster and simpler than Teams for in-service communication, with first-class support for Stream Deck triggering via Bitfocus Companion.

---

## Goals

- Enable production staff to broadcast a service status in seconds — ideally a single button press
- Deliver updates to staff and volunteers via push notification and a live status webpage
- Support per-campus status independence (Campus A can be "Running Late" while Campus B is "On Time")
- Allow subscribers to self-select their campus(es) and role group
- Keep the sender experience dead simple, especially for Stream Deck operators
- Support admin-configurable status types without a code change

## Non-Goals

- SMS delivery (not in scope)
- Email delivery
- Replacing Rock RMS or serving as a general communication platform
- Full chat or two-way messaging

---

## User Roles

| Role | Description |
|---|---|
| **Sender** | Production staff member at a campus. Triggers status updates via web UI or Stream Deck. One per campus is the expected operating model. |
| **Subscriber** | Staff or volunteer who opts in to receive updates for one or more campuses and groups. |
| **Admin** | IT or designated staff. Manages campuses, status types, subscriber groups, and user accounts. |

---

## Functional Requirements

### 1. Status Management

- A **status** consists of:
  - A **label** (e.g. "Running Late", "Ending Early", "On Time")
  - An optional **message** (freeform text, e.g. "Service is running approximately 10 minutes late")
  - A **campus** (scoped per campus; multi-campus admins may broadcast to multiple)
  - A **timestamp** (set automatically at time of trigger)

- **Default status set (admin-configurable):**
  - ✅ On Time
  - ⏱ Running Late
  - 🏁 Ending Early
  - Admins can add, edit, or disable status types via the admin panel without a code change

- A **freeform message** field is optional and available in the web UI sender interface
  - Stream Deck triggers map to predefined statuses only (no freeform text required or expected)
  - The web UI can optionally pre-fill a default message per status type (e.g. "Service is running late") that the sender can edit before sending

- The current status is always visible on the sender dashboard per campus

---

### 2. Sender Interface (Web UI)

- Accessible via browser; mobile-responsive
- Login required (see Authentication)
- Campus is pre-scoped to the sender's assigned campus; multi-campus senders see a campus selector
- Main screen shows:
  - Current active status for their campus
  - One large tap/click button per status type
  - Optional freeform message input before confirming
  - A "Send Update" confirmation step to prevent accidental triggers
- Send history log visible to the sender (last N updates for their campus)

---

### 3. Stream Deck / Bitfocus Companion Integration

- The app exposes a simple **HTTP webhook endpoint** per campus and status type:
  ```
  POST /api/trigger
  Body: { "campus": "chesterfield", "status": "running-late", "token": "..." }
  ```
- Authentication via a **static API token** per campus (generated in admin panel, no OAuth flow required for device integrations)
- Bitfocus Companion maps a Stream Deck button to an HTTP request action using this endpoint
- No freeform message support on this path by design — keeps the trigger atomic and instant
- Tokens are revocable from the admin panel

---

### 4. Subscriber Groups

- Groups are **per-campus** — each campus manages its own group definitions independently
- Default group set per campus (admin-configurable per campus):
  - In-Service Staff & Volunteers
  - Hospitality Staff & Volunteers
  - Kids Staff & Volunteers
- Subscribers self-enroll via a web page (or optionally via a Rock RMS-integrated flow)
- At enrollment, subscriber selects:
  - One or more **campuses** to receive updates from
  - For each campus, one or more **groups** they belong to at that campus
- Admins can manage group definitions per campus and review subscriber lists

---

### 5. Delivery Channels

#### Push Notifications (PWA)
- The app is a **Progressive Web App (PWA)** to enable push notifications without an app store
- Subscribers install the PWA or simply allow browser push notifications from the site
- On status change, a push notification is sent to all subscribed users matching campus + group
- Notification content: campus name, status label, and message (if set)

#### Live Status Webpage
- A **publicly accessible** status page at a stable URL (e.g. `/status` or `/status/chesterfield`)
- Must not be indexed by search engines — `noindex`/`nofollow` meta tags, `X-Robots-Tag` header, and `robots.txt` disallow rule
- Displays current status per campus, auto-refreshing in real time (WebSocket or polling)
- Suitable for display on a lobby screen, a staff tablet, or a shared browser tab
- Can be filtered by campus via URL parameter (e.g. `/status?campus=chesterfield`)
- No login required to view (read-only)

---

### 6. Authentication & Authorization

#### Sender / Admin Auth
- Login required for all sender and admin functions
- **Primary: Rock RMS integration** — authenticate senders using Rock RMS credentials (Rock has a REST API that supports authentication)
- **Stretch: M365 SSO** — allow staff to sign in with their Microsoft 365 account via OAuth; Rock remains the source of truth for campus assignment and role
- Sessions are persistent with a configurable timeout

#### Subscriber Auth
- Subscribers may enroll with a name + email (lightweight, no password required)
- Optional: tie subscriber enrollment to Rock RMS person record for richer group/campus defaulting
- No login required to view the public status page

#### API Token Auth (Stream Deck)
- Per-campus static tokens generated in the admin panel
- Scoped to a single campus; cannot be used to post for another campus
- Revocable at any time

---

### 7. Admin Panel

- Access restricted to IT staff initially; role expansion to campus production leads is a future option
- Manage campuses (name, slug, timezone, service windows)
- Manage status types per campus (label, default message, color/icon, active/inactive)
- Manage subscriber groups per campus
- View and revoke API tokens per campus
- View subscriber list (read-only)
- View send history across all campuses

---

## Non-Functional Requirements

- **Reliability:** Status updates must deliver push notifications within a few seconds of trigger
- **Simplicity:** The sender flow from button press to delivered notification should take under 5 seconds
- **Mobile-first:** Sender UI and status page must be fully usable on a phone
- **Low maintenance:** Minimal moving parts; avoid infrastructure that requires active ops (prefer managed services or a simple self-hosted stack)
- **Privacy:** Subscriber data (name, email, push token) is stored securely and not exposed publicly

---

## Stretch Goals / Future Considerations

- **Smart bulb integration** (e.g. Alexa-connected Govee/LIFX bulbs for kids wing) — HTTP trigger maps to a color via webhook adapter (IFTTT, Home Assistant, or direct bulb API)
- **Rock RMS subscriber sync** — auto-populate subscribers and group assignments from Rock serving teams
- **M365 SSO for senders** — reduces credential management; Rock RMS auth is the primary path
- **Scheduled / window-based auto-reset** — define service windows per campus; auto-reset to "On Time" at window start and optionally clear status at window end
- **ProPresenter 7 integration** — ProPresenter has a built-in REST/WebSocket API; could trigger status changes or auto-reset based on slide cues or stage display events
- **Planning Center integration** — Planning Center Online has a REST API; service plan times could seed campus service windows automatically, reducing manual admin setup
- **Video switcher hooks** — stretch/exploratory; some switchers (e.g. ATEM via companion plugin) could emit events that trigger status changes
- **Status history / analytics** — track frequency and patterns of late starts by campus over time

---

## Open Questions

| # | Question | Owner |
|---|---|---|
| 1 | ~~Does Rock RMS REST auth work well enough for sender login, or is M365 SSO the better path?~~ **Resolved:** Rock exposes `POST /api/Auth/Login` (returns a session cookie) and REST Key tokens (header-based). Cookie auth is viable for sender login — backend validates credentials against Rock and issues its own session. Not true SSO, but keeps Rock as the identity source. M365 SSO remains a stretch goal. | Resolved |
| 2 | ~~Are subscriber groups fixed per campus or shared org-wide?~~ **Resolved:** Groups are per-campus. | Resolved |
| 3 | ~~Who manages the admin panel — IT only, or campus production leads too?~~ **Resolved:** IT only to start; expand to campus leads later if needed. | Resolved |
| 4 | ~~Is the status page intended to be accessible outside the church network?~~ **Resolved:** Publicly accessible (staff/volunteers may be on guest Wi-Fi), but must not be indexed by search bots (`noindex`, `nofollow`, disallow in `robots.txt`). | Resolved |
| 5 | ~~Should push notifications go to all matching subscribers simultaneously, or can a sender target a specific group?~~ **Resolved:** Broadcast to all matching subscribers for that campus simultaneously. No group-level targeting by sender. | Resolved |
| 6 | ~~Are there service-start/end windows per campus that could drive auto-reset logic?~~ **Resolved:** Yes, windows exist. ProPresenter 7, video switchers, and Planning Center are also in use — see Stretch Goals for automation hooks. | Resolved |

---

## Appendix: Proposed Tech Stack (Suggested Starting Point)

| Layer | Suggestion | Notes |
|---|---|---|
| Frontend | React + Vite PWA | PWA enables push without app store |
| Backend | Node.js + Express (or Fastify) | Lightweight; easy webhook endpoint |
| Database | PostgreSQL | Subscriber list, status history, tokens |
| Push | Web Push (VAPID) | No third-party service required |
| Real-time | WebSockets (Socket.io) or SSE | Powers the live status page |
| Auth | Rock RMS REST API | Validate credentials server-side |
| Hosting | Single VPS or existing internal server | Low traffic; no need for cloud scale |
| Stream Deck | Bitfocus Companion HTTP action | Maps button → POST /api/trigger |
| *Stretch* | ProPresenter 7 REST/WS API | Auto-trigger or reset on slide events |
| *Stretch* | Planning Center Online REST API | Seed service windows from plan times |
