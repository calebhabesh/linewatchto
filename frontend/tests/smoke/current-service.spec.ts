import { expect, test } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";

test.beforeEach(async ({ page, isMobile }) => {
  test.skip(isMobile, "Current Service tests cover desktop layout; mobile is tested in mobile-service-sheet.spec.ts");
  await installDismissedTransientUi(page);
});

test("Current Service appears in desktop sidebar with live pill, categories, rail incidents, and line badges", async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");

  const sidebar = page.locator("#desktop-sidebar-container");
  await expect(sidebar).toBeVisible();

  const title = sidebar.getByRole("heading", { name: "Current Service", exact: true });
  await expect(title).toBeVisible();

  // Recessed LIVE pill
  await expect(sidebar.getByLabel("Live")).toBeVisible();

  // Category capsules
  const catGrid = sidebar.locator(".desktop-status-categories-grid");
  await expect(catGrid.getByRole("button", { name: /Active Alert/i })).toBeVisible();
  await expect(catGrid.getByRole("button", { name: /Delay/i })).toBeVisible();
  await expect(catGrid.getByRole("button", { name: /Reduced Speed Zone/i })).toBeVisible();
  await expect(catGrid.getByRole("button", { name: /Planned Closure/i })).toBeVisible();

  // Rail incident section
  const railSection = sidebar.locator(".desktop-status-rail-section");
  await expect(railSection).toBeVisible();
  await expect(railSection).toContainText("Subway & Light Rail");

  // Clicking an incident navigates to drilldown
  const delayItem = railSection.getByRole("button", { name: /Sheppard-Yonge to Don Mills/i }).first();
  await expect(delayItem).toBeVisible();
  await delayItem.click();

  await expect(page.getByRole("heading", { name: "Delays", exact: true })).toBeVisible();
  await expect(page.locator('[data-impact-card-id="stub-delay-line-4"]')).toHaveClass(/highlight-active-card/);
});

test("desktop Current Service badges open their matching impact panels", async ({ page, request }) => {
  await setStubMode(request, "seeded");
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
    payload.reducedSpeedZones = [
      ...payload.reducedSpeedZones,
      ...[1, 2, 3].map((index) => ({
        ...payload.reducedSpeedZones[0],
        id: `stub-line-2-rsz-${index}`,
        lineId: "line-2",
        lineNumber: "2",
        sourceAlertIds: [`stub-line-2-rsz-source-${index}`],
      })),
    ];
    payload.status.lines = [
      ...payload.status.lines,
      {
        id: "line-2",
        number: "2",
        name: "Stub API Bloor-Danforth",
        route: "Stub Station - Stub Terminal",
        color: "#00923F",
        status: "normal",
        statusLabel: "Normal Service",
        summary: "Stub API normal service for browser verification.",
        updatedAgo: "Seeded demo",
      },
    ];
    await route.fulfill({ response, json: payload });
  });
  await page.goto("/?previewTime=2026-08-14T16:00:00.000Z");

  const sidebar = page.locator("#desktop-sidebar-container");
  const plannedClosureBadge = sidebar.locator(".desktop-status-badge-incident-button").filter({ hasText: "Planned Closure" });
  await expect(plannedClosureBadge).toBeVisible();
  await plannedClosureBadge.click();
  await expect(page.getByRole("heading", { name: "Planned Closures", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Back", exact: true }).click();
  const reducedSpeedZoneBadge = sidebar.locator(".desktop-status-badge-incident-button").filter({ hasText: "Reduced Speed Zone" }).first();
  await expect(reducedSpeedZoneBadge).toBeVisible();
  await reducedSpeedZoneBadge.click();
  await expect(page.getByRole("heading", { name: "Reduced Speed Zones", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Back", exact: true }).click();
  const lineTwoGroup = sidebar.locator(".desktop-status-remaining-group").filter({ hasText: "3 Reduced Speed Zones" });
  const lineTwoReducedSpeedZoneBadge = lineTwoGroup.getByRole("button", { name: /Reduced Speed Zones/i });
  await expect(lineTwoReducedSpeedZoneBadge).toBeVisible();
  await lineTwoReducedSpeedZoneBadge.click();
  await expect(page.getByRole("heading", { name: "Reduced Speed Zones", exact: true })).toBeVisible();
});

test("unavailable data cannot read as clear service", async ({ page, request }) => {
  await setStubMode(request, "unavailable");
  await page.goto("/");

  const sidebar = page.locator("#desktop-sidebar-container");
  await expect(sidebar).toBeVisible();
  await expect(sidebar.locator(".mobile-service-sheet-recessed-badge").filter({ hasText: /Unknown/i }).first()).toBeVisible();
  await expect(sidebar).not.toContainText("No active alerts/delays");
  await expect(sidebar.locator(".desktop-status-incident-row")).toHaveCount(0);
});

test("regional readout has corridor identities and separate service notices", async ({ page, request }) => {
  await setStubMode(request, "regional-live");
  await page.goto("/");

  // Switch to GO/UP
  await page.getByRole("button", { name: "GO/UP", exact: true }).click();

  const sidebar = page.locator("#desktop-sidebar-container");
  await expect(sidebar).toContainText(/GO & UP Rail/i);
  await expect(sidebar).toContainText(/Service Notices/i);
  await expect(sidebar).not.toContainText(/Streetcar \/ Bus Alerts/i);
  await expect(sidebar.getByRole("button", { name: /Trip Change/i })).toBeVisible();
});

test("desktop sidebar expands on fresh load and toggles in-memory during active session", async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");

  const sidebar = page.locator("#desktop-sidebar-container");
  await expect(sidebar).toBeVisible();
  await expect(sidebar).not.toHaveClass(/desktop-sidebar-container--collapsed/);

  // Toggle sidebar collapse using rail button
  const toggleBtn = page.getByRole("button", { name: "Collapse sidebar" });
  await expect(toggleBtn).toBeVisible();
  await toggleBtn.click();

  await expect(sidebar).toHaveClass(/desktop-sidebar-container--collapsed/);

  // Reload page - must always start expanded on fresh load
  await page.reload();
  await expect(sidebar).toBeVisible();
  await expect(sidebar).not.toHaveClass(/desktop-sidebar-container--collapsed/);
});
