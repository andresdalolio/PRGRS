# Testing and verification

Run from the repository with Node 22.12+ (24 recommended) and `npm ci`.

## Automated checks

- `npm run lint`: Next.js/React hooks/TypeScript ESLint.
- `npm run typecheck`: strict TypeScript for app and tests.
- `npm test`: Vitest with fake IndexedDB and light/dark semantic-token contrast checks. Covers weighted progress, adherence, empty denominators, timezone dates, future-not-missed semantics, safe URLs, valid/malformed/ambiguous JSON, ordering, instruction exclusion, durable local check/uncheck/results/finalization, atomic outbox writes, safe logout/reconciliation races, replay after lost acknowledgement, per-session ordering, conflict retention/rebase, synchronization serialization, reviewed discard, stale conflict rejection, stable exercise history isolation, and optional workout details.
- `npm run db:test`: boots disposable PGlite PostgreSQL, creates a minimal `auth.users`/`auth.uid()` test shim, applies all actual migrations, and executes RPCs as the non-superuser `authenticated` role. Tests dual capability, role escalation denial, cross-user read/write isolation, anonymous denial, server input validation, duplicate import/assignment, idempotent acknowledgements, explicit version conflicts, exact 9/10 partial finish, reopening, template snapshot integrity, athlete consent/revocation, immutable exercise keys/ownership, and workout-detail snapshots across template edits. This is an actual SQL/RLS test, not string matching SQL or a JavaScript database mock.
- `npx playwright install chromium webkit` then `npm run test:e2e`: builds/runs the production application on port 3100 with a disposable test API on port 54321 (both ports must be free) with test-only configuration. Browser tests drive sign-in → JSON validation/preview/confirmation → assignment → athlete workout → offline edits → 90% finish → offline reload → reconnect → PostgreSQL assertions. Also weighted multi-workout day summaries, future adherence exclusion, populated exercise history, calendar views, grouping, external references, history modal, persisted dark theme, axe WCAG scans of light/dark dashboards and workout details, screenshots, authentication/coach-editor/profile axe checks, failed remote-read status, explicit offline discard/sign-out, keyboard skip navigation, import error states, and 320/430/768/1024px overflow checks. Projects: desktop Chromium and iPhone-sized WebKit.
- `npm run db:types`: regenerates typed tables, relationships and RPC signatures from every migration using disposable PostgreSQL.
- `npm run build`: production compilation and Next.js type checking; does not require Supabase credentials.
- `npm run format:check`: Prettier. SQL/TOML are maintained manually.
- `npm audit`: dependency vulnerability audit; the targeted minimatch override supplies a patched dev dependency without downgrading Next.js. Re-evaluate the override when upstream TypeScript ESLint updates its range.

The browser test local HTTP server is **only** in `tests/e2e/backend.ts`. It simulates Auth HTTP delivery/tokens and translates the required PostgREST requests into real SQL against the actual migrations, with RLS active. No production runtime imports it. Therefore browser tests verify UI, local storage, service worker, SQL data flow and policies, but **not hosted Supabase Auth, real PostgREST, mail delivery, network infrastructure or deployment**. Test configuration uses a loopback Supabase URL; no real account is needed. Screenshots and traces live in ignored `test-results` / `playwright-report`.

## Full Supabase integration

The running local Docker stack was rechecked on 2026-11-07 with Docker 29.9.2 and Supabase CLI 3.0.0. It initially had only the first migration. `npx supabase migration up` applied both pending additive migrations to `127.0.0.1:54322`, without a reset or hosted changes. `npx supabase test db --network-id supabase_network_PRGRS` then passed all 8 pgTAP checks against real local Supabase PostgreSQL.

The explicit network flag was needed because the default pgTAP runner could not resolve `db`; the running database has that alias on `supabase_network_PRGRS`. Use the network attached to your local database container if its name differs. Docker socket access may require execution outside an agent sandbox.

For a new disposable local stack, start Supabase and apply migrations before running tests. For an existing stack, use `npx supabase migration up` to apply pending migrations without resetting data. Real Auth/PostgREST workflows, hosted configuration and the two-real-account connectivity checks in [setup](SETUP_AND_CONFIGURATION.md) still require separate verification. Passing these pgTAP schema/permission checks does not establish those broader integrations. PGlite's auth shim also remains distinct from GoTrue/PostgREST integration.

## Device acceptance checklist

Before a production launch, on physical iOS Safari + Add to Home Screen, Android Chrome + Install, and a desktop browser:

1. Confirm manifest icons, standalone launch, safe areas, light/dark/system preference and readable gym controls.
2. Confirm focus order, dialog Escape/close, keyboard completion, labels and zoom readability. Check VoiceOver/TalkBack in workout cards.
3. Open a real assigned workout while connected. Wait for service worker activation. Toggle airplane mode, record load/notes, finish partially, force-close the app, reopen offline.
4. Confirm local edits/finalization/counts persist; reconnect and inspect server results and receipt IDs. Repeat a request after a network interruption.
5. Create simultaneous edits on two devices; verify explicit conflict comparison and both resolution choices.
6. Refresh expired authentication with pending edits. Attempt an account switch. Neither may silently discard another account's outbox.
7. Verify signing out clears private cached records. Never clear browser/OS storage while unsynced data is needed.
8. Verify videos open externally and their lack of offline playback is understandable.

WebKit automation checks the browser engine/mobile viewport; it cannot validate actual iOS installation, home-screen process lifecycle, storage eviction or device-specific OS behavior. Those remain manual checks.
