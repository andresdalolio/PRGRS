# PRGRS

**YOUR TRAINING. YOUR JOURNEY.**

Track the work. See the growth.

A mobile-first training PWA for athletes and coaches. Create/import programs, assign training, log actual work offline, and see real training history. One account can hold both capabilities. Finishing a session never checks the remaining exercises. Workout descriptions, categories and estimated durations stay with the assigned historical snapshot.

The name is incomplete by design. Because progress never ends.

## Start locally

Use Node 22.12+ (Node 24 recommended).

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open <http://localhost:3000>. Without configured Supabase values the app shows setup guidance; it does not simulate production data. Complete [setup and configuration](docs/SETUP_AND_CONFIGURATION.md) to authenticate and train.

## Commands

| Command                                   | Purpose                                             |
| ----------------------------------------- | --------------------------------------------------- |
| `npm run dev`                             | Development server                                  |
| `npm run build` / `npm start`             | Production build / server                           |
| `npm run lint`                            | ESLint                                              |
| `npm run typecheck`                       | Strict TypeScript                                   |
| `npm test`                                | Domain, JSON import, durable outbox tests           |
| `npm run db:test`                         | Real PostgreSQL schema/RLS/RPC tests using PGlite   |
| `npm run test:e2e`                        | Production build + Chromium and mobile WebKit flows |
| `npm run test:integration`                | Real local Supabase Auth/PostgREST checks (Docker)  |
| `npm run format:check` / `npm run format` | Check / apply formatting                            |
| `npm run db:types`                        | Regenerate Supabase types from migrations           |
| `npm run schema:generate`                 | Export JSON Schema from Zod                         |

Browser tests need `npx playwright install chromium webkit`. They use a test-only HTTP adapter backed by the real migrations and RLS, without any Supabase account. See [testing](docs/TESTING.md) for what these tests verify and their limits.

## Project guide

- [Authoritative product specification](docs/product/PRGRS_PRODUCT_SPEC.md), [brand](docs/product/PRGRS_BRAND.md), [reference research](docs/product/PRGRS_REFERENCES.md)
- [Setup and configuration](docs/SETUP_AND_CONFIGURATION.md) — external services, auth, migrations, first import, verification
- [Architecture](docs/ARCHITECTURE.md) — relational model, authorization, offline sync, conflict rules, decisions
- [Program import](docs/PROGRAM_IMPORT.md) — versioned format, example, external AI instructions
- [Testing](docs/TESTING.md) — automated and device checks
- [Production release gate](docs/PRODUCTION_READINESS.md) — verified evidence, operator configuration and remaining release checks
- [AGENTS.md](AGENTS.md) — persistent engineering requirements

No external project was created and no deployment was performed. Local database tests do not verify hosted Supabase Auth delivery, PostgREST configuration, or physical-device PWA installation.
