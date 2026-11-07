# PRGRS training data model audit

Audit date: 2026-11-07. Repository baseline: `c79553d`, with the working tree inspected as found. Audience: PRGRS and the separate AI Personal Trainer project.

PRGRS already implements a version 1 JSON program importer, a program builder, dated assignment snapshots, exercise completion, free-text actual load and notes, and durable offline logging. It can display many training prescriptions through structured fields and instructions. It cannot currently capture detailed set performance or interpret progression, RPE, timing, or units as structured training logic.

This document describes existing implementation, not a proposed integration schema or training methodology. “Implemented” means traced through checked-in code; it does not claim deployment verification. Only this document was created for the audit. No application files, migrations, or databases were changed. The pre-existing modification to `next-env.d.ts` was left untouched.

## 1. Evidence and verification boundary

The primary evidence is all five migrations, generated database types, domain and Zod models, coach and athlete components, persistence/sync services, generated JSON Schema, examples, and existing regression coverage. Product documents supplied intended behavior and were compared with implementation.

No live local or hosted database was inspected. The schema below is the resulting definition expressed by the migration chain, corroborated by checked-in generated types. Whether an actual Supabase project has applied every migration, contains older data, or has manual schema/grant changes requires a separate live inspection. No Supabase connection, migration command, or database test was run for this audit.

Existing tests were read as evidence of intended regression coverage; their presence is not a claim that they passed during this audit. Verification for this document consists of source cross-checking, checking its repository links, and validating its illustrative JSON and stated completion/log relationships against the existing program parser and domain functions.

### Source reference index

Locations refer to this audit's working tree; subsequent edits may move line numbers.

| Ref | Source and code locations                                                                                                                                                        | What it establishes                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| S1  | [Initial migration](../../supabase/migrations/202611060001_prgrs.sql), lines 4–145                                                                                               | All 15 tables, keys, initial constraints, RLS and grants                                    |
| S2  | [Initial migration](../../supabase/migrations/202611060001_prgrs.sql), lines 241–280                                                                                             | Result mutation RPC, idempotency, original reads and execution grants                       |
| S3  | [Exercise identity migration](../../supabase/migrations/20261107205323_protect_exercise_identity.sql), lines 3–4                                                                 | Browser updates restricted to exercise display fields                                       |
| S4  | [Workout details migration](../../supabase/migrations/20261107205717_preserve_workout_details.sql), lines 3–105                                                                  | Current validator, save/assign/get-program behavior; description/category/estimated minutes |
| S5  | [RLS refinement](../../supabase/migrations/20261107213519_optimize_rls_identity.sql), lines 4–14                                                                                 | Current ownership policies using scalar identity lookups                                    |
| S6  | [Program removal migration](../../supabase/migrations/20261107223229_remove_program.sql), lines 4–49                                                                             | Nullable assignment link, withdrawal, deletion and current session reader                   |
| S7  | [Database types](../../src/lib/database.types.ts), lines 3–575                                                                                                                   | Generated relational API types; JSONB typed as generic `Json`                               |
| S8  | [Domain model](../../src/lib/domain.ts), lines 1–121 and 157–172                                                                                                                 | Runtime-facing types, log shape, metrics, history and prescription display                  |
| S9  | [Import validation](../../src/lib/import.ts), lines 2–118                                                                                                                        | Authoritative client import shape, defaults and cross-field rules                           |
| S10 | [Session validation](../../src/lib/validation.ts), lines 4–50                                                                                                                    | Incoming session validation                                                                 |
| S11 | [Coach UI](../../src/components/coach.tsx), lines 129–163, 279–399, 647–774 and 778–1307                                                                                         | Import, preview, assignment, library management and builder                                 |
| S12 | [Workout UI](../../src/components/workout.tsx), lines 32–51, 105–208 and 217–338                                                                                                 | Actual inputs, grouping, finish/reopen/skip and exercise history                            |
| S13 | [IndexedDB persistence](../../src/lib/db.ts), lines 3–170                                                                                                                        | Local sessions, outbox, atomic edits, reconciliation and conflict handling                  |
| S14 | [Sync queue](../../src/lib/sync.ts), lines 4–36; [transport](../../src/lib/remote.ts), lines 5–18                                                                                | Ordered retries, conflict blocking and acknowledgement validation                           |
| S15 | [App](../../src/components/app.tsx), lines 87–101, 640–652, 845–852, 979–988 and 1103–1119                                                                                       | Cache use, metric scopes, session history and pending-edit export                           |
| S16 | [Published schema](../../public/examples/program.schema.json), lines 1–124; [generator](../../scripts/generate-schema.mjs)                                                       | Downloaded schema and its generation path                                                   |
| S17 | [Import guide](../PROGRAM_IMPORT.md); [example](../examples/foundation.json); [public example](../../public/examples/foundation.json)                                            | Existing external-author guidance and sample files                                          |
| S18 | [Import tests](../../tests/import.test.ts); [domain tests](../../tests/domain.test.ts); [offline tests](../../tests/offline.test.ts); [remote tests](../../tests/remote.test.ts) | Validation, partial completion, identity and offline regression cases                       |
| S19 | [Database regression script](../../scripts/test-db.mjs), especially lines 137–279 and 380–505; [test DB setup](../../scripts/test-database.mjs), lines 4–12                      | SQL behavior coverage using disposable PGlite with an Auth shim                             |
| S20 | [Browser tests](../../tests/e2e/app.spec.ts); [simulated backend](../../tests/e2e/backend.ts); [local integration script](../../scripts/test-local-supabase.mjs)                 | Browser scenarios, simulation boundary and opt-in real local integration                    |

