# PRGRS — Product Specification

**Status:** Initial product source of truth  
**Version:** 1.1  
**Updated:** 2026-11-07  
**Audience:** ChatGPT Project (product planning), Codex (when copied into the repository)

## 1. Product vision

PRGRS is a clean, mobile-first, offline-first fitness training Progressive Web App (PWA). Its purpose is to help athletes follow scheduled training, record what they actually did, review previous results, and track progress and consistency. It is inspired by TrueCoach, but is a distinct product, not a clone.

Official positioning: **YOUR TRAINING. YOUR JOURNEY.**  
Official tagline: **Track the work. See the growth.**

Start with a single person who can act as both athlete and coach, but design access and data ownership to accommodate multiple athletes and coaches later.

**Product boundaries:** Focus on routines, completing workouts, training records, and a simple dashboard. Avoid social networking, nutrition, messaging, payments, and direct AI program generation in the MVP.

## 2. Core experiences

### 2.1 Athlete dashboard

- Today's scheduled workout: title/type/date/status/progress and open/continue action.
- Summary of this week's scheduled and finished workouts and eligible exercise completion.
- Monthly overview of adherence/completion, recent sessions, quick route to history.
- Overall progress/consistency based on real records, never fabricated sample metrics in production.
- Prefer a concise dashboard with a few meaningful metrics over complicated analytics.

### 2.2 Workout calendar

- Day, week and month navigation; default to week on mobile.
- Clearly distinguish scheduled, in progress, finished, missed, skipped, and rest days.
- Select a day to open its workout(s); support past history and upcoming programming.
- Today's date highlighted; date calculations respect each athlete's timezone.
- Preserve correct handling of multiple workouts on a single day.
- Calendar and History use the same stable session occurrences; a programmed workout with recorded results appears once. Athletes can delete recorded workouts only from History, removing those occurrences and results everywhere, including statistics. Calendar/programming offers no athlete delete action, and unstarted scheduled workouts on the same date are protected from history deletion. Removing a reusable program preserves recorded sessions as detached history; it must not recreate explicitly deleted occurrences.

### 2.3 Workout detail

- Display date/title/category, optional description, instructions, estimated duration, exercise blocks, notes and progress.
- Block structure supports individual exercise, superset, circuit, EMOM, AMRAP, For Time, warm-up, cooldown and instruction-only sections.
- Preserve exercise order and group labels (A, B1, B2, C, etc.); support varying prescriptions: sets, reps, duration, rounds, distance, calories, tempo, rest, load and text instructions.
- Users can tick or untick eligible exercises with immediate visual feedback, including while offline. MVP uses one completion control per exercise, not mandatory per-set logging.
- Optional reference action opens an exercise video, especially TikTok, and may support YouTube/other valid links. Offline access to external videos is not guaranteed.
- Exercise-specific free-text notes and quick actual-results entry (especially weight) should be low-friction. Support future reps/sets/RPE/distance/time/rounds without demanding every field in the MVP.
- Present last-used result, and a View History action to inspect previous sessions of the same stable exercise definition.

### 2.4 Finish workout without requiring perfection

- Show **Finish Workout** at the end of a session.
- Finishing changes the session status to _finished_ and stores a timestamp; it does **not** auto-check remaining exercises.
- Example: 9 of 10 eligible exercises checked -> session status _finished_, exercise completion **90%**.
- Support intentional reopening/editing and persistent history. Distinguish session finalization from completion percentage.

### 2.5 Coach/admin interface

- Coach is a role, not a separate mandatory account. Same user may hold athlete + coach roles.
- Create/edit and reuse programs and workout templates; arrange weeks/days/blocks/exercises; prescribe targets and add exercise references.
- Assign a program to an athlete on a schedule; preserve history if templates or future assignments change.
- Manage a reusable exercise library (stable exercise IDs, aliases if appropriate, external reference links).
- Initially prioritize a practical builder; advanced drag-and-drop is not essential.
- Basic athlete management/progress review for multi-user readiness, without complex coaching business features.

### 2.6 AI-authored JSON program import

- The coach can paste/upload structured program JSON generated elsewhere by an AI assistant.
- Define and version a clear import schema, validated (e.g. with Zod), covering program details, weeks, sessions, blocks, exercises, prescriptions, rest/tempo/notes/reference URLs.
- Validate, display errors, preview and require confirmation before saving/assigning.
- Prevent accidental duplicate imports and preserve grouping/order.
- Provide realistic example JSON and instructions for creating future AI-generated plans.
- **No in-app AI program generation for MVP.**

## 3. Progress semantics (do not conflate metrics)

- **Exercise completion percentage:** completed eligible exercise entries / all eligible exercise entries in scope × 100. Exclude instruction-only items and rest days.
- **Day/week/month exercise completion:** aggregate numerator and denominator over eligible exercises scheduled within the chosen date range. Use weighted aggregate counts rather than averaging percentages, unless deliberately presenting a different labeled metric.
- **Workout adherence:** number of finished scheduled sessions / number of scheduled sessions due, excluding future sessions and rest days. Keep distinct from exercise completion.
- A finished workout can be <100% complete. Partial and missed states need coherent visual labels; status may remain _finished_ with partial completion.
- Define treatment of skipped, rescheduled and currently in-progress sessions; avoid treating future workouts as missed.
- When a range has no eligible workouts, display N/A or a helpful empty state rather than misleading 0% or 100%.
- All stats derive from stored records, including locally pending updates when offline. Clearly label sync state.

