CREATE TABLE IF NOT EXISTS folio_users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  recovery_hash TEXT NOT NULL,
  session_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS folio_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES folio_users (id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS folio_sessions_user_id_idx ON folio_sessions (user_id);
CREATE INDEX IF NOT EXISTS folio_sessions_expires_at_idx ON folio_sessions (expires_at);

CREATE TABLE IF NOT EXISTS folio_auth_limits (
  "key" TEXT PRIMARY KEY NOT NULL,
  count INTEGER NOT NULL,
  expires_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS folio_auth_limits_expires_at_idx ON folio_auth_limits (expires_at);
