# Production release gate

Assessment on **2026-11-07: ready after the configuration and release checks below**. Nothing was deployed and no hosted resources were changed. This is repository/local evidence, not a certification of a hosted environment.

## Verified in this pass

| Check                     | Actual result                                                                                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Install / static checks   | `npm ci`, lint and TypeScript passed on Node 24.21.0                                                                                                                                                    |
| Unit/regression tests     | 54 passed: domain/import, IndexedDB/outbox, malformed acknowledgements/snapshots, environment validation, timeout recovery, API auth/privacy, service-worker release/failure behavior                   |
| Clean migration/RLS suite | All four migrations applied to fresh disposable PGlite; 44 assertions passed                                                                                                                            |
| Real local Supabase       | 34 real GoTrue/PostgREST assertions passed with the optional history profile; random accounts and their records removed afterward                                                                       |
| Local pgTAP / advisors    | 8 checks passed; no security/performance warnings after the additive RLS optimization                                                                                                                   |
| Browser / accessibility   | 10 passed across desktop Chromium and iPhone-sized WebKit, including production service worker, offline edits/reload/reconnect, exact 9/10 finish, history, responsive layouts and light/dark axe scans |
| Production build          | Passed; production HTTP smoke verified security/cache headers, manifest/icons and unauthenticated API denial                                                                                            |
| Dependency audit          | `npm audit`: 0 reported vulnerabilities; no blanket dependency upgrades                                                                                                                                 |
| Secrets                   | `.env.local` ignored; only placeholder `.env.example` tracked; targeted scan found no private keys/service-role credentials in tracked source/config/docs                                               |

Build-time guards reject malformed origins and privileged client keys; Vercel requires valid public configuration. Sync has bounded requests and validates the returned version before removing an outbox item. Sanitized, rate-limited error categories and a render recovery screen are present. Worker caches are isolated by build, keep HTML/assets paired, and retain the installed fallback on network failure.

Performance: 11 RLS policies now initialize request identity once per statement; advisor warnings fell from 11 to zero. A real local PostgREST sample returned **85 sessions / 850 exercise entries in 33 ms, 245,248 JSON bytes**. Reproduce with `PRGRS_PROFILE_HISTORY=1 npm run test:integration`; this loopback sample is not a hosted SLA. Measured initial script references total approximately **1.14 MB raw / 337 KB gzip**, including the legacy-browser polyfill script. This is an artifact-size measurement, not a network latency or device CPU benchmark. The complete static directory was about 1.5 MB. Existing indexed session/block/entry queries use one snapshot RPC rather than browser N+1 requests. Profile large multi-athlete history payloads before expanding beyond the initial MVP population.

## Operator gates before authorizing deployment

Use [setup and configuration](SETUP_AND_CONFIGURATION.md) for commands and exact steps.

- [ ] Select the intended Supabase project; configure the two public environment values and verify that the browser targets it.
- [ ] Verify a recent backup/restore point and rehearse recovery in a separate project.
- [ ] Review remote migration status and dry-run; apply all four migrations with the v3 `--remote` target, then verify history and advisors. Preserve historical migration filenames.
- [ ] Configure email/password, minimum password length, production SMTP, exact Site URL and confirmation allowlist; test real confirmation and password sign-in.
- [ ] Provision the initial coach UUID through trusted SQL; verify dual capability without browser role grants.
- [ ] Repeat two-account RLS/RPC checks on the intended hosted API, including coaching consent/revocation and direct-write denials.
- [ ] Configure Vercel Next.js / Node 24 / `npm ci` / `npm run build`, with separate preview and production public values. Review automatic publication settings.
- [ ] Rerun lint, typecheck, unit tests, database tests, browser tests, build, formatting and dependency audit on the exact release commit. CI verifies code; it does not deploy.
- [ ] Record who is authorized to publish and perform recovery. Production deployment, external account changes and destructive operations still require explicit authorization.

## Manual release smoke test

- [ ] On the intended HTTPS origin, a dual-capability account imports/creates and assigns training; athlete sees grouped blocks and reference links.
- [ ] Complete 9 of 10 eligible entries, save load/notes and finish: **finished at 90%**. Verify weighted progress and prior exercise history. Edit the reusable template and confirm historical snapshots stay unchanged.
- [ ] Open synchronized training on physical iOS Safari + Add to Home Screen and Android Chrome + Install. Check icon crop, standalone launch, safe areas, keyboard/focus, VoiceOver/TalkBack and both themes.
- [ ] Airplane mode → edit/finish → force-close → relaunch offline → reconnect. Confirm durable edits, accurate sync indicators and one receipt per logical mutation. Open without a previous cache and confirm an understandable public sign-in/empty state.
- [ ] Test expired auth, two-device conflicting edits, both explicit conflict choices, permission denial and temporary backend outage. Export pending work before any manual storage changes. A new account must never inherit private cached data.
- [ ] Publish only after authorization. Check `/sw.js` no-cache headers, API `no-store`, manifest/icons and worker update behavior: old windows retain the installed fallback; new worker activates after they close. Test a failed update without clearing IndexedDB.
- [ ] Verify monitoring access and rollback procedure with the selected deployment and backup providers. Retain old static assets through rollout; prefer reviewed forward database fixes over destructive rollback.

## Remaining external verification

Hosted Supabase API/Auth settings, production mail delivery, Vercel behavior, native installation/OS process lifecycle, browser storage eviction and representative large-history performance remain unverified. Browser/OS storage deletion cannot be made durable by this app; iOS background sync is not required for correctness. Foreground reopening/reconnect performs synchronization. No credentials or native device access are needed to finish repository work; the remaining items are operator release gates.
