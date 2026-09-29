import { expect, test } from "@playwright/test";
import { installDismissedTransientUi, setStubMode, stubUrl } from "./test-support";

test.use({ serviceWorkers: "block" });

for (const network of ["ttc", "regional"] as const) {
  for (const theme of ["light", "dark"] as const) {
    test(`${network} status incidents show updating start/end countdowns in ${theme} mode`, async ({ page, request, isMobile }) => {
      const now = new Date("2026-09-28T16:00:00Z");
      await page.clock.install({ time: now });
      await setStubMode(request, network === "regional" ? "regional-live" : "seeded");
      await installDismissedTransientUi(page, now.toISOString());
      await page.setViewportSize({ width: isMobile ? 360 : 1440, height: 900 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.addInitScript(({ network, theme }) => {
        localStorage.setItem("linewatch-default-network-v1", network);
        localStorage.setItem("linewatch-theme-v1", theme);
      }, { network, theme });
      await page.route(`**/api/dashboard?network=${network}`, async (route) => {
        const response = await request.get(`${stubUrl}/api/dashboard?network=${network}`);
        const payload = await response.json();
        const line = payload.status.lines[0];
        const closure = {
          ...payload.plannedClosures[0], lineId: line.id, lineNumber: line.number,
          location: "Countdown test stations", shuttle: true,
        };
        payload.delays = [];
        payload.reducedSpeedZones = [];
        payload.activeAlerts = [{
          ...payload.activeAlerts[0], id: "countdown-active", lineId: line.id, lineNumber: line.number,
          severity: "planned", relatedPlannedClosureId: "countdown-parent", location: closure.location,
        }];
        payload.plannedClosures = [
          {
            ...closure, id: "countdown-parent", activeNow: true, timingStatus: "active-now",
            activeWindowStart: "2026-09-28T15:00:00Z", activeWindowEnd: "2026-09-30T19:00:00Z",
          },
          {
            ...closure, id: "countdown-upcoming", activeNow: false, timingStatus: "upcoming",
            activeWindowStart: null, activeWindowEnd: null,
            nextWindowStart: "2026-09-28T19:20:00Z", nextWindowEnd: "2026-09-28T22:00:00Z",
          },
        ];
        await route.fulfill({ response, json: payload });
      });
      await page.goto("/");
      if (isMobile) await page.getByRole("button", { name: "Expand service sheet" }).click();
      const service = page.locator(isMobile ? ".mobile-service-sheet" : ".desktop-status-overview");
      const timing = service.locator(isMobile ? ".current-service-impact-timing" : ".desktop-status-incident-timing");
      await expect(timing.filter({ hasText: /^Ends Wed at 3:00 PM \(2d 3h\)/ })).toBeVisible();
      await expect(timing.filter({ hasText: /^Starts today at 3:20 PM \(3h 20m\)/ })).toBeVisible();
      await expect(service.locator('.incident-countdown[data-stage="distant"]')).toHaveCount(2);
      await expect(service.locator(".incident-shuttle").first()).toBeVisible();
      expect(await service.locator(".incident-shuttle").evaluateAll((elements) => elements.every((element) => {
        const countdown = element.parentElement?.querySelector(".incident-countdown");
        return element.scrollWidth <= element.clientWidth + 1
          && (!countdown || element.getBoundingClientRect().top >= countdown.getBoundingClientRect().bottom);
      }))).toBe(true);
      expect(await timing.evaluateAll((elements) => elements.every((element) => {
        const bounds = element.getBoundingClientRect();
        return element.scrollWidth <= element.clientWidth + 1 && bounds.left >= 0 && bounds.right <= window.innerWidth;
      }))).toBe(true);
      await service.screenshot({ path: `/tmp/linewatch-countdown-${network}-${theme}-${isMobile ? "mobile" : "desktop"}.png` });

      // The shared transient-UI helper fixes Date.now independently of Playwright's timers.
      const advance = async (elapsed: number) => {
        await page.evaluate((time) => { Date.now = () => time; }, now.getTime() + elapsed);
        await page.clock.runFor(30_000);
      };
      await advance(30 * 60_000);
      await expect(timing.filter({ hasText: /^Starts today at 3:20 PM \(2h 50m\)/ })).toBeVisible();
      await expect(timing.filter({ hasText: /^Ends Wed at 3:00 PM \(2d 2h\)/ })).toBeVisible();
      await advance(150 * 60_000);
      const startingSoon = timing.filter({ hasText: /^Starts / }).locator(".incident-countdown");
      await expect(startingSoon).toHaveText("(50m)");
      await expect(startingSoon).toHaveAttribute("data-stage", "soon");
      await expect(startingSoon).toHaveCSS("color", theme === "dark" ? "rgb(183, 167, 215)" : "rgb(109, 40, 217)");
      await advance(190 * 60_000);
      await expect(startingSoon).toHaveText("(10m)");
      await expect(startingSoon).toHaveAttribute("data-stage", "imminent");
      await expect(startingSoon).toHaveCSS("color", theme === "dark" ? "rgb(216, 180, 254)" : "rgb(126, 34, 206)");
      await service.screenshot({ path: `/tmp/linewatch-countdown-colors-${network}-${theme}-${isMobile ? "mobile" : "desktop"}.png` });

      await advance(50 * 60 * 60_000 + 50 * 60_000);
      const endingSoon = timing.filter({ hasText: /^Ends / }).locator(".incident-countdown");
      await expect(endingSoon).toHaveText("(10m)");
      await expect(endingSoon).toHaveAttribute("data-stage", "imminent");
    });
  }
}

for (const entry of ["status", "pull-up sheet"] as const) {
  test(`in-effect closure opens its active alert from ${entry}`, async ({ page, request, isMobile }) => {
    test.skip(entry === "pull-up sheet" && !isMobile, "Pull-up sheet is a mobile entry point");
    test.skip(entry === "status" && isMobile, "Status incident list is a desktop entry point");
    await setStubMode(request, "seeded");
    await installDismissedTransientUi(page);
    // The canonical alert and planned closure share an ID, as in the live feed.
    await page.route("**/api/dashboard?network=ttc", async (route) => {
      const response = await route.fetch();
      const dashboard = await response.json();
      dashboard.activeAlerts = dashboard.activeAlerts.map((alert: { id: string; relatedPlannedClosureId?: string }) =>
        alert.id === "stub-active-closure-child-line-1"
          ? { ...alert, id: "stub-closure-line-1", relatedPlannedClosureId: undefined }
          : alert,
      );
      await route.fulfill({ response, json: dashboard });
    });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Center map view" }).first()).toBeVisible();
    if (entry === "status") {
      if (isMobile) {
        await page.getByRole("button", { name: "Status", exact: true }).click();
      } else {
        await page.getByRole("navigation", { name: "Desktop primary navigation" }).getByRole("button", { name: /^Status/ }).click();
      }
    } else {
      await page.getByRole("button", { name: "Expand service sheet" }).click();
    }
    const incidents = page.locator(entry === "status" ? ".desktop-status-incident-row" : ".current-service-impact--compact");
    await incidents.filter({ hasText: "Planned Closure · In Effect" }).click();
    await expect(page.getByRole("heading", { name: "Suspensions", exact: true })).toBeVisible();
    const alertCard = page.locator('[data-impact-card-id="stub-closure-line-1"]');
    await expect(alertCard).toHaveClass(/suspension-card-border/);
    await expect(alertCard.getByRole("button", { name: "View related planned advisory details" })).toBeVisible();
  });
}
