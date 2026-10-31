# System Map asset contract

Every System Map is an authored Inkscape SVG plus a manifest. A new map gets the same camera, overlays, badges and chooser, station alerts, hover, focus and selection, commute previews, station names and train markers as TTC and GO/UP, because all of that is shared code ([plan 09](refactor-plan/09-system-map-engine.md), [map renderer parity](map-renderer-parity.md)). Adding a map is this checklist, not a code project. Map-specific notes: [TTC](ttc-map-asset-contract.md).

## The manifest

`frontend/src/app/map-manifests.ts` holds one record per map. The maps, the geometry extractor and the validator all read it.

| Field | What it is |
| --- | --- |
| `svg`, `geometry` | The served SVG and its prepared geometry file, relative to `frontend/`. |
| `viewBox` | The root SVG's view box. Every prepared coordinate, overlay and badge is in this space. |
| `stage` | The camera stage in CSS pixels. Each SVG plane fills it with `xMidYMid meet`, so map coordinates reach the stage through `meetStageTransform(viewBox, stage)`. |
| `overlayUnit` | Map units per TTC overlay unit: the map's alert rail width over TTC's 96. Overlay sizes multiply by it. |
| `contentBounds` | The visible art in stage pixels, which the default camera fits. |
| `rasterPlanes` | The raster planes generated from the SVG (`background`, `foreground`, `labels`, optionally `badges`). |
| `layers` | CSS selectors for the layers the app reads: `stations`, `stationLabels`, `lines`, and `guides` when segments follow curves. |
| `stationLabelLink` | How a station name finds its station: an attribute the preparation step writes (`attribute`), or by matching the name to the station id (`name`). |
| `stationPartSuffixes` | Id suffixes of shapes drawn for a station rather than being one, such as a second anchor (`-2`) or a junction's line part (`-up`). |
| `stationHitPadding` | Room each station target adds around its dots, in map units: `pointer` for a mouse, `touch` for coarse pointers. Targets, hover rings and the selection marker take the dots' own shapes (`app/map-station-artwork.ts`). |
| `lineIds` | The line paths overlays follow, by `id` or `inkscape:label` in the lines layer. |
| `guideIds` | Curved segment guides, by `inkscape:label`. |

Network content (which alerts exist, trip changes, arrivals, sources and freshness) is not part of the map: it stays in the network's adapters (`app/regional-*.ts` and TTC's data), and only the station and line ids connect the two.

## SVG rules

- One coordinate space: the root `<svg>` has the manifest's `viewBox`. Nested transforms are fine; the extractor resolves them to root coordinates.
- The `stations` layer holds one element per station with id `station-<id>`, unique in the file, plus any parts named with a `stationPartSuffixes` suffix. Station ids must match the network's data.
- Station names are real `<text>` elements in the `stationLabels` layer, each linked to exactly one station.
- Every manifest line id is a `<path>` in the `lines` layer; every guide id is in the `guides` layer.
- Authored line width sets `overlayUnit`; alert tubes are drawn a little wider than the line so they cover it.

## Checklist for a new map

1. Add the SVG under `frontend/public/assets/linewatch/` and its manifest record.
2. Validate: `npm --prefix frontend run validate:map-asset -- <map> [path/to.svg]` (`scripts/validate-map-asset.mjs`). It checks the view box, layers, station ids and parts, name links, line and guide paths, and the raster files, and exits non-zero on any error.
3. Generate the raster planes: `npm --prefix frontend run generate:map-rasters`.
4. Prepare the geometry: `npm --prefix frontend run prepare:map-geometry`. `test:fast` fails while it is stale (`check:map-geometry` compares a fresh run).
5. Render the map through the shared plane stack, camera (`usePanZoom`), framing (`useMapFraming`), chooser (`useMapOverlapChooser`) and overlay components, passing the manifest's stage transform and content bounds.
6. Add the map to `tests/smoke/map-parity.spec.ts` and run `npm --prefix frontend run test:map-budgets` on a desktop GPU.

The validator runs in `npm --prefix frontend run test:scripts` against both served maps (`scripts/tests/validate-map-asset.test.mjs`).
