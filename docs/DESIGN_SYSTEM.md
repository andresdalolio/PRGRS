# PRGRS interface conventions

Product behavior and approved copy remain governed by `product/PRGRS_PRODUCT_SPEC.md` and `product/PRGRS_BRAND.md`. The Brand Book provides visual direction; screen layouts and the typeset PRGRS name are implementation choices.

## Tokens and themes

`src/app/globals.css` owns the palette and shared components. Brand primitives are Acid Green `#C5F500`, Carbon `#181D1B`, Ink `#101513`, Graphite `#343B35` and Off-white `#F6F6F4`. Components consume semantic variables: `--bg`, `--surface`, `--surface-raised`, `--surface-soft`, `--text`, `--muted`, `--line`, `--control-border`, `--accent`, `--primary-foreground`, `--accent-ink`, `--accent-soft`, `--focus` and `--disabled`.

Success, warning, destructive, offline, pending and sync errors have separate tokens. State labels/icons accompany colors. Acid Green is for key actions and selected accents; light-theme green text uses the darker `--accent-ink`. The dashboard's Carbon workout card uses fixed on-dark colors in either theme. `tests/design.test.ts` verifies actual token pairings against AA text and control contrast thresholds.

System appearance is the default; Profile stores explicit light/dark/system preference using the existing local setting. No remote font dependency: system Arial/Helvetica with tabular numerals. Shared cards, buttons, inputs, notices and dialogs apply to athlete and coach views. The Create program action remains available at phone widths. Workout descriptions and multiline prescriptions preserve line breaks; mobile description inputs use 16px type to avoid focus zoom. Calendar summaries distinguish weighted exercise completion from due-session adherence, and month cards include text status labels. Coach builders use nested bordered groups; workout cards retain prominent completion controls, prescriptions, load/notes, prior results and history/reference actions.

## Artwork and platform icons

`public/brand/PRGRS_Approved_Bold_PR_01.png` is the unchanged visual master. The shared `Brand` component pairs its raster derivative with the literal PRGRS name. Do not draw a substitute monogram, tint, stretch or add effects.

The 32/48/64 favicons, 180 Apple touch icon and 192/512 PWA icons are proportional full-image reductions of that master, preserving its backdrop and letter geometry. Reproduce on macOS with `sips -z SIZE SIZE public/brand/PRGRS_Approved_Bold_PR_01.png --out OUTPUT.png`. All six sizes were visually inspected. The manifest declares `purpose: any`; maskable safe zones and physical-device installation remain unverified. The old exploratory SVG was removed. User-supplied `icon-192 copy.png` and `icon-512 copy.png` remain unreferenced and untouched.

Metadata, manifest and service-worker precache reference the current PNG family. Shell cache v2 updates the public assets without forced activation; existing tabs close before a waiting worker takes over. Private cache/outbox behavior is unchanged.

## Interaction and verification

Maintain 44px control targets, visible focus, a route-preserving skip link, labeled native dialogs, selected-state semantics, safe-area padding and reduced motion. Mobile inputs remain at least 16px where needed to avoid iOS focus zoom. Themes share layouts but use independently chosen semantic colors.

Browser coverage includes authentication, empty/populated dashboards, day/week/month calendars, grouped workouts/history dialogs, JSON validation errors, coach builders and profile controls. Desktop Chromium and mobile WebKit run light/dark axe scans, responsive overflow checks (320, 430, 768 and 1024px), and representative screenshots. Browser regression tests also verify offline partial completion/reload/reconnect against disposable PostgreSQL. See `TESTING.md` for the limits of this simulated Auth adapter and the physical-device acceptance checklist.
