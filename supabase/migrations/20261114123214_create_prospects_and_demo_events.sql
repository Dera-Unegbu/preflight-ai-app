/*
# PreFlight AI — prospects and demo telemetry

1. New Tables
- `prospects`: one row per generated prospect demo. Holds the prospect's
  domain, display name, detected industry, selected channels, extracted brand
  assets (colors, logo, tagline) and the full generated `report` (top-10
  automation workflows, friction audit, grounded policy chunks, mock API tools,
  ROI defaults) as JSONB. `slug` is the unique URL-friendly identifier used by
  shareable microsite links.
- `demo_events`: append-only telemetry for shareable demo links. Each row is an
  intent signal: a prospect opened the demo link, sent a sandbox message, asked
  an edge-case question, or ran the ROI model. Linked to `prospects` with a
  foreign key.

2. Indexes
- `demo_events`: index on (prospect_id, created_at) for per-prospect feeds.

3. Security
- Enable RLS on both tables.
- This is an internal pre-sales tool with intentionally shareable demo links and
  no sign-in screen, so grants and policies target `anon` + `authenticated`.
- `prospects`: readable and insertable (generating a demo persists it); updates
  and deletes are not exposed.
- `demo_events`: insert-only for telemetry from the microsite; readable so the
  dashboard can show engagement counts; nothing is updated or deleted.
*/

CREATE TABLE IF NOT EXISTS prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  domain text NOT NULL,
  name text NOT NULL,
  industry text NOT NULL,
  channels jsonb NOT NULL DEFAULT '[]'::jsonb,
  brand jsonb NOT NULL DEFAULT '{}'::jsonb,
  report jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS demo_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS demo_events_prospect_idx
  ON demo_events (prospect_id, created_at);

ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON prospects TO anon, authenticated;
GRANT SELECT, INSERT ON demo_events TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_prospects" ON prospects;
CREATE POLICY "anon_select_prospects" ON prospects
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_prospects" ON prospects;
CREATE POLICY "anon_insert_prospects" ON prospects
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_select_demo_events" ON demo_events;
CREATE POLICY "anon_select_demo_events" ON demo_events
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_demo_events" ON demo_events;
CREATE POLICY "anon_insert_demo_events" ON demo_events
  FOR INSERT TO anon, authenticated WITH CHECK (true);
