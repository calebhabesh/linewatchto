# System map refactor chunks

Read the [index](README.md), [frontend guide](../../frontend/AGENTS.md),
[map asset contract](../ttc-map-asset-contract.md), and
[verification](01-verification.md). Current runtime selection is
[NetworkMap](../../frontend/src/components/NetworkMap.tsx): TTC diagram,
regional diagram, or MapLibre geographic view. Diagram rendering combines
raster planes with mounted SVG geometry and interaction layers.

## M1 — Regional SVG loading and preparation: pilot

**Evidence:** [LineWatchShell](../../frontend/src/components/LineWatchShell.tsx),
lines 11/598, preloads via [map-preload](../../frontend/src/app/map-preload.ts),
line 151. [InteractiveRegionalMap](../../frontend/src/components/InteractiveRegionalMap.tsx)
has a separate loader at 2782, invoked at 3684. Caches/promises exist in both
files (144/149 versus 173/174). The renderer creates/appends the planned-station
layer at 3032/3049; the preload copy lacks it. This is observed divergence,
not simply two large functions that look similar.

**Change:** create a renderer-independent regional asset module with a parser,
shared completed cache, one in-flight promise per asset identity, and retry
after rejection. Compare both preparation implementations and preserve the
current renderer's complete output. Both shell preloading and renderer mounting
must use the same module. Keep browser DOM parsing out of server execution.
Remove `setRegionalMapMarkupCache` only after confirming its absent callers.

**Acceptance:** concurrent preload/mount performs one fetch and parse; a failed
request or parse can retry; warm and cold paths produce equivalent output.
Verify dynamic layers, planned-station preview, label/station hit targets,
cutout sources, IDs, and station focus with the real parser in the browser
harness. Preserve build-versioned URLs and source labels/attribution. Exercise
network switch, theme state, station-only impact and overlapping impact selection.

**Done:** one preparation implementation and one cache lifetime; no renderer
import needed to preload. Record fetch/parse counts. Fewer fetch invocations
alone do not prove lower transferred bytes because browser caches may already
serve them. Risk: moderate. Review this pilot before starting broader work.

## M2 — Remove the disconnected renderer and exclusive debt

**Evidence:** [transit-map](../../frontend/src/app/transit-map.tsx), line 16,
exports `TransitMap`. Inspection found no production imports under `src`;
the active dispatcher uses the three current renderers. The code reference
found in [map-layering.test.mjs](../../frontend/tests/map-layering.test.mjs),
lines 6/41, asserts `asset-label-frame` against the old source.
[Frontend guidance](../../frontend/AGENTS.md), line 7, still points to it.

**Change:** finish the tracked-file/import/route/script/asset reference audit.
If disconnected, remove it and its exclusive assertion. Replace the intended
layering coverage against current rendered behavior, then update the scoped
guide to current map owners within its length limit. Historical plans may
remain dated history; active guidance must be correct.

Coordinate with C2 for exclusive selectors in
[impact-overlays.css](../../frontend/src/styles/map/impact-overlays.css), lines
1–39, and `.asset-map-stage` in
[dashboard-shell.css](../../frontend/src/styles/shell/dashboard-shell.css),
lines 103/279/305. These are candidates until producers are fully checked.
`asset-alert-path`, glow and selected variants remain in both current diagram
renderers: retain them. Prefix-based deletion would remove live behavior.

**Acceptance:** build/typecheck prove remaining imports resolve; current map
layer ordering, click priority, station details and overlays retain coverage.
Inspect both diagram modes and themes for affected style deletions.
**Done:** no active guide/test points to a retired runtime implementation and
its exclusive code/styles are removed together. Risk: low to moderate after proof.

## M3 — Diagram geometry and overlay ownership

Depends on M1. **Evidence:**
[InteractiveRegionalMap](../../frontend/src/components/InteractiveRegionalMap.tsx),
lines 898–1349, contains geometry/projection; lines 1984/2027/2072/2082/2196
build/order/update overlay runs. The layout effect at 3695 clears dynamic
layers with `replaceChildren()` at 3718 and recreates them. Train markers
already reconcile stable keys at 4048 and dispose animation at 4107.
[InteractiveTtcMap](../../frontend/src/components/InteractiveTtcMap.tsx)
contains chooser placement math at 3181/3373/3410 and duplicates impact
priority at 3693 that [map-alert-selector](../../frontend/src/app/map-alert-selector.ts)
already exports at 48.

