-- Test-only schema. Never discovered by legacy migrations.
-- Complete JSON envelope contains memberships, immutable revisions/current pointers,
-- retained conflicts, idempotency outcomes, editions and receipt/adoption metadata.
BEGIN;
CREATE TABLE IF NOT EXISTS next_workspaces (
    id text PRIMARY KEY,
    state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object' AND state->>'id' = id)
);
COMMIT;
