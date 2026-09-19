import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const assetDir = process.env.LINEWATCH_ONBOARDING_OUTPUT ?? "/tmp/linewatch-onboarding-captures";
const captureTime = "2026-06-04T13:00:00.000Z";

async function prepare(page: Page) {
  await page.clock.setFixedTime(captureTime);
  await page.addInitScript(() => {
    const preferences: Record<string, string> = {
      "linewatch-welcome-seen-v1": "true",
      "linewatch-unofficial-notice-ack-v1": "true",
      "linewatch-pwa-install-dismissed-at-v1": String(Date.now()),
      "linewatch-seen-release-notes-version": "1.1.0",
      "linewatch-reduced-motion-enabled-v1": "true",
      "linewatch-dot-background-enabled-v1": "false",
      "linewatch-estimated-trains-enabled-v1": "false",
      "linewatch-theme-v1": "dark",
      "linewatch-high-contrast-enabled-v1": "false",
      "linewatch-default-network-v1": "ttc",
    };
    for (const [key, value] of Object.entries(preferences)) localStorage.setItem(key, value);
  });
  await page.context().addCookies([{
    name: "linewatch-visual-preferences-v1",
    value: encodeURIComponent(JSON.stringify({ theme: "dark", highContrast: false, reducedMotion: true,
      estimatedTrainsEnabled: false, dotBackgroundEnabled: false, defaultNetwork: "ttc" })),
    domain: "127.0.0.1", path: "/",
  }]);
  await page.goto(`/?previewTime=${encodeURIComponent(captureTime)}`);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".ttc-map-stage")).toHaveAttribute("data-raster-map-ready", "true");
  await page.addStyleTag({ content: `
    *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
    nextjs-portal { display: none !important; }
  ` });
}

async function capture(page: Page, name: string, target?: Locator, ratio?: number) {
  await mkdir(assetDir, { recursive: true });
  await page.mouse.move(0, 0);
  // Wait for the actual map camera and two browser frames, not network-idle
  // (the dashboard deliberately polls in the background).
  await expect(page.locator("[data-map-pan-zoom-viewport]")).toHaveAttribute("data-map-camera-moving", "false");
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const box = target ? await target.boundingBox() : { x: 0, y: 0, ...page.viewportSize()! };
  expect(box).not.toBeNull();
  const clip = { ...box! };
  if (ratio) clip.height = clip.width / ratio;
  if (name === "desktop-map-guide") Object.assign(clip, { x: 440, y: 205, width: 680, height: 382.5 });
  if (name === "mobile-map-guide") {
    clip.x = 64;
    clip.y += 30;
    clip.width = page.viewportSize()!.width - 76;
    clip.height = clip.width * 3 / 4;
  }
  expect(clip.x).toBeGreaterThanOrEqual(0);
  expect(clip.x + clip.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(clip.y + clip.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  const png = await page.screenshot({ path: path.join(assetDir, `${name}.png`), clip, animations: "disabled" });
  // Catch silently clipped captures (a transformed SVG stage can extend outside
  // the viewport). Validate the encoded PNG, not just the requested clip.
  expect(Math.abs(png.readUInt32BE(16) / png.readUInt32BE(20) - clip.width / clip.height)).toBeLessThan(0.01);
}

for (const feature of ["map-guide", "impact-details", "my-commutes", "my-stations"] as const) {
  test(feature, async ({ page, request, isMobile }, testInfo) => {
    await request.post("http://127.0.0.1:4194/__test/mode", { data: { mode: "seeded" } });
    if (feature === "my-commutes" || feature === "my-stations") {
      await request.post("http://127.0.0.1:4194/api/auth/demo");
      await request.put("http://127.0.0.1:4194/api/account/stations/stub-station");
    }
    if (isMobile && feature.startsWith("my-")) await page.setViewportSize({ width: 640, height: 1100 });
    if (!isMobile && feature.startsWith("my-")) await page.setViewportSize({ width: 1440, height: 1200 });
    await prepare(page);
    const name = `${testInfo.project.name}-${feature}${feature.startsWith("my-") ? "-v3" : ""}`;
    if (feature === "map-guide") {
      await capture(page, name, page.locator(".ttc-map-stage"), isMobile ? 4 / 3 : 16 / 9);
    } else if (feature === "impact-details") {
      await page.getByRole("button", { name: "reduced-speed-zone: Eglinton to Davisville", exact: true }).dispatchEvent("click");
      await expect(page.getByText("Track issue").first()).toBeVisible();
      await capture(page, name, isMobile ? page.locator(".mobile-impact-inspector") : undefined, isMobile ? 4 / 3 : 16 / 9);
    } else {
      if (isMobile) {
        await page.getByRole("button", { name: "More", exact: true }).click();
        await page.getByRole("button", { name: feature === "my-commutes" ? "My Commutes" : "My Stations" }).click();
      } else {
        await page.getByRole("button", { name: "Toggle menu" }).click();
        await page.getByRole("menuitem", { name: feature === "my-commutes" ? "My Commutes" : "My Stations" }).click();
      }
      const panel = feature === "my-commutes" ? page.locator(".commute-panel").last() : page.getByRole("region", { name: "My Stations" });
      await expect(panel).toBeVisible();
      await expect(panel.getByText(feature === "my-commutes" ? "Morning Commute" : "Eglinton", { exact: true }).first()).toBeVisible();
      await capture(page, name, (isMobile || feature === "my-stations") ? panel.locator(feature === "my-commutes" ? ".commute-card" : ".saved-station-rich-row").first() : panel, isMobile ? 4 / 3 : 300 / 290);
    }
  });
}
