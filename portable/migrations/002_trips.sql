CREATE TABLE folio_trips (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES folio_users(id) ON DELETE CASCADE,
  currency TEXT NOT NULL, budget INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX folio_trips_owner ON folio_trips(owner_id);
CREATE TABLE folio_trip_members (
  id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES folio_trips(id) ON DELETE CASCADE,
  name TEXT NOT NULL, user_id TEXT REFERENCES folio_users(id) ON DELETE SET NULL,
  invite_hash TEXT UNIQUE, expires BIGINT, UNIQUE(trip_id,user_id)
);
CREATE INDEX folio_trip_members_user ON folio_trip_members(user_id);
CREATE INDEX folio_trip_members_trip ON folio_trip_members(trip_id);
CREATE TABLE folio_trip_entries (
  id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES folio_trips(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL, payload TEXT NOT NULL, UNIQUE(trip_id,seq)
);
