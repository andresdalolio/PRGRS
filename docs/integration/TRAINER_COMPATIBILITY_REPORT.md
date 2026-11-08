# TRAINER COMPATIBILITY REPORT

**Purpose:** Compare the current PRGRS training data model with the requirements of the AI Personal Trainer methodology.

**PRGRS baseline reviewed:** `PRGRS_DATA_MODEL.md`, audit dated 2026-11-07, repository baseline `c79553d`.

**Training sources reviewed:**

- `Manual_Maestro_Metodologia_Entrenamiento.md` v1.0.0
- `Perfil_y_Programa_Actual.md` v1.0.0

**Classification:**

- **Fully supported** — PRGRS can represent and preserve the requirement with its current implemented model/flows.
- **Partially supported** — information can be displayed/stored only incompletely, as prose, or without the structure needed for reliable Trainer feedback.
- **Not supported** — no implemented path can represent or return the requirement adequately.
- **Requires clarification** — the model may suffice depending on the intended Trainer↔PRGRS integration contract or semantics.

This report does **not** propose database tables. Recommendations describe capabilities/contract changes only.

---

# 1. Executive assessment

PRGRS is already a strong **program-display and workout-checklist foundation**. It supports multi-week programs, dated assignment snapshots, ordered blocks, stable exercise identities, single/superset/circuit/EMOM/AMRAP/For Time block kinds, workout descriptions/categories, and prescription fields for sets, reps, load, duration, distance, calories, rounds, tempo, rest, and free text.

However, PRGRS is **not yet fully compatible with the Trainer as a closed-loop coaching system**.

The main gap is not basic prescription display. The main gap is **structured actual-performance capture and feedback**. The current result model exposes only exercise-level `completed`, one actual `load` string, and `notes`. It cannot return actual reps by set, loads by set, observed RPE/RIR, technique quality, actual cardio metrics, interval splits, circuit scores, or the identity of a substituted exercise without interpreting prose.

That limitation conflicts directly with the Trainer methodology, which requires recent real performance to determine whether to progress, maintain, modify, or deload.

A second major gap is **set-specific prescription**. Most normal hypertrophy/strength entries can be represented with the existing entry-level prescription, but waves, ramps, top/back-off sets, or changing RPE/load/reps by set cannot be represented faithfully without prose or artificial duplicate entries.

A third major gap is **structured progression/substitution traceability**. Progression rules can be written in instructions, which is adequate for human display, but actual substitutions currently remain tied to the originally prescribed exercise unless described in notes, contaminating future exercise history if treated as equivalent.

**Overall status:**

- **Workout prescription/display:** broadly compatible, with several important conditional gaps.
- **Workout execution logging:** materially insufficient for Trainer methodology.
- **Trainer feedback/progression loop:** not yet compatible without manual interpretation or an additional structured results interchange path.

---

# 2. Compatibility matrix — planning and program structure

| Requirement                             | Importance  | PRGRS status            | Assessment                                                                                                                                     | Recommendation                                                                                                                                                                          |
| --------------------------------------- | ----------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TR-001 Program/block objective          | Mandatory   | **Partially supported** | Program/workout `description`, `category`, and instructions can describe objectives, but no explicit objective/priority semantics are modeled. | At minimum preserve objective/priority as unambiguous program/session metadata or a defined contract field rather than relying on arbitrary prose if Trainer integration will query it. |
| TR-002 Program horizon/week identity    | Mandatory   | **Fully supported**     | Programs contain numbered weeks 1–52 and assignments materialize dated sessions.                                                               | Keep. Ensure Trainer-generated programs obey runtime validation.                                                                                                                        |
| TR-003 Session priority/intended effect | Mandatory   | **Partially supported** | Can be expressed via title/category/description/instructions but is not structured.                                                            | Human-readable metadata is sufficient initially if the Trainer receives the original prescription; structure it later if workload analytics depend on it.                               |
| TR-004 Session scheduling/order         | Mandatory   | **Partially supported** | Dated sessions exist and multiple workouts/day are supported, but assigned same-day order is not guaranteed and no time-of-day exists.         | Preserve deterministic same-day sequence. Add time/separation only if double-session timing becomes prescribed.                                                                         |
| TR-005 Planned session duration         | Conditional | **Fully supported**     | `estimatedMinutes` is implemented.                                                                                                             | Keep.                                                                                                                                                                                   |

### Key constraint

