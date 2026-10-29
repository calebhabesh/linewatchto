#!/usr/bin/env node
// Capture the README screenshots from the public application, following docs/assets/README.md.
import { mkdir, mkdtemp, copyFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const frontend = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};

if (args.includes("--help")) {
  console.log(`Capture the README screenshots from the public LineWatchTO application.

node frontend/scripts/capture-readme-screenshots.mjs [--origin URL] [--out DIR] [--allow-stale]

  --origin       Application to capture (default https://linewatchto.ca).
  --out          Destination folder (default docs/assets).
  --allow-stale  Write images even when a source is not live; caption them yourself.

Desktop views use a full-screen browser tab (1920x1080), the phone view 412x915, both at 2x,
dark mode, reduced motion, the real clock, and a new signed-out context. Images are written
only when every capture succeeds and each network's dashboard reports a live source.
Review every image before committing; see docs/assets/README.md.`);
  process.exit(0);
}

const origin = option("origin", "https://linewatchto.ca").replace(/\/$/, "");
const outDir = path.resolve(option("out", path.join(frontend, "../docs/assets")));
const allowStale = args.includes("--allow-stale");
const DESKTOP = { width: 1920, height: 1080 };
// A stale "seen" version opens What's New over the map, so mark the live one as seen.
const releaseVersion = (await (await fetch(`${origin}/version.json`)).json()).releaseNote?.version ?? "";
const PHONE = { width: 412, height: 915 };

async function openDashboard(browser, network, viewport, isMobile = false) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    isMobile,
    hasTouch: isMobile,
    colorScheme: "dark",
    reducedMotion: "reduce",
  });
  await context.addCookies([{
    name: "linewatch-visual-preferences-v1",
    value: encodeURIComponent(JSON.stringify({ theme: "dark", reducedMotion: true, defaultNetwork: network })),
    url: origin,
  }]);
  await context.addInitScript(({ net, seen }) => {
    for (const [key, value] of [
      ["linewatch-welcome-seen-v1", "true"],
      ["linewatch-unofficial-notice-ack-v1", "true"],
      ["linewatch-pwa-install-dismissed-at-v1", String(Date.now())],
      ["linewatch-default-network-v1", net],
      ["linewatch-map-view-v1", "diagram"],
      ["linewatch-seen-release-notes-version", seen],
    ]) localStorage.setItem(key, value);
  }, { net: network, seen: releaseVersion });

  const page = await context.newPage();
  const dashboard = page.waitForResponse((response) => (
    response.url().includes("/api/dashboard") && response.url().includes(`network=${network}`) && response.ok()
  ), { timeout: 30_000 }).then((response) => response.json()).catch(() => null);
  await page.goto(`${origin}/?network=${network}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const stage = network === "ttc" ? ".ttc-map-stage" : ".regional-map-stage";
  await page.locator(`${stage}[data-raster-map-ready="true"]`).first().waitFor({ timeout: 30_000 });
  // Let the camera settle after its entrance and any layout re-fit.
  await page.waitForTimeout(2500);
  return { context, page, dashboard: await dashboard };
}

function sourceStatus(dashboard) {
  const generatedAt = dashboard?.status?.generatedAt ?? {};
  return {
    availability: dashboard?.availability ?? "unknown",
    live: generatedAt.live === true,
    time: generatedAt.time ?? null,
    date: generatedAt.date ?? null,
    lastPoll: generatedAt.lastPoll ?? null,
  };
}

const staging = await mkdtemp(path.join(tmpdir(), "linewatch-readme-"));
const captures = [];
const browser = await chromium.launch();
try {
  for (const network of ["ttc", "regional"]) {
    const { context, page, dashboard } = await openDashboard(browser, network, DESKTOP);
    const status = sourceStatus(dashboard);
    if (!status.live && !allowStale) throw new Error(`${network} source is not live (${status.availability}); nothing was written.`);
    const file = `${network === "ttc" ? "ttc" : "regional"}-desktop.png`;
    await page.screenshot({ path: path.join(staging, file) });
    captures.push({ network, file, viewport: `${DESKTOP.width}x${DESKTOP.height}`, pixelRatio: 2,
      framing: "Full viewport; default desktop frame", sourceStatus: status, capturedAt: new Date().toISOString() });

    if (network === "ttc") {
      await page.getByPlaceholder(/Search all stations/i).first().click();
      await page.getByPlaceholder(/Search all stations/i).first().fill("Union");
      await page.getByRole("button", { name: /^Union TTC station search result/ }).first().click();
      const panel = page.getByRole("complementary", { name: "Union station details" });
      await panel.waitFor({ timeout: 15_000 });
      await panel.getByRole("button", { name: /^(Trains|LRT)$/ }).first().click().catch(() => {});
      await page.waitForTimeout(1500);
      await page.locator("#desktop-sidebar-container").screenshot({ path: path.join(staging, "station-details.png") });
      captures.push({ network, file: "station-details.png", viewport: `${DESKTOP.width}x${DESKTOP.height}`, pixelRatio: 2,
        framing: "Union station panel / Train Arrivals section", sourceStatus: status, capturedAt: new Date().toISOString() });
    }
    await context.close();
  }

  const { context, page, dashboard } = await openDashboard(browser, "ttc", PHONE, true);
  await page.screenshot({ path: path.join(staging, "ttc-mobile.png") });
  captures.push({ network: "ttc", file: "ttc-mobile.png", viewport: `${PHONE.width}x${PHONE.height}`, pixelRatio: 2,
    framing: "Natural phone dashboard framing", sourceStatus: sourceStatus(dashboard), capturedAt: new Date().toISOString() });
  await context.close();
} finally {
  await browser.close();
}

await mkdir(outDir, { recursive: true });
for (const file of await readdir(staging)) await copyFile(path.join(staging, file), path.join(outDir, file));
await writeFile(path.join(outDir, "capture-provenance.json"), `${JSON.stringify({
  origin,
  authentication: "signed out",
  captures,
}, null, 2)}\n`);
await rm(staging, { recursive: true, force: true });
console.log(`Wrote ${captures.length} screenshots and capture-provenance.json to ${outDir}. Review each image before committing.`);