## 2. Current database structure and relationships

All application tables are in `public`; IDs are UUIDs unless noted. Status, role and block kind are checked text, not PostgreSQL enums. Dates use `date`; event/update times use `timestamptz`. SQL snake_case fields are mapped to camelCase in RPC JSON. [S1, S4, S6, S7]

| Table                 | Stored fields and key constraints                                                                                                                                                                                                                                                                 | Relationships / purpose                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `profiles`            | `id` PK, `name` ≤160, `timezone` default UTC, `created_at`; timezone checked against PostgreSQL timezone names                                                                                                                                                                                    | `id` → `auth.users`, deletion restricted                                                                    |
| `user_roles`          | Composite PK (`user_id`, `role`); role athlete or coach                                                                                                                                                                                                                                           | Profile → multiple capabilities; profile deletion cascades                                                  |
| `coach_athletes`      | Composite PK (`coach_id`, `athlete_id`), `accepted` default false, `created_at`; coach and athlete must differ                                                                                                                                                                                    | Both IDs → profiles with cascade; consent relationship                                                      |
| `exercises`           | `id`, `owner_id`, `exercise_key`, `name`, `aliases` text array, nullable `reference_url`, `created_at`; unique (`owner_id`, `exercise_key`)                                                                                                                                                       | Coach-owned canonical exercise; profile deletion restricted                                                 |
| `programs`            | `id`, `owner_id`, `name`, `description`, `checksum`, positive `version` default 1, `created_at`, `updated_at`; unique (`owner_id`, `checksum`)                                                                                                                                                    | Coach-owned reusable program; profile deletion restricted                                                   |
| `program_weeks`       | `id`, `program_id`, `week_number` 1–52; unique (`program_id`, `week_number`)                                                                                                                                                                                                                      | Program → weeks, cascade                                                                                    |
| `workout_templates`   | `id`, `week_id`, `day` 1–7, nonnegative `position`, `title`, `description` ≤2000, `category` ≤80, nullable `estimated_minutes` 1–1440; unique (`week_id`, `position`)                                                                                                                             | Week → ordered workouts, cascade; repeated day allowed                                                      |
| `template_blocks`     | `id`, `workout_id`, nonnegative `position`, `label`, checked `kind`, `instructions`; unique (`workout_id`, `position`)                                                                                                                                                                            | Template → ordered blocks, cascade                                                                          |
| `template_entries`    | `id`, `block_id`, `exercise_id`, nonnegative `position`, `label`, `eligible`, object `prescription` JSONB, `instructions`; unique (`block_id`, `position`)                                                                                                                                        | Block → ordered entries, cascade; exercise link restricts deletion                                          |
| `program_assignments` | `id`, `program_id`, `program_version`, `coach_id`, `athlete_id`, `start_date`, `created_at`; unique (`program_id`, `athlete_id`, `start_date`)                                                                                                                                                    | Links program/version to athlete and coach; referenced deletions restricted until explicitly handled        |
| `workout_sessions`    | `id`, nullable `assignment_id`, `athlete_id`, nullable `template_id`, `scheduled_date`, `title`, `description`, `category`, nullable `estimated_minutes`, `status`, nullable `finished_at`, nonnegative `version`, `updated_at`, nullable `withdrawn_at`; unique (`assignment_id`, `template_id`) | Assignment and source-template deletion set links null; athlete deletion restricted; durable dated snapshot |
| `session_blocks`      | `id`, `session_id`, `position`, `label`, `kind`, `instructions`; unique (`session_id`, `position`)                                                                                                                                                                                                | Session → blocks; parent deletion restricted                                                                |
| `session_entries`     | `id`, `block_id`, `exercise_id`, `position`, `label`, snapshot `name`, nullable `reference_url`, `eligible`, `prescription` JSONB, `instructions`; unique (`block_id`, `position`)                                                                                                                | Snapshot block and stable exercise links; both deletions restricted                                         |
| `exercise_results`    | `entry_id` PK, `completed` default false, `load` ≤160 default empty, `notes` ≤4000 default empty, object `metrics` JSONB default `{}`, `updated_at`                                                                                                                                               | Zero or one result row per snapshot entry; entry deletion restricted                                        |
| `sync_receipts`       | `mutation_id` PK, `athlete_id`, `session_id`, acknowledged `version`, `created_at`                                                                                                                                                                                                                | Idempotency record; profile/session deletions restricted                                                    |

