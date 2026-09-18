# Geographic map stability and system-map parity

Status: approved design, implementation pending. Prepared for Gemini 3.8 Flash on 2026-09-18. This handoff changes no application behavior. Findings below come from code inspection, not runtime reproduction or performance measurements.

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

## Stage 1: stable lifecycle before visual additions

First create a focused browser regression that observes the exact loading flash and map lifecycle during sidebar toggles and controlled data refreshes. Capture constructor, removal, style replacement and loading-overlay transitions using a test-only seam or scoped instrumentation. A canvas-presence assertion alone cannot detect replacement. Reproduce before fixing; do not treat this inspection as runtime proof of every flash.

Use one map owner for the mounted network and explicit retry generation. Initialization must not depend on data, selection, filter, sidebar callbacks, or theme identity. Keep current event callbacks in refs or an equivalent supported pattern; listeners should invoke current handlers without reinstalling the map. Do not suppress dependency warnings to conceal stale closures.

Separate responsibilities:

1. Lifecycle owns map creation, catalog acquisition, initial readiness, listeners, cancellation, and cleanup.
2. A single idempotent style-ready installer creates transit sources, sprite images and layers in deterministic order, then applies the latest state.
3. Dynamic source updates change only affected GeoJSON. Selection and filters update their filters/paint or feature state without rebuilding geometry.
4. Theme changes compare the applied style identity and replace style only on a real change. Register rehydration before replacement. Rehydrate from latest refs so polling during style loading cannot restore stale overlays.
5. A container `ResizeObserver`, coalesced to at most one animation frame, calls resize only when dimensions change. Overlay-only sidebar movement needs no resize. A docked sidebar can change canvas dimensions but must not reconstruct or refit the map.

Use an explicit state distinction: initial loading, usable, recoverable degradation, fatal/unavailable. Tile activity after readiness never returns to initial loading. Keep last usable view during transient tile/source failures; communicate degraded freshness honestly. Initial timeout, unavailable WebGL, and explicit retry retain understandable fallback to system map. Handle context loss with a small recovery notice and bounded retry/fallback; never disguise a truly lost canvas as healthy.

Cancel or generation-guard asynchronous catalog/style work. Remove observers and listeners on real unmount; ensure late callbacks cannot mutate a replacement map. Account for development Strict Mode separately from production lifecycle counts. Mode/network switching follows existing viewport persistence; do not keep multiple hidden WebGL contexts alive merely to avoid an initial load on intentional remount.

Acceptance: after initial ready, sidebar toggle, unchanged poll, changed poll, filter, station/alert selection, and commute preview produce zero additional constructors/removals/full loading transitions and zero style replacements. Theme change preserves the map instance/camera and restores every overlay exactly once. A genuine container resize preserves geographic center and zoom unless an explicit existing navigation action requests otherwise.

## Stage 2: shared semantics, geographic presentation

Extract the smallest pure semantic selector needed by both renderers. Keep authored SVG geometry and GTFS geometry in their respective adapters. Do not import the system-map component into the geographic renderer or rewrite its entire presentation pipeline.

The selector should preserve stable logical impact ID, related detail-card IDs, line ID, affected adjacent links or station IDs, kind, direction certainty, effective timing, active/preview state, and priority. Reuse existing planned-preview eligibility, selected-preview behavior, parent/child deduplication, and filters. Freeze current system-map behavior with characterization cases before extraction.

Project onto reviewed catalog links using line identity plus endpoint/topology matching. Do not match shared interchange endpoints across unrelated routes. Preserve missing-link coverage information and omit unsupported geometry. Station-only service impacts remain station rings/badges.

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

Recommended visual order: base transit tracks; service strokes and preview strokes according to hierarchy; selection casing that does not erase primary severity; direction indicators; station rings/anchors; estimated trains; alert badges; selected-item emphasis. Test interchanges rather than assuming layer order alone solves collisions. Line badges are subordinate to alert/station content. Retain usable hit areas and keyboard-accessible equivalent selection through existing lists/details; do not create hundreds of tab stops in the canvas.

