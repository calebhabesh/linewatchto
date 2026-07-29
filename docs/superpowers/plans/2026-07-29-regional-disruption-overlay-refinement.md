# Regional Disruption Overlay and Selection Refinement

**Date:** 2026-07-29

## Goal

Make GO/UP disruption overlays remain source-honest and usable when corridor,
segment, and station impacts overlap, while preserving the existing regional
SVG, camera, alert-card, and mobile interaction architecture.

## Implemented behavior

- Fresh regional planned closures now remain in backend map segment and
  single-station impact DTOs, allowing the existing blue planned-preview
  renderer to work with Metrolinx-backed dashboard data rather than fixtures
  alone.
- A station-only suspension is no longer inferred to be a route-wide alert
  merely because both shapes have an empty affected-segment list. The frontend
  cross-checks station-node impact identities before drawing a full corridor.
- Overlapping segment lanes use a deterministic severity and alert-identity
  order instead of depending on payload array order. The widest-to-narrowest
  order is suspension, delay, Reduced Speed Zone, then planned closure.
- Repeated pointer activation at an overlap cycles through the distinct
  segment or station impacts at that location. Keyboard activation continues
  to select the explicitly focused SVG target.
- A completed card or map selection is moved to the foreground within the
  regional SVG, including all connected pieces for that alert and matching
  station rings. Hover and focus do not move DOM nodes, avoiding interrupted
  pointer or keyboard activation.
- The synthetic all-impact-types scenario now includes an intentional
  Lakeshore East delay/planned-closure overlap for repeatable verification.

## Boundaries

- No database migration or API shape change is required.
- Regional alert direction remains bidirectional because the normalized source
  does not retain trustworthy direction metadata.
- The map remains schematic and topology-projected; these overlays do not
  imply exact physical geometry or train movement.
- This slice does not add a TTC-style floating overlap chooser. Cycling,
  deterministic lanes, card selection, and keyboard focus provide access to
  every current regional impact without adding a new regional-only panel.

## Verification

- `mvn -f backend/pom.xml -Dtest=RegionalDashboardServiceTest test`
- `node --test frontend/tests/regional-network.test.mjs`
- `npm --prefix frontend run typecheck`
- `npm --prefix frontend run test:smoke -- --grep "renders fresh Metrolinx impacts in regional mode" --project=desktop-chrome`

Before completion, run the full backend suite plus the standard frontend
fixture, typecheck, lint, build, and relevant desktop/mobile Playwright checks.
