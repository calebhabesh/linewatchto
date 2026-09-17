import { expect, test } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";

test("mobile Current Service badges open their matching impact panels", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "Current Service badge routing is exercised in the mobile service sheet");
  await setStubMode(request, "seeded");
  await installDismissedTransientUi(page);

  // The seeded closure is active/past its next-window label. Give this test a
  // future window so the same line renders the planned-closure sub-badge.
  await page.route("**/api/dashboard?network=ttc", async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    payload.plannedClosures = payload.plannedClosures.map((closure: Record<string, unknown>) =>
      closure.id === "stub-upcoming-closure-line-1"
        ? {
            ...closure,
            nextWindowStart: "2026-08-20T03:00:00Z",
            nextWindowEnd: "2026-08-20T06:00:00Z",
          }
        : closure,
    );
    await route.fulfill({ response, json: payload });
  });

  await page.goto("/?previewTime=2026-08-14T16:00:00.000Z");
  await page.getByRole("button", { name: "Expand service sheet" }).click();
  const service = page.getByRole("region", { name: "Current Service", exact: true });

  const plannedClosureBadge = service.locator(".current-service-badge-incident-button").filter({ hasText: "Planned Closure" });
  await expect(plannedClosureBadge).toBeVisible();
  await plannedClosureBadge.click();
  await expect(page.getByRole("heading", { name: "Planned Closures", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Expand service sheet" }).click();
  const reducedSpeedZoneBadge = page.locator(".current-service-badge-incident-button").filter({ hasText: "Reduced Speed Zone" });
  await expect(reducedSpeedZoneBadge).toBeVisible();
  await reducedSpeedZoneBadge.click();
  await expect(page.getByRole("heading", { name: "Reduced Speed Zones", exact: true })).toBeVisible();
});