The current assignment formula places day 1 on the chosen start date rather than mapping day numbers to a calendar weekday. That is acceptable if the integration contract treats `startDate` as program day 1, but the Trainer/PRGRS handoff must make this explicit to avoid schedule shifts.

---

# 3. Compatibility matrix — session/block structures

| Requirement                   | Importance  | PRGRS status                             | Assessment                                                                                                                                  | Recommendation                                                                                                                                 |
| ----------------------------- | ----------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| TR-010 Ordered session blocks | Mandatory   | **Fully supported**                      | Ordered blocks, instructions, and empty instruction blocks are supported.                                                                   | Keep.                                                                                                                                          |
| TR-011 Block types            | Mandatory   | **Fully supported for grouping/display** | `single`, `superset`, `circuit`, `emom`, `amrap`, `for_time`, warm-up, cooldown, instruction are implemented.                               | Keep; do not mistake heading/group type for execution logic.                                                                                   |
| TR-012 Ordered entries        | Mandatory   | **Fully supported**                      | Entry positions are stored/rendered in order.                                                                                               | Keep.                                                                                                                                          |
| TR-013 Block-level rounds     | Conditional | **Partially supported**                  | `rounds` exists only inside each entry prescription; block itself has no rounds field. Instructions can carry group rounds.                 | Add a way to represent group-level rounds without repeating the same value on every entry or duplicating exercises.                            |
| TR-014 Block-level rest       | Conditional | **Partially supported**                  | Entry `rest` and block instructions exist; no group-level recovery concept.                                                                 | Allow group rest/recovery to be unambiguous. It may initially remain structured block metadata or protocol text.                               |
| TR-015 Timing protocol        | Conditional | **Partially supported**                  | EMOM/AMRAP/For Time are labels; total duration, interval structure, time cap, alternating stations, and scoring rely on prose/entry fields. | For display-only use, standardized protocol text can suffice. For timers/scoring/Trainer analysis, expose structured protocol and result data. |

### Methodology impact

Flat ordered blocks are sufficient for most current strength supersets and simple circuits. **Nested blocks are not currently an essential Trainer requirement.** The essential issue is representing group-level rounds/timing/recovery without corrupting exercise completion or forcing duplicate entries.

---

# 4. Compatibility matrix — exercise identity and metadata

| Requirement                      | Importance  | PRGRS status                               | Assessment                                                                                                                                         | Recommendation                                                                                                                                      |
| -------------------------------- | ----------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| TR-020 Stable exercise identity  | Mandatory   | **Fully supported within a coach library** | Stable UUID + `(owner_id, exercise_key)` provides continuity across templates/sessions.                                                            | Keep; Trainer must use stable keys consistently.                                                                                                    |
| TR-021 Explicit variant identity | Mandatory   | **Partially supported**                    | Different variants can be represented with different exercise keys, but PRGRS does not enforce Trainer rules for when variants must split history. | Define an integration convention for exercise keys/variant identity. Never reuse one key for materially different ROM/stability/implement variants. |
| TR-022 Pattern/function metadata | Recommended | **Not supported as structured data**       | Could be written in text only.                                                                                                                     | Optional enhancement; useful for Trainer analytics/substitution but not required for initial display compatibility.                                 |
| TR-023 Technique instructions    | Mandatory   | **Fully supported**                        | Entry `instructions` plus prescription text can carry cues.                                                                                        | Keep.                                                                                                                                               |
| TR-024 Reference media           | Optional    | **Fully supported**                        | `referenceUrl` exists.                                                                                                                             | Keep.                                                                                                                                               |

### Canonical metadata concern

PRGRS uses an existing-library-wins rule for exercise names/aliases/reference URLs. A Trainer import can therefore preview one name/video and later assign another if the key already exists in the coach library. For robust interchange, either:

- the Trainer must know the existing library before generating imports, or
- PRGRS should surface/resolve metadata conflicts explicitly.

This is not a training-methodology change; it is an identity/provenance integration constraint.

---

# 5. Compatibility matrix — exercise prescription

