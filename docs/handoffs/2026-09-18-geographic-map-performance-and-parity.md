# Geographic map stability and system-map parity

Status: approved design, implementation pending. Prepared for Gemini 3.8 Flash on 2026-09-18. This handoff changes no application behavior. Findings below come from code inspection, not runtime reproduction or performance measurements.

## Mandatory session boundaries

**Implement exactly one session per session. Do not attempt this entire guide in one session.** The user explicitly requires separate sessions. The guide is organized into five manageable sessions:

1. Reproduce and fix map flashing/lifecycle.
2. Complete alert parity and overlap hierarchy.
3. Add direction arrows and estimated trains.
4. Add fading line badges in both views.
5. Validate integration and performance.

Each ends with checks, a handoff, and an explicit stop. Further splitting is reserved for unexpected complexity—not routine steps. Start at session 1 unless the progress log records a verified completed session. After the current session, write the handoff, report results, and stop. Wait for the user to start the next session; remaining context or time does not authorize continuing.

| Session | Bounded scope | Required exit evidence |
| --- | --- | --- |
| 1. Reproduce and fix map flashing/lifecycle | Reproduce sidebar/poll flashes with a focused regression; capture baseline; implement lifecycle separation, in-place GeoJSON updates, theme rehydration, resize and recovery. | Regression demonstrated failing then passing; camera/selection survive toggles and polls; theme/retry/unmount checked. No alert or train additions. |
| 2. Complete alert parity and overlap hierarchy | Implement shared eligibility selector, planned previews, station impacts, complete overlap groups, deduplicated counts, priority and secondary selection. Defer directional symbols to session 3. | Eligible IDs/details match both views; timing, parent deduplication, missing geometry and overlap cases pass; dense interchange inspected. |
| 3. Add direction arrows and estimated trains | Add static directional symbols along links and implement estimated train projection. Reuse verified link orientation/projection helpers while keeping alert direction and train eligibility rules separate. | Forward/reverse/both/unknown alert cases and curved/reversed/missing train links pass; freshness/visibility gates verified; no perpetual animation or GPS claim. |
| 4. Add fading line badges in both views | Implement geographic line-number anchors/symbols/fade and system-map badge separation/fade. | Phone/desktop overview-to-detail inspected; badges respect collision/gesture rules; generated assets and fallback preserve the map contract; only badges fade. |
| 5. Validate integration and performance | Run final cross-feature matrix, compare baseline, resolve integration regressions and update delivered behavior claims. No new features or broad refactors. | Required checks and measured comparison recorded, visual changes reviewed, outstanding limitations stated. |

Sessions run sequentially. Five sessions are the intended delivery size; individual tests, files and internal steps are not separate sessions. Keep work bounded to the current session and avoid unrelated cleanup. If unexpected complexity would make a session balloon, stop at a coherent boundary and record the precise remaining work as a continuation of that session. Splitting is an escape hatch, not the default. Do not mark a session complete with required behavior or checks still failing; session 1 must finish with its reproduced regression fixed.

At session start, read this section, the progress log, the current session's section and applicable scoped guidance. Inspect the current worktree before editing; prior findings and line numbers may have drifted. Preserve unrelated changes. Do not redo completed work unless current evidence invalidates it.

At session end, update the progress log below with:

- Completed session or sub-checkpoint, changed files, and concrete behavior delivered.
- Exact commands and results, including expected failures, skipped checks and reasons. Record the revision or working-tree state covered by passing checks.
- Remaining defects, evidence gaps and any implementation decisions that refine this design.
- The next session's bounded task and relevant files/test commands, sufficient for a fresh session without chat history.

Run focused checks within each session and applicable scoped-guide checks for its completed changes. Session 5 owns the final integrated matrix; reuse unchanged passing results where valid. Never defer a session's defining regression check to the final session. No automatic commits, deployment or external publication are requested.

Suggested first-session prompt:

> Read docs/handoffs/2026-09-18-geographic-map-performance-and-parity.md. Execute session 1 (Reproduce and fix map flashing/lifecycle) only. Run its checks, update the progress log with required exit evidence and next-session handoff, then stop. Do not begin session 2.

Suggested continuation prompt:

> Read docs/handoffs/2026-09-18-geographic-map-performance-and-parity.md and its progress log. Execute only the next incomplete session (or recorded sub-checkpoint), run its checks, update the log with exit evidence, then stop. Do not continue to another session.

### Progress log

