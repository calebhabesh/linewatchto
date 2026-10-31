import { expect, test } from "@playwright/test";
import { installDismissedTransientUi, setStubMode, waitForNetworkTransition } from "./test-support";

test.use({ serviceWorkers: "block" });

test("general regional labels use full line names in cards and details", async ({ page, request, isMobile }) => {
  await page.setViewportSize(isMobile ? { width: 360, height: 800 } : { width: 1440, height: 900 });
  await installDismissedTransientUi(page, "2026-06-04T16:00:00Z");
  await setStubMode(request, "regional-live");
  await page.route("**/api/dashboard?network=regional", async route => {
    const response = await route.fetch();
    const data = await response.json();
    data.activeAlerts = [{
      ...data.activeAlerts[0], id: "barrie-general-closure", lineId: "regional-br", lineNumber: "BR",
      title: "Barrie service suspension", location: "BR corridor", affectedSegmentIds: [],
    }];
    data.delays = [];
    data.plannedClosures = [];
    data.reducedSpeedZones = [];
    data.map.stationNodeImpacts = [];
    data.map.segments = data.map.segments.map((segment: Record<string, unknown>) => ({ ...segment, impacts: [] }));
    await route.fulfill({ json: data });
  });
  await page.goto("/");
  const switcher = isMobile
    ? page.locator(".mobile-map-network-switch")
    : page.getByRole("group", { name: "Select transit network" });
  await switcher.getByRole("button", { name: "GO/UP", exact: true }).click();
  await waitForNetworkTransition(page, "regional");
  if (isMobile) await page.locator(".mobile-service-sheet-handle").press("End");
  const row = page.locator(isMobile
    ? '.current-service-impact[data-impact-kind="suspension"]'
    : '.desktop-status-incident-row[data-impact-kind="suspension"]');
  await expect(row).toContainText("Barrie Line");
  await expect(row).not.toContainText(/Corridor|Allandale/);
  await row.click();
  const card = page.locator('.alert-card.is-active');
  await expect(card).toContainText("Barrie Line");
  await expect(card).not.toContainText(/BR Corridor|Allandale Waterfront/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("regional-line-label.png") });
});

