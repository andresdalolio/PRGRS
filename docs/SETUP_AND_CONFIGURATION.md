# Setup and configuration

Use this guide to connect PRGRS and record your first workout. No knowledge of internal architecture is required.

## 1. Automatically completed in this repository

- Next.js application, installable PWA assets, light/dark themes, athlete screens and coach studio.
- Supabase client authentication and a server-authenticated `/api/me` endpoint.
- Transactional SQL schema, RLS, constrained permissions, signup bootstrap, program import/assignment and safe log-sync functions.
- Durable offline database/outbox and conflict-review controls.
- Public environment template, valid import example, downloadable schema, tests and setup documentation.
- Build-time public-key checks, per-build offline-shell caches, sanitized error hooks and a GitHub verification workflow (no deployment job).
- No cloud account, Supabase project, real credentials, hosted database or public deployment was created.

Without credentials, `npm run dev` still runs and displays connection instructions. Training/auth screens become usable once the following setup is complete. There is no production mock database.

## 2. Manual setup required

### A. Install and start the application

Install Node.js **22.12+**, preferably Node 24, then run from the repository:

```sh
npm ci
cp .env.example .env.local
```

Do not commit `.env.local`. It is ignored by Git.

### B. Create/connect Supabase

1. Create a dedicated development project in the [Supabase dashboard](https://supabase.com/dashboard). Choose your region and save its database password securely.
2. Use the project's **Connect** dialog or project API settings to copy the project URL and **publishable** API key. Current Supabase keys use the `sb_publishable_...` form. Older projects/local stacks may expose a legacy `anon` key; it is also a public client key supported by Supabase JS and can be used as the value of our `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` variable. See [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).
3. Put the values into `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
```

These two values are intentionally public. Do **not** use `sb_secret_...`, `service_role`, the database password, or a personal access token in either variable. This app needs no privileged browser key.

Verify: restart the app and confirm the sign-in form appears. Malformed origins and non-public keys fail configuration without echoing their values. Unconfigured local builds can show setup guidance; Vercel builds require both valid public values. No server secret is required by the application. `NEXT_PUBLIC_RELEASE_ID` is generated automatically for service-worker versioning; do not set it manually. Environment files are ignored except the placeholder-only `.env.example`.

### C. Apply migrations

The repository supplies `supabase/config.toml` and a lockfile-pinned **v3** CLI. Use the repository CLI rather than an unrelated global version:

On the current development Mac, first follow [Supabase access with the VPN enabled](#supabase-access-with-the-vpn-enabled): the CLI needs the system certificate store, and the database needs the IPv4 pooler. Set `NODE_USE_SYSTEM_CA=1` in the terminal before running hosted commands.

```sh
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase migration list --remote
npx supabase db push --remote --dry-run --skip-vault
npx supabase db push --remote --skip-vault
```

Review the printed target project and dry-run before pushing. CLI v3 defaults to **local**; hosted operations require `--remote` and confirmation. `--skip-vault` keeps this migration procedure from also changing Vault configuration. See the [official v3 migration changes](https://supabase.com/changelog/supabase-cli-v3). Use a narrowly scoped CLI token where practical; never put it in `NEXT_PUBLIC_*` or source control.

Apply every repository migration, including exercise permissions, workout details, RLS identity optimization and program removal, before using this version. The initial migration targets a new dedicated project. Migration history supplies repeatability: preserve existing filenames and never reapply CREATE statements manually. Do not mix SQL Editor application and CLI migrations without reconciling history.

Verify: rerun `npx supabase migration list --remote`; every repository migration should be recorded and the push dry-run should be empty. Run `npx supabase db advisors --remote --type all --level warn`, then the real-account RLS checks below. Administrative SQL alone cannot demonstrate RLS enforcement.

For production, first verify a recent backup/PITR restore point in the dashboard and rehearse restoration to a separate project. Record the application commit and migration versions. Review expected locks and apply in a quiet window. All current migrations are transactional; a failed transaction rolls back its changes. Diagnose failure before retrying; never repair history to hide a failure. Retain additive columns/policies when rolling back the app; use a reviewed forward migration for database corrections. Restoring a backup can lose subsequent training and requires separate authorization and a recovery plan for pending device edits. Never casually run reset, drop, migration repair, or a destructive down migration against live data.

### D. Configure email/password authentication

In Supabase Authentication settings:

- Enable the email provider and allow signups if you want self-registration.
- Keep email confirmation enabled for a hosted project.
- Set Site URL to `http://localhost:3000` for local development.
- Allow redirect URL `http://localhost:3000` (and the equivalent trailing-slash origin if needed by your provider settings).
- When you later choose a production domain, add that exact HTTPS origin and change Site URL to it. The app uses `location.origin` as the signup confirmation destination; do not invent an `/auth/callback` route.
- For a production launch, configure your own SMTP delivery rather than assuming the development email quota is sufficient.
- Set a minimum password length of at least 8 to match the UI, review Auth rate limits, and disable anonymous signup for this application.

See [Supabase redirect URL configuration](https://supabase.com/docs/guides/auth/redirect-urls). Never put production signup redirects on a broad wildcard domain.

Verify: request a fresh signup confirmation, open it on the intended origin, sign in, reload and sign out. Test expired authentication with pending edits and use Profile → Sign in again to refresh authentication. Pending device work must survive. Hosted mail delivery and domain configuration are operator checks, even when local Auth tests pass.

### E. Start, sign up and grant your initial coach capability

```sh
npm run dev
```

Open <http://localhost:3000>. Create an account, confirm its email, then sign in. Signup automatically creates a profile and athlete capability. Open Profile and set your name and **training timezone**; signup initializes the browser-detected IANA zone when valid, falling back to UTC.

To use the same account as a coach, find your user UUID in Supabase Authentication → Users (or your PRGRS Profile). As the trusted project owner, run this SQL in the development project's SQL Editor, replacing the placeholder with your actual UUID:

```sql
insert into public.user_roles (user_id, role)
values ('YOUR_AUTH_USER_UUID'::uuid, 'coach')
on conflict do nothing;
```

Then reload PRGRS or sign in again. The account now has **athlete + coach** capabilities and Coach studio appears in the desktop sidebar/mobile navigation menu. Signup metadata cannot grant this role. Never expose an administrative key to accomplish this in the browser.

### F. Import and assign your first program

1. Open Coach studio → Import JSON → Load example, or upload `docs/examples/foundation.json`.
2. Validate & preview. Read the exercises, blocks and timing.
3. Confirm import & save. Identical imports are rejected to prevent accidental duplicates.
4. Choose Assign program. Select yourself, choose the date corresponding to **Day 1**, and confirm.
5. Home and Workouts now show stored scheduled workouts. Open one, check exercises, record load/notes, and finish whenever ready.
6. A finished session keeps its real completion percentage. Reopen session to deliberately edit it.

For another athlete: ask them to create an account and share their Profile athlete ID. Request coaching access in Coach studio → Athletes. They accept in their own Profile. Only then can you assign/view their training. They can revoke access later.

## 3. Verify your setup

### Connectivity and authentication

- Sign in and reload; your name/capabilities should persist.
- Open Coach studio and load the library. Network requests to your Supabase project should return authorized responses rather than permission errors.
- In your browser's developer console while signed in, you may obtain a session through the Supabase SDK for inspection; never paste a token into shared logs. `/api/me` requires `Authorization: Bearer YOUR_CURRENT_ACCESS_TOKEN` and returns ID/roles only after server-side Auth validation.
- Without a bearer token `/api/me` returns 401 when configured (503 if configuration is missing).
- If signup succeeds but Profile is absent, check that migrations were applied **before** creating the account. See troubleshooting below.

### RLS

Run `npm run db:test` for the automated PostgreSQL access tests. Against your development Supabase project, also use two real test accounts:

1. Assign training to account A and sign in as unrelated account B.
2. Using B's JWT and the public key, query A's `workout_sessions`, `exercise_results`, `programs` and `sync_receipts`. Expect no unauthorized rows.
3. Invoke `apply_session_mutation` on A's session as B. Expect an authorization error.
4. Attempt to insert/update `user_roles` as either browser user. Expect permission denied.
5. Test the accepted coach relationship and then revoke it; online coach reads must lose access.

The SQL Editor runs with administrative access and is **not** a valid RLS test by itself. `supabase/tests/security.sql` supplies pgTAP schema checks for a local stack. Our embedded database harness supplies real non-superuser RLS/RPC coverage using a test `auth.uid()` shim; it does not verify your project's API settings.

### Offline logging and synchronization

Use a **production build** on localhost (or an explicitly authorized HTTPS deployment) because development does not install the service worker:

```sh
npm run build
npm start
```

1. Sign in, assign/open a workout while connected, and wait for the service worker to activate. Browser developer tools → Application/Storage → Service Workers should show it active. Open the app again if it is waiting for a previous version to close.
2. Disable network using browser tools. Check/uncheck movements, enter actual load/notes, finish at partial completion.
3. Reload while still offline. Confirm entries, text, finished state and percentage survived.
4. Reconnect. Wait for All changes saved. Verify results/session rows in Supabase.
5. On a second browser/device, reload and confirm the same results. Server `sync_receipts` should contain a single record per mutation ID even after retries.
6. Edit the same session on two devices to test a conflict. Profile must offer explicit comparison/resolution; export pending edits if desired.

For an installed iPhone PWA, also force-close/reopen offline. Desktop/mobile browser automation does not substitute for this physical-device test. External exercise videos require internet.

## 4. Optional setup

### Local Supabase

Install a Docker-compatible runtime (Docker Desktop, OrbStack or equivalent). From this repository:

```sh
npx supabase start
npx supabase migration up
npx supabase status
npm run test:integration
```

Copy the local API URL and local public/anon key from status into `.env.local`, then restart Next. Status also prints privileged local values: do not share its full output. Local Studio defaults to <http://localhost:54323>; mail capture defaults to <http://localhost:54324>. Status output is authoritative. Local email does not require confirmation; hosted settings should. There is deliberately no seed data or automatic coach promotion.

`npm run test:integration` only accepts loopback port 54321 and the local `PRGRS` Docker stack. It runs real signup, password sign-in, provisioning, import/assignment, partial finish, replay, cross-user RLS and coaching revocation checks. It creates random test accounts and removes only their records afterward. Local administrative credentials stay inside the Node test process and never enter the application or browser bundle. A terminated test may require inspecting and removing its `prgrs-release-*` test accounts; never reset unrelated local data to clean them up.

`npx supabase test db --network-id supabase_network_PRGRS` runs rollback-only pgTAP checks. `npm run db:test` works without Docker using PGlite. See [current verification evidence](PRODUCTION_READINESS.md). Local configuration changes take effect on the next local stack restart; no hosted configuration is changed by editing this file.

### Automated checks

```sh
npm run lint
npm run typecheck
npm test
npm run db:test
npx playwright install chromium webkit
npm run test:e2e
npm run build
npm run format:check
```

Playwright builds a separate local instance with test-only public configuration. Its HTTP adapter exists only in the tests and executes our actual migrations/RLS in PostgreSQL. It never requires a hosted project and cannot send real confirmation mail. See [testing](TESTING.md).

### Prepare Vercel, without deploying

When deployment is authorized, configure:

| Setting          | Value                                                |
| ---------------- | ---------------------------------------------------- |
| Framework / root | Next.js / repository root                            |
| Node runtime     | 24.x (`.nvmrc` supplies the local default)           |
| Install / build  | `npm ci` / `npm run build`                           |
| Output directory | Next.js default; no static export or custom override |
| Environment      | The two public Supabase values from section B        |

Keep preview and production environments separate. Use a development Supabase project for previews; no broad production redirect wildcard. `NEXT_PUBLIC_*` values are baked into the build, so changes require rebuilding. Review automatic Git deployment settings before connecting a repository: this repository's workflow only verifies code and does not authorize publication. No Vercel project or deployment was created here.

Apply reviewed migrations before serving the corresponding app. The public shell is statically rendered; `/api/me` runs as a server route with `no-store` responses. Do not add a rewrite that redirects API/static/service-worker requests to HTML. Hash navigation needs no custom rewrite. Preserve Next's immutable asset headers and `/sw.js` no-cache headers. Keep old deployment assets available during rollout and rollback; do not force-reload active workout windows. No custom CDN override or `vercel.json` is needed for standard Vercel Next.js hosting.

Verify after an authorized deployment: HTTPS origin, expected project requests, production confirmation redirect, `/api/me` returning 401 without a token and 200 with a real token, security headers, service-worker installation, offline reload, and the [release gate](PRODUCTION_READINESS.md). A build alone does not verify Vercel or hosted Supabase behavior.

### Optional monitoring and domains

Use provider runtime logs and browser `[PRGRS]` events. `src/lib/observability.ts` records only a fixed context/category, rate limited per category; it excludes messages, stacks, workout payloads, IDs and tokens. A future monitoring adapter can subscribe to browser `prgrs:error` events or wrap the server hook. Never attach SDK request headers or training data by default. No vendor is required. For a custom domain, update the exact Supabase Site URL/allowlist and repeat confirmation/PWA checks. Monitor failed sync/auth rates and database latency before increasing the athlete population.

## 5. Actions requiring explicit authorization

Creating/modifying external accounts or cloud projects on your behalf, connecting a production database, applying production migrations, public deployment, changing production auth settings, deleting/resetting data, and configuring paid services all require your explicit authorization. Instructions above let you perform the manual setup yourself; the implementation agent has not performed those external actions.

## Troubleshooting

### Supabase access with the VPN enabled

**Observed on 2026-11-07:** the development Mac must keep its VPN enabled. Hosted database commands reported `IPv6 is not supported on your current network`; linking then failed with `HttpClientError: Transport error` when requesting `https://api.supabase.com/v1/projects/...`.

These failures involve different connections. The database needs an IPv4 route through the shared pooler. Linking first needs a working HTTPS connection to the Management API to discover that pooler. The transport error alone does not identify a VPN, DNS or certificate fault. See [Supabase's transport-error troubleshooting](https://supabase.com/kb/troubleshooting/supabase-cli-transport-error-antivirus-firewall-tls-interception).

**Verified workaround for the Management API:** unauthenticated curl and Node HTTPS requests returned HTTP 401 (expected without a token). With the existing CLI login, `npx supabase projects list` failed with the transport error, while the same read-only command with `NODE_USE_SYSTEM_CA=1` succeeded. This supports a difference in certificate trust; the VPN's exact interception behavior was not independently confirmed. The setting adds system-trusted certificate authorities and keeps TLS verification enabled. See [Bun's environment-variable documentation](https://bun.sh/docs/runtime/environment-variables) and [Node's enterprise network guidance](https://nodejs.org/en/learn/http/enterprise-network-configuration).

In the same terminal, run:

```sh
export NODE_USE_SYSTEM_CA=1
npx supabase projects list
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase migration list --remote
npx supabase db push --remote --dry-run --skip-vault
```

Use the project ref belonging to the app's `NEXT_PUBLIC_SUPABASE_URL`. Link without `--skip-pooler` so the CLI can save the IPv4 pooler configuration. Review the target and pending migrations; then, when ready to apply them:

```sh
npx supabase db push --remote --skip-vault
npx supabase migration list --remote
```

The export lasts for this terminal session. Repeat it in a new terminal or use a command-scoped prefix such as `NODE_USE_SYSTEM_CA=1 npx supabase projects list`. Putting the value only in Next.js's `.env.local` does not export it into your terminal. Do not use `NODE_TLS_REJECT_UNAUTHORIZED=0`, turn off certificate verification, or disconnect the required VPN as the default fix. If system trust is insufficient, obtain the approved CA bundle from IT and configure `NODE_EXTRA_CA_CERTS` for the CLI process.

**If linking still fails:** use Dashboard → Connect → **Session pooler**, which supports IPv4 on port **5432**. Copy its exact host; do not guess a cluster from the region. Use the pooler username `postgres.YOUR_PROJECT_REF`. See [Supabase connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres). In CLI v3, an explicit database URI goes in `--remote=...`; older examples using `--db-url` do not match this repository's CLI.

Prepare the session-pooler URI privately with the actual database password, percent-encoding any special characters in the password. Keep it out of source control, chat and shell history. This zsh prompt reads it without echoing it or putting its literal value in command history:

```sh
read -rs 'PRGRS_DB_URL?Paste session-pooler URI (hidden): '
print
npx supabase migration list --remote="$PRGRS_DB_URL"
npx supabase db push --remote="$PRGRS_DB_URL" --dry-run --skip-vault
```

After reviewing that target and dry-run:

```sh
npx supabase db push --remote="$PRGRS_DB_URL" --skip-vault
npx supabase migration list --remote="$PRGRS_DB_URL"
unset PRGRS_DB_URL
```

This avoids linked-project connection discovery, but still requires network access to the pooler. If that port is blocked, ask IT to allow the project pooler host on TCP 5432. `--dns-resolver https` is a separate option for confirmed DNS failures; it does not supply missing CA trust or IPv6 connectivity. Avoid sharing raw `--debug` output or connection URIs, which may contain credentials.

**Verification boundary:** the system-CA workaround was verified with a read-only project lookup using the installed CLI 3.0.0. Relinking, a hosted migration push and the explicit pooler-URI fallback were not performed during this troubleshooting. After applying migrations, confirm remote history matches local files, then retry the app action. For `public.remove_program(p_program)` missing from the schema cache, confirm `20261107223229_remove_program.sql` appears in remote migration history before investigating a stale API cache.

### Other symptoms

| Symptom                              | Check/fix                                                                                                                                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Setup screen remains                 | Both public values must be present in `.env.local`; restart `npm run dev`. Replace placeholders.                                                                                                                   |
| Invalid API key                      | Use publishable/legacy anon, not secret/service-role; URL and key must belong to the same project.                                                                                                                 |
| Confirmation link goes elsewhere     | Set Site URL and allowed redirect origin correctly; request a fresh confirmation.                                                                                                                                  |
| Signup user has no profile           | Apply migrations before signup. For existing users, as administrator insert missing profile rows from `auth.users`, then athlete roles; verify affected IDs before making changes. Do not grant coach to everyone. |
| Coach studio absent                  | Grant coach role for the correct UUID in SQL, then reload; client cannot self-grant.                                                                                                                               |
| Permission denied / function missing | Apply every migration and inspect grants/RLS; verify the signed-in JWT. Do not fix by disabling RLS.                                                                                                               |
| Duplicate import/assignment          | Open existing program, edit it, or choose a distinct copy name / intended assignment start.                                                                                                                        |
| Workout scheduled on wrong date      | Day 1 is the selected start date. Set Profile timezone. Existing assigned snapshots do not auto-follow template edits.                                                                                             |
| Pending changes persist              | Restore network, refresh authentication using Profile, then Sync now. Export before clearing any browser data.                                                                                                     |
| Conflict error                       | Profile → Review workout conflict → compare both versions → explicitly choose. Local work is retained until then.                                                                                                  |
| Offline reload fails                 | Test a production build; wait for service-worker activation while online. Check browser storage/private-mode restrictions.                                                                                         |
| Stale shell after rebuild            | Close all app tabs/windows so a waiting worker activates. Avoid clearing storage while edits are pending.                                                                                                          |
| Browser test cannot listen or launch | Run outside a restricted execution sandbox; install the listed browsers. No hosted credentials are required.                                                                                                       |
| App data on a shared device          | Sign out once synchronized. Pending edits require sync or export + explicit discard first.                                                                                                                         |

Additional design details: [architecture](ARCHITECTURE.md), [import format](PROGRAM_IMPORT.md).
