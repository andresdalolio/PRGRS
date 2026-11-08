# Testing and verification

Run from the repository with Node 22.12+ (24 recommended) and `npm ci`.

## Automated checks

- `npm run lint`: Next.js/React hooks/TypeScript ESLint.
- `npm run typecheck`: strict TypeScript for app and tests.
- `npm test`: Vitest with fake IndexedDB and light/dark semantic-token contrast checks. Covers weighted progress, adherence, empty denominators, timezone dates, future-not-missed semantics, safe URLs, valid/malformed/ambiguous JSON, ordering, instruction exclusion, durable local check/uncheck/results/finalization, atomic outbox writes, safe logout/reconciliation races, replay after lost acknowledgement, per-session ordering, conflict retention/rebase, synchronization serialization, reviewed discard, stale conflict rejection, stable exercise history isolation, and optional workout details. Production regressions also cover privileged/malformed environment values, stalled network recovery/caller cancellation, sanitized logging, malformed server acknowledgements/snapshots, server bearer validation/no-store responses, isolated worker caches, paired offline HTML/assets, navigation timeout/503 fallback and failed precaching.
- `npm run db:test`: boots disposable PGlite PostgreSQL, creates a minimal `auth.users`/`auth.uid()` test shim, applies all actual migrations, and executes RPCs as the non-superuser `authenticated` role. Tests dual capability, role escalation denial, cross-user read/write isolation, anonymous denial, server input validation, duplicate import/assignment, idempotent acknowledgements, explicit version conflicts, exact 9/10 partial finish, reopening, template snapshot integrity, athlete consent/revocation, immutable exercise keys/ownership, and workout-detail snapshots across template edits. This is an actual SQL/RLS test, not string matching SQL or a JavaScript database mock.
- `npx playwright install chromium webkit` then `npm run test:e2e`: builds/runs the production application on port 3100 with a disposable test API on port **54331** (both ports must be free), separate from local Supabase on 54321. Browser tests drive sign-in → JSON validation/preview/confirmation → assignment → athlete workout → offline edits → 90% finish → offline reload → reconnect → PostgreSQL assertions. Also weighted multi-workout day summaries, future adherence exclusion, populated exercise history, calendar views, grouping, external references, history modal, persisted dark theme, axe WCAG scans of light/dark dashboards and workout details, screenshots, authentication/coach-editor/profile axe checks, failed remote-read status, explicit offline discard/sign-out, keyboard skip navigation, import error states, and 320/430/768/1024px overflow checks. Projects: desktop Chromium and iPhone-sized WebKit.
- `npm run db:types`: regenerates typed tables, relationships and RPC signatures from every migration using disposable PostgreSQL.
- `npm run build`: production compilation and Next.js type checking; does not require Supabase credentials.
- `npm run format:check`: Prettier. SQL/TOML are maintained manually.
- `npm audit`: dependency vulnerability audit; the targeted minimatch override supplies a patched dev dependency without downgrading Next.js. Re-evaluate the override when upstream TypeScript ESLint updates its range.

The browser test local HTTP server is **only** in `tests/e2e/backend.ts`. It simulates Auth HTTP delivery/tokens and translates the required PostgREST requests into real SQL against the actual migrations, with RLS active. No production runtime imports it. Therefore browser tests verify UI, local storage, service worker, SQL data flow and policies, but **not hosted Supabase Auth, real PostgREST, mail delivery, network infrastructure or deployment**. Test configuration uses a loopback Supabase URL; no real account is needed. Screenshots and traces live in ignored `test-results` / `playwright-report`.

## Full Supabase integration

Run `npm run test:integration` with the repository's local Supabase stack running and migrated. This opt-in script only accepts `http://127.0.0.1:54321` and `supabase_db_PRGRS`; it never accepts a hosted target. It captures local CLI credentials in memory, creates two random accounts, and checks real GoTrue signup/password authentication, bootstrap roles, trusted promotion, actual PostgREST import/assignment/finalization/idempotency, cross-user reads across 12 training tables, unauthorized writes, coaching consent/revocation, anonymous denial and device logout. Its `finally` cleanup removes only its accounts/records; no reset is used. If terminated, inspect leftover `prgrs-release-*` local accounts rather than resetting the stack.

On 2026-11-07, all **33 real local Auth/PostgREST assertions** passed and cleanup completed. With `PRGRS_PROFILE_HISTORY=1 npm run test:integration`, a further assertion verifies 85 sessions / 850 entries; the real local RPC took 33 ms and returned 245,248 JSON bytes in one sample (34 assertions total). This does not measure hosted network latency or device rendering. The additive RLS optimization was applied locally without a reset. All **8 pgTAP checks** passed and `npx supabase db advisors --type all --level warn` reported no issues. All four migrations also apply from scratch in the disposable PGlite suite (44 assertions).

Use `npx supabase test db --network-id supabase_network_PRGRS` on this stack: the network flag lets the pgTAP runner resolve its `db` alias. Docker socket access, local listeners and browser launches may require execution outside an agent sandbox. The production browser suite passed all 10 Chromium/WebKit cases in this pass.

For an existing stack, use `npx supabase migration up` to apply pending migrations without resetting data. Local tests do not verify hosted configuration, confirmation mail delivery, external infrastructure or deployment. Repeat the hosted two-account checks in [setup](SETUP_AND_CONFIGURATION.md). The [release gate](PRODUCTION_READINESS.md) records current results and manual checks. GitHub Actions runs the non-Docker regression/build/browser suite on Node 24 and checks generated schema/types for drift; the real-local-stack integration is opt-in.

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

## History, themes and personal feedback

`tests/history-feedback.test.ts` checks meaningful stable-ID history, read-only views, durable atomic result deletion, independent finalization, updated completion metrics, feedback lifecycle, retry and stale conflict/discard protection. `scripts/test-history-feedback.mjs` is included in `npm run db:test`; it checks sparse result persistence, result removal, preserved templates/snapshots, owner isolation, feedback creation/edit/status changes/deletion, version conflicts, receipts and prevention of resurrection.

`tests/e2e/improvements.spec.ts` covers saved dark/light preferences after reload and reopening a page, explicit overrides versus system changes, offline feedback creation/edit/implementation/reopening/deletion, and history deletion through offline/reload/reconnect. Both Chromium and mobile WebKit use the existing disposable PostgreSQL HTTP adapter. They do not verify real hosted Auth, installed iOS PWA process termination, or OS storage eviction. Apply the new migration through the normal release process before using feedback against a hosted backend.

Whole-day deletion coverage includes several workouts on the same date, an unrelated athlete and date, stale reviewed versions, newly added workouts, rollback on failed outbox writes, cancellation, search-hidden workouts, reload and offline reconnection. The updated behavior uses the existing session RPC with the additive delete-workout-sessions migration. Deleted occurrences are absent from Calendar, History, dashboard and metric denominators; server tests check physical removal of session results/entries/blocks, retained templates/exercises, old receipt replay, resurrection rejection and preserved detached history after program removal.

The deletion change was verified in disposable PostgreSQL and the browser HTTP adapter. A local `supabase db advisors --type all --level warn` attempt could not connect because the Docker database at 127.0.0.1:54322 was not running; no advisor result or live Supabase migration is claimed for this change.

History-only deletion regression coverage confirms Calendar has no delete control, an untouched workout remains scheduled when recorded workouts on the same date are removed, and direct RPC deletion of untouched programming is rejected. Apply `20261108004022_protect_unstarted_programming.sql` for the server guard; no hosted migration is implied by the tests.
