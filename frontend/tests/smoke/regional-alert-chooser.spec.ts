import { expect, test } from "@playwright/test";
import type { RegionalDashboardApiResponse } from "../../src/app/regional-data";
import { installDismissedTransientUi, setStubMode } from "./test-support";

for (const theme of ["light", "dark"] as const) {
  test(`regional chooser shows advisory schedules and directions in ${theme} mode`, async ({ page, request, isMobile }, testInfo) => {
    await setStubMode(request, "regional-live");
    await installDismissedTransientUi(page);
    await page.setViewportSize(isMobile ? { width: 360, height: 800 } : { width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: theme });
    await page.context().addCookies([{
      name: "linewatch-visual-preferences-v1",
      value: encodeURIComponent(JSON.stringify({ theme, reducedMotion: true, defaultNetwork: "regional" })),
      domain: "127.0.0.1",
      path: "/",
    }]);
    await page.addInitScript((theme) => {
      localStorage.setItem("linewatch-theme-v1", theme);
      localStorage.setItem("linewatch-default-network-v1", "regional");
      localStorage.setItem("linewatch-reduced-motion-enabled-v1", "true");
    }, theme);
    await page.route("**/api/dashboard?network=regional", async (route) => {
      const response = await route.fetch();
      const payload: RegionalDashboardApiResponse = await response.json();
      // Keep only one overlapping span, so the same chooser is reachable on a compact map.
      const closure = payload.plannedClosures.find((item) => item.id === "regional-demo-planned")!;
      const delay = payload.delays.find((item) => item.id === "regional-demo-delay")!;
      const suspension = payload.activeAlerts.find((item) => item.id === "regional-demo-suspension")!;
      const routeDetails = theme === "dark" ? {
        lineId: "regional-up",
        lineNumber: "UP",
        location: "Weston to Pearson Airport",
      } : {
        lineId: closure.lineId,
        lineNumber: closure.lineNumber,
        location: closure.location,
      };
      const segmentIds = theme === "dark"
        ? payload.map.segments.filter((segment) => segment.lineId === "regional-up"
          && [segment.stationAId, segment.stationBId].includes("pearson-airport")).map((segment) => segment.id)
        : closure.previewSegmentIds;
      payload.plannedClosures = [{
        ...closure,
        ...routeDetails,
        previewSegmentIds: segmentIds,
        title: `Track repairs between ${theme === "dark" ? "Weston and Pearson Airport" : "Pickering and Ajax"}`,
        window: "Fri, Aug 14 11:00 PM – Sun, Aug 16 6:00 AM",
        serviceEffect: "suspension",
      }];
      payload.delays = [{
        ...delay,
        ...routeDetails,
        affectedSegmentIds: segmentIds,
        title: "Delay",
        description: `Trains are delayed while crews inspect a signal near ${theme === "dark" ? "Weston" : "Ajax"}.`,
      }];
      payload.activeAlerts = [{
        ...suspension,
        ...routeDetails,
        affectedSegmentIds: segmentIds,
        title: "Service suspended for an emergency track inspection",
      }];
      payload.map.segments = payload.map.segments.map((segment) => ({
        ...segment,
        overlay: segmentIds.includes(segment.id) ? "suspension" : "clear",
        impacts: segmentIds.includes(segment.id) ? [
          { kind: "suspension", cardId: suspension.id, travelDirection: "bidirectional", sourceAlertIds: [suspension.id] },
          { kind: "delay", cardId: delay.id, travelDirection: "bidirectional", sourceAlertIds: [delay.id] },
          { kind: "planned-closure", cardId: closure.id, travelDirection: "bidirectional", sourceAlertIds: [closure.id] },
        ] : [],
      }));
      payload.map.stationNodeImpacts = [];
      await route.fulfill({ response, json: payload });
    });
    await page.goto("/");
    if (!isMobile) {
      await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
    }
    const marker = page.locator('[data-overlap-segment-id^="regional-overlap-"]');
    await expect(marker).toHaveCount(1);
    await marker.click();
    const chooser = page.getByRole("dialog", { name: /Choose Alert on/ });
    await expect(chooser).toBeVisible();
    const planned = chooser.locator('[data-overlap-choice-id="regional-demo-planned"]');
    const delay = chooser.locator('[data-overlap-choice-id="regional-demo-delay"]');
    await expect(planned).toContainText("Planned Advisory · Closure");
    await expect(planned.locator(".overlap-chooser-choice-date"))
      .toHaveText("Fri, Aug 14 11:00 PM – Sun, Aug 16 6:00 AM");
    await expect(planned).toContainText(theme === "dark"
      ? "UP Express: Weston to Pearson Airport"
      : "Lakeshore East Line: Pickering to Ajax");
    await expect(planned.locator(".overlap-chooser-choice-direction"))
      .toHaveText("(Eastbound & Westbound)");
    await expect(planned.locator(".overlap-chooser-choice-summary")).toHaveCount(0);
    await expect(delay.locator(".overlap-chooser-choice-summary")).toHaveCount(0);
    await expect(delay).toContainText("Both directions");
    await expect(chooser.locator('[data-overlap-choice-id="regional-demo-suspension"] .overlap-chooser-choice-direction'))
      .toHaveText("(Eastbound & Westbound)");
    expect(await chooser.evaluate((element) => {
      const list = element.querySelector(".overlap-chooser-list")!;
      return list.scrollWidth <= list.clientWidth;
    })).toBe(true);
    await planned.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("regional-chooser.png") });
    await planned.click();
    await expect(chooser).toHaveCount(0);
    await expect(page.locator('[data-regional-impact-id="regional-demo-planned"][data-regional-impact-selected="true"]').first())
      .toBeAttached();
  });
}
