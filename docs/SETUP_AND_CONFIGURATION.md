# Setup and configuration

Use this guide to connect PRGRS and record your first workout. No knowledge of internal architecture is required.

## 1. Automatically completed in this repository

- Next.js application, installable PWA assets, light/dark themes, athlete screens and coach studio.
- Supabase client authentication and a server-authenticated `/api/me` endpoint.
- Transactional SQL schema, RLS, constrained permissions, signup bootstrap, program import/assignment and safe log-sync functions.
- Durable offline database/outbox and conflict-review controls.
- Public environment template, valid import example, downloadable schema, tests and setup documentation.
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

### C. Apply migrations

The repository supplies `supabase/config.toml`. Install a current [Supabase CLI](https://supabase.com/docs/guides/local-development). With a global CLI:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push --dry-run
supabase db push
```

Review the target project and dry-run before pushing. Apply all migrations, including the additive exercise-permission and workout-detail migrations, before using this application version. The initial migration is designed for a new dedicated project. `db push` records migration history; do not paste/reapply the initial CREATE statements on each run. The alternative for a new development project is to execute each migration in filename order once through Supabase SQL Editor. Do not mix SQL Editor application and CLI migrations without reconciling migration history.

No database reset is needed. Never run `supabase db reset --linked` on real data.

### D. Configure email/password authentication

In Supabase Authentication settings:

- Enable the email provider and allow signups if you want self-registration.
- Keep email confirmation enabled for a hosted project.
- Set Site URL to `http://localhost:3000` for local development.
- Allow redirect URL `http://localhost:3000` (and the equivalent trailing-slash origin if needed by your provider settings).
- When you later choose a production domain, add that exact HTTPS origin and change Site URL to it. The app uses `location.origin` as the signup confirmation destination; do not invent an `/auth/callback` route.
- For a production launch, configure your own SMTP delivery rather than assuming the development email quota is sufficient.

See [Supabase redirect URL configuration](https://supabase.com/docs/guides/auth/redirect-urls). Never put production signup redirects on a broad wildcard domain.

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

Install the Supabase CLI and a Docker-compatible runtime (Docker Desktop, OrbStack or equivalent). From this repository, with the supplied config:

```sh
supabase start
supabase db reset
supabase status
```

`db reset` is for the **disposable local stack only**: it rebuilds it and applies migrations. Copy the local API URL and local public/anon key from `supabase status` into `.env.local`, then restart Next. Local Studio defaults to <http://localhost:54323>; local mail capture defaults to <http://localhost:54324>. The actual status output is authoritative. The configured local email provider does not require confirmation; hosted settings should require it.

`supabase test db` runs pgTAP schema checks. `npm run db:test` works independently of Docker using PGlite. On 2026-11-07, the running local stack was verified, its two pending additive migrations were applied with `npx supabase migration up`, and all 8 pgTAP checks passed using `npx supabase test db --network-id supabase_network_PRGRS`. The network flag resolves the test runner's `db` hostname on this stack; use your database container's network if named differently. No reset or hosted changes were performed. Auth/PostgREST user workflows still require the connectivity checks above. New CLI versions may change config; compare with the CLI's generated defaults if an option is rejected, keeping our port/auth settings and migrations.

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

The repository is a standard Next.js project; no bespoke Vercel configuration is needed. When you authorize a deployment, choose Next.js, install with `npm ci`, build with `npm run build`, and use Node 24. Add the two public environment variables to the intended environment. `NEXT_PUBLIC_*` values are baked into the build: changing them requires a rebuild. Add your chosen HTTPS origin to Supabase Auth URLs. Apply reviewed migrations before serving the corresponding application version. Nothing in this repository auto-deploys.

## 5. Actions requiring explicit authorization

Creating/modifying external accounts or cloud projects on your behalf, connecting a production database, applying production migrations, public deployment, changing production auth settings, deleting/resetting data, and configuring paid services all require your explicit authorization. Instructions above let you perform the manual setup yourself; the implementation agent has not performed those external actions.

## Troubleshooting

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