| Requirement                      | Importance                          | PRGRS status                       | Assessment                                                                                                                  | Recommendation                                                                                                                                                           |
| -------------------------------- | ----------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TR-030 Sets                      | Mandatory when applicable           | **Fully supported at entry level** | Integer `sets`.                                                                                                             | Keep.                                                                                                                                                                    |
| TR-031 Reps/ranges               | Mandatory when applicable           | **Fully supported for display**    | Free string supports ranges and per-side wording.                                                                           | Keep; structured numeric semantics are only needed for automatic analysis.                                                                                               |
| TR-032 Duration                  | Conditional                         | **Fully supported for display**    | String field.                                                                                                               | Keep.                                                                                                                                                                    |
| TR-033 Distance                  | Conditional                         | **Fully supported for display**    | String field.                                                                                                               | Keep; value+unit structure recommended for later analysis.                                                                                                               |
| TR-034 Calories                  | Conditional                         | **Fully supported**                | Integer.                                                                                                                    | Keep.                                                                                                                                                                    |
| TR-035 Prescribed load           | Conditional                         | **Fully supported for display**    | String can represent kg, DB choice, or “calibrate”.                                                                         | Keep human-readable display; structured value/unit becomes important for automated comparison.                                                                           |
| TR-036 Target RPE/RIR            | Core methodology                    | **Partially supported**            | Can be placed in `load`, `text`, or instructions, but no dedicated target fields. Unknown `rpe`/`rir` keys are rejected.    | Add first-class effort target semantics or a formally defined structured extension. This is important to avoid conflating RPE with load and to compare target vs actual. |
| TR-037 Percentage + denominator  | Conditional                         | **Partially supported**            | Can be text, but no structured percentage/reference-type distinction.                                                       | Preserve percent and denominator explicitly whenever percentages are used. Do not store ambiguous “80%” alone.                                                           |
| TR-038 Tempo                     | Conditional                         | **Fully supported for display**    | `tempo` string.                                                                                                             | Keep; instructions should explain ambiguous notation.                                                                                                                    |
| TR-039 Rest                      | Important                           | **Fully supported at entry level** | `rest` string.                                                                                                              | Keep; group-level rest still missing.                                                                                                                                    |
| TR-040 Side semantics            | Conditional                         | **Partially supported**            | Reps text can say “per side”; not structured.                                                                               | Adequate for display; structure only if automatic totals/analytics are desired.                                                                                          |
| TR-041 Set-specific prescription | Conditional but essential when used | **Not supported natively**         | One entry has one prescription object. Repeating entries could emulate sets but changes completion units/history semantics. | Add a set-detail representation or equivalent prescription structure that keeps one exercise occurrence while allowing per-set reps/load/RPE.                            |
| TR-042 Warm-up vs work sets      | Conditional                         | **Partially supported**            | Could use separate entries/blocks/instructions; no explicit set role.                                                       | Support set role or clearly separate warm-up entries from effective work if volume analytics will be used.                                                               |
| TR-043 Stop criterion            | Important                           | **Partially supported**            | Can be written in entry/block instructions.                                                                                 | Prose is acceptable initially; ensure Trainer output includes it for anchors/high-fatigue work.                                                                          |

### Critical note on “structured vs prose”

The methodology does **not** require PRGRS to automatically calculate progression. It does require the meaning to remain recoverable. Therefore:

- Target RPE/RIR and percentage denominator **may technically be displayed in prose**, but this is fragile for machine-to-machine integration.
- Actual RPE/RIR, reps, and loads used to make progression decisions should **not** exist only in prose if PRGRS is expected to feed results back to the Trainer.

---

# 6. Compatibility matrix — substitutions

| Requirement                         | Importance                          | PRGRS status            | Assessment                                                                                                                            | Recommendation                                                                                                                               |
| ----------------------------------- | ----------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| TR-050 Planned alternatives         | Conditional                         | **Partially supported** | Alternatives can be listed in entry instructions/text but have no explicit relation to the original exercise.                         | Acceptable for initial workout display; a structured alternative link would improve UX and history.                                          |
| TR-051 Actual substitution identity | Mandatory when substitution happens | **Not supported**       | Result remains attached to the prescribed `exercise_id`; notes can mention another exercise but history still points to the original. | Add a way for the completed result to identify the actual movement/variant performed. This is essential for trustworthy progression history. |
| TR-052 Substitution reason/result   | Mandatory when substitution happens | **Partially supported** | Can be written in notes but not reliably queried.                                                                                     | Capture reason and result in a recoverable structured form or a standardized modification object.                                            |

### Methodology risk

This is a high-priority issue. If a user substitutes a machine press for barbell bench and marks the original entry complete with a load, future history can make it appear that the barbell bench was performed. The Trainer explicitly must not transfer those loads 1:1.

---

# 7. Compatibility matrix — progression