- **2026-09-18 Session 1 Complete**: Reproduce and fix map flashing/lifecycle.
  - Delivered:
    - Implemented lifecycle separation in `GeographicNetworkMap.tsx`: the map constructor `useEffect` now depends strictly on `[network, retryCount, attachMapListeners]`, completely decoupling it from theme, data polls, selections, filters, and callback churn.
    - Used `callbacksRef` to ensure all click, move, and query listeners invoke current handlers without reinstalling the map or recreating listeners.
    - Implemented idempotent transit layer/source installation (`installTransitLayers`) and in-place GeoJSON updates (`applyDynamicDataAndFilters`) via `source.setData(...)` on existing sources (`transit-impacts`, `transit-impact-stations`, `transit-impact-badges`, `transit-commute-links`, `transit-commute-stations`).
    - Implemented theme rehydration: compared `appliedStyleUrlRef` before replacing styles with `map.setStyle(...)`, registered `map.once("style.load")` rehydration callback beforehand to restore transit sources, layers, and latest data on genuine theme change without tearing down the map or camera.
    - Implemented container `ResizeObserver` coalesced via `requestAnimationFrame` to call `map.resize()` only when container dimensions actually change (> 0.5px), preserving center and zoom without refitting or recreating.
    - Maintained clear state boundaries: tile activity after `ready` never returns to initial loading or triggers error overlays; WebGL context loss presents an explicit error card with "Retry" and "Use Diagram" fallback.
    - Synchronized zoom slider via direct DOM ref during continuous gestures to prevent unnecessary React re-renders, updating state on `moveend`.
    - Added test seam in `frontend/src/app/geographic-lifecycle.ts` to record constructor, removal, style replacement, loading, ready, error, and resize events on `window.__linewatchGeographicMapLifecycle`.
  - Evidence & reproduction:
    - Failing reproduction captured via Playwright: `npx --prefix frontend playwright test geographic-map-lifecycle.spec.ts -c frontend/playwright.config.ts --project=desktop-chrome` failed with `Expected: 1, Received: 4` constructors (sidebar collapse + expand + refresh each destroyed and reconstructed the map).
    - Passing Playwright suite after fixes: 4/4 tests passed (sidebar toggles & poll ticks retain 1 constructor, 0 removals, 0 style replacements, 1 loading transition; camera zoom and selection survive; theme toggle replaces style exactly once and rehydrates; context-loss displays error card and switches to diagram via fallback button).
    - Fast test suite: `npm --prefix frontend run test:fast` passed with 0 failures (including new `tests/geographic-map-lifecycle.test.mjs`).
    - Typecheck: `npm --prefix frontend run typecheck` passed cleanly.
    - Lint: `npm --prefix frontend run lint` passed with 0 errors and 0 warnings.
    - Base commit: `e98d818c146ac1cd2788da99d98a52c55b74771b`.
  - Changed files:
    - `frontend/src/app/geographic-lifecycle.ts`
    - `frontend/src/components/GeographicNetworkMap.tsx`
    - `frontend/tests/smoke/geographic-map-lifecycle.spec.ts`
    - `frontend/tests/geographic-map-lifecycle.test.mjs`
    - `docs/handoffs/2026-09-18-geographic-map-performance-and-parity.md`
  - Remaining defects or refinements:
    - None for Session 1 scope. Alert additions, direction indicators, trains, and line badges were intentionally deferred to Sessions 2–4 per plan boundaries.
  - Next Session (Session 2):
    - Task: Complete alert parity and overlap hierarchy. Extract shared pure semantic selector for both renderers, planned closure previews, station-only impacts, deduplicated counts, priority hierarchy, and secondary selection highlight.
    - Relevant files: `frontend/src/app/geographic-overlays.ts`, `frontend/src/components/GeographicNetworkMap.tsx`, `frontend/src/components/InteractiveTtcMap.tsx`.
    - Test commands: `npm --prefix frontend run test:fast`, `npm --prefix frontend run typecheck`, `npm --prefix frontend run lint`.

- **2026-09-18 Session 2 Complete**: Complete alert parity and overlap hierarchy.
  - Delivered:
    - Created shared pure alert selector in `frontend/src/app/map-alert-selector.ts` (0 DOM/SVG/MapLibre dependencies):
      - `getEligiblePlannedClosures`: filters planned closures, deduplicates parent active closures when child active alert is active-now, respects preview segment coverage, and includes selected preview closures.
      - `buildActiveClosureImpactCardIds`: maps parent closure IDs to child active alert IDs.
      - `normalizeActiveClosureMapImpact`: normalizes map impacts so active child alerts reclassify parent planned-closure impacts into active suspensions.
      - `getImpactPriority`: enforces priority order `suspension (4) > delay (3) > planned-closure (2) > reduced-speed-zone (1)`.
      - `countUniqueImpactsByKind`: counts unique logical impacts per kind, deduplicating multiple rows or segments for the same underlying disruption.
      - `selectUnifiedLogicalImpacts`: unifies active alerts, delays, RSZs, station impacts, and planned closures with consistent card bindings.
    - Updated `frontend/src/components/map-impact-normalization.ts` to re-export pure selector functions.
    - Implemented full parity in `frontend/src/app/geographic-overlays.ts`:
      - Planned-closure previews projected with `#3b82f6` color, `"C"` badge label, and `isDashed: true`.
      - Overlap hierarchy: primary stroke adopts the highest-priority impact (`suspension > delay > planned-closure > reduced-speed-zone`).
      - All card IDs retained in `allCardIds`, `allImpactKinds`, and `rawImpacts` GeoJSON properties for selection matching.
      - Route isolation: strictly validates `segment.lineId === link.properties.lineId` to prevent multi-station spans at shared interchanges (e.g. Line 1 and Line 2 at Bloor-Yonge / St. George) from cross-matching unrelated lines.
      - Station-only service impacts project as station rings (`transit-station-impacts`) and correctly typed badges without fabricating corridor spans.
      - Deterministic multi-badge placement along link polylines (`getPointAlongPolyline`) at fractional offsets (0.4/0.6, 0.32/0.5/0.68), eliminating coordinate collision dropouts and displaying distinct badges per kind with deduplicated counts.
      - Secondary selection bounds (`getSelectionBounds`) resolves coordinates for hidden secondary impacts and planned previews without errors or bogus coordinates.
    - Updated `frontend/src/components/GeographicNetworkMap.tsx`:
      - Reordered layer installation so `transit-impacts-selection` (13px cyan halo) renders under `transit-impacts-line` (6.5px primary stroke), preserving primary severity when selected.
      - Added `transit-station-impacts-selection` layer for station impacts.
      - Selection filter uses MapLibre native array check `["in", selection.id, ["get", "allCardIds"]]`, correctly highlighting shared corridors when a hidden secondary impact is selected.
      - Added click and mouse feedback listeners for impact badges and station rings.
  - Evidence & tests:
    - 9 comprehensive unit and parity tests created in `frontend/tests/geographic-alert-parity.test.mjs` verifying planned preview eligibility, parent/child active closure deduplication, priority hierarchy, per-kind multi-badge placement, secondary selection camera bounds, station-only impact isolation, interchange route filtering, and missing geometry handling.
    - Fast test suite: `npm --prefix frontend run test:fast` passed with all tests green (0 failures).
    - Typecheck: `npm --prefix frontend run typecheck` passed with 0 errors.
    - Lint: `npm --prefix frontend run lint` passed with 0 errors and 0 warnings.
    - Working tree state: base commit `e98d818c146ac1cd2788da99d98a52c55b74771b` + clean Session 1 & 2 changes.
  - Changed files:
    - `frontend/src/app/map-alert-selector.ts` (new)
    - `frontend/tests/geographic-alert-parity.test.mjs` (new)
    - `frontend/src/components/map-impact-normalization.ts`
    - `frontend/src/app/geographic-overlays.ts`
    - `frontend/src/components/GeographicNetworkMap.tsx`
    - `docs/handoffs/2026-09-18-geographic-map-performance-and-parity.md`
  - Catalog quirks and edge cases discovered:
    - Link segment IDs in `ttc-catalog.json` use format `line-1-bloor-yonge-rosedale` (no `segment-` prefix), whereas `regional-catalog.json` uses `segment-br-aurora-newmarket`. Normalizing IDs by stripping `^segment-` ensures seamless cross-catalog compatibility.
    - Shared interchange endpoints (e.g. Bloor-Yonge, St. George) must require route match (`segment.lineId === link.properties.lineId`) to prevent multi-station segments from spreading across crossing lines.
    - MapLibre array properties in GeoJSON work cleanly with `["in", needle, ["get", "arrayProp"]]` filter expressions.
  - Next Session (Session 3):
    - Task: Add direction arrows and estimated trains.
    - Bounded scope: Static direction indicators for alerts oriented along polyline geometry; pure link projection, progress interpolation, and batched rendering for estimated train markers from live snapshot data; offline/freshness gating.
    - Starting files: `frontend/src/app/geographic-overlays.ts`, `frontend/src/components/GeographicNetworkMap.tsx`, `frontend/src/app/linewatch-data.ts`, `frontend/src/app/station-arrivals.ts`.
    - Test commands: `npm --prefix frontend run test:fast`, `npm --prefix frontend run typecheck`, `npm --prefix frontend run lint`.