## 4. Offline-first requirement (must shape architecture from the start)

Use cases:

1. Open already-synchronized workouts with poor or no gym signal.
2. Tick/untick exercises, edit weights/notes, finish sessions offline.
3. Changes persist across app refresh/relaunch without relying solely on memory.
4. Pending operations safely sync after reconnection/app reopening; avoid duplicates, prevent silent loss, handle failures and conflicts explicitly.

Suggested design (not a mandate): service worker + web app manifest for offline shell/installability; IndexedDB (Dexie) for structured cache, persistent mutation queue; server source of truth in Supabase Postgres; optimistic UI. TanStack Query alone is not sufficient for persistent offline writes. Do not assume background sync APIs will always run (particularly on iOS). Indicate _offline_, _pending_, _synced_, _error_ accurately. Define retry, idempotency, record version and conflict-handling policy. Consider secure handling of cached personally identifiable/training data, logout behavior, and shared devices.

**Acceptance example:** Open cached Monday workout in installed PWA, disable internet, mark several entries and add weight, force close/reopen, see those edits intact; reconnect and verify records arrive exactly once in database.

## 5. Account and data ownership

- Authentication is required. One account can have both coach and athlete capabilities.
- Scalable relational access design for coaches, athletes, programs, assignments, sessions, and results.
- Server-side authorization with row-level security (RLS); do not trust role-only frontend controls.
- Protect historical logs: editing a program template must not rewrite what was actually performed. Separate reusable definitions/templates from scheduled assignments and performed sessions/snapshots where appropriate.
- Exercise history links to stable exercise IDs, not brittle name comparisons.
- Never ship service-role credentials to a client.

## 6. Mobile-first experience and accessibility

- PWA installable with home-screen icon and standalone behavior; test iPhone Safari/installed iOS PWA, plus Android and desktop.
- Responsive interface, thoughtful safe areas, large comfortable touch targets, strong contrast, keyboard/focus support.
- Athlete mobile navigation suggestion: Home / Workouts / History / Profile. Coach interface can be a role switch or separate admin route; desktop sidebar is fine.
- Light and dark mode, system default + remembered override.
- During workouts prioritize exercise name, prescription, checkbox, results, prior record and reference action. Avoid busy charts or unnecessary steps.

### 6.1 Brand implementation cross-reference (2026-11-07)

- The approved Bold PR 01 app icon and Acid Green brand direction are documented in `PRGRS_BRAND.md` and the accompanying brand assets. New or refreshed UI should use that identity consistently.
- This visual identity update **does not change** workout completion semantics, database contracts, role boundaries, offline reliability or deferred features.

## 7. Technology direction (guidance, not rigid mandates)

- Frontend: Next.js App Router, React, TypeScript, Tailwind, shadcn/ui, Lucide.
- Backend/identity: Supabase Postgres + Supabase Auth + RLS.
- Data: TanStack Query; IndexedDB/Dexie for local persistence; Zustand only for useful UI state.
- Validation/forms: Zod, React Hook Form.
- Testing: Vitest, React Testing Library, Playwright. Hosting: Vercel.
- Codex should verify current compatibility and choose simpler alternatives where justified. No unnecessary bespoke backend.

## 8. MVP acceptance checklist

- [ ] A user can sign up/log in and access both athlete and coach views if authorized.
- [ ] Coach can create/import a valid training program and assign workouts to the user.
- [ ] Athlete can view a day/week/month schedule and open past/current/future workouts.
- [ ] Individual and grouped exercises render prescriptions and optional reference links correctly.
- [ ] Checking/unchecking eligible exercises persists, including when offline.
- [ ] Actual weight/notes save and previous exercise history remains searchable/visible.
- [ ] Finishing 9/10 exercises stores a finished workout with 90% completion.
- [ ] Dashboard reports meaningful and correctly denominated day/week/month/overall metrics.
- [ ] Installed mobile PWA retains cached schedules/logs and reliably syncs pending changes later.
- [ ] RLS prevents unauthorized cross-user reads/writes; historical sessions survive template edits.
- [ ] Responsive light/dark UI, loading/errors/empty states, tests and production build work.

## 9. Deliberately deferred features

Detailed set-by-set tracking, personal-record dashboards, advanced volume/performance charts, AI program generation inside the app, health/wearable integrations, timers, nutrition, coach messaging, social features, payments and complex business operations. Keep extension points reasonable; don't build speculative systems now.

## 10. How ChatGPT and Codex should use this file

**ChatGPT Project:** Treat this as product behavior/source-of-truth context. When asked to generate a Codex prompt, synthesize requirements into as few complete, autonomous work packages as practical, with testable outcomes. Do not ask for frequent approval of implementation details.

**Codex:** Own technical design and execution decisions within this specification. Implement working end-to-end slices, test them, fix issues, document decisions and real blockers. Explicit authorization is still needed for destructive operations, production deployment, external-account actions, and secrets. A large task may require continued execution, but should not be needlessly split into dozens of prompts.
