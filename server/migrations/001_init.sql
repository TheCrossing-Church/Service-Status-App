-- Service Progress Update Tool — initial schema
-- All timestamps are stored as TIMESTAMPTZ (UTC); convert at the edges using the campus timezone.

BEGIN;

CREATE TABLE campuses (
  id                   SERIAL PRIMARY KEY,
  slug                 TEXT NOT NULL UNIQUE,
  name                 TEXT NOT NULL,
  timezone             TEXT NOT NULL DEFAULT 'America/Chicago',
  service_window_start TIME,
  service_window_end   TIME,
  active               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id             SERIAL PRIMARY KEY,
  username       TEXT NOT NULL UNIQUE,
  email          TEXT UNIQUE,
  display_name   TEXT NOT NULL,
  role           TEXT NOT NULL CHECK (role IN ('admin', 'sender')),
  password_hash  TEXT,           -- local fallback / dev; null when authenticating via Rock
  rock_person_id INTEGER UNIQUE, -- populated when authed against Rock RMS
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Senders may be assigned to one or more campuses; admins typically have all campuses.
CREATE TABLE user_campuses (
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campus_id INTEGER NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, campus_id)
);

CREATE TABLE status_types (
  id              SERIAL PRIMARY KEY,
  campus_id       INTEGER NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  slug            TEXT NOT NULL,
  label           TEXT NOT NULL,
  default_message TEXT,
  color           TEXT,   -- e.g. "#22c55e"
  icon            TEXT,   -- emoji or icon identifier
  sort_order      INTEGER NOT NULL DEFAULT 0,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campus_id, slug)
);

CREATE INDEX idx_status_types_campus_active
  ON status_types(campus_id, active, sort_order);

CREATE TABLE subscriber_groups (
  id          SERIAL PRIMARY KEY,
  campus_id   INTEGER NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  slug        TEXT NOT NULL,
  name        TEXT NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campus_id, slug)
);

CREATE TABLE subscribers (
  id              SERIAL PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  display_name    TEXT NOT NULL,
  rock_person_id  INTEGER UNIQUE,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  unsubscribe_token TEXT NOT NULL UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A subscriber's group memberships are how we route updates: any update for
-- campus X reaches every subscriber with a membership in any group on campus X.
CREATE TABLE subscriber_memberships (
  subscriber_id INTEGER NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  group_id      INTEGER NOT NULL REFERENCES subscriber_groups(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (subscriber_id, group_id)
);

CREATE INDEX idx_subscriber_memberships_group ON subscriber_memberships(group_id);

-- One subscriber can have multiple devices, each with its own push endpoint.
CREATE TABLE push_subscriptions (
  id            SERIAL PRIMARY KEY,
  subscriber_id INTEGER NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  endpoint      TEXT NOT NULL UNIQUE,
  p256dh        TEXT NOT NULL,
  auth          TEXT NOT NULL,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_push_subscriptions_subscriber ON push_subscriptions(subscriber_id);

CREATE TABLE api_tokens (
  id                 SERIAL PRIMARY KEY,
  campus_id          INTEGER NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  label              TEXT NOT NULL,
  token_hash         TEXT NOT NULL UNIQUE, -- bcrypt hash of the raw token
  prefix             TEXT NOT NULL,        -- first 8 chars of raw token, for display
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  last_used_at       TIMESTAMPTZ,
  revoked_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_tokens_campus_active ON api_tokens(campus_id) WHERE revoked_at IS NULL;

CREATE TABLE status_updates (
  id              SERIAL PRIMARY KEY,
  campus_id       INTEGER NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  status_type_id  INTEGER NOT NULL REFERENCES status_types(id) ON DELETE RESTRICT,
  message         TEXT,
  sent_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  api_token_id    INTEGER REFERENCES api_tokens(id) ON DELETE SET NULL,
  sent_via        TEXT NOT NULL CHECK (sent_via IN ('web', 'webhook', 'system')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enables fast "current status per campus" lookups via DISTINCT ON.
CREATE INDEX idx_status_updates_campus_created
  ON status_updates(campus_id, created_at DESC);

-- Session store for connect-pg-simple. Schema matches the package's expected layout.
CREATE TABLE "session" (
  sid    VARCHAR NOT NULL COLLATE "default",
  sess   JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL,
  CONSTRAINT session_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE
) WITH (OIDS=FALSE);

CREATE INDEX "IDX_session_expire" ON "session" (expire);

-- Tracks applied migrations.
CREATE TABLE schema_migrations (
  filename   TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