The prescription graph is `programs → program_weeks → workout_templates → template_blocks → template_entries → exercises`. Assignment creates a separate graph: `program_assignments → workout_sessions → session_blocks → session_entries → exercise_results`. Both graphs refer to stable exercise UUIDs. Receipts refer to session UUIDs. There is no separate completed-workout table, per-set table, progression-rule table, or normalized result-unit table. [S1]

The generated relationships mark foreign keys `isOneToOne: false`, including `exercise_results.entry_id`; the SQL primary key makes the entry/result relationship zero-or-one in practice. Generated Insert/Update types also describe column shapes without enforcing privileges. For example, exercise Update types contain `exercise_key`, but browser grants forbid changing it. SQL constraints/grants remain authoritative. [S1, S3, S7]

### Access and ownership

RLS is enabled on all 15 tables. Program/template reads follow program ownership. Athletes can read their own sessions; coaches can read an athlete's sessions through an accepted relationship and coach capability. The session reader can therefore return multiple athletes' histories to a coach; athlete views filter to the signed-in athlete. Exercise reads include owned library records and exercises referenced in accessible sessions. [S1, S5, S6, S15]

Signup creates an athlete role. Coach capability requires trusted administration; users cannot grant it through the browser. A user can hold both roles and assign to themselves. Assignment to another athlete requires accepted coaching consent and athlete capability. Graph creation and result writes use authenticated RPCs with explicit checks. Coaches can review athlete results but cannot log them through `apply_session_mutation`, which requires the session's athlete to be the caller. [S1, S2, S4]

Browser exercise inserts require owner/coach checks; updates are limited to `name`, `aliases`, and `reference_url`. There are no browser write grants for program graphs, session structure, results or receipts. These are implementation findings from SQL, not a fresh live security certification. [S1, S3, S5]

## 3. Existing program, workout and exercise models

### Imported and reusable programming

`ProgramInput` is inferred from the Zod schema. Its hierarchy is:

```text
ProgramInput { schemaVersion: 1, name, description, weeks[] }
  week { week, workouts[] }
    workout { day, title, description?, category?, estimatedMinutes?, blocks[] }
      block { label, kind, instructions, entries[] }
        entry { exerciseKey, name, label, eligible, referenceUrl?, aliases,
                prescription, instructions }
```

The import has no database IDs, athlete, assignment date, results, completion flags, or finish time. The server generates relational IDs; assignment is a separate operation. Required/default behavior is specified in section 6. [S4, S9, S11]

An entry is one occurrence of an exercise inside a block, not a set. The same exercise can appear repeatedly with different prescriptions and independent entry results. All entries, even ineligible instruction/reference entries, require `exerciseKey` and `name` in import and a non-null exercise FK in SQL. A prose-only instruction block can instead use `entries: []`, avoiding a synthetic exercise-library record. [S1, S9]

### Stable exercise identity and display data

Import resolution uses `(owner_id, exercise_key)`. The corresponding UUID connects template entries, session entries and history. Keys match `^[a-z0-9][a-z0-9-]{0,79}$`: 1–80 lowercase ASCII letters/digits/hyphens, first character alphanumeric. Names and aliases do not determine identity. Two coaches using the same slug create different exercise identities; two slugs for the same movement under one coach split history. No cross-coach/global identity reconciliation exists. [S1, S4, S8, S9]

On key conflict, `save_program` uses `ON CONFLICT ... DO NOTHING`; it does not update canonical name, aliases or video. New assignments copy the library's current name and reference URL. Thus an imported entry's new name/video can appear in preview yet differ from what assignment produces when the key already exists. Repeated occurrences of a newly created key with differing aliases/URLs also retain the first inserted library record's metadata. Client validation checks consistent names per key within one file, but does not require consistent aliases or URLs. [S4:65–68, S4:89–90, S9:88–104]

Template entries do not store their own name/video override. `get_program` reconstructs these from the current library, including aliases; it is not an archival copy of the original uploaded JSON. Existing assigned sessions preserve their copied names/videos even if the library changes. [S4:89–105]

### Application-facing sessions and logs

`WorkoutSession` holds `id`, `athleteId`, nullable `assignmentId`, date-only `date`, `title`, optional `description`/`category`/nullable `estimatedMinutes`, `status`, nullable `finishedAt`, `version`, ordered `blocks`, and `updatedAt`. A `Block` has `id`, `label`, `kind`, `instructions`, `entries`. Each `Entry` combines snapshot identity/prescription with actual `completed`, `load` and `notes`. [S8:25–64]

`Entry.exerciseId` is nullable in TypeScript and runtime validation, although SQL `session_entries.exercise_id` is currently non-null. This is tolerated application input, not evidence that the current assignment RPC creates anonymous exercise entries. `template_id`, positional columns, and `withdrawn_at` are not exposed in the session JSON; array order carries position. Program name, program version, source week/day, aliases, result timestamps and raw `metrics` are also absent from that response. [S1, S6, S8, S10]

`SessionLog` contains only `status`, `finishedAt`, and a complete array of `{ entryId, completed, load, notes }`. It cannot mutate prescriptions, exercise identity, ownership, schedule dates or titles. [S2, S8:60–77]

