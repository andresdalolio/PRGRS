# Trainer export guide

Read `PRGRS_TRAINING_CONTRACT.md` and use `PRGRS_TRAINING_SCHEMA.json`. Generate a JSON object with `schemaVersion: 2`; no Markdown fences or internal database identifiers. See `trainer-example.json` for a complete importable example. The example illustrates serialization only and is not a recommended training plan.

1. Supply ordered objectives/success criteria in program description; use workout description for priority, stimulus, reductions and time separation.
2. Use numbered relative weeks (1–52) and days (1–7). Order same-day workouts intentionally. Do not invent assignment dates or athlete identifiers.
3. Keep ordered blocks and labels. A triset uses `superset` with three entries. Every grouped/conditioning block needs explicit protocol instructions describing applicable rounds, station order, work/recovery, rest and caps. No nested groups.
4. Give comparable exercise variants stable lowercase hyphenated keys, at most 80 characters. Reuse canonical names, aliases and references consistently; use a new key for a materially different variant.
5. Keep one entry per movement occurrence. Use `setDetails` for waves/ramps/top/back-off/approach sets, distinguishing `warmup` and `work`; omit `sets` in that case. Other entry targets are defaults. Use simple `sets` for uniform work sets.
6. Use targetRpe/targetRir for prescribed effort, percentage with an explicit denominator, and readable units in load/distance/duration/pace. Put ranges and uncertainty in explicit prose; never invent kilograms, RM values or zones.
7. Include applicable progression variable/conditions, stop criteria and alternatives/recalibration in their prescription fields or instructions. These remain Trainer decisions.
8. Prefer TikTok search references built from URL-encoded exact movement/variant names. Do not claim that search results are reviewed demonstrations. References are optional.
9. Mark reference-only entries `eligible:false`; instruction blocks may simply have no entries. Never include results or completion state.
10. Validate with the supplied JSON Schema, then use PRGRS Validate & preview to check cross-field rules and canonical library differences. Correct errors before handoff.

For revisions, identify the existing program to the coach outside the JSON. The coach opens that program to replace its reusable templates explicitly. Sending the same name alone never updates a program. Reimporting identical content is rejected. Updates do not rewrite any assigned training, including future sessions.

PRGRS currently records coarse exercise actual load/notes/completion only. This export is a prescription delivery contract; do not use it as proof of completed training or assume structured actual-result/history feedback exists.
