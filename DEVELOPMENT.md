# Development

Use Node.js 24 and npm ci. npm start and npm run dev start the same disposable loopback memory demonstration; they are not production authentication. No environment file is automatically loaded.

## Source map

- app-next/: browser interface, Settings, IndexedDB snapshots/drafts/outbox, public offline shell.
- server/next/: explicit asset routing, account adapters, owned revisions and generation services.
- data/reference-library.json: sole built-in vocabulary source; IDs are stable compatibility keys.
- js/reference-library-pdf.js, js/booklet-imposer.js and js/lib/: shared printing code.
- server/services/: four retained generation helpers; clients must be explicitly injected.
- tests/next/: fictional fixtures, unit checks, browser journeys and guarded disposable database harnesses.

Preserve complete extensible envelopes, local-first saves, account isolation, ownership checks, outbox retries and confirmed restores. Keep API responses outside public caches. Bump the offline shell cache when changing cached assets. Legacy format strings remain for import/export compatibility; they are not references to a private repository.

## Optional PostgreSQL tests

npm run test:integration requires a separately created empty, disposable PostgreSQL database on loopback, named cn_next_disposable_<suffix>. Set NEXT_TEST_DATABASE_URL using a dedicated non-superuser, non-BYPASSRLS role with credentials. DATABASE_URL must be unset. The harness verifies the actual database, host and role before schema work. Never supply any populated or live database. No database engine or credentials are bundled. npm run next:db and npm run test:next:frontend:db require the same deliberate configuration. Integration tests use generated fictional records and temporary schemas.

## Independently operated server

npm run start:server selects the import-inert beta assembly, not the demo. Operators must review its small capped-account design before use. There is no automatic provisioning or deployment configuration in this repository.

Explicitly set matching BETA_PROJECT_ID/OPERATOR_PROJECT_ID, BETA_ENVIRONMENT_ID/OPERATOR_ENVIRONMENT_ID and BETA_SERVICE_ID/OPERATOR_SERVICE_ID to your own installation identities; BETA_ORIGIN to your exact HTTPS origin without a trailing slash; DATABASE_URL to a dedicated empty database; BETA_SESSION_SECRET to a random secret of at least 32 characters; and BETA_OWNER_INVITE to 32 random bytes encoded base64url (43 characters). Generate secrets locally with Node’s crypto.randomBytes. Never use documentation examples as secrets. Optional OPENROUTER_API_KEY belongs to the operator and can incur charges. PORT defaults to 8080. The assembly assumes one trusted reverse-proxy hop and secure cookies; review topology before deployment.

First explicit server startup creates a schema only in an empty unmarked database, records the supplied installation identities, and creates a one-time organiser invitation. Later starts must match the marker and validate dependencies. Refusal of a populated unmarked database is intentional. The owner opens /join.html#token=<their invitation token>; tokens are private credentials, not issue-report material. Review tests and operator-specific policies before running a hosted service. Account support, backup retention, secrets and privacy wording are the operator’s responsibility. This repository does not include private deployment identities or operational recovery procedures.

## Changes and verification

npm test runs all retained units. npm run test:frontend owns its memory-server lifecycle. Direct Playwright selects the same retained frontend suite. Test outputs are ignored. Test fixtures are invented and are not imported user records. Changes to print code require layout checks and visual inspection of a dense Communication book and imposed booklet. Automated viewport checks do not establish physical iPhone/Safari acceptance. See VERIFICATION.md for candidate evidence and limits.

The memory browser runner starts a fresh fictional server per specification file and preserves per-file diagnostics. Supply explicit .spec.js filenames for a subset; ordinary Playwright flags are forwarded. For direct Playwright debugging, run one specification at a time because its single server retains fictional changes across files.