## 4. Supported workout structures and training fields

### Structural support

| Structure                    | Implemented representation                             | Boundary                                                                                                                     |
| ---------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Individual exercise          | `kind: "single"`, ordered entries                      | No rule restricts this kind to exactly one entry                                                                             |
| Superset                     | `kind: "superset"`, shared block, labels such as B1/B2 | No pairing/cardinality or alternating-execution enforcement                                                                  |
| Circuit                      | `kind: "circuit"`, ordered entries and instructions    | No per-round completion or block result                                                                                      |
| EMOM, AMRAP, For Time        | `emom`, `amrap`, `for_time`                            | Kind renders a heading; total timing, intervals, time caps and scoring require prose/entry prescription; no execution engine |
| Warm-up / cooldown           | `warmup`, `cooldown`                                   | Entries count if eligible; kind alone does not exclude them                                                                  |
| Instructions / explicit rest | `instruction`, prose and optionally ineligible entries | Eligible entries rejected in instruction blocks; empty entries allowed                                                       |
| Multiple workouts per day    | Repeated day in a week's workout array                 | Separate dated sessions; no start time or explicit persisted daily session sequence                                          |
| Multiple weeks               | Unique numbered weeks 1–52                             | Gaps and unsorted input accepted; schedule uses week numbers                                                                 |

All kinds share the same flat block shape. Blocks cannot contain child blocks. Labels are display strings, not identifiers or parsed group relationships. Block order and entry order are stored explicitly and rendered in that order. There is no structured group-level rounds, rest or duration field; block `instructions` carries such information. [S1, S4, S8, S9, S12]

Every eligible entry contributes one unit to completion, irrespective of its sets, reps, rounds or duration. Representing a circuit as three entries gives three completion units; there is no separate circuit completion control. No minimum entry count is enforced for any block kind. [S8:79–85, S9:34–69, S12]

### Prescription fields actually accepted

All fields below are optional, and an empty `{}` prescription is valid. All string fields are trimmed and limited to 2,000 characters by client Zod. [S9:2–21]

| Field      | Type and limits | Meaning implemented by PRGRS                                   |
| ---------- | --------------- | -------------------------------------------------------------- |
| `sets`     | Integer 1–100   | Displays a set count; no individual set records                |
| `reps`     | String          | Displays literal target, including ranges or per-side language |
| `load`     | String          | Displays literal prescribed load or intensity instruction      |
| `duration` | String          | Displays literal timing target                                 |
| `distance` | String          | Displays literal distance target                               |
| `calories` | Integer 1–10000 | Displays calorie target                                        |
| `rounds`   | Integer 1–1000  | Displays round count                                           |
| `tempo`    | String          | Displays literal tempo notation without parsing                |
| `rest`     | String          | Displays literal rest instruction                              |
| `text`     | String          | Displays additional prescription text                          |

`prescriptionText` concatenates these in a fixed order, independent of JSON key order. The builder exposes all ten. No mutual-exclusion or training-consistency checks prevent combinations of fields. [S8:157–172, S11:1144–1180]

RPE, RIR, percentage of 1RM, pace, heart-rate zones, side, equipment, substitutions, progression conditions, deloads and differing targets per set have no dedicated fields. Their human-readable instructions can fit in accepted text fields, but PRGRS cannot validate, calculate or query those concepts as structured data. Adding `rpe`, `rir`, `setDetails`, or another unknown prescription property fails current import validation. This distinction also applies to text such as `load: "RPE 7"`: it can be displayed, but is not an RPE model. [S9, S4:37–42]

### Actual performance and timestamps

The athlete UI records `completed` (boolean), actual `load` (string ≤160), and `notes` (string ≤4000) per eligible entry. It exposes no structured actual sets/reps/RPE/RIR/distance/time/calories/rounds, no set checkboxes, no session notes, and no block score. Free-text notes can describe these observations, but downstream analysis would require interpreting prose. [S1:95–99, S8, S12:138–172]

The SQL `exercise_results.metrics` column is a storage placeholder: the TypeScript domain, session reader, mutation serializer, mutation SQL and UI do not expose or update it. Ordinary browser roles cannot directly write results. It therefore does not provide an implemented result-metrics integration. [S1:95–99 and 142–145, S2, S6, S7, S8]

`finished_at` is a client-supplied finalization timestamp; `updated_at` and receipt `created_at` record server processing when mutations are applied. There is no start timestamp, actual elapsed session duration, or individual set timestamp. Reopening clears `finished_at`; there is no retained sequence of prior finish/reopen events in a dedicated history table. [S1, S2, S12]

## 5. Prescription lifecycle, completion and persistence

### Creation and assignment

The coach builder edits a `ProgramInput` in React state, including copying workouts within the draft and reordering workouts, blocks and entries. JSON paste/upload uses the same validator and confirmation flow. Coach authoring is online and its unsaved draft has no IndexedDB outbox. A standalone ad hoc session creation or athlete prescription-editing path was not found. [S11, S13]

