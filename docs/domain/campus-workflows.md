# Campus workflows

How the four campuses actually use this tool — who triggers updates,
where the Stream Decks live, who's watching the status page. This is
the part of the system that *isn't* in the code or PRD; it lives in
people's heads and on production booth desks.

## Per-campus reality

For each campus, capture: who's at the production console, what hardware
they're running, who their senders are (humans), and who their
subscribers are likely to be (audiences for the push).

### Chesterfield (CFD)

- [ ] Who's at the production console during a service?
- [ ] Stream Deck location (booth? FOH? video?)
- [ ] Bitfocus Companion host machine (which workstation, IP?)
- [ ] Senders (the humans who'll log in to `/send`):
  - [ ] How many?
  - [ ] What roles? (production lead, FOH, video, kids director, etc.)
- [ ] Subscriber groups currently configured:
  - In-Service Staff & Volunteers (default seed)
  - Hospitality Staff & Volunteers (default seed)
  - Kids Staff & Volunteers (default seed)
- [ ] Do these match what the campus actually wants? Or do they need
  different groups?

### Fenton (FEN)

- [ ] Same fields as above

### Grant's Trail (GRT)

- [ ] Same fields as above

### Mid Rivers (MID)

- [ ] Same fields as above

## Service rhythm

- [ ] Service times per campus, per day-of-week
- [ ] Pre-service prep window (when do production teams arrive?)
- [ ] Multiple services per day per campus (yes/no, count)
- [ ] Multi-campus services or always single-campus?

## Who watches the status page

The PRD distinguishes between staff (push notification) and
audience (live web page). Per campus:

- [ ] Lobby screens running `/?campus={slug}`? (Which TVs, what URLs?)
- [ ] Kids check-in stations watching for delays?
- [ ] Coffee bar / hospitality watching for "Ending Early" cues?
- [ ] Do greeters / parking want push? Web page? Neither?

## What "On Time / Running Late / Ending Early" actually mean

The default labels are PRD-derived. Each campus may use them differently
in practice:

- [ ] **On Time** — is this set explicitly, or assumed unless overridden?
  (Currently the app assumes "no status set" = OK; the campus can
  explicitly set "On Time" to confirm.)
- [ ] **Running Late** — what threshold? 5 min? 10 min? Specific to
  campus or universal?
- [ ] **Ending Early** — what triggers it? Speaker ran short? Kids
  programming wrapping early?
- [ ] Are there campus-specific status types worth seeding? Kids-only?
  Worship-only? "Service Cancelled" / "Service Delayed Indefinitely"?

## Known patterns from prior comm

Before this app, status comms happened in Teams. Documenting the
patterns we're replacing helps future-you decide if a new feature is
worth adding:

- [ ] What channels were the comms posted to?
- [ ] Who posted? Who read?
- [ ] How fast did the message propagate? (3 minutes? 10 minutes? An hour?)
- [ ] What was the failure mode? (Notifications muted? Wrong channel?
  Lost in scroll?)

## Stream Deck button conventions

Each campus's Stream Deck should follow a consistent button layout so
volunteers swapping campuses don't have to re-learn:

- [ ] Recommended button-to-status mapping per Stream Deck profile
- [ ] Naming convention for tokens (e.g. `streamdeck-cfd-booth`,
  `streamdeck-fen-foh`)
- [ ] Color coding: should the Stream Deck buttons match the status
  type colors (green / amber / blue)?

---

*This file is org-specific. Most of it is internal-only and should be
redacted before any broader sharing.*
