# PRGRS — Official Brand Identity

**Status:** Official brand language and Bold PR 01 app icon approved; supporting UI design guidance proposed  
**Version:** 2.0  
**Updated:** 2026-11-07

## 1. Official brand language (keep exact)

**Eyebrow / brand statement:**

> YOUR TRAINING. YOUR JOURNEY.

**Product name:**

# PRGRS

**Primary tagline:**

> Track the work. See the growth.

**Brand rationale:**

> The name is incomplete by design. Because progress never ends.

The spelling **PRGRS** is a stylized contraction of **PROGRESS**, chosen intentionally as a recognizable minimal wordmark. In spoken contexts, pronounce it “progress.” The unfinished spelling represents an ongoing journey, not a missing product feature or a promise of perfection.

These words are settled brand decisions. Do not silently rewrite them in design explorations or implementation prompts.

## 2. Brand story

PRGRS is for people who do the work and want to see how far they have come. Progress isn't a single destination: it is repeated sessions, incremental improvements, and consistency through imperfect days. Finishing a session with 90% of exercises logged is still meaningful work—PRGRS can preserve that fact without falsely calling it 100%.

The application combines a practical training plan, frictionless recording, and useful historical context. It should help users get back to training, not keep them busy inside an app.

## 3. Brand values

1. **Progress over perfection** — support partially completed workouts without shaming.
2. **Consistency over intensity** — show regular effort and durable patterns, not just record lifts.
3. **Your journey** — different training styles (strength, hypertrophy, running, conditioning, functional training) fit in one product.
4. **Simplicity** — logging should be faster than the workout itself.
5. **Evidence of growth** — reflect real saved sessions and useful history, not invented motivational numbers.
6. **Trust** — offline edits, access permissions and performance history must be reliable.

## 4. Voice and copy

- Clear, concise, encouraging, confident; not aggressive or guilt-driven.
- Prefer useful action labels: **Continue workout**, **Finish workout**, **View history**, **Add note**, **Sync pending**.
- A partial workout is not a failure. Consider copy like “Session finished · 90% of exercises completed.”
- Never equate incomplete exercise logs with personal failure.
- Brand lines belong on onboarding/authentication, splash/marketing materials, maybe a subtle dashboard header—not repeated in every exercise card.

## 5. Approved identity and rationale

**Approved visual direction:** Bold PR 01, Acid Green + Carbon. The approved visual master is `public/brand/PRGRS_Approved_Bold_PR_01.png`, copied from the icon explicitly approved on 2026-11-07. This is the authoritative **visual reference** for the PR monogram. Do not redraw, alter its P/R geometry, add blur, overlay, cutouts, shadows, gradients, stripes, or replace it with one of the earlier exploratory designs. The latest approved PR letters are bold, legible, italic/geometric and solid dark on an acid-green rounded-square icon.

**PR** can evoke _Personal Record_, a familiar fitness concept; **PRGRS** remains the full product name and references progress beyond any single record. This is a brand narrative, not authorization to build PR dashboards outside MVP scope.

The base exported master is a raster PNG, not editable vector artwork. Any future vector reconstruction must be manually checked against the master and separately approved; do not present an approximate SVG as the definitive logo.

## 6. Color system

The following are the currently selected **brand palette targets**, sourced from the brand-book direction, not sampled pixel-perfect colors from the generated master:

| Role      | Token            | HEX       | Use                                                                 |
| --------- | ---------------- | --------- | ------------------------------------------------------------------- |
| Accent    | `brand-acid`     | `#C5F500` | Brand treatments, selected states, key actions when contrast passes |
| Carbon    | `brand-carbon`   | `#181D1B` | Primary dark background/lettering                                   |
| Off-white | `brand-offwhite` | `#F6F6F4` | Light backgrounds and text on dark surfaces                         |
| Graphite  | `brand-graphite` | `#343B35` | Secondary dark surfaces/borders                                     |

**Accessibility:** These are brand primitives, not universal semantic tokens. Codex must derive verified foreground/background, hover, focus, muted, success, warning and error tokens in light and dark mode, test WCAG contrast, and avoid using Acid Green as readable text on white. Do not use only color to communicate workout status or sync state.

## 7. Brand asset and logo family

