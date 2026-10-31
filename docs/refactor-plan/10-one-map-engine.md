# F — One System Map engine component, maps as data

Owner decision, 2026-10-31: one engine for every authored System Map, with no
per-map code. Maps differ only in content (station names, map shape, which
alerts exist: GO/UP has trip changes, TTC does not). Adding a map, such as
TTC streetcars or bus routes drawn as SVGs (not overlays on the MapLibre Map
View), should be a drop-in: an SVG and a manifest, not a code project.

This finishes what [plan 09](09-system-map-engine.md) started. Plan 09 shared
the parts (camera, framing, plane stack, overlays, hover, badges, chooser,
prepared geometry, asset contract, budgets); each map still assembles those
parts in its own component. Read plan 09's Progress, the
[map asset contract](../map-asset-contract.md) and
[map renderer parity](../map-renderer-parity.md) first; their rules stay in
force.

- **Practical test.** A third map needs: an SVG meeting the asset contract,
  a manifest entry, `prepare:map-geometry`, `validate:map-asset`, a content
  adapter (or an existing one), and one registry line. No engine edits.
- **Build only what TTC and GO/UP need,** plus what the drop-in test needs.
  No plugin system: content adapters are plain functions, capabilities are
  flags.

## Where it still diverges (audit, 2026-10-31)

1. **Two map components.** `components/InteractiveTtcMap.tsx` (2,249 lines,
   14 effects) and `components/InteractiveRegionalMap.tsx` (1,362 lines,
   17 effects) render the same shared layers but each repeats the
   orchestration: SVG and raster loading and readiness, the entrance, the
   plane stack JSX, the hover controller install and restore, badge layout
   inputs, the chooser, keyboard and focus reveal wiring, camera options,
   selection intro and pulse clock.
2. **Station placement.** TTC places targets from its station list
   (`ttcStationCenters(TTC_GEOMETRY, …)` in `InteractiveTtcMap.tsx`, circles
   in `TtcStationTarget.tsx`: hit radius 37, 67 at large stations, 34 per
   anchor at multi-anchor stations); a station exists only if it is in that
   list. GO/UP places them from the artwork's shapes for every drawn station
   (`regionalStationArtwork`, `RegionalStationLayers.tsx`; Union's pill,
   junction transforms). TTC's prepared geometry already has `shapes` and
   `anchors` per station.
3. **Tap handling.** TTC selects on `onClick` per target. GO/UP records the
   target on pointer down and selects on release (`onPointerDown` /
   `finishPointer`, `InteractiveRegionalMap.tsx` around line 812), then
   suppresses the following click; a leftover from targets inside its
   interactive SVG. Both use the camera's shared click suppression after
   drags and glides.
4. **Overlay models.** TTC builds line alerts, station alerts and commute
   previews inline in its component; GO/UP builds them in `app/regional-*.ts`
   adapters (`regional-line-alerts.ts`, `regional-station-alerts.ts`,
   `regional-commute-preview.ts`, `regional-map-overlays.ts`).
5. **Train markers.** TTC draws them in `TtcTrainMarkerLayer.tsx`; GO/UP
   inline (about 30 references in its component, motion in
   `app/regional-train-marker-motion.ts`, shapes in
   `regional-train-marker-shapes.ts`).
6. **Station names and artwork obstacles.** `TtcStationLabelTargets` vs
   `RegionalStationLabelTargets`; `ttc-map-obstacles.ts` vs GO/UP's badge
   adapter in `regional-map-overlays.ts`.
7. **Map is network.** `NetworkId = "ttc" | "regional"`
   (`app/dashboard-contract.ts`) names both the data source and the map;
   about 75 files reference `"regional"`. `NetworkMap.tsx` hard-codes the two
   components.

