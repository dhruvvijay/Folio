CREATE TABLE folio_trip_plans (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES folio_trips(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount INTEGER NOT NULL,
  selected_shares TEXT,
  UNIQUE(trip_id,id)
);
CREATE UNIQUE INDEX folio_one_selected_plan ON folio_trip_plans(trip_id) WHERE selected_shares IS NOT NULL;
CREATE TABLE folio_trip_votes (
  trip_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES folio_users(id) ON DELETE CASCADE,
  PRIMARY KEY(trip_id,user_id),
  FOREIGN KEY(trip_id,plan_id) REFERENCES folio_trip_plans(trip_id,id) ON DELETE CASCADE
);
