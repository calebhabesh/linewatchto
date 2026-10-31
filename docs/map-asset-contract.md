# System Map asset contract

Every System Map is an authored Inkscape SVG plus a manifest. A new map gets the same camera, overlays, badges and chooser, station alerts, hover, focus and selection, commute previews, station names and train markers as TTC and GO/UP, because all of that is one engine, `SystemMap` ([plan 10](refactor-plan/10-one-map-engine.md), [map renderer parity](map-renderer-parity.md)). Adding a map is the checklist below, not a code project: a fixture map under `frontend/tests/fixtures/drop-in-map/` went through it with no engine code of its own (plan 10 phase 6). Map-specific notes: [TTC](ttc-map-asset-contract.md).

## The manifest

`frontend/src/app/map-manifests.ts` holds one record per shipped map (`MAP_MANIFESTS`, keyed by `MapId`). The engine, the geometry extractor and the validator all read it. A map that is not shipped (a fixture, or a map still in progress) is a module whose default export is a `MapManifest<"its-id">`; the tools take it with `--manifest`.

| Field | What it is |
| --- | --- |
| `id` | The map's id. It names the map's element hooks (`data-system-map`), plane group ids, raster files and saved camera, so it stays stable once a map ships. |
| `network` | The network whose data the map shows. Several maps can share a network; `NETWORK_MAPS` names the one each network shows. |
| `svg`, `geometry` | The SVG and its prepared geometry file, relative to `frontend/`. A shipped SVG lives under `public/` and is served from the site root (`mapArtworkUrl`). |
| `viewBox` | The root SVG's view box. Every prepared coordinate, overlay and badge is in this space. |
| `stage` | The camera stage in CSS pixels. Each SVG plane fills it with `xMidYMid meet`, so map coordinates reach the stage through `meetStageTransform(viewBox, stage)`. |
| `overlayUnit` | Map units per TTC overlay unit: the map's alert rail width over TTC's 96 (1 for 80-unit lines, as TTC's). Overlay sizes multiply by it. |
| `contentBounds` | The visible art in stage pixels, which the default camera fits. |
| `rasterPlanes` | The raster planes generated from the SVG (`background`, `foreground`, `labels`, optionally `badges`), or none. With none, the authored SVG paints: the engine mounts it in two parts, its `stations` and `stationLabels` layers over the overlays where the foreground and label planes would be, and the hovered name lifts the authored glyphs. Shipped maps use rasters for camera performance. |
| `layers` | CSS selectors for the layers the app reads: `stations`, `stationLabels`, `lines`, and `guides` when segments follow curves. Use ids. |
| `stationLabelLink` | How a station name finds its station: an attribute on the `<text>` (`attribute`), or by matching the name to the station id (`name`). |
| `stationPartSuffixes` | Id suffixes of shapes drawn for a station rather than being one, such as a second anchor (`-2`) or a junction's line part (`-up`). |
| `stationHitPadding` | Room each station target adds around its dots, in map units: `pointer` for a mouse, `touch` for coarse pointers. Targets, hover rings and the selection marker take the dots' own shapes (`app/map-station-artwork.ts`). |
| `stationLabels` | Station names: `targetPadding` and `hoverPadding` around each name's box, and the `cutout` the lifted name takes its glyphs from: the authored label (`use`, by `idPrefix` plus station id), or a prepared glyph copy (`copy`) for names in a transformed layer, which `<use>` would drop. |
| `framing` | The default camera: phone zoom, the station a phone centres on, and side insets as a share of the width. |
| `compass`, `attributionSource`, `label` | The north compass box in view box units, whose map the drawing re-creates (for the attribution notice), and the map's accessible name. |
| `lineIds` | The line paths overlays follow, by `id` or `inkscape:label` in the lines layer. The extractor keeps exactly these paths. |
| `guideIds` | Curved segment guides, by `inkscape:label`. |
| `badgeObstacles` | Optional: the artwork overlap badges keep clear of (`ignore`, `text`, `boxes` by kind, `strokes`), as selectors. Without it, badges keep clear of text and station dots (`mapBadgeObstacles`). |

Network content (which alerts exist, trip changes, arrivals, sources and freshness) is not part of the map: it stays in the network's content adapter (`ttcSystemMapAdapter`, `regionalSystemMapAdapter`), and only station, anchor and line ids connect the two. A new map of an existing network reuses its adapter, so the network's data must use the map's ids (`station-<id>` anchors, line ids).

## SVG rules

- One coordinate space: the root `<svg>` has the manifest's `viewBox`. Nested transforms are fine; the extractor resolves them to root coordinates.
- The `stations` layer holds one element per station with id `station-<id>`, unique in the file, plus any parts named with a `stationPartSuffixes` suffix. Station ids must match the network's data.
- Station names are real `<text>` elements in the `stationLabels` layer, each linked to exactly one station. With a `use` cutout each name sets its own `font-size` and `font-family` (on the text or every tspan): the lifted copy does not inherit its layer's styles.
- Every manifest line id is a `<path>` in the `lines` layer, by `id` or `inkscape:label`; every guide id is in the `guides` layer.
- Authored line width sets `overlayUnit`; alert tubes are drawn a little wider than the line so they cover it.

## Checklist for a new map

1. **SVG.** Draw it to the rules above. A shipped map goes under `frontend/public/assets/linewatch/`.
2. **Manifest.** A shipped map adds its id to `MapId` and its record to `MAP_MANIFESTS`; otherwise write a manifest module (as `tests/fixtures/drop-in-map/drop-in-map-manifest.ts`).
3. **Validate:** `npm --prefix frontend run validate:map-asset -- <map id>`, or `-- --manifest <module>` (paths relative to `frontend/`), optionally followed by another SVG path. It checks the view box, layers, station ids and parts, name links and fonts, line and guide paths, and the raster files the manifest lists, and exits non-zero on any error.
4. **Prepare the geometry:** `npm --prefix frontend run prepare:map-geometry` (every shipped map), or `-- --manifest <module>`. `test:fast` fails while a shipped map's geometry is stale; a fixture adds its own check (`tests/map-geometry-data.test.mjs` does for the drop-in map).
5. **Definition:** `defineSystemMap({ manifest, geometry, ...ttcSystemMapAdapter(geometry) })` (or `regionalSystemMapAdapter`), in `frontend/src/components/system-map/<map>-system-map.ts`. The overlay plane and the SVG preparation default from the manifest (`manifestOverlayPlane`, `mapArtworkSource`); pass your own only for station outline cutouts or an SVG that needs preparing (GO/UP links names and builds glyph copies). A new network writes its adapter (`SystemMapNetworkAdapter`: content, train markers, whether it places the shell's station list).
6. **Registry:** one line in `system-map/system-map-registry.tsx` (load it on demand unless it is the default map). `SystemMap` needs no edits. To show it, point its network at it in `NETWORK_MAPS`; a second map of one network needs the owner's decision on a map switcher, and its own station list for maps that place the shell's (`usesStationList`; NetworkMap passes one list per network).
7. **Rasters (shipped maps).** Raster generation is still per map: add the map to `scripts/generate-map-rasters.mjs` (its plane and theme CSS, which split the drawing into background, foreground and labels) and its sizes and planes to `src/app/map-raster-manifest.ts` (`RASTER_MAP_WIDTHS`, `RASTER_MAP_RENDERED_SIZES`, the plane types), then run `npm --prefix frontend run generate:map-rasters`, list the planes in `rasterPlanes` and validate again. A map can ship without them first.
8. **Test:** add the map to `tests/smoke/map-parity.spec.ts` and run `npm --prefix frontend run test:map-budgets` on a desktop GPU. `tests/smoke/drop-in-map.spec.ts` shows the cases for a map that is not shipped: it renders `SystemMap` with the fixture definition on a harness route (`src/app/test-harness/`, a page only in builds with `LINEWATCH_TEST_HARNESS=true`, which the Playwright build sets).

The validator runs in `npm --prefix frontend run test:scripts` against both served maps and the drop-in fixture (`scripts/tests/validate-map-asset.test.mjs`).
