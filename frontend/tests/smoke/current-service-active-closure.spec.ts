import { expect, test } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";

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
    await expect(page.getByRole("heading", { name: "Active Alerts", exact: true })).toBeVisible();
    const alertCard = page.locator('[data-impact-card-id="stub-closure-line-1"]');
    await expect(alertCard).toHaveClass(/suspension-card-border/);
    await expect(alertCard.getByRole("button", { name: "View related planned closure details" })).toBeVisible();
  });
}