| Requirement                    | Importance                 | PRGRS status            | Assessment                                                          | Recommendation                                                                                             |
| ------------------------------ | -------------------------- | ----------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| TR-060 Progression criterion   | Mandatory for anchors      | **Partially supported** | Can be included in text/instructions; no executable rule.           | Executable automation is not required. Preserve the rule as a distinct, readable part of the prescription. |
| TR-061 Progression variable    | Mandatory when rule exists | **Partially supported** | Can be described in text only.                                      | Prefer explicit metadata if Trainer↔PRGRS round-tripping is expected.                                      |
| TR-062 Deload/reduction intent | Conditional                | **Partially supported** | Can be expressed in program/workout descriptions and prescriptions. | A simple tag/intent would improve history but is not essential for initial compatibility.                  |

### Important conclusion

PRGRS does **not** need its own progression engine to satisfy the Trainer. The Trainer can decide progression externally. The essential requirement is that PRGRS preserve the prescription and return sufficiently detailed actual performance.

---

# 8. Compatibility matrix — actual resistance performance

| Requirement                              | Importance                | PRGRS status                        | Assessment                                                                                                                                                          | Recommendation                                                                                               |
| ---------------------------------------- | ------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| TR-070 Session completed/partial/omitted | Mandatory                 | **Partially supported**             | `scheduled/in_progress/finished/skipped` exists and finished sessions can be incomplete. No explicit `partial` status, but percentage can imply partial completion. | Current semantics are workable if partial completion remains recoverable from detailed results.              |
| TR-071 Exercise completion               | Mandatory                 | **Fully supported at coarse level** | Boolean per eligible entry.                                                                                                                                         | Keep, but do not treat as sufficient performance evidence.                                                   |
| TR-072 Actual sets                       | Mandatory for progression | **Not supported**                   | No actual-set field/path.                                                                                                                                           | Add structured actual work-set count or infer it from set results.                                           |
| TR-073 Actual reps per set               | Mandatory for progression | **Not supported**                   | Notes only.                                                                                                                                                         | Add structured per-set actual reps.                                                                          |
| TR-074 Actual load per set               | Mandatory when loaded     | **Not supported**                   | One exercise-level actual `load` string only.                                                                                                                       | Add structured set-level load with unit; retain a quick-copy/default mechanism for UX if desired.            |
| TR-075 Actual RPE/RIR                    | Mandatory for anchors     | **Not supported**                   | Notes only; unused SQL `metrics` is not exposed through domain/UI/RPC.                                                                                              | Expose structured actual effort. Per-set is preferred for anchors; exercise-level summary may supplement it. |
| TR-076 Technique quality                 | Mandatory for anchors     | **Not supported structurally**      | Notes only.                                                                                                                                                         | Add simple coded technique quality + optional note.                                                          |
| TR-077 Actual rest                       | Optional/conditional      | **Not supported structurally**      | Notes only.                                                                                                                                                         | Low priority.                                                                                                |
| TR-078 Exercise notes                    | Mandatory capability      | **Fully supported**                 | `notes` up to 4000 chars.                                                                                                                                           | Keep as contextual supplement, not replacement for core metrics.                                             |

### Highest-impact incompatibility

The methodology's progression algorithm uses **actual reps + actual load + actual effort + technique across comparable exposures**. PRGRS currently records none of these reliably at set level. Therefore the current app cannot, by itself, provide enough evidence for the Trainer to apply its progression rules without manual prose interpretation.

---

# 9. Compatibility matrix — running/aerobic work

| Requirement                      | Importance                      | PRGRS status                                       | Assessment                                                                 | Recommendation                                                                                           |
| -------------------------------- | ------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| TR-080 Cardio modality           | Mandatory when used             | **Fully supported through exercise identity/name** | Running/row/bike/Ski can be exercises.                                     | Keep stable identities.                                                                                  |
| TR-081 Planned duration/distance | Conditional                     | **Fully supported for display**                    | `duration` and `distance` strings.                                         | Keep.                                                                                                    |
| TR-082 Planned effort/zone/pace  | Conditional                     | **Partially supported**                            | Can be placed in load/text/instructions; no dedicated pace/zone/RPE model. | Standardized fields recommended for Trainer interchange, especially to distinguish easy vs quality work. |
| TR-083 Actual duration           | Mandatory for completed cardio  | **Not supported structurally**                     | Notes only.                                                                | Add actual duration metric.                                                                              |
| TR-084 Actual distance           | Mandatory when meaningful       | **Not supported structurally**                     | Notes only.                                                                | Add actual distance + unit.                                                                              |
| TR-085 Actual pace/speed         | Conditional                     | **Not supported structurally**                     | Notes only.                                                                | Add when relevant.                                                                                       |
| TR-086 HR/zones                  | Optional/conditional            | **Not supported structurally**                     | Notes only.                                                                | Future enhancement unless zone-based prescription is actively used.                                      |
| TR-087 Interval splits           | Mandatory for quality intervals | **Not supported**                                  | No interval result structure.                                              | Add structured split results or a general interval-result model.                                         |
| TR-088 Session RPE               | Strongly recommended            | **Not supported structurally**                     | Notes only.                                                                | Add session/cardio effort metric.                                                                        |

