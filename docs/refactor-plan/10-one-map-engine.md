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

- Not started.
