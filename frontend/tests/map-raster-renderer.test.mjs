import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

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
    const expectedWidths = {
      ttc: { mobile: 3000, desktop: 6750 },
      regional: { mobile: 3200, desktop: 7109 },
    };

    for (const network of ["ttc", "regional"]) {
      const planes = ["background", "foreground", "labels"];
      for (const plane of planes) {
        for (const theme of ["light", "dark", "high-contrast"]) {
          for (const density of ["mobile", "desktop"]) {
            const buffer = await readFile(`${assetRoot}/${network}-${plane}-${theme}-${density}.png`);
            const dimensions = pngDimensions(buffer);
            assert.equal(dimensions.width, expectedWidths[network][density]);
            assert.ok(dimensions.height > 1000);
            assert.ok(buffer.byteLength > 10_000, "raster plane must contain rendered artwork");
          }
        }
      }
    }
  });

  it("reuses decoded textures across map remounts and keeps the previous texture until replacements decode", async () => {
    const source = await readFile(`${frontendRoot}/src/components/RasterMapPlane.tsx`, "utf8");
    assert.match(source, /import \{ lineWatchBuildLabel \} from "\.\.\/app\/app-build"/);
    assert.match(source, /\?v=\$\{encodeURIComponent\(lineWatchBuildLabel\)\}/);
    assert.match(source, /const decodedRasterSources = new Set<string>\(\)/);
    assert.match(source, /rasterMapSourceIsDecoded\(desiredSource\) \? desiredSource : null/);
    assert.match(source, /const decode = image\.decode\(\)\.then/);
    assert.match(source, /decodedRasterSources\.add\(source\)/);
    assert.match(source, /if \(!cancelled\) setDisplayedSource\(desiredSource\)/);
    assert.match(source, /decoding="sync"/);
    assert.doesNotMatch(source, /next\/image/);
  });

  it("keeps mobile hydration on compact artwork planes flattened into one camera surface", async () => {
    const [ttc, regional, plane, mobileHook, css] = await Promise.all([
      readFile(`${frontendRoot}/src/components/InteractiveTtcMap.tsx`, "utf8"),
      readFile(`${frontendRoot}/src/components/InteractiveRegionalMap.tsx`, "utf8"),
      readFile(`${frontendRoot}/src/components/RasterMapPlane.tsx`, "utf8"),
      readFile(`${frontendRoot}/src/hooks/useMobilePerformanceMode.ts`, "utf8"),
      readFile(`${frontendRoot}/src/app/globals.css`, "utf8"),
    ]);

    assert.match(mobileHook, /export function mobilePerformanceModeMatches\(\)/);
    assert.match(ttc, /mobilePerformanceMode \|\| mobilePerformanceModeMatches\(\)/);
    assert.match(regional, /mobilePerformanceMode \|\| mobilePerformanceModeMatches\(\)/);
    assert.match(ttc, /readyRasterPlanes\.has\(`\$\{rasterVariantKey\}:labels`\)/);
    assert.match(regional, /readyRasterPlanes\.has\(`\$\{rasterVariantKey\}:labels`\)/);
    assert.match(ttc, /<RasterMapPlane[\s\S]*?plane="labels"/);
    assert.match(regional, /<RasterMapPlane[\s\S]*?plane="labels"/);
    assert.doesNotMatch(ttc, /rasterDensity === "desktop" \? \([\s\S]*?plane="labels"/);
    assert.doesNotMatch(regional, /rasterDensity === "desktop" \? \([\s\S]*?plane="labels"/);
    assert.doesNotMatch(plane, /density === "mobile" && svgViewBox/);
    assert.match(css, /\.linewatch-shell\.mobile-performance-mode :is\(\.ttc-map-stage, \.regional-map-stage\)\s*\{[^}]*will-change:\s*auto/s);
    assert.match(
      css,
      /\.linewatch-shell\.mobile-performance-mode :is\(\.ttc-map-stage, \.regional-map-stage\) \.raster-map-plane\s*\{[^}]*backface-visibility:\s*visible;[^}]*transform:\s*none;/s,
    );
    assert.match(css, /\.raster-map-plane\s*\{[^}]*transform:\s*translateZ\(0\);[^}]*backface-visibility:\s*hidden/s);
  });

  it("sandwiches live overlays between raster artwork and keeps interaction planes on top", async () => {
    const [ttc, regional, css] = await Promise.all([
      readFile(`${frontendRoot}/src/components/InteractiveTtcMap.tsx`, "utf8"),
      readFile(`${frontendRoot}/src/components/InteractiveRegionalMap.tsx`, "utf8"),
      readFile(`${frontendRoot}/src/app/globals.css`, "utf8"),
    ]);

    const ttcBackground = ttc.indexOf('plane="background"');
    const ttcDynamic = ttc.indexOf("raster-map-dynamic-plane", ttcBackground);
    const ttcForeground = ttc.indexOf('plane="foreground"', ttcDynamic);
    const ttcLabels = ttc.indexOf('plane="labels"', ttcForeground);
    assert.ok(ttcBackground > -1 && ttcDynamic > ttcBackground && ttcForeground > ttcDynamic && ttcLabels > ttcForeground);

    const regionalBackground = regional.indexOf('plane="background"');
    const regionalDynamic = regional.indexOf("<RegionalSvgMarkup", regionalBackground);
    const regionalForeground = regional.indexOf('plane="foreground"', regionalDynamic);
    const regionalLabels = regional.indexOf('plane="labels"', regionalForeground);
    assert.ok(regionalBackground > -1 && regionalDynamic > regionalBackground && regionalForeground > regionalDynamic && regionalLabels > regionalForeground);
    assert.match(ttc, /raster-map-top-plane[\s\S]*raster-map-interaction-plane/);
    assert.match(regional, /data-raster-map-ready=\{rasterMapReady/);
    assert.match(css, /\.raster-map-plane--background \{ z-index: 0; \}/);
    assert.match(css, /\.raster-map-interaction-plane \{ z-index: 4; \}/);
    assert.match(css, /data-raster-map-ready="true"[\s\S]*\.ttc-authored-svg-source/);
  });

  it("preserves authored label weights and theme-aware interchange leaders", async () => {
    const [generator, ttc, regional, css] = await Promise.all([
      readFile(`${frontendRoot}/scripts/generate-map-rasters.mjs`, "utf8"),
      readFile(`${frontendRoot}/src/components/InteractiveTtcMap.tsx`, "utf8"),
      readFile(`${frontendRoot}/src/components/InteractiveRegionalMap.tsx`, "utf8"),
      readFile(`${frontendRoot}/src/app/globals.css`, "utf8"),
    ]);

    const ttcLabelsCss = generator.match(/id: "ttc"[\s\S]*?labelsCss: `([\s\S]*?)`,\n    darkCss:/)?.[1] ?? "";
    const regionalLabelsCss = generator.match(/id: "regional"[\s\S]*?labelsCss: `([\s\S]*?)`,\n    darkCss:/)?.[1] ?? "";
    assert.doesNotMatch(ttcLabelsCss, /font-weight:\s*700/);
    assert.doesNotMatch(regionalLabelsCss, /font-weight:\s*700/);
    assert.doesNotMatch(regionalLabelsCss, /stroke-width:\s*2px !important/);
    assert.doesNotMatch(generator, /mobileForegroundCss/);
    assert.match(generator, /map\.id === "regional" && plane === "labels" && theme !== "light"[\s\S]*?source\.replaceAll\("stroke:#000000", "stroke:#ffffff"\)/);
    assert.match(generator, /#polygon771-7,[\s\S]*?#polygon771-7-4-1-5 \{ fill: #f1f5f9 !important; \}/);
    assert.match(ttc, /className="raster-station-label-text-hover"/);
    assert.match(ttc, /scale\(1\.045\)/);
    assert.match(
      ttc,
      /cutoutElementHref=\{hoveredStationLabelId[\s\S]*?`#station-label-\$\{hoveredStationLabelId\}`[\s\S]*?: null\}/,
    );
    assert.match(ttc, /rasterMapSource\("ttc", "labels", rasterTheme, rasterDensity\)/);
    assert.match(ttc, /mask="url\(#ttc-hovered-station-label-mask\)"/);
    assert.match(
      await readFile(`${frontendRoot}/src/components/RasterMapPlane.tsx`, "utf8"),
      /<feMorphology[\s\S]*?result="expandedAlpha"/,
    );
    assert.match(ttc, /clipPath="url\(#ttc-hovered-station-label-clip\)"/);
    assert.match(ttc, /filter="url\(#ttc-hovered-label-white-alpha\)"/);
    assert.match(generator, /labelsRenderedSize: \{ width: 17036\.959, height: 9031\.6719 \}/);
    assert.match(regional, /rasterMapSource\("regional", "labels", rasterTheme, rasterDensity\)/);
    assert.match(regional, /mask="url\(#regional-hovered-station-label-mask\)"/);
    assert.match(regional, /clipPath="url\(#regional-hovered-station-label-clip\)"/);
    assert.match(regional, /filter="url\(#regional-hovered-label-white-alpha\)"/);
    assert.match(regional, /removeDescendantIds\(isolatedCutoutSource\)/);
    assert.match(regional, /cutoutMarkup: isolatedCutoutSource\.outerHTML/);
    assert.doesNotMatch(regional, /regional-raster-station-label-live-copy/);
    assert.match(regional, /labelSource\.classList\.add\("regional-station-label-source"\)/);
    assert.match(regional, /labelCutoutSources\.id = "regional-station-label-cutout-sources"/);
    assert.match(regional, /cutoutSource\.id = `regional-station-label-cutout-source-\$\{stationId\}`/);
    assert.doesNotMatch(regional, /cutoutMarkup: `<rect x=/);
    assert.match(
      regional,
      /cutoutMarkup=\{hoveredStationLabel\?\.cutoutMarkup \?\? null\}/,
    );
    assert.doesNotMatch(regional, /regional-raster-label-halo/);
    assert.match(css, /data-raster-map-ready="true"[^}]*\.regional-station-label-source[^}]*opacity:\s*0/s);
    assert.match(css, /data-raster-map-ready="true"[^}]*#regional-station-labels-layer[^}]*opacity:\s*0/s);
    assert.doesNotMatch(css, /\.regional-raster-station-label-live-copy/);
    assert.doesNotMatch(
      css,
      /data-raster-map-ready="true"[^}]*#regional-station-labels-layer \[data-regional-station-label-for\][^}]*visibility:\s*hidden/s,
    );
    assert.doesNotMatch(css, /\.ttc-authored-svg-source \.station-label-hover-effect-active[\s\S]*visibility:\s*visible/);
    assert.match(css, /\.raster-station-label-text-hover\s*\{[^}]*filter:\s*drop-shadow/s);
  });
});
