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
  await expect(page.locator(".regional-map-stage")).toHaveAttribute("data-raster-map-ready", "true");

  const fills = page.locator(".regional-station-impact-fill");
  const closureFill = page.locator('.regional-station-impact-fill[data-regional-station-impact-id="bloor-up-closure"]');
  const delayFill = page.locator('.regional-station-impact-fill[data-regional-station-impact-id="bloor-ki-delay"]');
  await expect(fills).toHaveCount(2);
  await expect(closureFill).toHaveAttribute("data-regional-station-impact-anchor-id", "station-bloor-up");
  await expect(delayFill).toHaveAttribute("data-regional-station-impact-anchor-id", "station-bloor-ki");
  await expect(closureFill).toHaveCSS("fill", "rgb(239, 68, 68)");
  await expect(delayFill).toHaveCSS("fill", "rgb(249, 115, 22)");
  expect(await closureFill.evaluate(element => {
    const foreground = element.closest("svg")!;
    const artwork = element.closest(".regional-map-stage")!
      .querySelector(".raster-map-plane--foreground")!;
    return Number(getComputedStyle(foreground).zIndex) > Number(getComputedStyle(artwork).zIndex);
  })).toBe(true);
  await expect(page.locator(".regional-station-impact-direction-glyph")).toHaveCount(1);
  await expect(page.locator(".regional-station-impact-direction-glyph"))
    .toHaveAttribute("data-regional-station-impact-anchor-id", "station-bloor-ki");
  await expect(page.locator('.regional-station-impact-ring[data-regional-impact-id="bloor-up-closure"] :is(circle, ellipse)')).toHaveCount(1);

  // The fill covers the full authored interior and preserves its outline.
  const dot = page.locator("#station-bloor-up");
  const dotBox = await dot.boundingBox();
  const fillBox = await closureFill.boundingBox();
  expect(dotBox).not.toBeNull();
  expect(fillBox).not.toBeNull();
  expect(fillBox!.width).toBeCloseTo(dotBox!.width, 1);
  expect(fillBox!.height).toBeCloseTo(dotBox!.height, 1);
  expect(await closureFill.evaluate(element => getComputedStyle(element).stroke))
    .toBe(await dot.evaluate(element => getComputedStyle(element).stroke));
  expect(await closureFill.evaluate(element => getComputedStyle(element).strokeWidth))
    .toBe(await dot.evaluate(element => getComputedStyle(element).strokeWidth));
  expect(Math.abs(fillBox!.x + fillBox!.width / 2 - dotBox!.x - dotBox!.width / 2)).toBeLessThan(2);
  expect(Math.abs(fillBox!.y + fillBox!.height / 2 - dotBox!.y - dotBox!.height / 2)).toBeLessThan(2);

  if (!isMobile) {
    const pulse = await closureFill.evaluateHandle(element => {
      const animation = element.getAnimations()[0];
      if (!animation) throw new Error("Expected an active station fill pulse");
      animation.currentTime = 1200;
      return { element, animation };
    });
    for (const name of ["Zoom in", "Zoom out"]) {
      await page.getByRole("button", { name, exact: true }).click();
      await expect(page.locator(".regional-map")).not.toHaveAttribute("data-regional-map-camera-moving", "true");
      expect(await pulse.evaluate(({ element, animation }) => element.getAnimations()[0] === animation),
        `${name} must preserve the fill animation rather than restart it`).toBe(true);
    }
    await pulse.dispose();
  }

  // Animation must never fade the affected dot back to an unmarked state.
  const pulseSamples = await closureFill.evaluate(element => {
    const animation = element.getAnimations()[0];
    if (!animation) return null; // Performance budgets can keep the fill static.
    animation.pause();
    const duration = Number(animation.effect!.getTiming().duration);
    const samples = [0, 0.25, 0.5, 0.75, 1].map(fraction => {
      animation.currentTime = duration * fraction;
      return Number(getComputedStyle(element).fillOpacity);
    });
    animation.play();
    return samples;
  });
  if (pulseSamples) {
    expect(Math.min(...pulseSamples)).toBeGreaterThanOrEqual(0.6);
    expect(Math.max(...pulseSamples)).toBeGreaterThan(Math.min(...pulseSamples));
  }

  const map = page.locator(".regional-map");
  await map.evaluate(element => element.setAttribute("data-map-gesture-active", "true"));
  await expect(closureFill).toBeVisible();
  if (!isMobile) await expect(closureFill).toHaveCSS("animation-play-state", "paused");
  await map.evaluate(element => element.removeAttribute("data-map-gesture-active"));

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(closureFill).toHaveCSS("animation-name", "none");
  await expect(closureFill).toHaveCSS("fill-opacity", "1");
  await expect(delayFill).toHaveCSS("animation-name", "none");
  await attachScreenshot("regional-station-alerts-dark");
  const themeToggle = isMobile
    ? page.getByRole("button", { name: "Switch to light theme", exact: true })
    : page.getByRole("button", { name: "Toggle theme", exact: true }).filter({ visible: true }).first();
  await themeToggle.click();
  await expect(page.locator(".linewatch-shell")).not.toHaveClass(/\bdark\b/);
  await expect(page.locator(".regional-map-stage")).toHaveAttribute("data-raster-map-ready", "true");
  await expect(closureFill).toHaveCSS("fill", "rgb(239, 68, 68)");
  await expect(delayFill).toHaveCSS("fill", "rgb(249, 115, 22)");
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
  const closureRing = page.locator('.regional-station-impact-ring[data-regional-impact-id="bloor-up-closure"]');
  await expect(closureRing).toHaveAttribute("data-regional-impact-selected", "true");
  await expect(map).not.toHaveAttribute("data-regional-map-camera-moving", "true");
  await expect(page.getByText(/UNKNOWN_CAUSE|Unknown Cause/i)).toHaveCount(0);
  await attachScreenshot("regional-station-alert-focused");
});
