import { expect, test } from "@playwright/test";
import { installDismissedTransientUi, setStubMode, stubUrl } from "./test-support";

test.use({ serviceWorkers: "block" });

for (const theme of ["light", "dark"] as const) {
  for (const mapView of ["diagram", "geographic"] as const) {
    test(`limited service links delay and planned details in ${theme} ${mapView}`, async ({ page, request, isMobile }) => {
      await setStubMode(request, "seeded");
      await installDismissedTransientUi(page, "2026-09-29T04:00:00Z");
      await page.setViewportSize({ width: isMobile ? 360 : 1440, height: 900 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.addInitScript(({ theme, mapView }) => {
        localStorage.setItem("linewatch-theme-v1", theme);
        localStorage.setItem("linewatch-map-view-v1", mapView);
        localStorage.setItem("linewatch-impact-list-view-v1", "cards");
      }, { theme, mapView });
      await page.route("**/api/dashboard?network=ttc", async (route) => {
        const response = await route.fetch();
        const payload = await response.json();
        const segment = payload.map.segments.find((item: { id: string }) => item.id === "stub-line-1-eglinton-davisville")
          ?? payload.map.segments.find((item: { lineId: string }) => item.lineId === "line-1");
        const details = {
          id: "limited-child", lineId: "line-1", lineNumber: "1", title: "Limited service between Eglinton and Davisville due to planned track work", location: "Eglinton to Davisville",
          description: "Synthetic fixture: there is limited subway service due to planned track work.",
          displayDirection: "Both directions", source: "Synthetic test fixture", cause: "Closure - Planned Track Work",
          serviceEffect: "limited-service", relatedPlannedClosureId: "limited-parent", affectedSegmentIds: [segment.id],
          activeWindowEnd: "2026-09-29T06:00:00Z", startedAt: "2026-09-29T03:00:00Z", updatedAt: "2026-09-29T04:00:00Z", shuttle: false,
        };
        payload.activeAlerts = [];
        payload.reducedSpeedZones = [];
        payload.delays = [details];
        payload.plannedClosures = [{
          ...details, id: "limited-parent", title: "Limited nightly service", relatedPlannedClosureId: undefined,
          previewSegmentIds: [segment.id], activeNow: true, timingStatus: "active-now", nightly: true,
          activeWindowStart: details.startedAt, activeWindowLabel: "Sep 28, 11 PM – Sep 29, 2 AM",
          window: "Sep 28 – Oct 1", windowDates: "Sep 28 – Oct 1", windowHours: "11 PM – 2 AM",
          nextWindowStart: "2026-09-30T03:00:00Z", nextWindowEnd: "2026-09-30T06:00:00Z",
        }];
        payload.map.segments = payload.map.segments.map((item: { id: string }) => ({
          ...item, overlay: item.id === segment.id ? "delay" : "clear", alertId: item.id === segment.id ? details.id : null,
          impacts: item.id === segment.id ? [{ kind: "delay", cardId: details.id, travelDirection: "bidirectional", sourceAlertIds: [details.id] }] : [],
        }));
        payload.map.stationNodeImpacts = [];
        payload.status.lines = payload.status.lines.map((line: { id: string }) => ({
          ...line, status: line.id === "line-1" ? "delay" : "normal", statusLabel: line.id === "line-1" ? "Limited service" : "Normal Service",
        }));
        await route.fulfill({ response, json: payload });
      });
      await page.goto("/");
      if (isMobile) {
        await page.getByRole("button", { name: "Status", exact: true }).click();
        await page.locator(".mobile-status-actions").getByRole("button", { name: /Delays/ }).click();
      } else {
        await page.getByRole("navigation", { name: "Desktop primary navigation" }).getByRole("button", { name: /^Delays/ }).click();
      }
      await expect(page.getByRole("heading", { name: "Delays", exact: true })).toBeVisible();
      const current = page.locator('[data-impact-card-id="limited-child"]');
      await expect(current).toHaveClass(/delay-card-border/);
      await expect(current).toContainText("Limited service");
      await expect(current).toContainText("Source cause");
      await expect(current.locator(".impact-card-title")).toHaveText("Limited service between Eglinton and Davisville due to planned track work");
      await expect(current.locator(".impact-overlap-refs")).toHaveCount(0);
      await expect(current.locator(".impact-card-badges").getByRole("button", { name: "View related planned advisory details" })).toBeVisible();
      await current.getByRole("button", { name: "View related planned advisory details" }).click();
      await expect(page.getByRole("heading", { name: "Planned Advisories", exact: true })).toBeVisible();
      if (isMobile) {
        const headingText = page.getByRole("heading", { name: "Planned Advisories", exact: true }).locator("span");
        await expect(headingText).toHaveCSS("white-space", "normal");
        await expect(headingText).toHaveCSS("text-overflow", "clip");
        expect(await headingText.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      }
      const planned = page.locator('[data-impact-card-id="limited-parent"]');
      await expect(planned).toContainText("Planned limited service");
      await expect(planned).toContainText("Advisory dates");
      await expect(planned).toContainText("Advisory hours");
      await expect(planned.locator(".impact-overlap-refs")).toHaveCount(0);
      await expect(planned.getByRole("button", { name: "View current impact" })).toHaveClass(/is-delay/);
      await expect(planned.getByRole("button", { name: "View current impact" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `/tmp/linewatch-limited-planned-${theme}-${mapView}-${isMobile ? "mobile" : "desktop"}.png` });
      await planned.getByRole("button", { name: "View current impact" }).click();
      if (isMobile) {
        await expect(page.getByRole("heading", { name: "Limited service", exact: true })).toBeVisible();
        await page.getByRole("button", { name: "View in List", exact: true }).click();
      }
      await expect(page.getByRole("heading", { name: "Delays", exact: true })).toBeVisible();
      if (mapView === "geographic") await expect(page.locator(".geographic-network-map")).toHaveAttribute("data-status", "ready", { timeout: 15_000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `/tmp/linewatch-limited-${theme}-${mapView}-${isMobile ? "mobile" : "desktop"}.png` });
    });
  }
}

test("station-only limited service keeps orange current and blue local planned markers", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await installDismissedTransientUi(page, "2026-09-29T04:00:00Z");
  await page.setViewportSize({ width: isMobile ? 360 : 1440, height: 900 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.addInitScript(() => {
    localStorage.setItem("linewatch-theme-v1", "light");
    localStorage.setItem("linewatch-map-view-v1", "diagram");
    localStorage.setItem("linewatch-impact-list-view-v1", "cards");
  });
  await page.route("**/api/dashboard?network=ttc", async route => {
    const response = await route.fetch();
    const payload = await response.json();
    const details = { id: "local-child", lineId: "line-1", lineNumber: "1", title: "Limited service at Stub Station",
      description: "Synthetic station-only limited service.", location: "Stub Station", displayDirection: "Both directions",
      source: "Synthetic test fixture", serviceEffect: "limited-service", affectedSegmentIds: [],
      relatedPlannedClosureId: "local-parent", startedAt: "2026-09-29T03:00:00Z", activeWindowEnd: "2026-09-29T06:00:00Z", shuttle: false };
    payload.activeAlerts = [];
    payload.reducedSpeedZones = [];
    payload.delays = [details];
    payload.plannedClosures = [{ ...details, id: "local-parent", previewSegmentIds: [], previewStationIds: ["stub-station"],
      activeNow: true, timingStatus: "active-now", window: "Tonight", activeWindowStart: details.startedAt }];
    payload.map.segments = payload.map.segments.map((segment: Record<string, unknown>) => ({ ...segment, impacts: [], overlay: "clear", alertId: null }));
    payload.map.stationNodeImpacts = [{ stationId: "stub-station", kind: "delay", cardId: details.id, title: details.title }];
    await route.fulfill({ response, json: payload });
  });
  await page.goto("/");
  const currentRing = page.locator(".station-impact-ring.delay");
  await expect(currentRing).toHaveCount(1);
  await expect(currentRing).toHaveCSS("stroke", "rgb(245, 158, 11)");
  await expect(page.locator(".station-impact-ring.planned-closure")).toHaveCount(0);
  await currentRing.focus();
  await currentRing.press("Enter");
  if (isMobile) await page.getByRole("button", { name: "View in List", exact: true }).click();
  const current = page.locator('[data-impact-card-id="local-child"]');
  await expect(current).toContainText("Limited service");
  await current.getByRole("button", { name: "View related planned advisory details" }).click();
  const planned = page.locator('[data-impact-card-id="local-parent"]');
  await planned.getByRole("button", { name: /View .* on map/ }).click();
  await expect(page.locator(".station-impact-ring.planned-closure")).toHaveCount(1);
  await expect(page.locator(".station-impact-ring.planned-closure")).toHaveCSS("stroke", "rgb(8, 127, 255)");
  await page.screenshot({ path: `/tmp/linewatch-limited-station-${isMobile ? "mobile" : "desktop"}.png` });
});

test("nightly advisory keeps full dates and the next occurrence between active windows", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await installDismissedTransientUi(page, "2026-09-29T16:00:00Z");
  await page.setViewportSize({ width: isMobile ? 360 : 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem("linewatch-impact-list-view-v1", "cards"));
  await page.route("**/api/dashboard?network=ttc", async route => {
    const response = await route.fetch();
    const payload = await response.json();
    const segment = payload.map.segments.find((item: { lineId: string }) => item.lineId === "line-1");
    payload.activeAlerts = [];
    payload.delays = [];
    payload.reducedSpeedZones = [];
    payload.plannedClosures = [{
      id: "between-nights", lineId: "line-1", lineNumber: "1", title: "Limited nightly service",
      description: "Synthetic nightly limited-service fixture.", location: "Eglinton to Davisville", source: "Synthetic test fixture",
      previewSegmentIds: [segment.id], activeNow: false, timingStatus: "upcoming", nightly: true, serviceEffect: "limited-service",
      windowDates: "Mon, Sep 28 – Thu, Oct 1", windowHours: "11 PM – 2 AM", window: "Mon, Sep 28 – Thu, Oct 1",
      nextWindowStart: "2026-09-30T03:00:00Z", nextWindowEnd: "2026-09-30T06:00:00Z",
      nextWindowLabel: "Tue, Sep 29 · 11 PM – Wed, Sep 30 2 AM",
    }];
    payload.map.segments = payload.map.segments.map((item: Record<string, unknown>) => ({ ...item, impacts: [], overlay: "clear", alertId: null }));
    payload.map.stationNodeImpacts = [];
    payload.status.lines = payload.status.lines.map((line: Record<string, unknown>) => ({ ...line, status: "normal", statusLabel: "Normal Service" }));
    await route.fulfill({ response, json: payload });
  });
  await page.goto("/");
  if (isMobile) {
    await page.getByRole("button", { name: "Status", exact: true }).click();
    await page.locator(".mobile-status-actions").getByRole("button", { name: /Planned Advisories/ }).click();
  } else {
    await page.getByRole("navigation", { name: "Desktop primary navigation" }).getByRole("button", { name: /^Planned Advisories/ }).click();
  }
  const card = page.locator('[data-impact-card-id="between-nights"]');
  await expect(card).toContainText("Next Tonight");
  await expect(card).toContainText("Mon, Sep 28 – Thu, Oct 1");
  await expect(card).toContainText("Wed, Sep 30");
  await expect(card.getByRole("button", { name: "View current impact" })).toHaveCount(0);
  await expect(card.locator(".impact-overlap-refs")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("regional delay cards retain their descriptive source headline", async ({ page, request, isMobile }) => {
  await setStubMode(request, "regional-live");
  await installDismissedTransientUi(page);
  await page.setViewportSize({ width: isMobile ? 360 : 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem("linewatch-impact-list-view-v1", "cards"));
  const payload = await (await request.get(`${stubUrl}/api/dashboard?network=regional`)).json();
  const delay = payload.delays.find((item: { id: string }) => item.id === "regional-demo-delay");
  expect(delay).toBeTruthy();
  await page.goto("/?network=regional&panel=delays");
  await expect(page.locator(".linewatch-shell")).toHaveAttribute("data-network", "regional");
  const card = page.locator('[data-impact-card-id="regional-demo-delay"]');
  await expect(card.locator(".impact-card-title")).toHaveText(delay.title);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