`save_program` validates and writes the reusable graph transactionally. Updating uses the same program ID, increments its version, deletes the old weeks/templates/blocks/entries, and recreates that graph. It does not keep a complete archive of every template version. Existing session prescription snapshots remain intact, including future sessions already assigned; their old `template_id` becomes null when the source template is removed. [S1:76, S4:47–73]

`assign_program` records program/version, athlete, coach and start date, then materializes all workouts immediately. The date formula is:

```text
scheduled_date = start_date + (week_number - 1) * 7 + (day - 1)
```

Day 1 is the chosen start date, regardless of weekday. Missing days create no session. A rest/instruction session requires an explicit workout with no eligible entries. Multiple same-day sessions are supported; templates have array positions, but session reading orders by date then UUID, so original same-day workout ordering is not guaranteed after assignment. Assignment captures no time-of-day. [S4:75–94, S6:48]

### Performing and finishing a session

A scheduled workout and a finished workout are the same session record with a different status and results. Valid stored statuses are `scheduled`, `in_progress`, `finished`, `skipped`. “Missed” is a display label for a past scheduled eligible session, not a stored status. Rest/instructions are inferred from no eligible entries, not a separate status. [S1:78–80, S8:98–107]

Editing an entry sets `in_progress`. Finish sets `finished` and the finish timestamp without changing entry checkboxes. Reopen sets `in_progress`, clears the timestamp and preserves results. Skip/resume preserves results. Finished entries are locked in the UI until reopening. SQL requires a finish timestamp exactly when status is finished, but does not enforce the UI's reopen-before-edit workflow as a distinct server transition. It accepts any valid status/log combination from the owning athlete at the correct version. [S2, S12:41–51 and 227–273]

A session may therefore be finished with 9/10 eligible entries completed and remain 90%. An entry can have load/notes while unchecked. Result rows may be absent before the first mutation; the reader supplies `completed: false`, `load: ""`, `notes: ""`. A mutation sends every entry, including ineligible ones, so it creates/upserts a result row for each. Ineligible entries cannot be marked completed; their load/notes are representable by the RPC, though no result inputs are shown for them. [S2:255–263, S6:46, S12:157]

### Completion, adherence and history

Exercise completion is the aggregated count of completed eligible entries divided by all eligible entries in the supplied scope, rounded to an integer percent. Empty denominator returns null and displays N/A. It is not set completion, volume, or an average of individual workout percentages. [S8:79–96]

Adherence counts finished eligible sessions divided by eligible sessions dated today or earlier. Skipped, in-progress and missed due sessions remain in the denominator. Future sessions and sessions without eligible entries are excluded. Today uses the athlete's profile timezone; coach reviews calculate today separately per athlete. Dashboard week/month exercise completion includes the full scheduled range, including future entries; overall completion includes sessions through today. Calendar completion uses the displayed range. These scopes differ intentionally from adherence's due-date filter. [S8, S15, S11:550–554]

Exercise history joins by exercise UUID, isolates athlete, excludes the current session and later scheduled dates, and includes entries having load, notes or a completion flag. It does not require the previous session to be finished. Other sessions on the same date can appear; ordering is date then session update time, not exercise execution order. History is derived from accessible cached session snapshots, with no dedicated performance-history API or numeric trend computation. The session History screen filters by workout title rather than offering a global exercise-name search. [S8:109–121, S12:278–299, S15:979–988]

### Offline writes and conflicts

Dexie database `prgrs-v1` stores `sessions` (indexed by ID, athlete, date), `outbox` (ID, owner, session, creation time), and `identities`. An edit atomically stores the new local session and a mutation containing UUID, owner/session IDs, base version, complete result log, creation time, attempt count and optional error/conflict fields. Each changed log increments the local session version. [S13:3–66]

The mutation RPC locks the owning athlete's session, recognizes repeat mutation UUIDs through receipts, checks the base version, requires every session entry exactly once, validates result types/eligibility, and commits results, status, version and receipt together. A receipt stores acknowledgement/version, not the full submitted result payload. A repeated ID for the same athlete/session returns its original version; a reused ID is not a new edit. [S2:241–265]

Retries retain IDs; an error blocks later mutations for that session. Remote reconciliation preserves pending local sessions. Conflicts require explicit choice of the complete local or server log; local choice rebases onto the server version. The local version must match the version reviewed before either choice. This is whole-session conflict handling, not field-by-field merging. [S13:68–126, S14]

### Program removal and historical provenance

The owner-only removal RPC locks the program and assigned sessions, withdraws `scheduled`, version-zero snapshots dated today onward in each athlete's timezone, deletes all assignments, and deletes the reusable graph atomically. Sessions detach through nullable assignment/template links. Past snapshots, results, stable exercises and receipts survive. Pending offline edits can still target a withdrawn session; a subsequent acknowledged mutation makes it visible again because the reader includes version-positive/non-scheduled sessions. [S6]

Withdrawal is a reader filter, not row deletion or an RLS visibility rule. Direct table reads by an otherwise authorized client can still see withdrawn snapshots. The removal timestamp is not exposed in application session JSON. Deleting assignments also removes their program-version/start-date provenance; detached snapshots keep the prescribed content but no independent program-name/version/week/day archive. [S1, S6]

