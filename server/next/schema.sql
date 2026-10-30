-- Prepared schema only: not registered with the legacy migration runner.
-- Apply only after the shared database backup/restoration and compatibility review.
-- Existing legacy tables and owned source envelopes are not transformed here.
BEGIN;
CREATE TABLE IF NOT EXISTS next_workspaces (
    id text PRIMARY KEY,
    owner_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    state jsonb NOT NULL,
    CHECK (jsonb_typeof(state) = 'object'),
    CHECK (state->>'id' IS NOT NULL AND state->>'id' = id),
    CHECK (state->>'owner' IS NOT NULL AND state->>'owner' = owner_id::text)
);
COMMIT;