- **2026-09-18 Session 3 Complete**: Add direction arrows and estimated trains.
  - Delivered:
    - Direction Indicators:
      - Implemented `resolveTravelDirectionFromDisplay` in `frontend/src/app/map-alert-selector.ts`: maps cardinal directions ("Eastbound", "Westbound", "Northbound", "Southbound") and bidirectional indicators to topological forward/reverse against station topology sequence (including Line 1's U-shape geometry around Union).
      - Added `directionCertainty: "explicit" | "unspecified"` to `MapImpact` in `frontend/src/app/linewatch-data.ts`.
      - Implemented `projectImpactArrows` in `frontend/src/app/geographic-overlays.ts`: projects static directional indicators strictly aligned with link polyline tangents via `getPointAndBearingAlongPolyline`.
      - Implemented paired opposing indicators for explicit bidirectional alerts (at 0.42 and 0.58 fractional offsets).
      - Suppressed indicators on short links (`totalDistance < 120m`, `MIN_ARROW_LINK_LENGTH_METERS`) to prevent chevron clipping and station ring collisions.
      - Omitted arrows when direction is unspecified/unknown (prevents fabricating false direction).
      - Supported secondary selection emphasis: selecting a secondary alert highlights its distinct direction without modifying the primary track severity.
    - Estimated Trains:
      - Forwarded `estimatedTrainsEnabled` and `estimatedTrainMarkers` from `LineWatchShell` through `NetworkMap` to `GeographicNetworkMap`.
      - Implemented pure projection in `projectEstimatedTrainMarkers` in `frontend/src/app/geographic-overlays.ts`: matches link by line and station endpoints; rejects ambiguous or absent links; validates progress range [0.0, 1.0] (rejecting out-of-range, NaN, strings); orients coordinates from `fromStationId` toward `toStationId`; interpolates positions using cumulative polyline distance via `getCachedPolylineDistances`; preserves heading bearing along tangent polyline segments.
      - Gating invariants enforced: offline state (`navigator.onLine === false`), disabled toggle (`enabled === false`), closed service hours (`closedHours === true`), and empty snapshot immediately suppress train markers so no false live positions are presented.
      - Sprites & Batched Rendering in `frontend/src/components/GeographicNetworkMap.tsx`:
        - Registered SDF sprites (`direction-arrow`, `train-arrow`) for dynamic WebGL tinting.
        - Installed `transit-impact-arrows` (symbol layer, minzoom: 11.5, icon-rotate: bearing, map alignment).
        - Installed `transit-train-markers-halo` (circle, minzoom: 10.5, selection halo / contrast casing), `transit-train-markers-body` (circle, minzoom: 10.5, line color), `transit-train-markers-symbol` (symbol, minzoom: 11.0, train heading arrow), and `transit-train-markers-label` (symbol, minzoom: 13.0, suppressing text labels at overview zoom).
        - Integrated with in-place GeoJSON updates (`applyDynamicDataAndFilters`), corridor filtering opacities, and click / hover selection.
  - Evidence & tests:
    - 12 comprehensive unit and regression tests in `frontend/tests/geographic-arrows-and-trains.test.mjs` verifying:
      - Direction indicator resolution (cardinal directions, Line 1 Yonge/University arms, bidirectional, unspecified).
      - Forward, reverse, and paired opposing indicators along polylines.
      - Low-zoom and short-link suppression (< 120m).
      - Secondary selection directional emphasis.
      - Train progress interpolation at endpoints (0.0, 1.0) and interior (0.5), curved polylines, reversed links, zero-length links.
      - Malformed progress rejection and ambiguous/absent link rejection.
      - Online/offline, disabled toggle, and closed-hours gating invariants.
    - Fast test suite: `npm --prefix frontend run test:fast` passed with 0 failures (all tests green).
    - Typecheck: `npm --prefix frontend run typecheck` passed with 0 errors.
    - Lint: `npm --prefix frontend run lint` passed with 0 errors and 0 warnings.
  - Changed files:
    - `frontend/src/app/linewatch-data.ts`
    - `frontend/src/app/map-alert-selector.ts`
    - `frontend/src/app/geographic-overlays.ts`
    - `frontend/src/components/NetworkMap.tsx`
    - `frontend/src/components/GeographicNetworkMap.tsx`
    - `frontend/tests/geographic-arrows-and-trains.test.mjs` (new)
    - `docs/handoffs/2026-09-18-geographic-map-performance-and-parity.md`
  - Next Session (Session 4):
    - Task: Add fading line badges in both views.
    - Bounded scope: Geographic line badges (termini and sparse reviewed intermediate anchors, native symbol sprites, zoom-driven opacity fading from zoom 10 to 14, non-interactive); system-map badge separation and diagram scale-driven fading.
    - Starting files: `frontend/src/components/GeographicNetworkMap.tsx`, `frontend/src/components/InteractiveTtcMap.tsx`, `docs/ttc-map-asset-contract.md`.
    - Test commands: `npm --prefix frontend run test:fast`, `npm --prefix frontend run typecheck`, `npm --prefix frontend run lint`.

- **2026-09-18 Session 4 Complete**: Add fading line badges in both views.
  - Delivered:
    - Added a pure line-badge model in `frontend/src/app/map-line-badges.ts` with 17 reviewed TTC geographic anchors across Lines 1, 2, 4, 5 and 6. Line 1 includes Vaughan Metropolitan Centre and St George on the west arm, Union at the base, and Bloor-Yonge and Finch on the east arm; missing catalog stations are omitted without guessed coordinates.
    - Registered stable-size native MapLibre circle-and-number sprites using the authored TTC colors and contrast conventions. Geographic badges use collision-aware symbol placement, yield to station names, remain outside all interactive hit layers, and place alert badges above them.
    - Calibrated geographic fade to opacity 1 at zoom 10, 0.5 at zoom 12 and 0 at zoom 14. `maxzoom: 14` removes fully faded symbols from collision placement; active line filtering dims unrelated badges consistently with the route layer.
    - Split the authored system-map `ttc-line-badges-layer` from the foreground SVG markup and generated raster foreground. Added a dedicated badge raster plane for every TTC theme and density while preserving the required source SVG layer and geometry fallback.
    - Bound system-map badge opacity to rendered diagram scale using the verified calibration 1 at fit scale, 0.5 at 1.7x fit and 0 at 2.5x fit. The authored SVG fallback uses the same opacity function. Station names, station/connection artwork and tracks remain on independent fully opaque planes.
    - Kept the system badge plane below live disruption overlays and above the background track texture. Both raster and fallback badge layers use `pointer-events: none`; mobile offline installation and raster fallback recognize the new plane.
    - Updated `docs/ttc-map-asset-contract.md` to document the four TTC static planes and regeneration contract.
  - Visual and regression evidence:
    - Added `frontend/tests/map-line-badges.test.mjs` for anchor coverage, missing-station behavior, fade calibration, geographic zoom cutoff/non-interactivity, and SVG/raster separation. Updated raster and layer-order contracts for the new plane.
    - Added `frontend/tests/smoke/map-line-badges.spec.ts`. Final focused Playwright run at 1440x900 and 360x800 passed 4/4 cases across desktop Chrome and mobile Chromium, capturing system and geographic overview/intermediate/detail states. Review confirmed full overview badges, progressive midpoint fading, no line badges at detail thresholds, unchanged station/track opacity, and no gesture interception.
    - The first two exploratory browser runs exposed test-driver issues only (a React range input needed the native value setter and mobile hides its slider visually); the final test drives the attached native input at exact calibration values on both layouts.
    - Focused asset, badge, service-worker and raster tests passed 23/23 before the full suite.
    - `npm --prefix frontend run test:fast`: passed with 0 failures after updating the existing source-order assertion for the separated badge fallback.
    - `npm --prefix frontend run typecheck`: passed with 0 errors.
    - `npm --prefix frontend run lint`: passed with 0 errors and 0 warnings.
    - `npm --prefix frontend run generate:map-rasters`: passed; only the nine TTC foreground textures changed and nine TTC badge textures were added.
  - Changed files:
    - `frontend/src/app/map-line-badges.ts` (new)
    - `frontend/src/app/map-assets.ts`
    - `frontend/src/app/map-preload.ts`
    - `frontend/src/components/GeographicNetworkMap.tsx`
    - `frontend/src/components/InteractiveTtcMap.tsx`
    - `frontend/src/components/RasterMapPlane.tsx`
    - `frontend/src/styles/map/base-map.css`
    - `frontend/scripts/generate-map-rasters.mjs`
    - `frontend/public/sw.js`
    - `frontend/public/assets/linewatch/raster-maps/ttc-foreground-*.png`
    - `frontend/public/assets/linewatch/raster-maps/ttc-badges-*.png` (new)
    - `frontend/tests/map-line-badges.test.mjs` (new)
    - `frontend/tests/smoke/map-line-badges.spec.ts` (new)
    - `frontend/tests/map-raster-renderer.test.mjs`
    - `frontend/tests/map-layering.test.mjs`
    - `docs/ttc-map-asset-contract.md`
    - `docs/handoffs/2026-09-18-geographic-map-performance-and-parity.md`
  - Remaining defects or refinements:
    - None for Session 4 scope. Broader theme/motion/cross-network integration and measured performance remain intentionally assigned to Session 5.
  - Next Session (Session 5):
    - Task: Validate integration and performance only; add no new features or broad refactors.
    - Target suites: frontend fast/typecheck/lint/build, smoke and E2E desktop/mobile shell and geographic interaction cases, plus 360px/1440px visual review across light/dark/high contrast and reduced motion.
    - Benchmark criteria: production build with fixed normal/dense fixture snapshots; record viewport, browser/device, DPR, fixture counts, p95 frame intervals, tasks over 50ms, source updates, style requests and lifecycle counts. Require zero ordinary-interaction lifecycle resets; aim for 60fps desktop and at least 30fps on a representative phone, separating warm rendering from cold tile latency and reporting any unavailable physical-device evidence.

- **2026-09-18 Pre-Session 5 polish complete**: Stop here; start Session 5 only in a separate session.
  - Agreed behavior and implementation now present:
    - Geographic View-on-Map camera bounds use the rendered projected link/station identity graph, including indirect/source IDs. Initial selections and same-key late geometry retry until a focus succeeds. Unsupported geometry leaves the camera unchanged and announces `Location unavailable on geographic map`.
    - Explicit direction arrows are no longer suppressed under 120 m. They avoid the midpoint badge, repeat at bounded intervals on longer links, appear from zoom 10.5, and use a dark casing with white core for contrast. Unknown direction still produces no invented arrow. Selecting/hovering a secondary overlap switches arrows to that alert while the priority impact retains the base track.
    - Train captions are direction-only (`Eastbound`, etc.; none when unavailable). Marker circles and heading glyphs are about 18–20% larger. Direction/train sprites are generated at 2x/3x pixel density to remove rotated raster jaggies.
    - Contiguous links with an identical alert set consolidate to one per-kind geographic badge. Badges retain the kind glyph and render counts in a separate bubble instead of replacing the glyph with an unexplained number.
    - Geographic multi-impact clicks retain batched MapLibre layers and mount only one React `MapOverlapChooser`. Desktop chooser follows its geographic anchor; compact layout docks near the bottom. Pure grouping exposes every distinct same-kind and mixed-kind alert.
  - Final overlap-chooser regression fix:
    - Replaced the guessed canvas fraction with `window.__linewatchGeographicMapLifecycle.getProjectedImpactAnchor(key)`, a live resolver that projects the current grouped badge (or link/station fallback) through the mounted MapLibre camera and returns it only when `queryRenderedFeatures` confirms the target is actually hittable.
    - Pinned reduced motion for this chooser regression so unrelated camera animation cannot move the target between resolution and click. Desktop performs a real click at the live badge anchor. Compact switches the inspector to map-focus, pans the badge clear of the inspector, resolves the post-pan rendered anchor, and performs the same real click.
    - The regression asserts both distinct same-kind Line 4 delay choices. Desktop asserts an in-map anchored chooser; compact uses a 360x800 viewport and asserts the chooser is docked within 16px of the available map bottom.
  - Final verification:
    - `npm --prefix frontend run test:fast` passed with 0 failures after the final source change.
    - `npm --prefix frontend run typecheck` passed cleanly after the final source change.
    - `npm --prefix frontend run lint` passed with 0 errors and 0 warnings after the final source change.
    - Focused pure tests: 40/40 in `geographic-alert-parity.test.mjs` and `geographic-arrows-and-trains.test.mjs`.
    - New View-on-Map browser case passes for supported geometry or the explicit unavailable notice.
    - Geographic line-badge/detail screenshot test passes; reviewed detail capture shows kind glyphs plus separate count bubbles and prominent repeated arrows.
    - `LINEWATCH_PLAYWRIGHT_REUSE_BUILD=true npx --prefix frontend playwright test geographic-map-lifecycle.spec.ts -c frontend/playwright.config.ts --project=desktop-chrome --project=mobile-chromium` passed: 7 passed, 5 intentional mobile skips for desktop-only lifecycle/theme/context cases.
    - Focused chooser command across both projects passed 2/2. Reviewed `/tmp/geographic-overlap-chooser-desktop.png` and `/tmp/geographic-overlap-chooser-compact.png`: desktop chooser followed the Line 4 badge without obscuring the corridor; compact chooser docked at the bottom of the available map region with both choices in its scroll surface. Temporary screenshot capture code was removed.
    - Working tree covered: base `70b1cd459b29e90e38e6e49fd34a0337381f9463` plus the preserved Sessions 1-4 and completed pre-Session 5 polish changes.
  - Remaining defects or evidence gaps:
    - None for this polish checkpoint. Session 5 still owns the broader integration matrix, theme/motion/cross-network review, production build validation, and measured performance comparison.
  - Next session:
    - Execute Session 5, “Validate integration and performance,” only, following its existing bounded scope and checks below. Do not add features or broad refactors.
  - Main changed files for this checkpoint:
    - `frontend/src/app/geographic-overlays.ts`
    - `frontend/src/app/geographic-lifecycle.ts`
    - `frontend/src/components/GeographicNetworkMap.tsx`
    - `frontend/tests/geographic-alert-parity.test.mjs`
    - `frontend/tests/geographic-arrows-and-trains.test.mjs`
    - `frontend/tests/geographic-map-phase-d.test.mjs`
    - `frontend/tests/smoke/geographic-map-lifecycle.spec.ts`

## Outcome and agreed scope

Keep a geographic map instance stable while dashboard data, sidebar state, filters, and selection change. After initial loading, normal tile requests must never replace the map with “Loading TTC Geographic Map.” Preserve camera and selection. Match system-map alert eligibility, priority, details, and filters using performant geographic rendering. Add static directional indicators, estimated train markers from existing data, and informational line badges that fade with zoom. Add equivalent badge fading to the system map in a separate stage.

The user approved these decisions after a grilling interview:

- Share alert semantics between views, including eligible upcoming planned previews and station-only service impacts. Missing geographic coverage leaves an alert available in the existing list/details; never invent a location.
- Highest-priority service impact owns the track treatment. Compact per-kind badges/counts expose overlapping impacts. Reveal more detail with zoom and selection.
- Direction arrows are static for everyone. Distinguish explicit bidirectional coverage from unspecified direction.
- Trains reuse existing estimated positions and freshness gates; this is not GPS tracking or a new provider integration.
- Prioritize responsive interaction on ordinary phones; reduce labels and consolidate badges before sacrificing affected-track visibility. Preserve selected items.
- Geographic line-number badges appear at termini and sparse reviewed intermediate anchors, including both Line 1 arms. System-map badges retain authored placements. Badges are informational and must not intercept gestures.
- Line badges remain fully visible at overview, fade gradually through intermediate zoom, and disappear at station-detail zoom. Keep a stable screen size on the geographic map. Calibrate each renderer separately.
- Deliver in stages: lifecycle; alert parity/hierarchy/direction; trains and geographic badges; system-map badge separation/fading.

Scope is TTC geographic behavior and TTC badge fading. Shared components must preserve GO/UP behavior and independent freshness. Do not expand regional capabilities or introduce new ingestion. “All alerts” means parity with eligible system-map overlays, not turning every notice into a route impact.

## Read before implementation

Follow [root guidance](../../AGENTS.md), [frontend guidance](../../frontend/AGENTS.md), affected sections of [domain invariants](../domain-invariants.md), and [testing](../testing.md). Read [map asset contract](../ttc-map-asset-contract.md) before stage 4. Preserve [source/attribution boundaries](../source-licensing-launch-gates.md).

Accessibility outages, surface notices, station-page notices, service notices without supported spans, and cancellations must not acquire route overlays. Preserve station-detail access where already supported. Future planned work is a preview, not an active service claim. Existing freshness, offline, and effective-window rules remain authoritative.

## Evidence and ownership

Line references describe the inspected checkout and will drift during implementation.

| Owner | Finding and consequence |
| --- | --- |
| `frontend/src/components/GeographicNetworkMap.tsx`, around 705–915 | Initialization depends on `installTransitLayers`, callbacks, theme and filter. Installer depends on dynamic segments, station impacts, selection and commute preview. Cleanup removes the map; initialization sets loading and constructs it again. Separate data-update effects already exist but cannot prevent this teardown. |
| `frontend/src/components/LineWatchShell.tsx`, around 3300–3330 | `handleSelectStationId` depends on `desktopSidebarCollapsed`. Sidebar toggle changes a dependency passed into geographic initialization. This is a concrete teardown path, not evidence of slow tiles. |
| Same shell, around 2862 | Refresh replaces dashboard data; changed segment/impact identities can change installer identity and trigger the same path. Verify the observed periodic flash against this trigger in a browser. |
| `GeographicNetworkMap.tsx`, around 983 | Theme effect calls `setStyle` when installer identity or ready state changes, without checking whether theme changed. This provides another avoidable style reload path. |
| Same component, around 872 and 1119 | Zoom drives React state; resize handling is tied to active/ready state. Audit which state is necessary and observe actual container size changes. |
| `frontend/src/components/InteractiveTtcMap.tsx`, around 1312–1341 and 3677–3705 | System map independently builds planned-closure previews, including selected closures and active-parent deduplication. Geographic inputs lack this preview path. |
| `frontend/src/app/geographic-overlays.ts`, around 366–527 | Link projection chooses one primary impact; colocated badges are discarded by rounded coordinate keys. Station badges collapse non-suspension kinds to “D.” Counts and card IDs use different deduplication behavior. |
| `GeographicNetworkMap.tsx`, around 467 | Selection halo matches only the primary card ID; selecting a secondary overlapping impact cannot highlight all its shared links. |
| `frontend/src/components/NetworkMap.tsx`, around 39–58 | Shell supplies estimated train snapshot/visibility, but geographic branch does not forward them. |
| `frontend/src/app/train-markers.ts` | Existing estimates contain adjacent segment/endpoints, progress, direction, timestamps and IDs, not measured geographic positions. |
| [Map asset contract](../ttc-map-asset-contract.md) | System-map foreground raster contains line badges together with station dots, labels and connection artwork. Independent fading requires asset/layer separation. |

## Session 1: Reproduce and fix map flashing/lifecycle

### Bounded scope and architecture

First create a focused browser regression that observes the exact loading flash and map lifecycle during sidebar toggles and controlled data refreshes. Capture constructor, removal, style replacement and loading-overlay transitions using a test-only seam or scoped instrumentation. A canvas-presence assertion alone cannot detect replacement. Reproduce before fixing; do not treat this inspection as runtime proof of every flash.

Use one map owner for the mounted network and explicit retry generation. Initialization must not depend on data, selection, filter, sidebar callbacks, or theme identity. Keep current event callbacks in refs or an equivalent supported pattern; listeners should invoke current handlers without reinstalling the map. Do not suppress dependency warnings to conceal stale closures.

Separate responsibilities:

1. Lifecycle owns map creation, catalog acquisition, initial readiness, listeners, cancellation, and cleanup.
2. A single idempotent style-ready installer creates transit sources, sprite images and layers in deterministic order, then applies the latest state.
3. Dynamic source updates change only affected GeoJSON. Selection and filters update their filters/paint or feature state without rebuilding geometry.
4. Theme changes compare the applied style identity and replace style only on a real change. Register rehydration before replacement. Rehydrate from latest refs so polling during style loading cannot restore stale overlays.
5. A container `ResizeObserver`, coalesced to at most one animation frame, calls resize only when dimensions change. Overlay-only sidebar movement needs no resize. A docked sidebar can change canvas dimensions but must not reconstruct or refit the map.

Use an explicit state distinction: initial loading, usable, recoverable degradation, fatal/unavailable. Tile activity after readiness never returns to initial loading ("Loading TTC Geographic Map"). Keep last usable view during transient tile/source failures; communicate degraded freshness honestly. Initial timeout, unavailable WebGL, and explicit retry retain understandable fallback to system map. Handle context loss with a small recovery notice and bounded retry/fallback; never disguise a truly lost canvas as healthy.

Cancel or generation-guard asynchronous catalog/style work. Remove observers and listeners on real unmount; ensure late callbacks cannot mutate a replacement map. Account for development Strict Mode separately from production lifecycle counts. Mode/network switching follows existing viewport persistence; do not keep multiple hidden WebGL contexts alive merely to avoid an initial load on intentional remount.

Acceptance: after initial ready, sidebar toggle, unchanged poll, changed poll, filter, station/alert selection, and commute preview produce zero additional constructors/removals/full loading transitions and zero style replacements. Theme change preserves the map instance/camera and restores every overlay exactly once. A genuine container resize preserves geographic center and zoom unless an explicit existing navigation action requests otherwise.

Bounded scope: Lifecycle, in-place GeoJSON updates, theme rehydration, container resize, and error/context recovery only. No alert additions, direction arrows, train markers, or line badges.

### Checks

- Focused browser regression asserting zero extra map constructors, removals, style replacements, or full loading-overlay transitions during sidebar toggles, equal polls, and changed polls.
- Component tests verifying camera center/zoom and active selection survive sidebar collapse/expand, poll ticks, filter changes, and commute preview toggle.
- Theme switching verifies style replaces only when theme genuinely changes, restoring transit sources and overlays without full map teardown.
- Unmount and context-loss recovery tests verify clean listener removal and proper fallback behavior.
- Scoped checks: `npm --prefix frontend run test:fast`, `npm --prefix frontend run typecheck`, `npm --prefix frontend run lint`.

### Handoff

- In `### Progress log`, record session 1 completion, list changed files, and detail the concrete lifecycle fixes delivered.
- Record exact commands executed and results (including the failing-then-passing reproduction evidence and working-tree revision).
- Note any remaining defects, edge cases, or implementation refinements.
- State the exact bounded task for session 2, listing relevant files and test commands for a fresh session.

### Stop

Stop. Do not proceed to Session 2 in this session. Further splitting is reserved for unexpected complexity—not routine steps.

## Session 2: Complete alert parity and overlap hierarchy

### Bounded scope and architecture

Extract the smallest pure semantic selector needed by both renderers. Keep authored SVG geometry and GTFS geometry in their respective adapters. Do not import the system-map component into the geographic renderer or rewrite its entire presentation pipeline.

The selector should preserve stable logical impact ID, related detail-card IDs, line ID, affected adjacent links or station IDs, kind, direction certainty, effective timing, active/preview state, and priority. Reuse existing planned-preview eligibility, selected-preview behavior, parent/child deduplication, and filters. Freeze current system-map behavior with characterization cases before extraction.

Project onto reviewed catalog links using line identity plus endpoint/topology matching. Do not match shared interchange endpoints across unrelated routes. Preserve missing-link coverage information and omit unsupported geometry. Station-only service impacts remain station rings/badges; do not fabricate a corridor span.

For each link or station, retain the full deduplicated group before deriving presentation. Priority follows existing behavior: suspension > delay > planned closure > RSZ. Count unique logical impacts per kind, not input rows or parent/child duplicates. Keep all selectable card associations. Selection matching must inspect group membership, including a lower-priority impact hidden under the primary stroke.

| Semantic feature | Geographic treatment |
| --- | --- |
| Active suspension/closure | Existing red service treatment above lower-priority strokes |
| Ordinary delay | Orange treatment, distinct from explicit RSZ chevrons |
| Upcoming planned work | Existing blue preview convention, with timing in details |
| Explicit RSZ | Orange segment treatment with recognizable static chevrons |
| Station-only service impact | Station ring and correctly typed badge; no fabricated corridor span |
| Multiple impacts | Primary stroke plus compact per-kind icons/counts, opening existing detail selection |

Use batched MapLibre layers and a bounded set of icon assets, not a DOM/React marker for every item. Group by semantic link/span/station, not rounded coordinates alone. Use deterministic anchors and stable IDs to prevent badges hopping on polls. Low zoom can consolidate nearby badges but must preserve route and kind membership; geographic point clustering alone is insufficient for route semantics. Selected groups should remain identifiable even when ordinary symbols collide. Details must list every member when a group cannot display all badges.

Recommended visual order: base transit tracks; service strokes and preview strokes according to hierarchy; selection casing that does not erase primary severity; station rings/anchors; alert badges; selected-item emphasis. Test interchanges rather than assuming layer order alone solves collisions. Line badges are subordinate to alert/station content. Retain usable hit areas and keyboard-accessible equivalent selection through existing lists/details; do not create hundreds of tab stops in the canvas.

Bounded scope: Shared alert eligibility, planned previews, station impacts, complete overlap groups, deduplicated counts, priority hierarchy, and secondary selection. Direction arrows and estimated trains are deferred to Session 3.

### Checks

- Characterization and parity tests comparing eligible IDs and detail card targets between system and geographic map renderers across active suspensions, delays, RSZs, planned previews, and station impacts.
- Edge-case unit tests: active-child/planned-parent deduplication, missing link geometry, shared interchange endpoints, and overlapping impact combinations.
- Visual inspection of dense interchange stations (e.g. Bloor-Yonge, St George) to verify stroke layering, badge placement, and secondary selection highlight.
- Scoped checks: `npm --prefix frontend run test:fast`, `npm --prefix frontend run typecheck`, `npm --prefix frontend run lint`.

### Handoff

- In `### Progress log`, record session 2 completion, list changed files, and detail delivered parity behavior.
- Record exact test commands executed and passing results.
- Document any discovered geometry quirks or catalog edge cases.
- State the exact bounded task for session 3 (direction arrows and estimated trains), listing starting files and test commands.

### Stop

Stop. Do not proceed to Session 3 in this session. Further splitting is reserved for unexpected complexity—not routine steps.

## Session 3: Add direction arrows and estimated trains

### Bounded scope and architecture

Direction indicators:
Direction rendering uses verified coordinate orientation along each adjacent link. Resolve forward/reverse against topology endpoints, never geographic north or arbitrary shape-array order. Render spaced static symbols oriented with the line; prevent automatic icon flipping from reversing arrow meaning. For explicitly both directions use paired opposing indicators; unknown direction gets no inferred arrow and explicit detail wording. Clip indicators to supported affected spans and suppress them where short segments or low zoom make them unreadable. The primary stroke's arrows describe that impact; selecting a secondary impact may show its own distinct directional emphasis without reclassifying the primary severity. Static rendering only; no perpetual animation or per-frame GeoJSON rebuild.

Estimated trains:
Forward existing train snapshot and visibility through `NetworkMap` to `GeographicNetworkMap`. Preserve upstream source enablement, freshness, closed-service-hours, and offline gates; independently clear geographic train data when eligibility is lost. Existing live arrivals or alerts alone do not authorize marker visibility.

Build a pure projection from a validated estimate onto its matching adjacent geographic link. Orient coordinates from the estimate's from-station toward its to-station; interpolate progress by cumulative geographic distance along the polyline, not vertex index or a straight line between stations. Reject malformed/out-of-range or ambiguous estimates rather than assigning plausible-looking coordinates. Never extrapolate beyond the reviewed adjacent link. Cache link distance tables by catalog revision and link ID.

Render a batched point source with stable train IDs and existing visual identity. Update on accepted snapshots; first delivery needs no synthetic frame-by-frame movement. At overview zoom suppress train text before hiding markers; use bounded aggregation if density requires it. Keep selected trains identifiable and retain existing detail access. If a selected estimate expires, show unavailable state rather than preserving a false live position. Label these as estimated positions from live data wherever live gates pass, never GPS tracking.

Bounded scope: Static direction indicators for alerts and pure link projection / batched rendering for estimated trains. Do not implement line badges (deferred to Session 4).

### Checks

- Direction indicator tests: forward, reverse, both directions, and unknown direction; orientation preserved along curved links; clipping on short links and low-zoom suppression.
- Train projection tests: progress interpolation at endpoints and interior, curved and reversed shapes, zero-length or absent links, line ambiguity, and malformed progress values.
- Train gating tests: stale data, offline state, disabled provider, closed-hours suppression, and visibility toggle.
- Scoped checks: `npm --prefix frontend run test:fast`, `npm --prefix frontend run typecheck`, `npm --prefix frontend run lint`.

### Handoff

- In `### Progress log`, record session 3 completion, list changed files, and detail delivered directionality and train features.
- Record exact test commands executed and passing results.
- Note any distance interpolation or orientation refinements.
- State the exact bounded task for session 4 (fading line badges in both views), listing starting files and test commands.

### Stop

Stop. Do not proceed to Session 4 in this session. Further splitting is reserved for unexpected complexity—not routine steps.

## Session 4: Add fading line badges in both views

### Bounded scope and architecture

Geographic line badges:
Use existing authored line colors, numbers and contrast conventions. Build reviewed point anchors for termini and sparse intermediate route locations; include both arms of Line 1. Avoid blindly placing a badge at a geometric centroid, which can be far from the route. Prefer native symbol sprites containing the circle and number as one collision unit; decorative badges do not join interactive hit layers or intercept gestures.

Use zoom-driven opacity so badges are fully visible at overview and disappear at station-detail zoom. Starting calibration: full at zoom 10 or below, about half at 12, zero at 14; these are tuning seeds, not measured acceptance thresholds. Inspect actual fitted mobile/desktop views and adjust named constants. Keep geographic badge screen size stable. Ensure alert and station readability takes precedence; verify actual symbol collision behavior, since paint opacity alone is not a guarantee that invisible symbols release collision space. Remove fully faded badges from placement using a suitable zoom range.

Independently fading system-map badges:
Keep the source SVG's required `transit-line-badges` layer and all geometry/station contracts. Extend the existing raster-generation pipeline to exclude badges from foreground and provide a separate badge plane, or reuse extracted authored badge geometry in a lightweight overlay. Choose the smallest approach that preserves overview appearance, raster sharpness, alignment and fallback SVG behavior. Never hand-edit generated raster outputs or paint duplicate badges over baked-in originals.

Bind opacity to the existing rendered diagram scale relative to fitted overview scale; do not reuse geographic zoom values. Starting calibration: opacity 1 at fit scale, 0.5 at 1.7 times fit, 0 at 2.5 times fit. Validate phone fit, rotation, zoom controls and restored camera state. Apply opacity through the existing transform/render path or a narrowly scoped CSS property rather than rerendering all alerts on every gesture. This zoom-following effect needs no independent time animation and works under reduced motion. Fading must affect badges only, never station names or track artwork.

Bounded scope: Geographic badge placement, sprites, and zoom fading; system-map badge layer extraction and scale-based fading. No broad integration benchmarking (deferred to Session 5).

### Checks

- Visual inspection of overview, intermediate, and station-detail zoom on phone (360px) and desktop (1440px) in both geographic and system-map views.
- Collision verification: alert badges and station labels take precedence over line badges; line badges do not intercept tap/click gestures.
- System-map asset contract tests: verify SVG contracts, raster generation, and fallback behavior (`npm --prefix frontend run test:fast`).
- Scoped checks: `npm --prefix frontend run test:fast`, `npm --prefix frontend run typecheck`, `npm --prefix frontend run lint`.

### Handoff

- In `### Progress log`, record session 4 completion, list changed files, and detail delivered badge fading across both views.
- Record exact test commands executed and passing results.
- Note verified calibration values for zoom/scale thresholds.
- State the exact bounded task for session 5 (integration and performance validation), listing target suites and benchmark criteria.

### Stop

Stop. Do not proceed to Session 5 in this session. Further splitting is reserved for unexpected complexity—not routine steps.

## Session 5: Validate integration and performance

### Bounded scope and architecture

Performance and MapLibre configuration:
Fix lifecycle churn before tuning rendering options. Establish a production-build baseline with a fixed camera gesture and fixture snapshot at normal and dense alert/train counts. Record device/browser, viewport, pixel ratio, fixture counts, frame intervals, long tasks, source updates, style requests and map lifecycle counts. Compare warm rendering separately from cold tile-network latency.

Keep static catalog geometry separate from dynamic impact/train sources; reuse projection indexes and only send changed collections. Use zoom expressions and native collision handling rather than React updates on every zoom tick. Persist viewport on move end; update discrete UI only when its value changes. A selected-item exception must not disable collision handling for every symbol.

Use existing defaults initially for workers, tile cache and request concurrency. Only adjust after a repeatable bottleneck is measured against the installed MapLibre version. Larger caches increase memory; extra concurrency cannot fix React teardown. Consider pixel-ratio reduction only if GPU-bound measurements justify the sharpness tradeoff. Do not add manual tile prefetch loops, unlimited caches, new basemap hosting, or a MapLibre upgrade as incidental scope.

Engineering targets, not current measured claims: zero lifecycle resets for ordinary interactions; aim for 60 fps on the recorded desktop device and at least 30 fps during dense interaction on the recorded representative phone. Record p95 frame intervals, main-thread tasks over 50 ms, and any reproducible stalls. If targets fail, identify whether layout, projection, source updates, GPU work or network is responsible; reduce visual density before hiding impact coverage. Browser automation timing alone is not proof of real-phone smoothness. Report unavailable physical-device checks honestly.

MapLibre references checked during planning; verify API compatibility with the lockfile before coding:

- [Map lifecycle, style and resize API](https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/).
- [Layer specification: symbols, spacing, rotation, opacity and zoom ranges](https://maplibre.org/maplibre-style-spec/layers/).
- [GeoJSON performance guidance](https://maplibre.org/maplibre-gl-js/docs/guides/large-data/).

Cross-feature integration matrix:
Extend existing geographic catalog/phase D/phase E and train-marker tests at production-function seams; source-string assertions do not prove lifecycle correctness. Add integrated geographic browser cases for repeated sidebar toggles, equal/changed polls, selection/filter changes, theme changes, container resize, mode/network round trips and retry races. Observe loading state transitions so a split-second flash cannot escape a final screenshot assertion.

Inspect TTC at 360px and 1440px, light/dark/high contrast, reduced motion, overview/intermediate/detail zoom, dense interchange overlap and train visibility states. Check GO/UP where shared lifecycle/selection code changes. Verify line-badge placement/fade, alert detail access, camera persistence and no page-level overflow. Preserve attribution.

Update behavior claims and documentation only for delivered changes. Preserve source licensing launch gates.

Bounded scope: Integration matrix, performance measurement, cross-network regression checks, and documentation/claims updates. No new features or broad refactors.

### Checks

- Full scoped test suite:
  - `npm --prefix frontend run test:fast`
  - `npm --prefix frontend run typecheck`
  - `npm --prefix frontend run lint`
  - `npm --prefix frontend run build`
- Playwright smoke and E2E suites: desktop and mobile shell cases, geographic map interaction cases.
- Visual review across viewports (360px, 1440px), themes (light, dark, high contrast), and motion settings.
- Performance measurements documented against targets (fps, p95 frame intervals, long tasks, zero lifecycle resets).

### Handoff

- In `### Progress log`, record session 5 completion and final delivery status.
- Record all executed command outputs, measured performance comparison against baseline, and covered commit/tree state.
- Document any remaining runtime, physical-device, or browser limitations honestly.
- Confirm all behavior claims in README/docs match delivered reality.

### Stop

Stop. Implementation is complete. Further splitting is reserved for unexpected complexity—not routine steps.