## 6. Import, export and validation as implemented

The existing path is Coach studio → paste/upload JSON → validate and preview → confirm save → separately assign. Upload rejects files larger than 2,000,000 bytes; the code accepts exactly that size despite the UI wording “below 2 MB.” Paste has no equivalent explicit byte limit. Preview displays program/workout details, block instructions, entry labels/names/prescriptions and eligibility, but does not display every imported field: entry instructions, aliases and reference URLs are absent from that preview. [S11:279–399]

| Layer             | Verified behavior / limit                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Program           | Exact `schemaVersion: 1`; trimmed nonempty name ≤160; description defaults to empty, ≤2000                                                       |
| Weeks             | Array length 1–52; each integer `week` 1–52; unique numbers; no contiguous-number requirement                                                    |
| Workouts          | 0–21 per week; required integer day 1–7, title and blocks; repeated days accepted                                                                |
| Workout details   | Optional description ≤2000, category ≤80, estimated minutes integer 1–1440; omit unknown values, not null                                        |
| Blocks            | 1–30 per workout; required label ≤12, known kind, entries; instructions default empty                                                            |
| Entries           | 0–50 per block; key/name/label required; eligible defaults true, aliases `[]`, prescription `{}`, instructions empty; optional HTTP(S) URL ≤2000 |
| Aliases           | At most 20 trimmed nonempty strings, each ≤100; no identity matching by alias                                                                    |
| Cross-field rules | Client rejects duplicate week numbers, different names for one key within the file, and eligible entries in instruction blocks                   |
| Unknown fields    | Client objects are strict at every import level; unknown fields fail rather than being retained                                                  |

Empty weeks and entirely empty instruction blocks are accepted. An entry must explicitly use `eligible: false` inside an instruction block because the default is true. Null is not a substitute for omitted optional prescription fields or URL. [S9]

### Validation differences and duplicate detection

The SQL validator independently checks sizes, ranges, kinds, prescription keys and instruction eligibility. It is not equivalent to Zod: it does not reject unknown keys at every outer object level, does not compare repeated-key names, does not apply the same trim normalization, and some checks use `->>` text extraction rather than strict JSON primitive types. Unknown outer fields can therefore be ignored by persistence rather than modeled, while unknown prescription fields are rejected. Passing only SQL validation is not proof of conformance to the client import format. [S4:11–45, S9]

The published JSON Schema uses Zod's generated output shape: it marks defaulted properties such as program `description`, block `instructions`, and entry `eligible`, `aliases`, `prescription`, `instructions` as required. Runtime Zod accepts their omission and fills defaults. It also omits custom checks for unique week numbers, consistent names, instruction eligibility and the HTTP(S)-only refinement; a URI format alone is broader. A schema-valid file still needs the runtime validator, and a runtime-valid minimal file can fail a strict validator using the published schema. [S9, S16]

Program duplicate detection is unique `(owner_id, md5(p_program::text))`, calculated from the submitted JSONB. In the UI this input has passed Zod normalization. This is content comparison, not semantic equivalence of training plans. Different optional empty fields, titles or array order can change the checksum. `get_program` adds stored empty workout description/category and current library metadata, so editing/re-saving or copying its JSON need not preserve the original import checksum. “Duplicate program” errors also wrap any unique violation within `save_program`. [S1:37–47, S4:47–73 and 104–105]

### Export capability boundary

Implemented downloads are the schema and the Profile pending-edit export, `prgrs-pending-edits.json`, containing `{ identityId, exportedAt, mutations }`. The latter contains queued result logs and queue metadata, not a full program, prescription archive or complete athlete history. There is no importer for this recovery export. [S11:330–332, S15:1103–1119]

`get_program` supplies a reconstructed v1 program for editing/duplication, and JSON mode exposes text that can be copied manually. There is no dedicated program-file export button, full completed-training export, or Trainer-facing results interchange endpoint. The existing browser-to-Supabase RPCs are implemented app APIs, not evidence of a separate external integration. [S4:104–105, S11:129–139 and 250–255]

## 7. Representative supported data

The following synthetic example demonstrates the existing format only; it is not a training recommendation or final integration design. Its two exercise keys are assumed new in the importing coach's library. It includes explicit defaulted fields so it also satisfies the published schema's required-property shape.

### A. Importable program JSON