### Methodology impact

The Trainer can prescribe a run today using `duration`, `distance`, and instructions, so **display compatibility is good**. But it cannot later distinguish “prescribed 40 min easy; actually ran 35 min hard” from a completed checkbox without parsing notes. That prevents reliable weekly adjustment.

---

# 10. Compatibility matrix — conditioning / HYROX-style work

| Requirement                 | Importance          | PRGRS status                          | Assessment                                                          | Recommendation                                           |
| --------------------------- | ------------------- | ------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------- |
| TR-090 Station prescription | Mandatory when used | **Fully supported for basic display** | Ordered entries with reps/distance/calories/duration/load.          | Keep.                                                    |
| TR-091 Rounds/protocol      | Mandatory when used | **Partially supported**               | Entry rounds + block instructions; no group-level rounds semantics. | Add group protocol/rounds.                               |
| TR-092 Actual block score   | Conditional         | **Not supported structurally**        | Notes only; no block result.                                        | Add block-level score appropriate to AMRAP/For Time/etc. |
| TR-093 Round/station splits | Conditional         | **Not supported**                     | No result model.                                                    | Add when conditioning progression/pacing is relevant.    |
| TR-094 Transitions          | Optional            | **Not supported**                     | No result model.                                                    | Future enhancement only.                                 |

---

# 11. Compatibility matrix — recovery and safety

| Requirement                          | Importance                 | PRGRS status                          | Assessment                                                                           | Recommendation                                                                                   |
| ------------------------------------ | -------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| TR-100 Pre-session fatigue/readiness | Recommended/conditional    | **Not supported structurally**        | Could use notes only at entry level; no session note field exposed for this purpose. | Add lightweight session-level readiness/fatigue capture if PRGRS is the Trainer feedback source. |
| TR-101 Post-session fatigue          | Optional/conditional       | **Not supported structurally**        | Notes only.                                                                          | Low/medium priority.                                                                             |
| TR-102 Sleep/recovery context        | Conditional                | **Not supported structurally**        | No dedicated capture.                                                                | Optional session/day context field is sufficient; avoid unnecessary medical data.                |
| TR-103 Training-relevant discomfort  | Safety-critical capability | **Partially supported through notes** | Entry notes can capture it, but no standardized session-level signal.                | Provide a lightweight discomfort/safety note/flag. Do not diagnose.                              |

### Priority note

These fields are less urgent than actual sets/reps/load/RPE, but the Trainer's methodology explicitly considers recovery and discomfort when deciding whether to progress or reduce workload. If PRGRS becomes the main execution log, at least a simple session-level mechanism is advisable.

---

# 12. Compatibility matrix — traceability and history

| Requirement                            | Importance                                 | PRGRS status                                  | Assessment                                                                                                          | Recommendation                                                                       |
| -------------------------------------- | ------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| TR-110 Preserve original prescription  | Mandatory                                  | **Fully supported at assigned-session level** | Sessions snapshot prescribed content; template edits do not rewrite assigned sessions.                              | Strong fit; keep this behavior.                                                      |
| TR-111 Link result to exact occurrence | Mandatory                                  | **Fully supported**                           | Results keyed to session entry.                                                                                     | Keep.                                                                                |
| TR-112 Program/block provenance        | Recommended→mandatory for full interchange | **Partially supported**                       | Assignment stores program/version, but removal can detach historical snapshots and lose program/version provenance. | Preserve durable provenance if PRGRS becomes longitudinal Trainer history.           |
| TR-113 Modification history            | Conditional                                | **Partially supported**                       | Notes can describe changes, but no structured modification history.                                                 | Add standardized deviation/substitution logging if closed-loop coaching is intended. |
| TR-132 Exercise history                | Mandatory                                  | **Partially supported**                       | History by exercise UUID exists, but only completion/load/notes and no comparable-variant metadata.                 | Keep stable IDs; enrich result metrics before relying on history for progression.    |

