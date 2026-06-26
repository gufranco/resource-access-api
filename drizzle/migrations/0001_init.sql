-- 0001_init.sql
-- Baseline schema: users, resources, resource_shares.
-- Idempotent DDL so the migration is safe to re-run.

CREATE TABLE IF NOT EXISTS users (
  id   bigint PRIMARY KEY,
  name text   NOT NULL,
  role text   NOT NULL CHECK (role IN ('member', 'admin'))
);

CREATE TABLE IF NOT EXISTS resources (
  id         bigint      PRIMARY KEY,
  owner_id   bigint      NOT NULL REFERENCES users(id),
  type       text        NOT NULL CHECK (type IN ('doc', 'sheet', 'slide')),
  status     text        NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  title      text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS resource_shares (
  resource_id bigint NOT NULL REFERENCES resources(id),
  user_id     bigint NOT NULL REFERENCES users(id),
  PRIMARY KEY (resource_id, user_id)
);

-- Baseline FK index for owner lookups.
CREATE INDEX IF NOT EXISTS resources_owner_id_idx ON resources(owner_id);