Implement as separate chunks:

1. Extract regional geometry into a network-specific module over existing
   [map-geometry](../../frontend/src/app/map-geometry.ts) and shared math.
   Represent root-SVG versus regional station-layer coordinates explicitly.
   **Done:** projection has a small testable interface, with DOM measurement
   limited to the asset/geometry owner.
2. Put regional overlay operations behind a small install/update/dispose
   interface. Keep renderer-specific ordering and effects together.
   **Done:** one owner creates, updates and removes listeners/nodes/animations;
   React orchestrates it without editing its internals.
3. Extract TTC chooser pure placement decisions, keeping actual DOM measurements
   near the DOM owner. Consolidate priority calculation only after confirming
   identical inputs/semantics. **Done:** boundary/clamping/overlap cases import
   production logic and the renderers use its output.

**Acceptance:** Spadina's multiple TTC anchors; regional KI/UP junctions;
nonlinear guides; selected overlay ordering; label cutouts; station labels
winning over corridor hit targets; hover across refresh; overlap chooser at
viewport edges; motion cleanup and reduced motion. Existing geometry, overlap,
asset and browser-compatibility tests plus current integrated map flows apply.

Only after extraction, profile unchanged polls and selection updates: nodes
replaced, path/`getBBox` measurements, long tasks and update duration. Incremental
overlay reconciliation is optional if measured churn warrants it. Preserve
the existing train-marker reconciliation. No wholesale React/imperative
rendering conversion is justified. Risk: high geometry/interaction sensitivity.

## M4 — Shared geographic update operations

**Evidence:** [GeographicNetworkMap](../../frontend/src/components/GeographicNetworkMap.tsx),
line 486, installs layers/images; `applyDynamicDataAndFilters` at 1291 updates
seven sources and filters. Normal effects repeat source changes at 2223 and
filters at 2296. Style reload uses the installer and combined helper at
2417/2430, creating two maintenance paths for equivalent updates.

**Change:** first create small operations for dynamic source data, line filters,
and selection styling, used by both normal effects and style rehydration.
Then extract cohesive layer/image installation. Keep MapLibre lifecycle,
generation checks, event subscriptions and user interaction in one clear owner.

**Acceptance:** theme/data/filter/selection changes preserve the map instance;
network change and explicit retry may recreate it. Style reload with active
selection, commute preview, line filter and a newer alert snapshot restores
all state exactly once. Preserve pending-style-load handling, timeout/error UI,
WebGL failure and diagram fallback. No estimated-train physical tracking claim
or new geographic marker feature belongs in this refactor.

Use `tests/smoke/geographic-map-lifecycle.spec.ts` and relevant geographic
fast tests. Replace source-location assertions with actual update/lifecycle
behavior; record instance and source-update counts where meaningful.
**Done:** normal refresh and style reload call the same update implementation.
Risk: moderate to high.

## M5 — Camera and shell occlusion: investigate before unifying

Coordinate with F4. **Evidence:** TTC uses
[usePanZoom](../../frontend/src/hooks/usePanZoom.ts), while regional implements
its own camera/gesture engine in `InteractiveRegionalMap.tsx:3328–3675` and
`:4452–4860`. They already share math. Regional occlusion at 3166 and
[map-chooser-keepouts](../../frontend/src/components/map-chooser-keepouts.ts), line 1,
include older capsule/chip selectors. TTC focus at 1062–1083 and `usePanZoom:80`
query shell DOM directly.

**First chunk (Completed):** document the two cameras' actual command/gesture contracts,
coordinate systems, persistence, layout inputs, and deliberate differences.
Trace selector producers in all layouts. Record a retain/extract/remove
decision per repeated mechanic. The investigation can correctly conclude
that the regional engine should stay separate. See [m5-camera-investigation.md](m5-camera-investigation.md).

**Conditional next chunk:** move demonstrably identical math/persistence into
existing seams. Let shell-owned layout measurement expose actual viewport and
occlusion inputs to consumers, replacing repeated cross-component DOM queries
one at a time. Remove selectors only after proving their producers retired.
Do not force regional through TTC's hook as the starting design.