test("regional station alerts keep severity fills and require explicit direction", async ({ page, request, isMobile }) => {
  const attachScreenshot = async (name: string) => {
    const path = test.info().outputPath(`${name}.png`);
    await page.screenshot({ path });
    await test.info().attach(name, { path, contentType: "image/png" });
  };
  await page.setViewportSize(isMobile ? { width: 360, height: 800 } : { width: 1440, height: 900 });
  await installDismissedTransientUi(page, "2026-06-04T16:00:00Z");
  await setStubMode(request, "regional-live");
  await page.route("**/api/dashboard?network=regional", async route => {
    const response = await route.fetch();
    const data = await response.json();
    const closure = {
      ...data.activeAlerts[0], id: "bloor-up-closure", lineId: "regional-up", lineNumber: "UP",
      title: "No service at Bloor UP", location: "Bloor", severity: "suspension",
      affectedSegmentIds: [], displayDirection: null, cause: "UNKNOWN_CAUSE",
    };
    const delay = {
      ...data.delays[0], id: "bloor-ki-delay", lineId: "regional-ki", lineNumber: "KI",
      title: "Delay at Bloor GO", location: "Bloor", affectedSegmentIds: [],
      displayDirection: "Westbound", cause: "Construction",
    };
    data.activeAlerts = [closure];
    data.delays = [delay];
    data.plannedClosures = [];
    data.reducedSpeedZones = [];
    data.map.stationNodeImpacts = [
      { stationId: "bloor", kind: "suspension", cardId: closure.id, title: closure.title },
      { stationId: "bloor", kind: "delay", cardId: delay.id, title: delay.title },
    ];
    data.map.segments = data.map.segments.map((segment: { impacts: unknown[] }) => ({ ...segment, impacts: [] }));
    await route.fulfill({ response, json: data });
  });
  await page.goto("/");
  const switcher = isMobile
    ? page.locator(".mobile-map-network-switch")
    : page.getByRole("group", { name: "Select transit network" });
  await switcher.getByRole("button", { name: "GO/UP", exact: true }).click();
  await waitForNetworkTransition(page, "regional");
  await expect(page.locator("[data-system-map=regional] .map-stage")).toHaveAttribute("data-raster-map-ready", "true");

  // The shared station-alert layer (TTC's design): each alert sits on its own
  // line's platform at Bloor, with TTC's colours.
  const alertAnchor = (id: string) => page.locator(
    `[data-system-map=regional] .map-station-alert[data-map-impact-id="${id}"] .map-station-alert-anchor`,
  );
  await expect(page.locator("[data-system-map=regional] .map-station-alert")).toHaveCount(2);
  await expect(alertAnchor("bloor-up-closure")).toHaveAttribute("data-map-station-anchor-id", "station-bloor-up");
  await expect(alertAnchor("bloor-ki-delay")).toHaveAttribute("data-map-station-anchor-id", "station-bloor-ki");
  const closureCore = alertAnchor("bloor-up-closure").locator(".station-impact-dot-red-glow");
  const delayCore = alertAnchor("bloor-ki-delay").locator(".station-impact-dot-red-glow");
  await expect(closureCore).toHaveCSS("fill", "rgb(255, 59, 48)");
  await expect(delayCore).toHaveCSS("fill", "rgb(245, 158, 11)");
  await expect(alertAnchor("bloor-up-closure").locator(".station-impact-dot-red-beacon")).toHaveCount(1);
  await expect(alertAnchor("bloor-up-closure").locator(".station-impact-ring")).toHaveCSS("stroke", "rgb(250, 204, 21)");
  // Drawn in the top plane, above the raster station artwork.
  expect(await closureCore.evaluate(element => {
    const foreground = element.closest("svg")!;
    const artwork = element.closest("[data-system-map=regional] .map-stage")!
      .querySelector(".raster-map-plane--foreground")!;
    return Number(getComputedStyle(foreground).zIndex) > Number(getComputedStyle(artwork).zIndex);
  })).toBe(true);
  const glyph = page.locator("[data-system-map=regional] .station-impact-direction-glyph");
  await expect(glyph).toHaveCount(1);
  await expect(glyph).toHaveAttribute("data-map-station-anchor-id", "station-bloor-ki");

  // The core sits inside its dot and the ring just outside it, as on TTC.
  const dot = page.locator("#station-bloor-up");
  const dotBox = await dot.boundingBox();
  const coreBox = await closureCore.boundingBox();
  const ringBox = await alertAnchor("bloor-up-closure").locator(".station-impact-ring").boundingBox();
  expect(dotBox).not.toBeNull();
  expect(coreBox).not.toBeNull();
  expect(ringBox).not.toBeNull();
  // Bloor's group is rotated, so its box is wider than the dot; use the
  // dot's own radius on screen.
  const dotDiameter = await dot.evaluate((element) => {
    const ellipse = element as SVGEllipseElement;
    const matrix = ellipse.getScreenCTM()!;
    return 2 * ellipse.rx.baseVal.value * Math.hypot(matrix.a, matrix.b);
  });
  expect(coreBox!.width).toBeLessThan(dotDiameter);
  expect(ringBox!.width).toBeGreaterThan(dotDiameter);
  expect(Math.abs(coreBox!.x + coreBox!.width / 2 - dotBox!.x - dotBox!.width / 2)).toBeLessThan(2);
  expect(Math.abs(coreBox!.y + coreBox!.height / 2 - dotBox!.y - dotBox!.height / 2)).toBeLessThan(2);

  // Alert overlays never animate (map-renderer-parity.md, rule 3).
  for (const core of [closureCore, delayCore]) {
    expect(await core.evaluate(element => element.getAnimations().length)).toBe(0);
  }

  const map = page.locator("[data-system-map=regional]");
  await map.evaluate(element => element.setAttribute("data-map-gesture-active", "true"));
  await expect(closureCore).toBeVisible();
  await map.evaluate(element => element.removeAttribute("data-map-gesture-active"));

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(closureCore).toHaveCSS("animation-name", "none");
  await expect(delayCore).toHaveCSS("animation-name", "none");
  await attachScreenshot("regional-station-alerts-dark");
  const themeToggle = isMobile
    ? page.getByRole("button", { name: "Switch to light theme", exact: true })
    : page.getByRole("button", { name: "Toggle theme", exact: true }).filter({ visible: true }).first();
  await themeToggle.click();
  await expect(page.locator(".linewatch-shell")).not.toHaveClass(/\bdark\b/);
  await expect(page.locator("[data-system-map=regional] .map-stage")).toHaveAttribute("data-raster-map-ready", "true");
  await expect(closureCore).toHaveCSS("fill", "rgb(255, 59, 48)");
  await expect(delayCore).toHaveCSS("fill", "rgb(245, 158, 11)");
  await attachScreenshot("regional-station-alerts-light");
  await expect(page.getByText(/UNKNOWN_CAUSE|Unknown Cause/i)).toHaveCount(0);
  if (isMobile) await page.locator(".mobile-service-sheet-handle").press("End");
  await expect(page.getByText("Cause: Construction", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/UNKNOWN_CAUSE|Unknown Cause/i)).toHaveCount(0);

  await attachScreenshot("regional-alert-causes");
  const closureCard = page.locator(isMobile
    ? '.current-service-impact[data-impact-kind="suspension"]'
    : '.desktop-status-incident-row[data-impact-kind="suspension"]');
  await closureCard.click();
  await expect(alertAnchor("bloor-up-closure").locator(".station-impact-ring")).toHaveClass(/\bselected\b/);
  await expect(page.locator('[data-system-map=regional] [data-station-impact-selection-id="bloor-up-closure"]')).toBeAttached();
  await expect(map).not.toHaveAttribute("data-map-camera-moving", "true");
  await expect(page.getByText(/UNKNOWN_CAUSE|Unknown Cause/i)).toHaveCount(0);
  await attachScreenshot("regional-station-alert-focused");
});
