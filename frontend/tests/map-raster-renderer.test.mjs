import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";
import {
  RASTER_MAP_RENDERED_SIZES,
  RASTER_MAP_WIDTHS,
  listAllRasterMapVariants,
} from "../src/app/map-raster-manifest.ts";
import { readSystemMapSource } from "./helpers/map-source.mjs";

const frontendRoot = fileURLToPath(new URL("..", import.meta.url));
const assetRoot = `${frontendRoot}/public/assets/linewatch/raster-maps`;

function pngDimensions(buffer) {
  assert.deepEqual(
    [...buffer.subarray(0, 8)],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    "generated map surface must be a PNG",
  );
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

describe("stable raster map renderer", () => {
  it("ships static artwork planes for every network, theme, and density", async () => {
    const variants = listAllRasterMapVariants();
    assert.equal(variants.length, 63, "must advertise exactly 63 static raster variants (36 TTC + 27 Regional)");

    for (const { map, density, filename } of variants) {
      const buffer = await readFile(`${assetRoot}/${filename}`);
      const dimensions = pngDimensions(buffer);
      assert.equal(dimensions.width, RASTER_MAP_WIDTHS[map][density]);
      assert.ok(dimensions.height > 1000);
      assert.ok(buffer.byteLength > 10_000, `raster plane ${filename} must contain rendered artwork`);
    }
  });

  it("reuses decoded textures across map remounts and keeps the previous texture until replacements decode", async () => {
    const source = await readFile(`${frontendRoot}/src/components/RasterMapPlane.tsx`, "utf8");
    const assets = await readFile(`${frontendRoot}/src/app/map-assets.ts`, "utf8");
    assert.match(assets, /import \{ lineWatchBuildLabel \} from "\.\/app-build"/);
    assert.match(assets, /\?v=\$\{encodeURIComponent\(lineWatchBuildLabel\)\}/);
    assert.match(source, /const decodedRasterSources = new Set<string>\(\)/);
    assert.match(source, /rasterMapSourceIsDecoded\(desiredSource\) \? desiredSource : null/);
    assert.match(source, /const decode = image\.decode\(\)\.then/);
    assert.match(source, /decodedRasterSources\.add\(source\)/);
    assert.match(source, /if \(!cancelled\) setDisplayedSource\(desiredSource\)/);
    assert.match(source, /decoding="sync"/);
    assert.doesNotMatch(source, /next\/image/);
  });

  it("keeps mobile hydration on compact artwork planes flattened into one camera surface", async () => {
    const [map, plane, mobileHook, css] = await Promise.all([
      Promise.resolve(readSystemMapSource()),
      readFile(`${frontendRoot}/src/components/RasterMapPlane.tsx`, "utf8"),
      readFile(`${frontendRoot}/src/hooks/useMobilePerformanceMode.ts`, "utf8"),
      readAppStylesheet(),
    ]);

    // One engine renders every map's planes.
    assert.match(mobileHook, /export function mobilePerformanceModeMatches\(\)/);
    assert.match(map, /mobilePerformanceMode \|\| mobilePerformanceModeMatches\(\)/);
    assert.match(map, /useMobileRendering\s*\?\s*"mobile"\s*:\s*"balanced"/);
    assert.match(
      await readFile(`${frontendRoot}/src/app/map-raster-manifest.ts`, "utf8"),
      /"mobile" \| "balanced" \| "desktop"/,
    );
    assert.match(map, /mapEffectMotionPaused = reducedMotion \|\| !pageVisible/);
    assert.match(map, /animate=\{!mapEffectMotionPaused\}/);
    assert.match(map, /useMapPulseSync\(rootRef, \{\s*paused: mapEffectMotionPaused/);
    // Ready once every plane the manifest lists has decoded (TTC also has line badges).
    assert.match(map, /manifest\.rasterPlanes\.every\(\(plane\) => readyRasterPlanes\.has\(`\$\{rasterVariantKey\}:\$\{plane\}`\)\)/);
    assert.match(map, /\{renderRasterPlane\("labels"\)\}/);
    assert.doesNotMatch(map, /rasterDensity === "desktop"/);
    assert.doesNotMatch(plane, /density === "mobile" && svgViewBox/);
    assert.match(css, /\.linewatch-shell\.mobile-performance-mode \.map-stage\s*\{[^}]*will-change:\s*auto/s);
    assert.match(
      css,
      /\.linewatch-shell\.mobile-performance-mode \.map-stage \.raster-map-plane\s*\{[^}]*backface-visibility:\s*visible;[^}]*transform:\s*none;/s,
    );
    assert.match(css, /\.raster-map-plane\s*\{[^}]*transform:\s*translateZ\(0\);[^}]*backface-visibility:\s*hidden/s);
  });

  it("sandwiches live overlays between raster artwork and keeps interaction planes on top", async () => {
    const [map, css] = await Promise.all([
      Promise.resolve(readSystemMapSource()),
      readAppStylesheet(),
    ]);

    const under = map.indexOf("{underPlanes.map(renderRasterPlane)}");
    const artwork = map.indexOf("<AuthoredArtwork", under);
    const overlays = map.indexOf("raster-map-dynamic-plane map-overlay-plane", artwork);
    const foreground = map.indexOf('{renderRasterPlane("foreground")}', overlays);
    const labels = map.indexOf('{renderRasterPlane("labels")}', foreground);
    const top = map.indexOf("raster-map-top-plane", labels);
    const interaction = map.indexOf("raster-map-interaction-plane", top);
    assert.ok(under > -1 && artwork > under && overlays > artwork && foreground > overlays && labels > foreground);
    assert.ok(top > labels && interaction > top);
    assert.match(map, /const UNDER_PLANES: readonly RasterMapPlaneName\[\] = \["background", "badges"\];/);
    assert.match(map, /data-raster-map-ready=\{rasterMapReady/);
    assert.match(css, /\.raster-map-plane--background \{ z-index: 0; \}/);
    assert.match(css, /\.raster-map-interaction-plane \{ z-index: 4; \}/);
    assert.match(css, /\.map-stage\[data-raster-map-ready="true"\] \.map-authored-svg\s*\{[^}]*visibility:\s*hidden/s);
  });

  it("preserves authored label weights and theme-aware interchange leaders", async () => {
    const [generator, map, stationLayers, regionalAsset, manifests, css, mapLabelFontHook] = await Promise.all([
      readFile(`${frontendRoot}/scripts/generate-map-rasters.mjs`, "utf8"),
      Promise.resolve(readSystemMapSource()),
      readFile(`${frontendRoot}/src/components/MapStationLayers.tsx`, "utf8"),
      readFile(`${frontendRoot}/src/app/regional-map-asset.ts`, "utf8"),
      readFile(`${frontendRoot}/src/app/map-manifests.ts`, "utf8"),
      readAppStylesheet(),
      readFile(`${frontendRoot}/src/hooks/useMapLabelFontReady.ts`, "utf8"),
    ]);

    const ttcLabelsCss = generator.match(/id: "ttc"[\s\S]*?labelsCss: `([\s\S]*?)`,\n    darkCss:/)?.[1] ?? "";
    const regionalLabelsCss = generator.match(/id: "regional"[\s\S]*?labelsCss: `([\s\S]*?)`,\n    darkCss:/)?.[1] ?? "";
    assert.doesNotMatch(ttcLabelsCss, /font-weight:\s*700/);
    assert.doesNotMatch(regionalLabelsCss, /font-weight:\s*700/);
    assert.doesNotMatch(regionalLabelsCss, /stroke-width:\s*2px !important/);
    assert.doesNotMatch(generator, /mobileForegroundCss/);
    assert.match(generator, /map\.id === "regional" && plane === "labels" && theme !== "light"[\s\S]*?source\.replaceAll\("stroke:#000000", "stroke:#ffffff"\)/);
    assert.match(generator, /#polygon771-7,[\s\S]*?#polygon771-7-4-1-5 \{ fill: #f1f5f9 !important; \}/);
    // The hovered name: one copy for every map, masked to its glyphs, lifted
    // over the label texture, which cuts the same glyphs out underneath.
    assert.match(stationLayers, /className="raster-station-label-text-hover"/);
    assert.match(css, /scale\(1\.035\)/);
    assert.match(stationLayers, /targetMask: `\$\{idPrefix\}-hovered-station-target-mask`/);
    assert.match(stationLayers, /<mask id=\{ids\.labelMask\} maskUnits="userSpaceOnUse" \{\.\.\.bounds\}>\s*<g mask=\{`url\(#\$\{ids\.targetMask\}\)`\}>/);
    assert.match(stationLayers, /<feMorphology in="SourceAlpha" operator="dilate" radius=\{dilate\} result="expandedTargetAlpha" \/>/);
    assert.match(stationLayers, /clipPath=\{`url\(#\$\{ids\.clip\}\)`\} filter=\{`url\(#\$\{ids\.whiteAlpha\}\)`\}/);
    assert.match(map, /labelsSource=\{rasterMapSource\(manifest\.id, "labels", rasterTheme, rasterDensity\)\}/);
    assert.match(map, /cutoutElementHref: labelCutout && "href" in labelCutout \? labelCutout\.href : null,/);
    assert.match(map, /cutoutMarkup: labelCutout && "markup" in labelCutout \? labelCutout\.markup : null,/);
    assert.match(
      await readFile(`${frontendRoot}/src/components/RasterMapPlane.tsx`, "utf8"),
      /<feMorphology[\s\S]*?result="expandedAlpha"/,
    );
    // TTC cuts with its authored label; GO/UP, whose names sit in a
    // transformed layer, with a prepared glyph copy, without ids.
    assert.match(manifests, /cutout: \{ kind: "use", idPrefix: "station-label-", dilate: 4 \}/);
    assert.match(manifests, /cutout: \{ kind: "copy", idPrefix: "regional-station-label-cutout-source-", dilate: 6 \}/);
    assert.match(map, /removeDescendantIds\(copy\)/);
    assert.match(regionalAsset, /labelCutoutSources\.id = "regional-station-label-cutout-sources"/);
    assert.match(regionalAsset, /cutoutSource\.id = `regional-station-label-cutout-source-\$\{stationId\}`/);
    assert.match(
      generator,
      /labelsRenderedSize:\s*(?:RASTER_MAP_RENDERED_SIZES\.regionalLabels|\{ width: 17036\.959, height: 9031\.6719 \})/,
    );
    assert.deepEqual(RASTER_MAP_RENDERED_SIZES.regionalLabels, { width: 17036.959, height: 9031.6719 });
    // Hide the authored SVG with visibility: opacity: 0 on its label layer gave
    // Chromium ~55 GPU layers for invisible text, which tore the GO/UP map
    // after a pan. Its targets are React elements elsewhere.
    assert.match(css, /\.map-authored-svg\s*\{\s*pointer-events:\s*none;/s);
    assert.doesNotMatch(css, /data-raster-map-ready="true"\][^{,]*#regional-station-labels-layer\s*\{[^}]*opacity:\s*0/s);
    assert.doesNotMatch(css, /\.regional-raster-station-label-live-copy/);
    assert.doesNotMatch(css, /\.station-label-hover-effect/);
    assert.match(css, /\.raster-station-label-text-hover\s*\{[^}]*filter:\s*drop-shadow/s);
    assert.match(mapLabelFontHook, /MAP_LABEL_FONT_SPECS\.map\(\(spec\) => document\.fonts\.load\(spec, MAP_LABEL_FONT_SAMPLE\)\)/);
    assert.match(mapLabelFontHook, /fontFaces\.every/);
    assert.match(mapLabelFontHook, /faces\.length > 0 && faces\.every\(\(face\) => face\.status === "loaded"\)/);
    // The name lifts, and its glyphs are cut, only once the label font is ready.
    assert.match(map, /const labelHover = useMemo\(\(\) => \(hoveredLabel && mapLabelFontReady/);
    assert.match(map, /const labelCutout = labelHover \? hoveredLabel\?\.cutout \?\? null : null;/);
    assert.match(map, /data-map-label-font-ready=\{mapLabelFontReady \? "true" : "false"\}/);
  });
});
