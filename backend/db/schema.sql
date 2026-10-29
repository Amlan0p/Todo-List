-- PostgreSQL schema for the To-Do app.
-- Safe to run many times: every statement uses IF NOT EXISTS and nothing is dropped.

CREATE TABLE IF NOT EXISTS users (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          VARCHAR(100) NOT NULL CHECK (length(btrim(name)) > 0),
  email         VARCHAR(254) NOT NULL,
  password_hash TEXT         NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- One account per email, case-insensitive. This is what prevents duplicate accounts.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key ON users (lower(email));

CREATE TABLE IF NOT EXISTS todos (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Every task belongs to exactly one user. Deleting a user deletes their tasks.
  user_id     BIGINT        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title       VARCHAR(200)  NOT NULL CHECK (length(btrim(title)) > 0),
  description VARCHAR(2000) NOT NULL DEFAULT '',
  status      VARCHAR(20)   NOT NULL DEFAULT 'Pending'
              CHECK (status IN ('Pending', 'Completed', 'Expired')),
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- "Get all todos for this user, newest first" is the most common query.
CREATE INDEX IF NOT EXISTS todos_user_id_created_at_idx ON todos (user_id, created_at DESC);
