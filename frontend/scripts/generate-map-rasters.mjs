import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const frontendDirectory = resolve(scriptDirectory, "..");
const assetDirectory = join(frontendDirectory, "public", "assets", "linewatch");
const outputDirectory = join(assetDirectory, "raster-maps");

const maps = [
  {
    id: "ttc",
    source: join(assetDirectory, "ttc-subway-map-custom.svg"),
    renderedSize: { width: 4500, height: 2181.8 },
    widths: { mobile: 3000, desktop: 6750 },
    backgroundCss: `
      #ttc-station-labels-layer,
      #ttc-stations-layer,
      #ttc-line-badges-layer,
      #ttc-connection-labels-layer { opacity: 0 !important; }
      #non-linear-guides-layer { display: none !important; }
    `,
    foregroundCss: `
      #ttc-tracks-layer,
      #non-linear-guides-layer,
      #ttc-station-labels-layer text { opacity: 0 !important; }
      .fil3:has(+ .fil0),
      .fil3:has(+ .fil2),
      .fil3:has(+ .fil4),
      .fil3:has(+ .fil5),
      .fil3:has(+ .fil8) { display: none !important; }
    `,
    labelsCss: `
      #ttc-tracks-layer,
      #non-linear-guides-layer,
      #ttc-stations-layer,
      #ttc-line-badges-layer,
      #ttc-connection-labels-layer,
      #ttc-station-labels-layer polygon { opacity: 0 !important; }
      #ttc-station-labels-layer [data-station-label-for] {
        font-family: "TeX Gyre Heros", Arial, sans-serif !important;
        stroke: #000000 !important;
        stroke-width: 2px !important;
      }
    `,
    darkCss: `
      #ttc-station-labels-layer text,
      #ttc-station-labels-layer tspan,
      #ttc-station-labels-layer [data-station-label-for] {
        fill: #f1f5f9 !important;
        stroke: #ffffff !important;
      }
      #polygon771-7,
      #polygon771-7-4,
      #polygon771-7-4-1,
      #polygon771-7-4-1-5 { fill: #f1f5f9 !important; }
      .fil6,
      .fil1,
      [fill="black"],
      [fill="#000000"],
      [style*="fill:#000000"],
      [style*="fill:black"] { fill: #f1f5f9 !important; }
      #ttc-stations-layer [inkscape\\:label="inner-pill"],
      #ttc-stations-layer [fill="#000000"],
      #ttc-stations-layer [style*="fill:#000000"],
      #ttc-stations-layer [style*="fill:black"] { fill: #000000 !important; }
    `,
  },
  {
    id: "regional",
    source: join(assetDirectory, "regional-rail-map.svg"),
    renderedSize: { width: 4739.2821, height: 2616.8174 },
    labelsRenderedSize: { width: 17036.959, height: 9031.6719 },
    widths: { mobile: 3200, desktop: 7109 },
    backgroundCss: `
      #Layer_x0020_1 > * { opacity: 0 !important; }
      #regional-lines-layer { opacity: 1 !important; }
      #regional-lakes-layer { display: none !important; }
    `,
    foregroundCss: `
      #regional-lines-layer,
      #regional-lakes-layer,
      #regional-station-labels-layer { opacity: 0 !important; }
      #regional-route-labels-layer rect { stroke: none !important; }
    `,
    labelsCss: `
      #Layer_x0020_1 > * { opacity: 0 !important; }
      #regional-station-labels-layer { opacity: 1 !important; }
      #regional-station-labels-layer text,
      #regional-station-labels-layer tspan {
        font-family: "TeX Gyre Heros", Arial, sans-serif !important;
      }
    `,
    darkCss: `
      #regional-station-labels-layer text,
      #regional-station-labels-layer tspan { fill: #f8fafc !important; }
      #regional-route-lw-div { stroke: #0d0808 !important; }
      #g6 text,
      #g6 tspan { fill: #f8fafc !important; }
    `,
    highContrastCss: `
      #regional-route-lw-div { stroke: #000000 !important; }
    `,
  },
];

const themes = ["light", "dark", "high-contrast"];

function withRasterStyle(source, css, renderedSize) {
  const normalizedPage = source
    .replace(/\bwidth="[^"]*"/, `width="${renderedSize.width}"`)
    .replace(/\bheight="[^"]*"/, `height="${renderedSize.height}"`);
  const style = `<style id="linewatch-raster-export-style"><![CDATA[${css}]]></style>`;
  const closingDefs = normalizedPage.indexOf("</defs>");
  if (closingDefs < 0) throw new Error("SVG source is missing its definitions element");
  return `${normalizedPage.slice(0, closingDefs)}${style}${normalizedPage.slice(closingDefs)}`;
}

async function exportPng(sourcePath, outputPath, width) {
  await execFileAsync("inkscape", [
    sourcePath,
    "--export-type=png",
    `--export-width=${width}`,
    "--export-background-opacity=0",
    `--export-filename=${outputPath}`,
  ]);
}

async function main() {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "linewatch-map-rasters-"));
  try {
    await mkdir(outputDirectory, { recursive: true });
    for (const map of maps) {
      const source = await readFile(map.source, "utf8");
      const planes = map.labelsCss ? ["background", "foreground", "labels"] : ["background", "foreground"];
      for (const plane of planes) {
        for (const theme of themes) {
          const themeCss = theme === "light"
            ? ""
            : `${map.darkCss}${theme === "high-contrast" ? map.highContrastCss ?? "" : ""}`;
          const renderedSize = plane === "labels" && map.labelsRenderedSize
            ? map.labelsRenderedSize
            : map.renderedSize;
          // The SVG rasterizer does not consistently apply substring attribute
          // selectors to inline presentation styles. Change only authored black
          // strokes in the isolated regional label plane so regular 5px outlines
          // become white on dark canvases while bold no-stroke labels stay intact.
          const themedSource = map.id === "regional" && plane === "labels" && theme !== "light"
            ? source.replaceAll("stroke:#000000", "stroke:#ffffff")
            : source;
          for (const [density, width] of Object.entries(map.widths)) {
            const planeCss = plane === "background"
              ? map.backgroundCss
              : plane === "labels"
                ? map.labelsCss
                : map.foregroundCss;
            const stagedSvg = join(temporaryDirectory, `${map.id}-${plane}-${theme}-${density}.svg`);
            await writeFile(stagedSvg, withRasterStyle(themedSource, `${planeCss}${themeCss}`, renderedSize));
            const filename = `${map.id}-${plane}-${theme}-${density}.png`;
            const stagedPng = join(temporaryDirectory, filename);
            await exportPng(stagedSvg, stagedPng, width);
            await copyFile(stagedPng, join(outputDirectory, filename));
            process.stdout.write(`generated ${basename(filename)}\n`);
          }
        }
      }
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

await main();
