# Program import v1

For Trainer v2 prescriptions, see the [training contract](integration/PRGRS_TRAINING_CONTRACT.md), [Trainer export guide](integration/PRGRS_TRAINER_EXPORT_GUIDE.md), and [import guide](integration/PRGRS_IMPORT_GUIDE.md). The downloadable schema now accepts both versions.

Use Coach studio → Import JSON. Paste or upload a UTF-8 `.json` file below 2 MB, validate, review the preview, then explicitly confirm import. Assignment is a separate explicit step. The builder writes the same format and also previews before saving.

- [Realistic valid example](examples/foundation.json)
- [Downloadable JSON Schema](../public/examples/program.schema.json)
- [Zod schema, authoritative validation](../src/lib/import.ts)
- [Invalid regression fixture](../tests/fixtures/invalid-program.json)

`npm run schema:generate` regenerates JSON Schema. Cross-field Zod rules (unique weeks, consistent names per stable key, no eligible instruction entries) are additional to JSON Schema and also matter.

## Format

```json
{
  "schemaVersion": 1,
  "name": "Strength foundation",
  "description": "Three purposeful training days",
  "weeks": [
    {
      "week": 1,
      "workouts": [
        {
          "day": 1,
          "title": "Full body",
          "blocks": [
            {
              "label": "A",
              "kind": "single",
              "instructions": "Leave two reps in reserve.",
              "entries": [
                {
                  "exerciseKey": "goblet-squat",
                  "name": "Goblet squat",
                  "label": "A",
                  "eligible": true,
                  "aliases": ["DB goblet squat"],
                  "prescription": {
                    "sets": 3,
                    "reps": "8–10",
                    "tempo": "3010",
                    "rest": "90 seconds"
                  },
                  "instructions": "Keep the whole foot grounded."
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

| Field                       | Rules                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| `schemaVersion`             | Exactly `1`                                                                                       |
| `name`, workout `title`     | 1–160 characters                                                                                  |
| `description`, instructions | Up to 2,000 characters                                                                            |
| `weeks`                     | 1–52 weeks with unique integer numbers 1–52                                                       |
| `workouts`                  | Up to 21 per week; `day` 1–7 relative to assignment start; repeated days allowed                  |
| `blocks`                    | 1–30 per workout; array order is preserved                                                        |
| `kind`                      | `single`, `superset`, `circuit`, `emom`, `amrap`, `for_time`, `warmup`, `cooldown`, `instruction` |
| `label`                     | Up to 12 characters; e.g. A, B1, B2                                                               |
| `entries`                   | Up to 50 per block; may be empty for instruction sections                                         |
| `exerciseKey`               | Stable lowercase slug, 1–80 characters, letters/digits/hyphens; first character alphanumeric      |
| `name`                      | Exercise name, 1–160 characters; use the same name for the same key                               |
| `eligible`                  | Defaults true; MUST be false in instruction-only blocks; false for reference/rest items           |
| `referenceUrl`              | Optional valid http/https URL; YouTube, TikTok and other external references supported            |
| `aliases`                   | Optional list, at most 20 items of 1–100 characters                                               |
| `prescription`              | Optional object; see below                                                                        |

Workouts also accept optional `description` (up to 2,000 characters), `category` (up to 80 characters), and `estimatedMinutes` (integer 1–1440; omit when unknown). They appear in the builder and preview and are copied into each assigned session. Existing v1 files remain valid. Assigned history retains the details originally prescribed when templates change.

Structured prescription numeric fields: `sets` (1–100), `rounds` (1–1000), `calories` (1–10000). String fields: `reps`, `load`, `duration`, `distance`, `tempo`, `rest`, `text` (each ≤2,000 characters). Use text to express complex training without inventing fields. For EMOM/AMRAP/For Time, describe total timing and grouping in block instructions; entries can have duration/rounds/distance/calories as appropriate. All arrays retain their supplied order.

The importer resolves exercises by `(coach, exerciseKey)`. It reuses existing library records; the library's canonical name/reference is used when assigning. It does not deduplicate by similar names or aliases. Importing identical normalized JSON twice is rejected by a server content checksum; this checksum is duplicate detection, not a cryptographic security boundary. Editing an existing program preserves its ID and increments its version, while existing assignments retain snapshots. To intentionally duplicate a plan, give the copy a distinct name.

## Instructions for an external AI assistant

Give the external assistant the schema and this prompt:

> Return only a JSON object compatible with PRGRS program import schemaVersion 1. Use the supplied schema exactly, without extra properties or markdown fences. Create [describe your program]. Use unique numbered weeks 1–52 and day offsets 1–7 relative to each week. Preserve movement order in arrays. Use stable lowercase exerciseKey slugs consistently across the whole plan; keep names consistent per key. Label grouped movements A1/A2, B1/B2, etc. Choose the correct block kind. Include sets/reps, timing, distance, rounds, tempo, rest and free-form instructions where relevant. Do not force conditioning into sets/reps. Instruction-only entries must set eligible false. Omit unknown reference URLs rather than inventing them. No results or completed flags belong in the import.

AI output is untrusted input. Validation and explicit preview confirmation are mandatory regardless of who authored it. No AI generation runs inside PRGRS.