Direction rendering uses verified coordinate orientation along each adjacent link. Resolve forward/reverse against topology endpoints, never geographic north or arbitrary shape-array order. Render spaced static symbols oriented with the line; prevent automatic icon flipping from reversing arrow meaning. For explicitly both directions use paired opposing indicators; unknown direction gets no inferred arrow and explicit detail wording. Clip indicators to supported affected spans and suppress them where short segments or low zoom make them unreadable. The primary stroke's arrows describe that impact; selecting a secondary impact may show its own distinct directional emphasis without reclassifying the primary severity. No perpetual animation or per-frame GeoJSON rebuild.

Acceptance includes active suspension, delay, explicit RSZ, upcoming/selected planned preview, station impact, all overlapping pairings, active-child/planned-parent deduplication, reverse/both/unknown direction, shared interchange endpoints, and missing geometry. Compare eligible IDs and detail targets between views, not pixels.

## Stage 3a: estimated trains

Forward existing train snapshot and visibility through `NetworkMap`. Preserve upstream source enablement, freshness, closed-service-hours and offline gates; independently clear geographic train data when eligibility is lost. Existing live arrivals or alerts alone do not authorize marker visibility.

Build a pure projection from a validated estimate onto its matching adjacent geographic link. Orient coordinates from the estimate's from-station toward its to-station; interpolate progress by cumulative geographic distance along the polyline, not vertex index or a straight line between stations. Reject malformed/out-of-range or ambiguous estimates rather than assigning plausible-looking coordinates. Never extrapolate beyond the reviewed adjacent link. Cache link distance tables by catalog revision and link ID.

Render a batched point source with stable train IDs and existing visual identity. Update on accepted snapshots; first delivery needs no synthetic frame-by-frame movement. At overview zoom suppress train text before hiding markers; use bounded aggregation if density requires it. Keep selected trains identifiable and retain existing detail access. If a selected estimate expires, show unavailable state rather than preserving a false live position. Label these as estimated positions from live data wherever live gates pass, never GPS tracking.

Tests cover progress at endpoints/interior, curved/reversed shapes, zero-length or absent links, line ambiguity, malformed progress, stale/offline/disabled/closed-hours suppression and visibility toggles. Update the current geographic-marker omission in domain documentation only when implementation is verified.

## Stage 3b: geographic line badges

Use existing authored line colors, numbers and contrast conventions. Build reviewed point anchors for termini and sparse intermediate route locations; include both arms of Line 1. Avoid blindly placing a badge at a geometric centroid, which can be far from the route. Prefer native symbol sprites containing the circle and number as one collision unit; decorative badges do not join interactive hit layers.

Use zoom-driven opacity so badges are fully visible at overview and disappear at station-detail zoom. Starting calibration: full at zoom 10 or below, about half at 12, zero at 14; these are tuning seeds, not measured acceptance thresholds. Inspect actual fitted mobile/desktop views and adjust named constants. Keep geographic badge screen size stable. Ensure alert and station readability takes precedence; verify actual symbol collision behavior, since paint opacity alone is not a guarantee that invisible symbols release collision space. Remove fully faded badges from placement using a suitable zoom range.

## Stage 4: independently fading system-map badges

Keep the source SVG's required `transit-line-badges` layer and all geometry/station contracts. Extend the existing raster-generation pipeline to exclude badges from foreground and provide a separate badge plane, or reuse extracted authored badge geometry in a lightweight overlay. Choose the smallest approach that preserves overview appearance, raster sharpness, alignment and fallback SVG behavior. Never hand-edit generated raster outputs or paint duplicate badges over baked-in originals.

