# Import guide

A coach capability is required. In Coach → Programs, create a program and choose JSON. Paste or upload the Trainer file (up to 2 MB), then choose **Validate & preview**. Both legacy v1 and the v2 contract are supported. All changes stay in preview until confirmation.

Review week/day ordering, same-day sequence, group protocol, set targets, effort, percentage reference, instructions and external links. Canonical exercise-library differences are surfaced; the effective canonical metadata shown is what will be assigned. Correct a genuinely different movement key rather than merging incomparable variants. Update the library first if canonical metadata needs changing. A concurrent library change causes save rejection and requires a fresh preview.

Confirm import to save reusable programming atomically. Then assign to an athlete with consent (or yourself) and a Day 1 date. No assignment or performed result is created by import alone. External references need connectivity and open outside the app.

For an update, open **Edit** on the intended program, switch to JSON, replace its contents, preview and confirm the update. Its revision increases. Previously assigned sessions retain their prescriptions and results. Future assigned sessions also remain unchanged; new assignments use the revision. Avoid overlapping schedules when replacing future work. Identical content is rejected as a duplicate; matching names do not cause updates. Keep exported source files if an archive of unassigned revisions is required.

Errors contain paths, e.g. `weeks.0.workouts.0.blocks.0.entries.0.prescription`. Unknown fields, unsupported versions, unsafe references, inconsistent repeated identities, eligible instruction entries and ambiguous sets/setDetails are rejected. Grouped v2 blocks need protocol instructions. PRGRS never drops unknown training fields to make a file pass.

Developer verification and implementation rationale are recorded in `PRGRS_TRAINING_IMPLEMENTATION.md`. The import schema is generated with `npm run schema:generate`; generated JSON Schema describes structural constraints while runtime and SQL also check semantic constraints. No hosted migration or deployment is implied by repository implementation.
