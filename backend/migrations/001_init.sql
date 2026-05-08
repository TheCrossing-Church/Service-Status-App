-- Service Progress Update Tool — initial schema (SQLite)
-- Timestamps stored as TEXT in ISO 8601 UTC ("YYYY-MM-DDTHH:MM:SS.sssZ").
-- Booleans stored as INTEGER 0/1 with CHECK constraints.

CREATE TABLE campuses (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  slug                 TEXT NOT NULL UNIQUE,
  name                 TEXT NOT NULL,
  code                 TEXT UNIQUE,                                -- e.g. CFD, FEN, GRT, MID
  timezone             TEXT NOT NULL DEFAULT 'America/Chicago',
  service_window_start TEXT,                                       -- 'HH:MM' (no date component)
  service_window_end   TEXT,
  active               INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  username       TEXT NOT NULL UNIQUE,
  email          TEXT UNIQUE,
  display_name   TEXT NOT NULL,
  role           TEXT NOT NULL CHECK (role IN ('admin', 'sender')),
  password_hash  TEXT,                                             -- local fallback / dev
  rock_person_id INTEGER UNIQUE,
  active         INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE user_campuses (
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campus_id INTEGER NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, campus_id)
);

CREATE TABLE status_types (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  campus_id       INTEGER NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  slug            TEXT NOT NULL,
  label           TEXT NOT NULL,
  default_message TEXT,
  color           TEXT,
  icon            TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  active          INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (campus_id, slug)
);
CREATE INDEX idx_status_types_campus_active
  ON status_types(campus_id, active, sort_order);

CREATE TABLE subscriber_groups (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  campus_id   INTEGER NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  slug        TEXT NOT NULL,
  name        TEXT NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (campus_id, slug)
);

CREATE TABLE subscribers (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  email             TEXT NOT NULL UNIQUE,
  display_name      TEXT NOT NULL,
  rock_person_id    INTEGER UNIQUE,
  active            INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  unsubscribe_token TEXT NOT NULL UNIQUE,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE subscriber_memberships (
  subscriber_id INTEGER NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  group_id      INTEGER NOT NULL REFERENCES subscriber_groups(id) ON DELETE CASCADE,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (subscriber_id, group_id)
);
CREATE INDEX idx_subscriber_memberships_group ON subscriber_memberships(group_id);

CREATE TABLE push_subscriptions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  subscriber_id INTEGER NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  endpoint      TEXT NOT NULL UNIQUE,
  p256dh        TEXT NOT NULL,
  auth          TEXT NOT NULL,
  user_agent    TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_push_subscriptions_subscriber ON push_subscriptions(subscriber_id);

CREATE TABLE api_tokens (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  campus_id          INTEGER NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  label              TEXT NOT NULL,
  token_hash         TEXT NOT NULL UNIQUE,                          -- bcrypt hash
  prefix             TEXT NOT NULL,                                 -- first 8 chars of raw token
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  last_used_at       TEXT,
  revoked_at         TEXT,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_api_tokens_campus_active ON api_tokens(campus_id) WHERE revoked_at IS NULL;

CREATE TABLE status_updates (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  campus_id       INTEGER NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  status_type_id  INTEGER NOT NULL REFERENCES status_types(id),
  message         TEXT,
  sent_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  api_token_id    INTEGER REFERENCES api_tokens(id) ON DELETE SET NULL,
  sent_via        TEXT NOT NULL CHECK (sent_via IN ('web', 'webhook', 'system')),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_status_updates_campus_created
  ON status_updates(campus_id, created_at DESC);

-- schema_migrations is created/managed by the migration runner itself.
