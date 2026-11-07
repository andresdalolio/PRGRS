# PRGRS — TrueCoach Research and UI References

**Status:** Research notes + PRGRS interpretation  
**Version:** 1.0  
**Reviewed:** 2026-10-26

## 1. Purpose and attribution

TrueCoach is an inspiration for *workout scheduling, grouped exercises, training records and coach program administration*. PRGRS is a separate product: don't copy assets, screens, marketing text or exact design patterns. The user supplied **10 TrueCoach screenshots in the original project-planning conversation**. Upload those screenshots to PRGRS Project Sources separately: Markdown cannot automatically bundle the chat images.

The links below are official TrueCoach pages. They document features of TrueCoach, not necessarily complete/current screenshots of every surface; verify time-sensitive UI details before treating them as exact.

## 2. Verified TrueCoach behavior (official sources)

### Workout builder and calendar
- TrueCoach describes a free-form workout builder organized around a client calendar; a coach can add a workout to a date, title it, prescribe sets/reps/tempo/rest, include warmup/cooldown, and save changes. [TrueCoach — Workout Builder Basics](https://help.truecoach.co/en/articles/3047972-the-workout-builder-basics)
- Its official product page describes calendar-oriented workout creation and reusable programs that can be assigned to athletes. [TrueCoach — Program and Workout Builder](https://truecoach.co/features/program-workout-builder/)
- Supersets link several movements under labels such as A1/A2 or B1/B2, while a circuit can represent AMRAP/EMOM-style work. [TrueCoach — Creating a Superset](https://help.truecoach.co/en/articles/2403842-creating-a-superset); [Workout Builder Basics](https://help.truecoach.co/en/articles/3047972-the-workout-builder-basics)

### Athlete workout and history
- The documented client experience shows athletes opening workouts, seeing warmups/exercises/cooldowns, entering results, and checking past workouts. [TrueCoach — Client Experience](https://help.truecoach.co/en/articles/2403707-the-truecoach-client-experience)
- Exercise History provides previous workout metrics for a movement, useful when deciding what weight or performance to target. [TrueCoach — Client Exercise History](https://help.truecoach.co/en/articles/2403762-client-exercise-history)
- Videos can be attached to exercises through an exercise library or workout builder. [TrueCoach — Adding Demo Videos](https://help.truecoach.co/en/articles/2403878-adding-demo-videos-to-workouts-the-library)

### Programs and broader features
- Programs are reusable collections of workouts that can be assigned to one or more clients. The official help center says unassigning a program does not delete completed or missed workouts. [TrueCoach — Programs](https://help.truecoach.co/en/articles/3047401-programs)
- TrueCoach also advertises messaging, nutrition, wearables, business functions, timers, milestones and progression metrics; PRGRS does **not** need those in its MVP. [TrueCoach — Features](https://truecoach.co/features/)

## 3. What PRGRS should borrow conceptually

| Reference pattern | PRGRS interpretation | Priority |
|---|---|---|
| Calendar-based programming | Day/week/month workout browsing, mobile week default | MVP |
| Workout title + warmup + ordered exercises + cooldown | Structured daily detail with instructions | MVP |
| Linked supersets A1/A2 | Clear, visually grouped exercise blocks | MVP |
| Circuit/EMOM/AMRAP instructions | Flexible block types, not just sets/reps | MVP |
| Client exercise history | Previous recorded loads/reps/notes by stable exercise | MVP |
| Exercise demonstration URLs | Easy external TikTok/YouTube reference action | MVP |
| Coach programs reusable across athletes | Templates + assignments + immutable historical session results | MVP |
| Coach editing and drag/drop convenience | Straightforward editor first; advanced drag/drop later | Later if needed |
| Messaging, nutrition, payments, wearables | Explicitly outside MVP | Future |

## 4. PRGRS-specific requirements (not verified as TrueCoach features)

These requirements come from the PRGRS product vision. Do not attribute them to TrueCoach without evidence:

- **Offline-first PWA:** cached workouts and durable local edits, later synced to Supabase.
- **One-tap exercise completion:** PRGRS checklist design for each eligible exercise.
- **Partial completion:** finishing a workout with 9 of 10 exercises checked yields *finished*, **90% completed**, not all-or-nothing.
- **Clear day/week/month/overall exercise completion metrics** and separately labeled workout adherence.
- **AI-generated JSON import** with schema validation/preview/confirmation.
- **Athlete and coach permissions on one account**, in a future-ready multi-user model.
- **Exact PRGRS brand identity** and original light/dark UI.

## 5. Screenshot study guide (user-provided assets)

The user supplied ten screenshots alongside the initial product request. Upload them as additional source images to the ChatGPT PRGRS Project, preferably with informative filenames, e.g. `truecoach-reference-01.png` ... `truecoach-reference-10.png` (rename as appropriate). They are visual references, not deliverables to duplicate.

When reviewing these screenshots, focus on:

1. How a day or week is browsed, and where current vs historical training appears.
2. Workout headers, group labels, exercise order, and long exercise prescriptions.
3. Superset/circuit grouping and visual hierarchy of A, B1, B2, etc.
4. Positioning of exercise history, results and video links.
5. Where completion controls fit into athlete workflow.
6. How a coach edits/assigns the schedule.
7. What to simplify for faster, more legible mobile interactions.

**Caution:** These screenshots are not embedded in this Markdown. If they are not uploaded to Project Sources, the next ChatGPT conversation cannot reliably inspect them through this file alone.

## 6. Recommended original PRGRS screen patterns

- **Home:** today card and a compact progress summary, with no overwhelming stat wall.
- **Calendar:** week-first on phone, day/month switcher, consistent status indicators.
- **Workout detail:** a scrolling grouped list with prominent checkbox, concise prescription and last-result hint; notes/reference one tap away.
- **History:** date-based past workouts plus per-exercise performance history.
- **Coach admin:** functional program editor and JSON import preview; prioritize efficiency over animated interactions.
- **Cross-cutting:** theme switch, offline/pending sync state, resilient empty/loading/error states.

These are PRGRS design proposals, not claims about TrueCoach UI.

## 7. Source URLs for future verification

- https://truecoach.co/features/
- https://truecoach.co/features/program-workout-builder/
- https://help.truecoach.co/en/articles/3047972-the-workout-builder-basics
- https://help.truecoach.co/en/articles/2403842-creating-a-superset
- https://help.truecoach.co/en/articles/2403707-the-truecoach-client-experience
- https://help.truecoach.co/en/articles/2403762-client-exercise-history
- https://help.truecoach.co/en/articles/3047401-programs
- https://help.truecoach.co/en/articles/2403878-adding-demo-videos-to-workouts-the-library

## 8. Instructions for later Codex prompts

Use this research for *capabilities and interaction inspiration*, not as a mandate to reproduce TrueCoach. `PRGRS_PRODUCT_SPEC.md` defines what PRGRS must do; `PRGRS_BRAND.md` defines brand decisions. Let Codex design original components and choose sensible technical details, with end-to-end verification of critical workout, data, role and offline scenarios.