```json
{
  "schemaVersion": 1,
  "name": "Data model demonstration",
  "description": "Synthetic prescription and logging example.",
  "weeks": [
    {
      "week": 1,
      "workouts": [
        {
          "day": 1,
          "title": "Example session",
          "description": "Preserve the listed order and instructions.",
          "category": "Example",
          "estimatedMinutes": 40,
          "blocks": [
            {
              "label": "A",
              "kind": "superset",
              "instructions": "Alternate A1 and A2 as prescribed.",
              "entries": [
                {
                  "exerciseKey": "goblet-squat",
                  "name": "Goblet squat",
                  "label": "A1",
                  "eligible": true,
                  "referenceUrl": "https://example.com/goblet-squat",
                  "aliases": ["DB goblet squat"],
                  "prescription": {
                    "sets": 3,
                    "reps": "8–10",
                    "load": "Use the externally prescribed load",
                    "tempo": "3010",
                    "rest": "90 seconds",
                    "text": "RPE target, if required, is instruction text here."
                  },
                  "instructions": "Follow the supplied technique guidance."
                },
                {
                  "exerciseKey": "single-arm-row",
                  "name": "Single-arm dumbbell row",
                  "label": "A2",
                  "eligible": true,
                  "aliases": [],
                  "prescription": {
                    "sets": 3,
                    "reps": "10 per arm",
                    "rest": "60 seconds"
                  },
                  "instructions": "Record actual observations in notes."
                }
              ]
            },
            {
              "label": "B",
              "kind": "instruction",
              "instructions": "This section contributes no completion units.",
              "entries": []
            }
          ]
        }
      ]
    }
  ]
}
```

The URL is a format illustration, not a verified exercise demonstration. Assignment on 2026-11-07 places this day-1 workout on 2026-11-07. IDs below illustrate values generated on persistence; imports do not supply them. After one accepted mutation from base version zero, a corresponding session-reader value can be:

### B. Assigned snapshot with a finished, partial result

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "athleteId": "22222222-2222-4222-8222-222222222222",
  "assignmentId": "33333333-3333-4333-8333-333333333333",
  "date": "2026-11-07",
  "title": "Example session",
  "description": "Preserve the listed order and instructions.",
  "category": "Example",
  "estimatedMinutes": 40,
  "status": "finished",
  "finishedAt": "2026-11-07T16:40:00.000Z",
  "version": 1,
  "updatedAt": "2026-11-07T16:41:00.000Z",
  "blocks": [
    {
      "id": "44444444-4444-4444-8444-444444444444",
      "label": "A",
      "kind": "superset",
      "instructions": "Alternate A1 and A2 as prescribed.",
      "entries": [
        {
          "id": "55555555-5555-4555-8555-555555555555",
          "exerciseId": "66666666-6666-4666-8666-666666666666",
          "name": "Goblet squat",
          "label": "A1",
          "eligible": true,
          "referenceUrl": "https://example.com/goblet-squat",
          "prescription": {
            "sets": 3,
            "reps": "8–10",
            "load": "Use the externally prescribed load",
            "tempo": "3010",
            "rest": "90 seconds",
            "text": "RPE target, if required, is instruction text here."
          },
          "instructions": "Follow the supplied technique guidance.",
          "completed": true,
          "load": "24 kg",
          "notes": "Actual reps and effort are prose observations."
        },
        {
          "id": "77777777-7777-4777-8777-777777777777",
          "exerciseId": "88888888-8888-4888-8888-888888888888",
          "name": "Single-arm dumbbell row",
          "label": "A2",
          "eligible": true,
          "referenceUrl": null,
          "prescription": {
            "sets": 3,
            "reps": "10 per arm",
            "rest": "60 seconds"
          },
          "instructions": "Record actual observations in notes.",
          "completed": false,
          "load": "",
          "notes": "Not performed."
        }
      ]
    },
    {
      "id": "99999999-9999-4999-8999-999999999999",
      "label": "B",
      "kind": "instruction",
      "instructions": "This section contributes no completion units.",
      "entries": []
    }
  ]
}
```

This session has two eligible entries, one completed: 50% exercise completion and status `finished`. If due, it contributes one finished session and one due session to adherence. Its `prescription.load` and entry-level `load` are different fields: target versus actual.

### C. Result log used inside a mutation

```json
{
  "status": "finished",
  "finishedAt": "2026-11-07T16:40:00.000Z",
  "results": [
    {
      "entryId": "55555555-5555-4555-8555-555555555555",
      "completed": true,
      "load": "24 kg",
      "notes": "Actual reps and effort are prose observations."
    },
    {
      "entryId": "77777777-7777-4777-8777-777777777777",
      "completed": false,
      "load": "",
      "notes": "Not performed."
    }
  ]
}
```

The RPC receives this as `p_log`, with a new `p_id` mutation UUID, the snapshot's `p_session` UUID, and `p_base_version: 0`. No program JSON or prescription fields are sent in that result mutation. The empty instruction block needs no result item; an instruction block containing entries would require those entries in the log with `completed: false`. [S2, S8]

## 8. Limitations, concerns and implementation status

| Capability or concern                                     | Current status                                                        | Consequence for Trainer evaluation                                                                                     |
| --------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| JSON program import, validation, confirmation, assignment | Implemented                                                           | Integration preparation starts from an existing v1 format                                                              |
| Workout description/category/estimated duration           | Implemented through additive migration                                | Requires that migration in a live project; legacy snapshots receive empty/null defaults, not reconstructed old details |
| Superset/circuit/EMOM/AMRAP/For Time                      | Group storage and display implemented                                 | Timers, interval scheduling, group scoring and round execution are absent                                              |
| Detailed actual metrics                                   | Partial storage only: unused `metrics` column                         | No working structured result path for actual reps, RPE, time or distance                                               |
| Per-set prescriptions/results                             | No dedicated model/UI                                                 | Varying sets can be described in prose or separate entries, which changes completion units                             |
| Progression and conditional programming                   | No executable rules                                                   | Trainer must assess whether explicit prescriptions across numbered weeks are sufficient                                |
| Historical prescription protection                        | Implemented session snapshots                                         | Editing reusable templates does not update any already assigned workout                                                |
| Template version archive                                  | Version number only, with assigned snapshots                          | Cannot retrieve an arbitrary old whole program solely by version                                                       |
| Library identity/metadata resolution                      | Implemented per coach, existing records win                           | Input preview and assigned name/video may differ; aliases do not reconcile identity                                    |
| Same-day ordering                                         | Templates ordered; sessions sorted by date/UUID                       | Multiple daily workouts have no guaranteed original sequence or time slot                                              |
| Rescheduling / replacing one assignment                   | No dedicated UI/RPC found                                             | Assignment creates all dates; program removal affects every assignment                                                 |
| Historical program provenance after removal               | Partial                                                               | Prescriptions/results survive, assignment-level program/version linkage does not                                       |
| Exports                                                   | Pending-edit recovery JSON and schema download; copyable program JSON | No full result/history export or recovery-file import                                                                  |
| Large histories/programs                                  | No pagination in session reader; whole-session mutation logs          | Payload and parsing costs grow with accessible history and entries; no real-scale measurement performed                |
| Live deployment correctness                               | Unverified                                                            | Migration application, real records, RLS deployment and transport need separate environment checks                     |

The product specification describes broad workout kinds and future results support; the implementation verifies the kinds as grouping/display and actual logging as completion/load/notes. Its detailed sets, timers and advanced performance charts are explicitly deferred. The architecture document's phrase “extensible result metrics” describes a JSONB extension point, not a currently usable result editor or RPC contract. The import guide's “all arrays retain their supplied order” needs qualification: block/entry order survives; program reads sort weeks numerically and assigned same-day session reads sort by UUID. The import UI's “preview every detail” exceeds the actual preview fields listed in section 6. [S8–S17; product specification sections 2.3 and 9; architecture lines 37 and 78–80]

Other consistency concerns are the validator differences, published-schema defaults, content-based duplicate boundary, and nullable TypeScript exercise ID described above. These are observed technical constraints; this audit does not propose schema changes or decide which require expansion.

## 9. Questions and requirements for AI Personal Trainer to evaluate

The Trainer project should supply its requirements against the capabilities above before a final integration contract is designed.

1. **Prescription detail:** Can one entry-level prescription represent the Trainer's work, or must individual sets have different rep/load/RPE targets? Which requirements must be structured rather than displayed as prose?
2. **Actual observations:** Are completion, one load string and notes sufficient? Which actual sets/reps/RPE/RIR/time/distance/rounds or block scores must be recoverable without interpreting text?
3. **Grouping:** Does a flat ordered block express the intended supersets/circuits, including mixed structures, or are nested groups, group timing/rest and round-level state essential?
4. **Effort and progression:** Can RPE/RIR/percentages and progression remain instructions with explicit week-by-week prescriptions, or must they be validated and evaluated automatically?
5. **Entry identity:** What determines whether variants, sides, implements or techniques share an exercise key? How should the Trainer maintain keys/names within a coach's existing library and identify intentional new variants?
6. **Canonical metadata:** Is the existing-library-wins rule acceptable for names, aliases and video references? How will the Trainer learn the library contents before generating a file?
7. **Completion meaning:** Is one completion unit per eligible entry appropriate for long circuits, warmups, unilateral work and optional work? Which entries should be ineligible?
8. **Scheduling:** Are relative day offsets and up to 52 numbered weeks sufficient? Are multiple daily workouts expected to have strict sequence/start times, and are gaps or explicit rest sessions required?
9. **Program updates:** Is it acceptable that every assigned session retains its original prescription? What should be required when future prescriptions change after assignment?
10. **Result feedback to Trainer:** Does the project require a complete results/history export, prescribed-versus-actual comparisons, or only manual review? The current pending-edit export does not provide that dataset.
11. **Units and interpretation:** Which quantities need numeric values, units, ranges, per-side rules or unambiguous tempo notation? The current string fields do not enforce them.
12. **Provenance and scope:** Must original Trainer output, program version, source exercise vocabulary or generation metadata remain available after program updates/removal? Those are not currently archived as a full external-source record.
13. **Volume:** Do real programs fit 21 workouts/week, 30 blocks/workout, 50 entries/block, numeric limits and text/upload limits? Actual examples are needed to assess usability and payload size.
14. **Validation handoff:** Can generated files satisfy runtime Zod rules in addition to the downloadable schema, include explicit defaults when useful, and avoid invented fields or result data in program imports?

These questions establish technical requirements for a later integration discussion. Training methodology and the final interchange design remain the responsibility of the appropriate projects.