Bind opacity to the existing rendered diagram scale relative to fitted overview scale; do not reuse geographic zoom values. Starting calibration: opacity 1 at fit scale, 0.5 at 1.7 times fit, 0 at 2.5 times fit. Validate phone fit, rotation, zoom controls and restored camera state. Apply opacity through the existing transform/render path or a narrowly scoped CSS property rather than rerendering all alerts on every gesture. This zoom-following effect needs no independent time animation and works under reduced motion. Fading must affect badges only, never station names or track artwork.

## Performance and MapLibre configuration

Fix lifecycle churn before tuning rendering options. Establish a production-build baseline with a fixed camera gesture and fixture snapshot at normal and dense alert/train counts. Record device/browser, viewport, pixel ratio, fixture counts, frame intervals, long tasks, source updates, style requests and map lifecycle counts. Compare warm rendering separately from cold tile-network latency.

Keep static catalog geometry separate from dynamic impact/train sources; reuse projection indexes and only send changed collections. Use zoom expressions and native collision handling rather than React updates on every zoom tick. Persist viewport on move end; update discrete UI only when its value changes. A selected-item exception must not disable collision handling for every symbol.

Use existing defaults initially for workers, tile cache and request concurrency. Only adjust after a repeatable bottleneck is measured against the installed MapLibre version. Larger caches increase memory; extra concurrency cannot fix React teardown. Consider pixel-ratio reduction only if GPU-bound measurements justify the sharpness tradeoff. Do not add manual tile prefetch loops, unlimited caches, new basemap hosting, or a MapLibre upgrade as incidental scope.

Engineering targets, not current measured claims: zero lifecycle resets for ordinary interactions; aim for 60 fps on the recorded desktop device and at least 30 fps during dense interaction on the recorded representative phone. Record p95 frame intervals, main-thread tasks over 50 ms, and any reproducible stalls. If targets fail, identify whether layout, projection, source updates, GPU work or network is responsible; reduce visual density before hiding impact coverage. Browser automation timing alone is not proof of real-phone smoothness. Report unavailable physical-device checks honestly.

MapLibre references checked during planning; verify API compatibility with the lockfile before coding:

- [Map lifecycle, style and resize API](https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/).
- [Layer specification: symbols, spacing, rotation, opacity and zoom ranges](https://maplibre.org/maplibre-style-spec/layers/).
- [GeoJSON performance guidance](https://maplibre.org/maplibre-gl-js/docs/guides/large-data/).

## Verification and handoff completion

Extend existing geographic catalog/phase D/phase E and train-marker tests at production-function seams; source-string assertions do not prove lifecycle correctness. Add integrated geographic browser cases for repeated sidebar toggles, equal/changed polls, selection/filter changes, theme changes, container resize, mode/network round trips and retry races. Observe loading state transitions so a split-second flash cannot escape a final screenshot assertion.

Inspect TTC at 360px and 1440px, light/dark/high contrast, reduced motion, overview/intermediate/detail zoom, dense interchange overlap and train visibility states. Check GO/UP where shared lifecycle/selection code changes. Verify line-badge placement/fade, alert detail access, camera persistence and no page-level overflow. Preserve attribution.

When stable run frontend fast tests, typecheck, lint, production build, smoke and E2E as required by the scoped guide. Run desktop/mobile shell cases explicitly for sidebar behavior; the testing guide explains that the main E2E catalog does not include every shell test. Run relevant map-fit/asset checks for stage 4 and inspect targeted visual differences before changing baselines. Reuse a matching build and serialize suites sharing stubs. Do not run the full matrix after every styling adjustment.

Implementation is complete when each stage's behavior is verified, existing source/freshness semantics remain intact, no redundant map/style recreation remains under the tested triggers, all eligible impact kinds remain discoverable, and badges/trains obey the agreed detail and density rules. Update behavior claims and the asset contract only for delivered changes. Report commands/results and any remaining runtime or device-validation gaps. This planning handoff itself has only received diff/link review; no application tests or performance benchmarks were run.