**Approved:** The exported `PRGRS_Approved_Bold_PR_01.png` master and its same-artwork raster derivatives in `public/icons/`. Maintain proportions, letter shapes and colors; do not crop into the actual PR lettering. Existing master includes a dark backdrop around the rounded green icon; it is the visual source, not necessarily a final platform-safe maskable icon.

**Recommended application formats (not separately approved logo designs):**

- **App icon:** Original PR mark inside the Acid Green rounded square, suitable for home-screen, launch/splash and favicon. Use provided derived PNGs as temporary working assets, and audit platform safe areas.
- **Primary brand lockup:** PR app icon alongside the literal name `PRGRS` for marketing/auth surfaces. The accompanying typography is a proposed layout, not a separately approved wordmark file.
- **Wordmark-only:** Text `PRGRS` in a bold legible font in narrow headers. Do not substitute an invented decorative PR mark.
- **Monochrome and inverse:** Future variants require deliberate design approval. Do not invert colors automatically and call the result an approved logo.

Use consistent spacing and never stretch, tint, rotate, apply shadows, or distort the approved monogram.

## 8. Visual design language (proposed implementation guidance)

- Minimal, premium, athletic without being aggressive; straightforward athlete/coach usability.
- Layout is mobile-first, with strong exercise hierarchy, generous tap targets, short paths, and fast logging.
- Use compact, legible sans-serif UI type and tabular numerals for sets, reps, weights, durations, and percentages. **Specific font family is not formally approved**; default to a readable, maintainable font available in the app.
- Preserve equivalent quality of dark/light themes. Dark surfaces should not simply invert the existing design.
- Use the green accent deliberately, not on every button, chip, card, or chart.
- Display supersets and workout blocks clearly; preserve honest partial-completion percentages and distinct session-finish status.
- Use semantic states for offline, pending sync, synced, errors, missed/skipped/in-progress/finished, with accessible labels.
- Avoid decorative animations competing with workout logging; honor reduced-motion settings.
- Respect originality: the TrueCoach references are for capabilities, not a pixel-for-pixel UI.

## 9. Voice and product guardrails

The approved four brand lines in section 1 must remain unchanged. Keep copy clear, concise and encouraging, without guilt, fake achievements or all-or-nothing framing. "Session finished - 90% of exercises completed" is valid. A completed **session** is not the same metric as completion of all its exercises.

The brand does not add MVP scope: detailed PR tracking/charts, wearables, nutrition, coaching chat and AI-generated plans inside the app remain deferred by `PRGRS_PRODUCT_SPEC.md`.

## 10. Brand placement

- Authentication/onboarding: show the official name and optionally brand statement and tagline.
- Dashboard: prioritize the scheduled workout, logging continuation, week metrics and synchronization state over marketing language.
- Workout screens: optimize readability of the prescription, input values and completion controls.
- Coach/admin: same color and typography system, denser layouts when necessary.
- PWA manifest/splash/home-screen: use provided icon export derivatives while retaining user-approved artwork.

## 11. Sources, authority and implementation handoff

1. `PRGRS_PRODUCT_SPEC.md` determines functional behavior and MVP boundaries.
2. **This file** determines the accepted identity/copy and the distinction between approved vs proposed design choices.
3. `PRGRS_Brand_Book_v3_Bold_PR_01.pdf` is the human-facing visual reference; where an illustrative mockup or speculative variant conflicts with the approved icon, the approved PNG wins.
4. `PRGRS_REFERENCES.md` contains third-party research, not PRGRS logo/design authority.
5. `docs/implementation/PRGRS_REDESIGN_CODEX_PROMPT.md` provides a repository-adaptive redesign task for Codex.

Codex must inspect existing UI tokens/components and update them centrally. Preserve working authentication, roles, navigation, Supabase/RLS, data, offline queue, calendar and logging workflows. Verify mobile/desktop and light/dark states. Never use earlier exploratory lime icons in place of Bold PR 01.

## 12. Open decisions and publication checks

**Approved:** PRGRS name; four official brand lines; Bold PR 01 artwork as shown in the provided PNG; Acid Green direction and dark Carbon pairing.

**Proposed / pending validation:** exact accessible semantic palette and theme tokens; font choice and final wordmark typography; custom vector master; monochrome/inverse logos; platform-specific maskable safe areas; complete UI design system; professional brand/trademark clearance. Colors above are implementation targets, not evidence of exact pixels or verified accessibility.
