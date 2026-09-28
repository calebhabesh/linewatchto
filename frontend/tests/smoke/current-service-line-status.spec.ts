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
      const status = network === "ttc"
        ? "Normal Service, Speed zones, Closure planned"
        : "Normal Service, Closure planned";
      const affected = service.getByRole("button", { name: new RegExp(status) });
      await expect(affected).toBeVisible();
      await expect(affected.locator(".current-service-good-service-icon")).toHaveCount(0);
      await expect(affected.locator(".line-service-advisory-count")).toHaveText(network === "ttc" ? "2 advisories" : "1 advisory");
      await expect(service.locator(".line-service-advisory-count")).toHaveCount(1);
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

      const closureBadge = service.locator(isMobile ? ".current-service-badge-incident-button" : ".desktop-status-badge-incident-button")
        .filter({ hasText: "Planned Closure" });
      await closureBadge.click();
      await expect(page.getByRole("heading", { name: "Planned Closures", exact: true })).toBeVisible();
    });
  }
}
