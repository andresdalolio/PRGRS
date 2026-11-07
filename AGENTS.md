# PRGRS engineering guidance

Read `docs/product/PRGRS_PRODUCT_SPEC.md`, `PRGRS_BRAND.md`, and `PRGRS_REFERENCES.md` before making product decisions. These are authoritative, not optional. Preserve the four approved brand lines exactly. Build original UI; TrueCoach is functional inspiration only.

- Keep MVP limited to programming, training, results, history, progress, auth and offline sync. No nutrition, messaging, payments, social, wearables or in-app AI generation.
- Accounts may have both athlete and coach capabilities. Enforce access in Supabase RLS and RPCs, never just UI.
- A finished session is distinct from exercise completion. Finishing 9/10 MUST remain finished at 90%. Instruction-only entries never count.
- Store session prescription snapshots separately from reusable templates. Template edits must never rewrite athlete history. Exercise history uses stable IDs; browser updates must not change exercise keys or ownership.
- Removing a program deletes its templates and all assignments atomically. Preserve detached session snapshots and sync receipts; withdraw only unstarted, never-synced sessions from today onward in each athlete's timezone. Pending offline logs must still sync after removal.
- Workout edits must atomically persist in IndexedDB with their outbox mutation. Preserve unsynced edits on reload, retries, conflicts and authentication expiry. Server acknowledgements are idempotent. Never silently discard local edits. Conflict choices must match the reviewed local version; explicit discard must reject newly queued work.
- Metrics aggregate numerators and denominators; adherence excludes future sessions and rest. Use athlete timezone. Empty denominator is N/A.
- No service-role/secret keys in browser code. Never commit credentials. No public deploy, production reset or external account changes without explicit authorization.
- Keep light/dark themes, keyboard access, touch targets and safe areas working.

Commands: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run db:test`, `npm run test:e2e`, `npm run build`, `npm run format:check`.
Use `npm run test:integration` for opt-in real local Supabase Auth/PostgREST verification (loopback + PRGRS Docker stack only). Browser test API uses port 54331 to avoid the local Supabase port 54321. Supabase CLI v3 defaults to local; hosted migration commands must explicitly use `--remote`. Build-generated release IDs isolate offline-shell caches; do not force worker activation during a workout. Use `src/lib/observability.ts` for sanitized error categories, never raw tokens or training logs.
Run `npm run db:types` after SQL changes and `npm run schema:generate` after import-format changes. Add meaningful regression coverage for changed invariants. See `docs/ARCHITECTURE.md` and `docs/SETUP_AND_CONFIGURATION.md` for design and setup. Record unverified external behavior honestly. Maintain this file when conventions change.

Hosted Supabase access on the development Mac must work with the VPN enabled. Read the “Supabase access with the VPN enabled” section in `docs/SETUP_AND_CONFIGURATION.md` before recommending hosted commands. `NODE_USE_SYSTEM_CA=1` fixed the CLI's Management API transport error in a read-only check; use system certificate trust and relink for IPv4 pooler discovery. Do not assume IPv6 works or disable TLS verification. Hosted pushes still require explicit authorization; distinguish a verified connection check from an applied migration.