---

# 13. Compatibility matrix — completion/adherence semantics

| Requirement                          | Importance  | PRGRS status            | Assessment                                                                                                           | Recommendation                                                                        |
| ------------------------------------ | ----------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| TR-120 Eligibility                   | Mandatory   | **Fully supported**     | `eligible` controls exercise completion contribution; instruction blocks reject eligible entries.                    | Keep.                                                                                 |
| TR-121 Meaningful partial completion | Mandatory   | **Partially supported** | Session may finish at e.g. 90%, but each exercise occurrence is binary; 2/4 sets cannot be represented except notes. | Once set logging exists, derive richer partial completion without changing simple UX. |
| TR-122 Circuit/group completion      | Conditional | **Not supported**       | Completion counts entries, not rounds/stations completed.                                                            | Add block/round result semantics for circuits when necessary.                         |

### Methodology concern

Current completion percentages are **UI adherence indicators**, not valid measures of training volume or stimulus. The Trainer must not use a 100% checkbox score as evidence that planned reps, load, effort, pace, or rounds were achieved.

---

# 14. Compatibility matrix — feedback/interchange

| Requirement                                       | Importance                       | PRGRS status                                        | Assessment                                                                                                                                 | Recommendation                                                                                                                       |
| ------------------------------------------------- | -------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| TR-130 Machine-readable completed-session history | Essential for Trainer↔PRGRS loop | **Not supported as an external integration/export** | Session data exists internally, but there is no full completed-history export/Trainer endpoint. Pending-edit export is not history export. | Create a supported read/export contract for prescribed + actual training history before relying on PRGRS as Trainer evidence source. |
| TR-131 Planned vs actual comparison               | Essential                        | **Partially supported internally**                  | Prescription snapshot + coarse result coexist, but actual detail is insufficient.                                                          | Enrich results and expose both sides together.                                                                                       |
| TR-133 Weekly aggregation inputs                  | Recommended                      | **Partially supported**                             | Session status/completion exists, but effective volume, cardio metrics, effort, and recovery inputs are missing.                           | Do not prioritize dashboards before underlying structured data exists.                                                               |

### Integration boundary

The current PRGRS importer is good for **Trainer → PRGRS** program delivery once generated JSON conforms to the v1 runtime validator.

The reverse direction, **PRGRS → Trainer**, is the major missing integration capability. Without it, the Trainer cannot autonomously use real completed-session evidence from PRGRS and must depend on manual user reporting.

---

# 15. Units and semantic precision

| Requirement                      | Importance             | PRGRS status                              | Assessment                                                                      | Recommendation                                                                                                                               |
| -------------------------------- | ---------------------- | ----------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| TR-140 Numeric values + units    | Important for analysis | **Partially supported**                   | Most prescription/result quantities are strings; only some values are integers. | Keep display strings if desired, but add machine-readable value/unit semantics for actual metrics and any target values used in progression. |
| TR-141 Ranges/per-side semantics | Conditional            | **Partially supported**                   | Human-readable strings can express them.                                        | Structure only where calculation/comparison is needed.                                                                                       |
| TR-142 Unknown/not calibrated    | Mandatory              | **Fully representable in prose/omission** | Empty/omitted fields or `load` text can indicate calibration.                   | Define a consistent Trainer convention so “unknown” is never interpreted as zero or missing accidentally.                                    |

---

# 16. Existing PRGRS constraints that may compromise methodology

## 16.1 Strict import rejects future Trainer prescription fields

Current prescription objects only accept the existing ten keys. Adding `rpe`, `rir`, `setDetails`, `percentage`, `pace`, etc. causes import validation failure.

**Impact:** The Trainer cannot simply emit richer data today and expect PRGRS to preserve it. Any new interchange capability requires an intentionally versioned contract or supported extension mechanism.

**Priority:** Essential before adding structured prescription fields.

---

## 16.2 One result row per exercise occurrence

Current results contain only `completed`, `load`, `notes`; the SQL `metrics` JSONB is not wired through the domain/UI/mutation flow.

**Impact:** The presence of `metrics` in storage must not be treated as support. The Trainer currently cannot receive structured detailed actuals.

**Priority:** Highest.

---