Legitimate per-map or per-network differences, which become data: the SVG,
its prepared geometry and rasters (TTC also has a line-badge raster plane),
overlay unit, default framing (GO/UP's phone framing centres on Union),
badge scale, station-name padding, line colours and badges; and per network,
which alerts exist and how they are classified, trip changes, arrivals,
source and freshness labels.

## Target design

- **`SystemMap`** (engine component): takes a map manifest
  (`app/map-manifests.ts`, extended as needed) and a `MapContent`, and owns
  all orchestration listed in audit item 1, station targets and names from
  prepared geometry, one tap path, train markers, badges, chooser, hover,
  keyboard and camera. It reads no network-specific module.
- **`MapContent`** (plain data, built per render from dashboard data): line
  alerts, station alerts and direction glyphs, commute preview, station
  names and metadata, train markers (optional), overlap badge inputs, and
  capability flags. Selection and callbacks stay props.
- **Content adapters:** `ttcMapContent(data, geometry)` and
  `regionalMapContent(data, geometry)` (pure, unit-tested), holding today's
  inline TTC model building and the `regional-*.ts` logic. Network
  differences live only here.
- **Map registry:** maps get their own id (`MapId`), each with a network
  (`ttc` subway map and a future `ttc-streetcar` map both use network `ttc`
  and its adapter). `NetworkMap` renders `SystemMap` for the network's map.
  The shell stays two-network.

## Phases

Each phase is shippable alone and keeps both maps working; the parity suite
must pass after each.

1. **One station layer.** TTC adopts artwork-shaped station targets from its
   prepared geometry (generalize `RegionalStationLayers.tsx` into a shared
   `MapStationLayers`), retiring `TtcStationTarget.tsx`'s circle targets.
   Preserve TTC's behaviour where it matters: large-station and multi-anchor
   reach (check `mobile-station-tap-accuracy`), stations missing from the
   station list (decide: draw a target only for stations with data, as TTC
   does now, on both maps), Union drawn as a regular dot, beacons spacing.
   Keep the memoization (a selection re-renders only changed stations).
2. **One tap path.** Move GO/UP to per-target `onClick` with the shared click
   suppression (or move both to one engine-owned path if click proves
   unreliable on touch); delete `finishPointer`'s selection logic. Parity
   suite cases for press, glide-press and open-map press, plus the touch
   cases, must stay green on both maps.
3. **Content adapters.** Define `MapContent`; extract TTC's inline model
   building into `app/ttc-map-content.ts`; wrap GO/UP's `regional-*.ts` into
   `app/regional-map-content.ts`. Unify train markers into one shared layer
   fed by content (TTC and GO/UP motion/shapes become adapter output or
   shared helpers). Unit tests per adapter against current outputs.
4. **`SystemMap`.** Merge the two components' orchestration into one,
   driven by manifest and content; `InteractiveTtcMap` and
   `InteractiveRegionalMap` shrink to thin wrappers, then go. Station names,
   artwork obstacles and the line-badge raster become manifest data. Update
   the parity doc so each rule names the engine, not two maps.
5. **Maps as data.** Introduce `MapId` and the registry; key manifests and
   prepared geometry by map; `NetworkMap` looks maps up by network.
6. **Drop-in proof.** A small fixture SVG under `frontend/tests/` (a few
   lines and stations, meeting the contract) with a manifest, run through
   `prepare:map-geometry` and `validate:map-asset`, and rendered by
   `SystemMap` with a fixture adapter in a browser test (camera, hover,
   press, chooser). No product UI. Rewrite `docs/map-asset-contract.md`'s
   checklist from what this step actually needed.

**Open owner question:** a way to choose between several maps of one network
(for example Subway vs Streetcars under TTC). The engine and registry allow
it either way; whether plan 10 adds a shell switcher, or leaves it until a
real third map exists, is undecided. Default: leave it out.

## Constraints

- Keep plan 09's budgets (`npm --prefix frontend run test:map-budgets`) and
  its performance decisions: never measure the live SVG, never inject into an
  authored SVG, no `filter` on repeated artwork, hover copies attach their
  `<use>` only while hovered, memoized alert tubes and station targets, the
  hidden map frozen (`FrozenWhileHidden` in `NetworkMap.tsx`), camera commits
  through the store.
- Label data honestly (root `AGENTS.md`); content adapters must preserve
  source and freshness labels exactly.
- Owner preferences on record: full-width map framing (fix chrome, not the
  camera); no alert glows on hover or selection; hover outline only under the
  cursor or keyboard focus.

## Checks per phase

`npm --prefix frontend run test:fast`, `typecheck`, `lint` (15 pre-existing
warnings). Browser suites on `--project=desktop-chrome
--project=mobile-chromium`: `map-parity` first, then `dashboard`,
`regional-station-alerts`, `regional-planned-closure-station-rings`,
`overlapping-count-badges`, `regional-alert-chooser`,
`selection-attention-refresh`, `map-mode-regressions`, `network-fade`,
`impact-camera-focus`, `map-chooser-mobile-keepouts`,
`map-viewport-persistence`, `mobile-map-fit`, `mobile-default-frame`,
`desktop-profiles-and-collapse`, `map-pan-motion`, `browser-compat`,
`regional-map-cold-launch`, `mobile-station-tap-accuracy`. Also
`test:map-zoom-memory`, `test:visual` (review differences) and, after phases
1, 3 and 4, `test:map-budgets` (compare full-spec runs and check the printed
display frame time; the phone numbers are noisy). Read
[testing](../testing.md) before Playwright; the user runs `:3000` and
`:8080`, so don't start dev servers.

Known failures at the start (2026-10-31): offline-dashboard × 4 on desktop
(the notice is not found; CI runs this spec on mobile only), two GO/UP mobile
cases (`regional-planned-closure-station-rings`, `regional-station-alerts`),
`desktop-profiles-and-collapse:150` (flaky). `browser-compat` mobile TTC
timed out waiting for rasters in two full runs but passed alone and in 26
repeated parallel runs; cause unknown, watch it.

## Starting state (handoff, 2026-10-31)

- `main` at `6084be83`, pushed: plan 09 complete (commits `53d910bd` to
  `b43a9dc1`), My Stations destination wrapping (`1988369c`), the offline
  chunk-recovery fix (`170b277b`, `ChunkLoadRecovery` no longer reloads
  offline; this was why CI's offline gate failed since `e2645af9`), and My
  Stations platform labels (`6084be83`). Check CI on `main` passed for
  `6084be83` (`gh run list --branch main`); the run for `1988369c` predates
  the offline fix and is expected to fail its offline gate.
- Leads not in this plan: GO/UP's hover sweep has 17–56 frames over 20 ms
  (TTC 1–2), within its p95 budget; phone tap INP is mostly the GO/UP station
  details panel render (TTC 216–260 ms, GO/UP 568–650 ms emulated; budgets
  provisional until a low-end Android measurement on the owner's device);
  the GO/UP station panel's arrival tiles still truncate destinations (My
  Stations now wraps them; offered to the owner, not done).

## Progress

- **Phase 1 done (2026-10-31): one station layer.** `app/map-station-artwork.ts`
  builds every map's stations from prepared geometry (`mapStationArtwork`):
  elements named with a manifest `stationPartSuffixes` suffix fold into one
  station (Spadina's two dots), and "large" is read from the artwork (a dot
  over 1.5× the map's median radius), replacing TTC's hard-coded list and
  `REGIONAL_LARGE_TERMINAL_IDS` (Kitchener is now regular-sized, as drawn).
  Hover rings grow the dots ×1.45 (large ×1.35), selection ×1.2 (large ×1),
  capped so two dots of one station never grow into each other (Spadina), which
  matches TTC's old radii within a unit; pills grow by one margin on every side
  (Union's former fixed 75-unit pad is now 81). `components/MapStationLayers.tsx`
  draws targets, hover rings, the selected-station marker and station-name
  targets on both maps; `TtcStationTarget.tsx` and `RegionalStationLayers.tsx`
  are gone. Decisions: targets only for stations with data (`placeMapStations`);
  TTC still places a station its artwork lacks at its data position, which the
  smoke stub's fixture stations need; hit padding is manifest data
  (`stationHitPadding`: TTC 6, touch 22; GO/UP 60); TTC's hover ring moved under
  the station artwork as on GO/UP, with a 10-unit stroke scaled by
  `--map-overlay-unit`; one selection marker (`.station-selection-flash`) on
  both maps, retiring TTC's always-hidden `station-selected-indicator` underlay
  and its pulse keyframes. Attributes are now shared (`data-station-id`,
  `data-station-label-id`, `.station-hit-target`, `.station-label-hit-target`);
  the `data-regional-station-*` and `regional-station-*` names are gone. Until
  phase 2, TTC's targets select themselves (`select` prop) and GO/UP's viewport
  selects from those attributes at release.
- Phase 1 checks: `test:fast`, typecheck and lint (15 warnings) pass; `map-parity`
  passes on both projects; `test:visual` (visual-baselines and
  desktop-visual-acceptance) passes with no differences. The plan's browser list
  passes except the two known GO/UP mobile cases and
  `dashboard.spec.ts:1574` (regional corridor hover), which also fails on clean
  `main` (5 of 16 runs at its mouse-hover step). `test:map-budgets` passes;
  phone tap INP TTC 208–248 ms (main 208), GO/UP 496–552 ms (main 472); one of
  five GO/UP desktop runs exceeded the wheel-burst frames-over-20 ms budget
  (the others 1–2 frames, as on main), not reproduced in three reruns.
- **Phase 2 done (2026-10-31): one tap path.** Per-target `onClick` was not an
  option: a camera commit or the details panel opening between press and click
  can drop the synthesized click, and Android can retarget it (why TTC's targets
  had already moved to `pointerup`). Both maps now take GO/UP's engine-owned
  path, generalized as `components/map-overlays/useMapTaps.ts`: the viewport
  resolves the press target when the press starts (`mapTapTargetAt`; on an
  alert, the alert the hover outline shows, formerly GO/UP's
  `regionalPointerImpactSelection`), selects it at release unless the camera's
  `shouldSuppressMapClick` says the press moved, stopped a glide or became a
  pinch, clears the selection on a release over open map, and consumes the
  click that follows in the capture phase. Enter, Space and clicks with no
  pointer (`detail === 0`) select the focused target. Station targets, station
  names, line alert targets and station alert rings carry identity only: the
  `select` and `interaction` props, `MapStationTargetSelect`, the alert targets'
  `onSelect`/`shouldSuppressMapClick`/`suppressNextMapClick` props, TTC's
  `suppressNextMapClick` flag and viewport `onClick`, and GO/UP's
  `finishPointer`/`activateTarget` are gone. TTC's alert presses now pick the
  hovered alert as GO/UP's did. Station-name hover stays per map until phase 4
  (TTC passes `onHoverChange` to `MapStationLabelTargets`; GO/UP finds it from
  the viewport).
- Phase 2 checks: `test:fast`, typecheck and lint (15 warnings) pass; `map-parity`
  passes on both projects (press, glide-press, open-map press, keyboard and the
  touch cases). The plan's browser list (357 passed) fails only the known cases:
  the two GO/UP mobile cases, offline-dashboard × 4 on desktop (pulled in by the
  `dashboard.spec.ts` filter), and `desktop-profiles-and-collapse:150`, which
  passed three repeats alone. `dashboard.spec.ts:1574` passed in this run.
  `test:visual`, `test:map-zoom-memory` and `test:map-budgets` were not rerun:
  no rendering changed.
- **Phase 3 done (2026-10-31): content adapters.** `app/map-content.ts` defines
  `MapContent` (line alerts, `selectedLineAlerts`, station alerts and direction
  glyphs, commute preview, outline paths by impact, overlap badge inputs and
  `badgePlacement`: artwork, station dots, badge scale) and the shared steps:
  `placeMapOverlapBadges` (the shared layout, formerly two call sites) and
  `reuseMapContent`/`mapContentReuser`, which keep each unchanged item's object
  across rebuilds so memoized overlays skip it (GO/UP's whole-array
  `JSON.stringify` comparisons are gone). `app/ttc-map-content.ts`
  (`ttcMapContent`) holds what `InteractiveTtcMap.tsx` built inline (now 1,246
  lines, from 2,262); corridors and badge artwork are cached by input identity,
  so a selection reuses them and badge placement stays cached.
  `app/regional-map-content.ts` (`regionalMapContent`) wraps the `regional-*`
  adapters and owns the station-only planned advisories. Fade-out of alerts
  that leave the data is a shared hook (`map-overlays/useRetainedMapItems.ts`);
  only TTC uses it, as before (GO/UP has no exit fade yet: a phase 4 decision).
  Train markers are one layer, `map-overlays/TrainMarkerLayer.tsx`
  (`MapTrainMarkerLayer`, the shared motion), placed per map by a
  `MapTrainMarkerPlacement` (`TTC_TRAIN_MARKER_PLACEMENT` measures a detached
  path, `regionalTrainMarkerPlacement` reads prepared corridors at scale 1.8);
  `TtcTrainMarkerLayer.tsx`, `app/regional-train-marker-motion.ts` and GO/UP's
  imperative marker DOM are gone. Fixed on the way: GO/UP rebuilt its overlays
  only when its content signature changed, which leaves out the selection, so
  selecting a current planned closure never drew its station-only advisory
  ring; it now rebuilds on a selection too (TTC already did). Badge layout now
  avoids only current alerts, not ones still fading out. Unit tests:
  `tests/ttc-map-content.test.mjs`, `tests/regional-map-content.test.mjs`
  (against the `regional-*` adapters' own output); source checks read each map
  with its adapter (`tests/helpers/map-source.mjs`).
- Phase 3 checks: `test:fast`, typecheck and lint (15 warnings) pass;
  `map-parity` passes on both projects (also after the adapters alone, before
  train markers); `test:visual` 30 passed with no differences;
  `test:map-zoom-memory` passes (0 tile warnings on both maps);
  `test:map-budgets` passes: phone tap INP TTC 216 ms, GO/UP 504 ms (phase 1:
  208–248 and 496–552), desktop wheel and drag p95 6.1 ms on both, GO/UP hover
  sweep 43 frames over 20 ms (17–56 before). The plan's browser list fails only
  the known cases plus `dashboard.spec.ts:1871` (timed GO/UP marker), which
  restores the real clock and finds the train toggle disabled during GO/UP's
  closed hours (run at 02:50); `dashboard.spec.ts:1911` failed until the shared
  layer kept GO/UP's `data-marker-key`, then passed.
- **Phase 4 done (2026-10-31): one engine.** `components/system-map/SystemMap.tsx`
  owns every map's orchestration: artwork and raster loading, the entrance and
  camera, the plane stack, station targets and names, the tap path, hover, train
  markers, badges and the chooser. A map is a `SystemMapDefinition`
  (`system-map/ttc-system-map.ts`, `regional-system-map.ts`): manifest, prepared
  geometry, `prepareArtwork`, content adapter, train marker segments and
  placement. `InteractiveTtcMap.tsx` and `InteractiveRegionalMap.tsx` are
  one-line wrappers (GO/UP's stays code-split); they go with phase 5's registry.
  New manifest data: `stationLabels` (target and hover padding, glyph cutout:
  TTC `use` of its authored label, GO/UP a prepared glyph copy, mask dilation),
  `framing`, `compass`, `attributionSource`, `label`. Both maps' SVGs load
  through `app/map-artwork.ts` and mount whole as artwork under the overlay plane
  (TTC's three-part split is gone, with its unused `delay-static-filter` and
  `badge-suspension-hash` defs and the authored-label hover classes); the lifted
  station name is one `MapStationLabelHoverCopy`; station-name hover comes from
  the targets on both maps (`installRegionalStationLabelHover`,
  `regional-station-interaction.ts` and `regionalOverlayContentSignature` are
  gone). Plane groups have map-prefixed ids (`ttc-dynamic-segment-layer`).
  Decisions (owner): GO/UP gets the exit fade; content is built per render on
  both maps (poll-only restamps are caught by `reuseMapContent`, now unit-tested).
  Unified behaviour, formerly one map's: the entrance waits for the rasters
  (TTC's), the stage shows once the camera is placed (GO/UP's), turning the
  phone refits (GO/UP's), programmatic motion stops while the page is hidden and
  the camera reconciles resizes only while active (GO/UP's), hover pauses on
  `isGestureActive` and pulses sync on phones too (TTC's), side insets follow the
  camera's width rule (TTC's desktop-with-hidden-chrome inset is now 32, was 12),
  the chooser sits in the viewport and the toolbar comes first (TTC's), GO/UP
  station names get targets only for stations with data, the name cutout waits
  for the label font on TTC too, and TTC's Center button is titled "Center map
  view". One set of element hooks: the root `.system-map` with
  `data-system-map="ttc|regional"` (camera flags on it for both maps), the
  viewport `.system-map-viewport` and the stage `.map-stage`; the per-map classes
  (`.ttc-map-stage`, `.regional-map`, `.regional-map-viewport`,
  `.regional-map-stage`, `.regional-map-control-rail`) and TTC's
  `data-map-pan-zoom-viewport` are gone, specs select a map by
  `[data-system-map=…]`, and the only per-map CSS left is artwork theming. The
  `!important` ceiling went from 446 to 448: TTC's inline artwork theming moved into `base-map.css`.
- Phase 4 checks (before the element hooks were unified; rerun after, below): `test:fast`, typecheck and lint (15 warnings) pass;
  `map-parity` passes on both projects. The plan's browser list (354 passed)
  fails only the known cases: the two GO/UP mobile cases, offline-dashboard × 4
  on desktop, and `dashboard.spec.ts:1871` (run at 03:00, GO/UP closed); two
  unscoped locators (`dashboard.spec.ts:2830`, `:4016`), which matched GO/UP's
  identical groups and Kipling, are scoped to TTC and pass. `test:visual` 30
  passed with no differences; `test:map-zoom-memory` 0 warnings on both maps;
  `test:map-budgets` passes: phone tap INP TTC 200 ms, GO/UP 528 ms; desktop
  wheel and drag p95 6.1 ms on both; GO/UP hover sweep 45 frames over 20 ms
  (phase 3: 43).
- Phase 4 checks after unifying the element hooks: `test:fast`, typecheck and
  lint (15 warnings) pass; the plan's browser list with `map-parity` (380
  passed) fails only the known cases (the two GO/UP mobile cases,
  offline-dashboard × 4 on desktop, `dashboard.spec.ts:1871` overnight); the
  specs the rename broke (nested locators that repeated the map scope, flag
  checks on TTC's viewport, two `.regional-map-control-rail` lookups) were
  fixed and pass. `test:visual` 30 passed with no differences. `compact-mobile`
  (not in the list) fails the same 18 cases on `e38b29a2` as here.
- **Phase 5 done (2026-10-31): maps as data.** Maps have their own id,
  `MapId` (`app/map-manifests.ts`, replacing `MapManifestId` and
  `PreparedMapId`), and each manifest names its `network`; `NETWORK_MAPS`
  names the map each network shows. Decision: `MapId` keeps today's values
  (`ttc`, `regional`), so `data-system-map` is now the map id with no change to
  specs, CSS, plane ids, raster file names or saved cameras (`persistenceKey`);
  a TTC streetcar map would be `ttc-streetcar` with network `ttc`. Prepared
  geometry sources come from the manifests (`MAP_GEOMETRY_SOURCES`), and a
  definition is built with `defineSystemMap`, which reads the station artwork
  and rejects geometry prepared for another map. Raster planes are keyed by map
  (`RASTER_MAP_PLANES_BY_MAP`, `RasterMapId`, `rasterMapSource(mapId, …)`,
  `RasterMapPlane`'s `map` prop); the definition's `network` field is gone
  (`manifest.network`), and a map's SVG URL comes from its manifest
  (`mapArtworkUrl`, also the home page's preload). The registry,
  `components/system-map/system-map-registry.tsx`, holds each map's definition:
  TTC's bundled, GO/UP's loaded on demand through `next/dynamic` (client only,
  as before) with its artwork listed so `prepareSystemMap` loads both at once.
  `NetworkMap` renders `RegisteredSystemMap` with `NETWORK_MAPS[network]` and
  the same props for every map; `InteractiveTtcMap.tsx` and
  `InteractiveRegionalMap.tsx` are gone. GO/UP now gets the shell's props
  spread as TTC did (it had an explicit list; the only props it lacked were
  `stations` and `entranceSignal`, which the shell does not pass). The shell's
  station list is read only by a map whose definition `usesStationList` (TTC):
  GO/UP's summaries have no map positions. No map switcher (owner question
  still open, default kept).
- Phase 5 checks: `test:fast` (new `tests/map-registry.test.mjs`), typecheck,
  lint (15 warnings), `test:scripts`, `prepare:map-geometry --check` and
  `validate:map-asset` for both maps pass. `map-parity` passes on both projects
  before and after. The build keeps GO/UP's definition out of the page's
  chunks (its 64 KB geometry chunk loads on demand; TTC's is in the page
  manifest). The plan's browser list (350 passed) fails only the known cases:
  the two GO/UP mobile cases and `dashboard.spec.ts:1871` × 2 (run at 04:50,
  GO/UP closed; the `tests/smoke/dashboard.spec.ts` path left out
  offline-dashboard). `test:visual` 30 passed with no differences;
  `test:map-zoom-memory` 0 warnings on both maps; `test:map-budgets` passes:
  phone tap INP TTC 200 ms, GO/UP 528 ms (phase 4: 200, 528); desktop wheel and
  drag p95 6.1 ms on both; GO/UP hover sweep 35 frames over 20 ms (phase 4: 45).
- Next: phase 6 (drop-in proof: a fixture SVG, manifest and adapter rendered by
  `SystemMap` in a browser test; rewrite the asset contract's checklist from
  what it needed). The fixture map needs a `MapId` and a registry entry, which
  are typed as a closed union today; phase 6 decides whether tests register a
  map or render `SystemMap` with a definition directly.
