#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";

export const DEFAULT_OG_OUTPUT_PATH = "public/assets/linewatch/og-image.png";
export const VALID_OG_STYLES = ["glass", "blur"];

export function parseOgCliArgs(argv, defaults = {}) {
  const options = {
    input: process.env.LINEWATCH_OG_SOURCE_IMAGE ?? defaults.input ?? null,
    output: process.env.LINEWATCH_OG_OUTPUT_IMAGE ?? defaults.output ?? null,
    style: process.env.LINEWATCH_OG_STYLE ?? defaults.defaultStyle ?? "glass",
    width: 2560,
    height: 1440,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--input" || arg === "-i") {
      options.input = argv[++i];
    } else if (arg.startsWith("--input=")) {
      options.input = arg.slice("--input=".length);
    } else if (arg === "--output" || arg === "-o") {
      options.output = argv[++i];
    } else if (arg.startsWith("--output=")) {
      options.output = arg.slice("--output=".length);
    } else if (arg === "--style" || arg === "-s") {
      options.style = argv[++i];
    } else if (arg.startsWith("--style=")) {
      options.style = arg.slice("--style=".length);
    } else if (arg === "--width") {
      options.width = Number.parseInt(argv[++i], 10);
    } else if (arg.startsWith("--width=")) {
      options.width = Number.parseInt(arg.slice("--width=".length), 10);
    } else if (arg === "--height") {
      options.height = Number.parseInt(argv[++i], 10);
    } else if (arg.startsWith("--height=")) {
      options.height = Number.parseInt(arg.slice("--height=".length), 10);
    }
  }

  return options;
}

export function buildOgHtml({ sourceBase64, style = "glass", width = 2560, height = 1440 }) {
  if (style === "blur") {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  body {
    width: ${width}px;
    height: ${height}px;
    overflow: hidden;
    background: #0d0808;
    position: relative;
  }
  .blur-container {
    width: ${width + 80}px;
    height: ${height + 80}px;
    margin-left: -40px;
    margin-top: -40px;
    background-image: url('data:image/png;base64,${sourceBase64}');
    background-size: ${width}px ${height}px;
    background-position: 40px 40px;
    background-repeat: no-repeat;
    filter: blur(1.5px);
  }
  .haze-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(255, 255, 255, 0.25);
    pointer-events: none;
  }
</style>
</head>
<body>
  <div class="blur-container"></div>
  <div class="haze-overlay"></div>
</body>
</html>`;
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  body {
    width: ${width}px;
    height: ${height}px;
    overflow: hidden;
    background: #090d16;
    position: relative;
  }
  .blur-container {
    position: absolute;
    top: -60px;
    left: -60px;
    width: ${width + 120}px;
    height: ${height + 120}px;
    background-image: url('data:image/png;base64,${sourceBase64}');
    background-size: ${width}px ${height}px;
    background-position: 60px 60px;
    background-repeat: no-repeat;
    filter: blur(6px) saturate(145%) contrast(92%) brightness(88%);
  }
  .tint-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(9, 13, 22, 0.62);
    pointer-events: none;
  }
  .sheen-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.01) 40%, rgba(0, 0, 0, 0.15) 100%);
    pointer-events: none;
  }
</style>
</head>
<body>
  <div class="blur-container"></div>
  <div class="tint-overlay"></div>
  <div class="sheen-overlay"></div>

  <svg xmlns="http://www.w3.org/2000/svg" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; opacity: 0.08;">
    <filter id="glass-noise">
      <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="4" stitchTiles="stitch"/>
    </filter>
    <rect width="100%" height="100%" filter="url(#glass-noise)" />
  </svg>
</body>
</html>`;
}

export function printOgUsage() {
  console.log(`LineWatchTO OpenGraph / Social Preview Image Generator

Usage:
  node frontend/scripts/generate-og-image.mjs [options]
  node frontend/generate_og_glass.js [options]
  node frontend/generate_og_blur.js [options]

Options:
  --input, -i <path>     Path to the source screenshot (or LINEWATCH_OG_SOURCE_IMAGE)
  --output, -o <path>    Path for the output image (or LINEWATCH_OG_OUTPUT_IMAGE)
                         Default: frontend/public/assets/linewatch/og-image.png
  --style, -s <style>    Filter preset: "glass" (default) or "blur" (or LINEWATCH_OG_STYLE)
  --width <number>       Output viewport width in pixels (default: 2560)
  --height <number>      Output viewport height in pixels (default: 1440)
  --help, -h             Show this help message

Source Availability:
  Raw high-resolution UI captures are optional authoring inputs.
  Checked-in production assets are stored in frontend/public/assets/linewatch/og-image.png.
  A standard build does NOT require running this script or providing local screenshots.
`);
}

export async function runOgCli(argv, options = {}) {
  const parsed = parseOgCliArgs(argv, options);

  if (parsed.help) {
    printOgUsage();
    return 0;
  }

  if (!VALID_OG_STYLES.includes(parsed.style)) {
    console.error(`Error: Unknown style "${parsed.style}". Valid options are: ${VALID_OG_STYLES.join(", ")}`);
    return 1;
  }

  if (!parsed.input) {
    console.error(`Error: Missing required input image.
Provide a path via --input <path> or LINEWATCH_OG_SOURCE_IMAGE.

Run with --help for detailed usage.`);
    return 1;
  }

  const inputPath = resolve(process.cwd(), parsed.input);
  if (!existsSync(inputPath)) {
    console.error(`Error: Source image not found at "${inputPath}".
Provide a valid image path via --input <path> or LINEWATCH_OG_SOURCE_IMAGE.
Note: Raw screenshots are optional authoring assets. A standard build uses checked-in public assets.`);
    return 1;
  }

  const frontendRoot = resolve(import.meta.dirname, "..");
  const outputPath = parsed.output
    ? resolve(process.cwd(), parsed.output)
    : resolve(frontendRoot, DEFAULT_OG_OUTPUT_PATH);

  console.log(`Reading source dashboard image from: ${inputPath}`);
  const sourceBase64 = readFileSync(inputPath).toString("base64");

  console.log(`Generating HTML template with style "${parsed.style}" (${parsed.width}x${parsed.height})...`);
  const htmlContent = buildOgHtml({
    sourceBase64,
    style: parsed.style,
    width: parsed.width,
    height: parsed.height,
  });

  console.log("Launching headless browser via Playwright...");
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: parsed.width, height: parsed.height });
    await page.setContent(htmlContent);
    await page.waitForTimeout(1000);

    mkdirSync(dirname(outputPath), { recursive: true });
    console.log(`Saving generated OG image to: ${outputPath}...`);
    await page.screenshot({ path: outputPath, type: "png" });
    console.log("Done!");
    return 0;
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const exitCode = await runOgCli(process.argv.slice(2));
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}