**Acceptance:** per-network/per-mode persisted cameras and version compatibility;
drag interrupts a flight; pinch continues correctly with one pointer; dragging
suppresses click; search close preserves camera; reduced motion; rotated fit;
resize deferred during gestures; station/chooser fit with desktop/sidebar and
mobile sheet. Use pan-zoom, viewport persistence, panned-search-close, map-fit
and browser compatibility checks; broad interaction changes require full
final smoke/E2E. **Done:** evidence supports each shared mechanic and remaining
differences are explicit. Risk: high; consolidation is conditional.

## M6 — Reproducible asset preparation

**Status: Completed**

**Evidence:** [prepare-regional-map](../../scripts/prepare-regional-map.mjs),
line 28, and [import-linewatch-map-assets](../../scripts/import-linewatch-map-assets.mjs),
line 59, independently normalize SVG. The first validates 78 authored labels;
the second checks a different subset. Bulk import delegates TTC but duplicates
regional preparation. Both default to personal paths. The
[raster generator](../../frontend/scripts/generate-map-rasters.mjs) defines a
network/plane/theme/density matrix separate from
[map-assets](../../frontend/src/app/map-assets.ts); its type permits regional
`badges`, although generation emits that plane only for TTC.

Implemented:

1. **Extracted Pure Regional Normalizer**: created [`scripts/lib/regional-map-normalizer.mjs`](../../scripts/lib/regional-map-normalizer.mjs)
   exporting pure `normalizeRegionalMapSvg` used by both `prepare-regional-map.mjs`
   and `import-linewatch-map-assets.mjs`. Reconciles viewBox to `-200 -200 17036.959 9031.6719`,
   strictly verifies all 78 station and junction labels, assigns contract layer and
   route IDs, injects the segment guide marker, hides lakes, and normalizes whitespace.
   Both CLIs require input paths or configurable environment variables
   (`LINEWATCH_MAP_SOURCE_DIR`, `LINEWATCH_REGIONAL_MAP_SOURCE`) rather than hardcoding personal paths.
2. **Reconciled Variants and Manifest**: created [`frontend/src/app/map-raster-manifest.ts`](../../frontend/src/app/map-raster-manifest.ts)
   defining canonical raster matrices, dimensions, widths, and required fonts without client Node dependencies.
   Reconciled runtime types in [`frontend/src/app/map-assets.ts`](../../frontend/src/app/map-assets.ts) and
   [`frontend/src/components/RasterMapPlane.tsx`](../../frontend/src/components/RasterMapPlane.tsx)
   with discriminated unions so regional `badges` is disallowed at compile time.
   Updated `generate-map-rasters.mjs` to consume manifest constants.
3. **Pipeline Documentation**: created [`docs/map-asset-preparation.md`](../map-asset-preparation.md)
   documenting fonts (`TeX Gyre Heros`), Inkscape 1.4+, commands, output ownership, and source availability.
4. **Reproducibility Verified**: regenerated `mobile` raster plane with Inkscape, producing 100% bitwise byte-for-byte identical output to checked-in rasters.
5. **Testing**: added comprehensive test suites in [`frontend/tests/regional-map-normalizer.test.mjs`](../../frontend/tests/regional-map-normalizer.test.mjs)
   and [`scripts/tests/regional-map-normalizer.test.mjs`](../../scripts/tests/regional-map-normalizer.test.mjs).
   Modernized [`frontend/tests/map-raster-renderer.test.mjs`](../../frontend/tests/map-raster-renderer.test.mjs)
   to verify all 63 advertised variants against the manifest.

**Acceptance:** preserve TTC `0 0 8250 4000`, 109 names/110 anchors, four nonlinear
guides, and intentional `station-greenwoood`/`station-o_connor` IDs. Preserve
regional junction anchors, geometry mounted after raster decode, separate
badge/label planes, versioned URLs, last decoded texture during theme changes,
and fallback paths. Use asset/catalog tests and a generated-file diff plus
visual comparison. Regeneration must not silently redraw authored geometry.

Coordinate source/asset permissions with P1. Public builds should consume
checked-in permissible assets without requiring a personal authoring directory.
Risk: moderate; generated files are outputs, not hand-edit targets.

## Compatibility that looks like duplication

`legacyImpactsForSegment` in the TTC renderer has active fallback callers when
`impacts` is missing or empty. It is not proven obsolete. Audit API/fixture and
installed-client compatibility before removal. Regional planned previews and
TTC active closure presentation intentionally differ. Existing pan/zoom math,
map overlap, station visuals, and normalization helpers are assets to preserve.
