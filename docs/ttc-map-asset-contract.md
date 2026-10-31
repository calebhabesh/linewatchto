# TTC custom map asset contract

TTC's notes on the shared [System Map asset contract](map-asset-contract.md), which every map meets; its manifest is `ttc` in `frontend/src/app/map-manifests.ts`.

The authored source is an independent derivative replica re-created by the LineWatchTO developer in Inkscape, using the [TTC Line 1 route-page map](https://www.ttc.ca/routes-and-schedules/1/0) as a direct visual reference. It is structured for optimized app rendering and data referencing/formatting; it is not a downloaded TTC map file. TTC names, marks, line colors, and the referenced map design remain the property of TTC or their respective owners.

LineWatchTO prepares the authored Inkscape file before serving it. Run:

```bash
node scripts/prepare-ttc-map-asset.mjs \
  /path/to/TTC_Subway_Map_Custom_Edited.svg \
  frontend/public/assets/linewatch/ttc-subway-map-custom.svg
npm --prefix frontend run validate:map-asset -- ttc
npm --prefix frontend run generate:map-rasters
npm --prefix frontend run prepare:map-geometry
```

`prepare:map-geometry` lays out both maps' SVGs in Chromium with the label font and writes their geometry (station dots and shapes, segment anchors, track and route paths, guides, station-name boxes, badge obstacles) to `frontend/src/app/map-geometry/`, in root coordinates. The maps read only that data, never the live SVG's layout. Rerun it after any TTC or regional SVG change; `test:fast` fails while the data is stale, and `npm --prefix frontend run check:map-geometry` compares a fresh extraction.

The source must keep the `0 0 8250 4000` view box and the six authored layers named `station-text`, `tracks`, `stations`, `transit-line-badges`, `connection-labels`, and `non-linear-guides-layer`. Station names must remain real SVG `<text>` elements. The preparation step assigns stable DOM ids, links each text element to its station, validates the 109 names and 110 visual anchors, and normalizes the four curved/nonlinear overlay guides.

The SVG stays mounted as a non-painting geometry source once all required raster planes have decoded. The generated background plane contains static tracks; the foreground plane contains station dots and connection artwork; station names and line badges each have a separate plane. This separation lets line badges fade with diagram scale without fading names or track artwork. Do not hand-edit files under `raster-maps/`: regenerate them after any authored TTC or regional SVG change.

## Authored source status

The Inkscape source now includes the corrected Humber College, Jane, Line 6, and Spadina station-circle labels. Its three UP Express wordmarks also use UP blue (`#4084cd`), and the Mount Dennis UP subgroup is labeled. The importer validates those authored station labels directly; it no longer repairs them through generated Inkscape object ids.

LineWatchTO's current internal station ids intentionally remain `station-greenwoood` and `station-o_connor`; those spellings match persisted application data. Do not silently change only the SVG ids.

Alert rails are 80 units wide, the same as the authored lines, so lines drawn edge to edge never overlap each other's alerts. A segment without a guide follows its line's path in the `tracks` layer between its two station anchors (`resolveNetworkSegmentPath`), so each `tracks` path must stay labelled with its line id (`line-1`, `line-2`, `line-4`, `line-5`, `line-6`). A straight chord between station centres cut the track's corners by up to 15 units, which the rail's former 102-unit width hid. An anchor more than 60 units from its track keeps the chord.

The preparation step still converts the four curved/nonlinear guides to stable root-coordinate paths aligned to St Andrew–Union, Union–King, St George–Spadina, and Humber College–Westmore. It also normalizes the standalone UP Express connection icon to UP blue so a bulk asset import cannot overwrite the application version with the black source variant.

The preparation script is deliberately strict. A renamed, missing, or duplicate station stops the import instead of allowing clicks, overlays, station rings, commute previews, or estimated train markers to drift silently.