## 16.3 One entry is an exercise occurrence, not a set

Duplicating the same exercise as multiple entries to emulate set-specific work would create multiple completion units and distort exercise history/adherence semantics.

**Impact:** This is not an acceptable general workaround for waves or set-level logging.

**Priority:** High for advanced strength prescriptions; medium for simple hypertrophy sessions.

---

## 16.4 Actual substitutions cannot change exercise identity

Results remain attached to the prescribed exercise UUID.

**Impact:** Exercise history can become methodologically invalid if substitutions are logged as original exercises.

**Priority:** High.

---

## 16.5 Same-day session order is not guaranteed after assignment

Templates have order, but session reads sort by date then UUID.

**Impact:** Double-session order can be lost, which matters for strength/run priority and recovery.

**Priority:** Medium; becomes high when double sessions are regularly prescribed.

---

## 16.6 Program update/version history is incomplete

Assigned sessions preserve snapshots, which is good, but old whole template versions are not retrievable and program removal can remove assignment provenance.

**Impact:** Historical completed sessions remain useful, but longitudinal block analysis loses some program context.

**Priority:** Medium for Trainer integration; low for basic workout execution.

---

## 16.7 Completion percentage is not training dose

Each eligible entry contributes one unit regardless of sets, reps, duration, or rounds.

**Impact:** Do not use PRGRS completion % as resistance volume, conditioning volume, or evidence of meeting intensity targets.

**Priority:** Essential interpretation constraint; not necessarily a schema change.

---

## 16.8 Runtime validation differs from published JSON Schema

The Zod runtime applies defaults/refinements not fully reflected in the published schema, and SQL validation is not identical either.

**Impact:** Trainer-generated program files must be validated against the actual PRGRS import contract, not only the downloadable schema.

**Priority:** High for reliable integration.

---

# 17. Essential improvements vs optional enhancements

## Essential for faithful closed-loop Trainer integration

1. **Structured actual set performance** for relevant resistance exercises: reps, load, RPE/RIR, sets performed.
2. **Actual exercise/variant identity when substituted**, with reason/result traceability.
3. **Structured actual cardio metrics**: at least duration/distance plus interval splits for quality sessions; session effort.
4. **Structured conditioning results** when the protocol's outcome is rounds/time/splits.
5. **Set-specific prescription support** for sessions that genuinely use varying reps/load/effort by set.
6. **Target effort semantics** (RPE/RIR) kept distinct from actual effort.
7. **Unambiguous percentage denominator** when percentage loading is used.
8. **Machine-readable PRGRS → Trainer history/read path** containing planned and actual data.
9. **Preserve deterministic order for multiple same-day sessions** when order is prescribed.
10. **Versioned import/interchange contract** capable of accepting richer Trainer fields without silently discarding or rejecting them.

## Important but can initially remain human-readable

1. Progression rules for anchors.
2. Stop criteria.
3. Planned substitutions and rationale.
4. Session priority/intended stimulus.
5. Block-level rest and protocol descriptions.
6. Deload/reduction intent.
7. Per-side semantics when clearly stated in reps/instructions.

## Optional enhancements

1. Built-in progression engine.
2. Timers and automatic interval execution.
3. Wearable/GPS synchronization.
4. Detailed HR-zone analytics.
5. Automatic exercise pattern/muscle tagging.
6. PR charts and advanced dashboards.
7. HYROX transition analytics.
8. Automatic technique/video analysis.
9. Global cross-coach exercise identity.

---

# 18. Answers to the questions raised by the PRGRS audit

## Q1. Can one entry-level prescription represent Trainer work?

**Answer:** Usually for simple straight sets, but **not always**. Set-specific targets are conditionally essential for waves, ramps, top/back-off sets, and progressive load by set. Using duplicate entries as a workaround would distort completion/history.

## Q2. Are completion + one load string + notes sufficient actual observations?

**Answer:** **No.** They are insufficient for the current methodology. The Trainer needs structured actual reps, loads, RPE/RIR, sets performed, technique for key lifts, and cardio/conditioning outcomes.

## Q3. Is a flat ordered block sufficient?

**Answer:** **Mostly yes for current programming.** Nested groups are not presently essential. However, group-level rounds, timing, and recovery are needed when they define the protocol.

## Q4. Must progression/RPE be executable logic?

**Answer:** **No executable progression engine is required.** Progression can be decided by the Trainer. But target RPE/RIR and progression conditions should be recoverable, and actual RPE/RIR must be structured enough for evaluation.

