# PRGRS training contract

Contract version: 2. Direction: Trainer → PRGRS. The Trainer owns programming decisions; PRGRS validates, stores and displays them. Version 1 remains accepted. The generated `PRGRS_TRAINING_SCHEMA.json` is the field and limit reference; runtime validation also enforces the semantic rules below.

## Architecture decision

Keep the existing ordered program → weeks → workouts → blocks → entries model. Store richer targets in the existing prescription JSONB, rather than adding per-set tables. One entry remains one exercise occurrence and one completion unit even when it contains many set targets. No progression engine, timers, automatic substitutions or inferred loads.

Block `instructions` is the authoritative human-readable group protocol: include rounds/ranges, station order, work/recovery intervals, between-station and between-round recovery, caps and scoring intent when applicable. This satisfies TR-013–015 for program delivery; it is not an executable timing/score contract. Do not repeat an exercise as multiple entries just to emulate sets.

## Shape and semantics

Required hierarchy: `{schemaVersion:2,name,weeks:[{week,workouts:[{day,title,blocks:[{label,kind,entries:[]}]}]}]}`. Arrays retain order; week and day numbers determine relative dates. Day 1 is the selected assignment start date. Same-day workout array order is prescribed execution order within an assignment. Across unrelated assignments no relative order is implied. Rest days may omit workouts; instruction blocks may have empty entries.

All v1 fields remain available. V2 adds prescription fields:

| Field                             | Meaning                                                                                                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| targetRpe / targetRir             | Numeric target effort (RPE 0–10, RIR 0–100); ranges belong in instructions when needed                                                                                                                 |
| percentage                        | `{value,reference}`; value is 0–100 and reference explicitly names the denominator, e.g. tested 1RM or prior 5RM, optionally including known value/date in that text                                   |
| side                              | `per_side`, `alternating`, or `total`                                                                                                                                                                  |
| pace / zone                       | Human-readable target with units/reference; omit unknown values                                                                                                                                        |
| progression / stop / alternatives | Human-readable decision rule (including variable), termination criterion, and planned alternatives with reason, variant differences and recalibration caveat                                           |
| setDetails                        | Ordered array of individual set targets; each has required `kind` (`warmup` or `work`) and optional reps/load/duration/distance/calories/tempo/rest/text/targetRpe/targetRir/percentage/side/pace/zone |

With `setDetails`, omit `sets`; each array element is exactly one planned set. Entry-level target fields act as defaults for those sets; set fields override them. `progression`, `stop`, and `alternatives` describe the whole occurrence. Display includes both defaults and overrides without calculating loads. Unknown/calibration targets are explicit prose in `load`; never use zero as a placeholder. Percentage expressions in free text must still identify their reference; validators cannot determine whether training prose is methodologically sound.

Program description carries ordered objectives and success criteria. Workout description carries priority, stimulus, intended reduction and any time separation. Instruction blocks carry week-specific context/check-in/stop guidance. Exercise key identifies the comparable variant, including consequential equipment, ROM, assistance, tempo or stability differences. Names and aliases never merge identities.

No performed data is allowed in this contract: completion, actual load/reps/effort, athlete IDs, dates, session IDs or results are rejected as unknown fields. Prescription is never evidence of performance. Actual results remain separate existing entry logs (completion, load and notes); finished status is separate from exercise completion.

## Validation and references

Strict objects reject unknown fields at every level. Versions other than 1/2 are rejected. Week numbers are unique. Instruction entries cannot be eligible. Repeated keys must use identical name, reference URL and aliases. V2 grouped/conditioning blocks (`superset`, `circuit`, `emom`, `amrap`, `for_time`) require nonempty protocol instructions. V2 prescriptions cannot combine `sets` and `setDetails`. Errors identify paths.

Prefer an explicit TikTok search URL: `https://www.tiktok.com/search?q=<URL-encoded movement and variant>`. This is a search reference, not a verified demonstration. PRGRS never fabricates video IDs, scrapes TikTok or guarantees external/offline availability. Other http(s) references remain accepted. Missing references remain absent. Canonical library metadata wins: the preview must expose differences and display the effective canonical name/reference; server rejects stale conflicting metadata at save time.

## Persistence mapping

| Contract                                                     | Internal storage                                                                  |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| name / description / schemaVersion                           | programs name / description / contract_version                                    |
| weeks[].week                                                 | program_weeks.week_number                                                         |
| workouts day / array order / details                         | workout_templates day / position / description, category, estimated_minutes       |
| block label / kind / instructions / order                    | template_blocks corresponding fields / position                                   |
| exerciseKey / name / aliases / referenceUrl                  | coach-owned exercises canonical record; reused by stable key                      |
| entry label / eligible / instructions / prescription / order | template_entries corresponding fields / position, prescription JSONB unchanged    |
| assignment                                                   | dated workout_sessions plus separate session_blocks and session_entries snapshots |
| source context                                               | workout_sessions provenance JSONB and position, copied on assignment              |

No new result tables or changes to mutation/outbox semantics. Add only program contract version, durable session source context and same-day position. Existing historical source fields must not be invented from current mutable templates; old snapshots default to unknown provenance/order.

## Duplicates, updates and history

Existing owner-scoped JSONB-content checksum rejects identical imports transactionally, including concurrent requests. Object key ordering is immaterial; array ordering is meaningful. Runtime defaults and whitespace trimming normalize coach imports. This is content identity, not name matching or an external program-ID protocol. No name-based automatic overwrite.

For a revision, explicitly open the intended program, paste the replacement JSON, preview, then confirm update. The existing program ID is retained and its revision increments. Old assigned sessions, IDs, exercise identities, results, sync receipts and queued offline writes remain intact. New assignments use revised templates. Existing future assignments also retain their snapshots; no automatic rescheduling. Review/remove an obsolete assignment/program deliberately before making a replacement schedule to avoid overlapping plans. Program removal retains durable provenance on new snapshots, even after links detach. Whole old template revisions are not an archive; assigned snapshots are the historical record.

## Scope and outstanding feedback requirements

This implementation provides faithful program delivery, not the closed-loop Trainer feedback integration. TR-051–052, TR-072–077, TR-083–088, TR-092–094, TR-100–103 and TR-130–133 still require structured actual results, substitutions, recovery and history export. Never treat checklist completion as training dose or use it to automate progression. The result contract and feedback UX require a separate implementation; no missing actuals are invented. Optional exercise classification and executable timing remain deferred. These are capability gaps, not unresolved decisions blocking prescription import.
