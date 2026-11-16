import { expect, test } from "@playwright/test";
import { installDismissedTransientUi, setStubMode, stubUrl } from "./test-support";

for (const network of ["ttc", "regional"] as const) {
  for (const theme of ["light", "dark"] as const) {
    test(`${network} line conditions distinguish normal service in ${theme} mode`, async ({ page, request, isMobile }) => {
      await setStubMode(request, network === "regional" ? "regional-live" : "seeded");
      await installDismissedTransientUi(page);
      await page.setViewportSize({ width: isMobile ? 360 : 1440, height: 900 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.addInitScript(({ network, theme }) => {
        localStorage.setItem("linewatch-default-network-v1", network);
        localStorage.setItem("linewatch-theme-v1", theme);
      }, { network, theme });

      await page.route(`**/api/dashboard?network=${network}`, async (route) => {
        const response = await request.get(`${stubUrl}/api/dashboard?network=${network}`);
        const payload = await response.json();
        payload.status.lines = payload.status.lines.map((line: Record<string, unknown>) => ({
          ...line, status: "normal", statusLabel: "Normal Service",
        }));
        const line = payload.status.lines[0];
        payload.activeAlerts = [];
        payload.delays = [];
        payload.reducedSpeedZones = network === "ttc" ? [payload.reducedSpeedZones[0]] : [];
        payload.plannedClosures = [{
          ...payload.plannedClosures[0],
          id: "status-test-planned-closure", lineId: line.id, lineNumber: line.number,
          activeNow: false, timingStatus: "upcoming",
          activeWindowStart: null, activeWindowEnd: null,
          nextWindowStart: network === "ttc" ? "2026-08-20T03:00:00Z" : null,
          nextWindowEnd: network === "ttc" ? "2026-08-20T06:00:00Z" : null,
        }];
        await route.fulfill({ response, json: payload });
      });

      await page.goto("/?previewTime=2026-08-14T16:00:00.000Z");
      if (isMobile) await page.getByRole("button", { name: "Expand service sheet" }).click();
      const service = isMobile
        ? page.getByRole("region", { name: "Current Service", exact: true })
        : page.locator(".desktop-status-overview");
      // The row keeps its yellow status for the planned advisory, but only the speed zone,
      // which has no card of its own, is counted.
      const status = network === "ttc"
        ? "Normal Service, Speed Zones, Advisory Planned, \\+ 1 Advisory"
        : "Normal Service, Advisory Planned$";
      const affected = service.getByRole("button", { name: new RegExp(status) }).first();
      await expect(affected).toBeVisible();
      await expect(affected.locator(".current-service-good-service-icon")).toHaveCount(0);
      await expect(service.locator(".line-service-advisory-count")).toHaveCount(network === "ttc" ? 1 : 0);
      if (network === "ttc") await expect(affected.locator(".line-service-advisory-count")).toHaveText("1 Advisory");
      await expect(service.getByText("Normal Service", { exact: true }).first()).toBeVisible();
      const textFits = await affected.evaluate((button) => {
        const bounds = button.getBoundingClientRect();
        return [...button.querySelectorAll("strong, .line-service-advisory-count")].every((item) => {
          const rect = item.getBoundingClientRect();
          return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1;
        });
      });
      expect(textFits).toBe(true);
      await service.screenshot({ path: `/tmp/linewatch-status-${network}-${theme}-${isMobile ? "mobile" : "desktop"}.png` });

      const upcoming = service.locator(".upcoming-advisory");
      await expect(upcoming).toHaveCount(1);
      await upcoming.click();
      // Desktop opens the advisory in its list; phones open its inspector over the map.
      if (isMobile) await expect(page.getByRole("button", { name: "View in List" })).toBeVisible();
      else await expect(page.getByRole("heading", { name: "Planned Advisories", exact: true })).toBeVisible();
    });
  }
}

test("urgent line rows list upcoming advisories and speed zones without repeating a count", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await installDismissedTransientUi(page);
  await page.setViewportSize({ width: isMobile ? 360 : 1440, height: 900 });
  await page.route("**/api/dashboard?network=ttc", async (route) => {
    const response = await request.get(`${stubUrl}/api/dashboard?network=ttc`);
    const payload = await response.json();
    const line = payload.status.lines[0];
    payload.status.lines = payload.status.lines.map((candidate: Record<string, unknown>) => ({
      ...candidate, status: "normal", statusLabel: "Normal Service",
    }));
    payload.activeAlerts = [{ ...payload.activeAlerts[0], lineId: line.id, lineNumber: line.number }];
    payload.delays = [];
    payload.reducedSpeedZones = [{ ...payload.reducedSpeedZones[0], lineId: line.id, lineNumber: line.number }];
    payload.plannedClosures = [{
      ...payload.plannedClosures[0],
      lineId: line.id,
      lineNumber: line.number,
      activeNow: false,
      timingStatus: "upcoming",
      nextWindowStart: "2026-08-20T03:00:00Z",
      nextWindowEnd: "2026-08-20T06:00:00Z",
    }];
    await route.fulfill({ response, json: payload });
  });

  await page.goto("/?previewTime=2026-08-14T16:00:00.000Z");
  if (isMobile) await page.getByRole("button", { name: "Expand service sheet" }).click();
  const line = page.locator(isMobile ? ".current-service-line" : ".desktop-status-rail-line-group").first();
  const upcoming = line.locator(".upcoming-advisory");
  await expect(upcoming).toBeVisible();
  await expect(upcoming).toContainText("In 5 Days");
  await expect(line.getByRole("button", { name: /1 Reduced Speed Zone/ })).toBeVisible();
  // The pill already counts the speed zone; Other Advisories repeats no count.
  await expect(line.locator(".line-service-advisory-count")).toHaveCount(0);
  const cardFits = await upcoming.evaluate((card) => {
    const bounds = card.getBoundingClientRect();
    return [...card.querySelectorAll("strong, .upcoming-advisory-countdown, .upcoming-advisory-span, .upcoming-advisory-line")].every((item) => {
      const rect = item.getBoundingClientRect();
      return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1;
    });
  });
  expect(cardFits).toBe(true);
});
