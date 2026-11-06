# PRGRS engineering guidance

Read `docs/product/PRGRS_PRODUCT_SPEC.md`, `PRGRS_BRAND.md`, and `PRGRS_REFERENCES.md` before making product decisions. These are authoritative, not optional. Preserve the four approved brand lines exactly. Build original UI; TrueCoach is functional inspiration only.

- Keep MVP limited to programming, training, results, history, progress, auth and offline sync. No nutrition, messaging, payments, social, wearables or in-app AI generation.
- Accounts may have both athlete and coach capabilities. Enforce access in Supabase RLS and RPCs, never just UI.
- A finished session is distinct from exercise completion. Finishing 9/10 MUST remain finished at 90%. Instruction-only entries never count.
- Store session prescription snapshots separately from reusable templates. Template edits must never rewrite athlete history. Exercise history uses stable IDs.
- Workout edits must atomically persist in IndexedDB with their outbox mutation. Preserve unsynced edits on reload, retries, conflicts and authentication expiry. Server acknowledgements are idempotent. Never silently discard local edits.
- Metrics aggregate numerators and denominators; adherence excludes future sessions and rest. Use athlete timezone. Empty denominator is N/A.
- No service-role/secret keys in browser code. Never commit credentials. No public deploy, production reset or external account changes without explicit authorization.
- Keep light/dark themes, keyboard access, touch targets and safe areas working.

Commands: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run db:test`, `npm run test:e2e`, `npm run build`, `npm run format:check`.
Run `npm run db:types` after SQL changes and `npm run schema:generate` after import-format changes. Add meaningful regression coverage for changed invariants. See `docs/ARCHITECTURE.md` and `docs/SETUP_AND_CONFIGURATION.md` for design and setup. Record unverified external behavior honestly. Maintain this file when conventions change.