## Q5. What determines exercise identity?

**Answer:** The key should represent a genuinely comparable movement variant. Material differences in ROM, implement, stability, grip/stance when consequential, assistance, or prescribed technique/tempo may require a distinct identity or explicit variant context. Names alone are not sufficient.

## Q6. Is existing-library-wins metadata acceptable?

**Answer:** It is acceptable only if the Trainer can use/resolve the existing canonical library before assignment or PRGRS clearly surfaces conflicts. Silent preview-versus-assignment divergence is undesirable.

## Q7. Is one completion unit per eligible entry appropriate?

**Answer:** It is acceptable as a **simple UI completion indicator**, not as training-dose evidence. Instruction/reference items should be ineligible. Circuits and partial sets need richer execution metrics than the entry checkbox.

## Q8. Are relative days/up to 52 weeks sufficient?

**Answer:** Yes for the current planning horizon. Multiple same-day sessions require deterministic sequence. Start times are conditional, not generally essential.

## Q9. Should assigned sessions preserve old prescriptions?

**Answer:** **Yes.** Snapshot preservation is methodologically desirable. Future programming changes should not rewrite what was previously prescribed. The integration should separately handle newly prescribed future sessions when adjustments are made.

## Q10. Does the Trainer require complete results/history feedback?

**Answer:** **Yes for the intended closed-loop workflow.** Manual review is possible but defeats the goal of PRGRS becoming the execution record. The pending-edit recovery export is not sufficient.

## Q11. Which quantities need structured units?

**Answer:** Any quantity used for comparison/progression should become unambiguous: actual load, reps, distance, duration, pace/speed, percentage reference, and relevant effort. Human-readable target strings can coexist with structured values.

## Q12. Must provenance be retained?

**Answer:** Session prescription snapshots are mandatory and already good. Durable program/version/block provenance is strongly recommended if PRGRS will provide longitudinal history back to the Trainer.

## Q13. Do current numeric/size limits conflict with real programs?

**Answer:** No obvious conflict is identified from the methodology. 21 workouts/week, 30 blocks/workout, 50 entries/block, and current text limits are far above expected normal usage. Real scale/performance remains an implementation question rather than a training-methodology limitation.

## Q14. Can Trainer files satisfy current runtime validation?

**Answer:** Yes for the current v1 field set. The Trainer must generate only accepted fields, use stable keys, satisfy instruction/eligibility rules, and avoid assuming the published schema alone captures all runtime refinements. Richer fields require a future contract version or supported extension path.

---

# 19. Recommended implementation sequence from the Trainer perspective

This is a capability priority, **not a database schema proposal**.

### Phase A — Preserve current import compatibility

Keep the existing v1 importer functional for basic program delivery. Define a deterministic exercise-key convention and a reliable validation handoff.

### Phase B — Fix the feedback loop first

Prioritize structured actual results over dashboards or automatic progression:

- set results,
- actual load/reps/effort,
- actual substitution identity,
- cardio results/splits,
- conditioning scores,
- session-level training/recovery context.

Then expose a supported read/export contract back to the Trainer.

### Phase C — Expand prescription fidelity

Add set-specific prescriptions, first-class effort targets, percentage denominator/reference, and group-level timing/rounds/rest where required.

### Phase D — Optional automation

Only after the underlying prescription/result data is trustworthy should PRGRS consider automatic progression suggestions, analytics, timers, charts, or wearable integrations.

---

# 20. Final compatibility verdict

**PRGRS can currently represent a large majority of the Trainer's workouts visually, but it cannot yet represent the full Trainer methodology as a reliable closed-loop training record.**

The current model is sufficient for:

- multi-week workout delivery,
- exercise ordering,
- most basic strength/hypertrophy prescriptions,
- supersets and basic circuits,
- human-readable RPE/RIR/progression instructions,
- running/conditioning prescriptions as text + duration/distance fields,
- checklist-style completion,
- historical preservation of assigned prescription snapshots.

It is not sufficient for:

- reliable progression decisions from actual performance,
- set-level comparison,
- trustworthy substitution history,
- structured run/interval analysis,
- structured conditioning scoring,
- closed-loop PRGRS → Trainer feedback without manual prose interpretation.

Therefore, the correct technical direction is **not to simplify the Trainer methodology**. PRGRS should preserve its current simple workout UX while extending the underlying prescription/result contract so that the Trainer can recover the evidence it actually uses.
