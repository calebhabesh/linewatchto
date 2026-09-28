import { expect, test, type Locator } from "@playwright/test";
import { installDismissedTransientUi, setStubMode, stubUrl } from "./test-support";

async function expectLastItemReachable(item: Locator) {
  // Scroll only user-scrollable ancestors. scrollIntoView can also move hidden
  // overflow containers and conceal the clipping bug this test guards against.
  await expect.poll(() => item.evaluate(async (element) => {
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (/^(auto|scroll)$/.test(getComputedStyle(parent).overflowY)) parent.scrollTop = parent.scrollHeight;
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const bottom = element.getBoundingClientRect().bottom;
    const clippedBy: string[] = [];
    if (bottom > innerHeight + 1) clippedBy.push("viewport");
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (/^(auto|scroll|hidden|clip)$/.test(getComputedStyle(parent).overflowY)
        && bottom > parent.getBoundingClientRect().bottom + 1) clippedBy.push(parent.className);
    }
    return clippedBy;
  }), { message: "The final list card must be reachable at the bottom of its scroll area" }).toEqual([]);
}

test("line submenu can scroll to the complete final impact card", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await installDismissedTransientUi(page);
  await page.setViewportSize({ width: isMobile ? 360 : 1440, height: 760 });
  await page.route("**/api/dashboard?network=ttc", async (route) => {
    const response = await request.get(`${stubUrl}/api/dashboard?network=ttc`);
    const payload = await response.json();
    payload.status.lines = payload.status.lines.map((line: Record<string, unknown>) => ({ ...line, status: "normal", statusLabel: "Normal Service" }));
    payload.activeAlerts = [];
    payload.delays = [];
    payload.plannedClosures = [];
    payload.reducedSpeedZones = Array.from({ length: 3 }, (_, index) => ({
      ...payload.reducedSpeedZones[0], id: `scroll-zone-${index}`, title: `Scroll zone ${index}`,
      location: `Reachability station ${index} to Terminal ${index}`,
      sourceAlertIds: [`scroll-source-${index}`], directionalDetails: [],
      reducedSpeedKmh: 20, typicalSpeedKmh: 58, cause: "Track issue",
      resolution: "Early October", startedAt: "2026-07-10T14:22:00Z", updatedAt: "2026-08-14T14:03:00Z",
    }));
    await route.fulfill({ response, json: payload });
  });
  await page.goto("/?previewTime=2026-08-14T16:00:00.000Z");
  if (isMobile) await page.getByRole("button", { name: "Status", exact: true }).click();
  await page.getByRole("button", { name: isMobile ? "View all service impacts for Stub API Yonge-University" : /View Stub API Yonge-University line impacts:/ }).click();
  const panel = page.locator(".line-impacts-panel");
  await expect(panel).toBeVisible();
  const cards = panel.locator(".alert-card.rsz-card-border");
  await expect(cards).toHaveCount(3);
  await expectLastItemReachable(cards.last());
  await page.screenshot({ path: `/tmp/linewatch-line-list-${isMobile ? "mobile" : "desktop"}.png` });
});

for (const network of ["ttc", "regional"] as const) {
  test(`${network} mixed line impacts reach the final category and notice`, async ({ page, request, isMobile }) => {
    test.setTimeout(60_000);
    await setStubMode(request, network === "regional" ? "regional-live" : "seeded");
    await installDismissedTransientUi(page);
    await page.setViewportSize({ width: isMobile ? 360 : 1440, height: 640 });
    let lineId = "";
    let lineNumber = "";
    await page.route(`**/api/dashboard?network=${network}`, async (route) => {
      const response = await request.get(`${stubUrl}/api/dashboard?network=${network}`);
      const payload = await response.json();
      const line = payload.status.lines[0];
      lineId = line.id;
      lineNumber = line.number;
      for (const category of ["activeAlerts", "delays", "plannedClosures", "reducedSpeedZones"] as const) {
        const template = payload[category][0];
        payload[category] = template ? Array.from({ length: 3 }, (_, index) => ({
          ...template, id: `scroll-${category}-${index}`, lineId, lineNumber,
          sourceAlertIds: [`scroll-${category}-${index}`], relatedPlannedClosureId: null,
          activeNow: false, timingStatus: "upcoming", directionalDetails: [],
          location: `Scroll station ${index} to Terminal ${index}`,
        })) : [];
      }
      await route.fulfill({ response, json: payload });
    });
    await page.route("**/api/surface-notices?**", async (route) => {
      const response = await request.get(`${stubUrl}/api/surface-notices?network=regional`);
      const payload = await response.json();
      payload.notices = Array.from({ length: 4 }, (_, index) => ({
        ...payload.notices[0], id: `scroll-notice-${index}`, routeIds: [lineNumber],
        title: `Scroll notice ${index}`, description: `Final notice details ${index}`,
      }));
      await route.fulfill({ response, json: payload });
    });
    if (network === "regional") await page.route("**/api/accessibility-outages?**", async (route) => {
      const response = await request.get(`${stubUrl}/api/accessibility-outages?network=regional`);
      const payload = await response.json();
      payload.groups[0].stations = Array.from({ length: 8 }, (_, index) => ({
        ...payload.groups[0].stations[0], stationId: `scroll-station-${index}`, stationName: `Scroll station ${index}`,
      }));
      await route.fulfill({ response, json: payload });
    });
    await page.goto(`/?network=${network}&previewTime=2026-08-14T16:00:00.000Z`);
    if (isMobile) await page.getByRole("button", { name: "Status", exact: true }).click();
    // The first line is populated across categories, so exercise its all-impacts submenu.
    const launch = isMobile ? page.locator(".mobile-line-status-summary").first() : page.getByRole("button", { name: /^View .* line impacts/ }).first();
    await launch.click();
    const panel = page.locator(".line-impacts-panel");
    await expect(panel).toBeVisible();
    const closures = panel.locator(".closure-card");
    await expect(closures).toHaveCount(3);
    const finalItem = network === "regional"
      ? panel.getByText("Final notice details 3", { exact: true })
      : closures.last();
    await expect(finalItem).toBeAttached();
    await expectLastItemReachable(finalItem);
    for (const category of ["alerts", "delays", "closures"] as const) {
      await panel.locator(`[data-category="${category}"]`).click();
      const cards = panel.locator(category === "closures" ? ".closure-card" : ".alert-card");
      await expect(cards).toHaveCount(3);
      await expectLastItemReachable(cards.last());
    }
    await page.getByRole("button", { name: /^Back/ }).first().click();
    for (const [category, mobileClass, desktopClass] of [
      ["alerts", "alerts", "active-alerts"],
      ["delays", "delays", "delays"],
      ["closures", "closures", "planned-closures"],
      ...(network === "ttc" ? [["reduced-speed-zones", "rsz", "reduced-speed-zones"]] : []),
    ]) {
      const overview = page.locator(isMobile ? ".mobile-status-content-scroll" : ".desktop-status-overview");
      await overview.locator(isMobile ? `.mobile-status-btn-${mobileClass}` : `.mobile-status-peek-count-badge.${desktopClass}`).click();
      const cards = page.locator(category === "closures" ? ".closure-stack .closure-card" : ".alert-stack .alert-card");
      await expect(cards).toHaveCount(3);
      await expectLastItemReachable(cards.last());
      await page.getByRole("button", { name: /^Back/ }).first().click();
    }
    if (network === "regional") {
      const overview = page.locator(isMobile ? ".mobile-status-content-scroll" : ".desktop-status-overview");
      await overview.getByRole("button", { name: /Service Notices/ }).click();
      await expectLastItemReachable(page.getByText("Final notice details 3", { exact: true }));
      await page.getByRole("button", { name: /^Back/ }).first().click();
      await overview.getByRole("button", { name: /Accessibility Outages/ }).click();
      const outages = page.locator(".accessibility-outages-scroll");
      await expect(outages).toBeVisible();
      await expectLastItemReachable(outages.locator("*").filter({ visible: true }).last());
      await outages.getByRole("button", { name: /Elevator Outages/ }).click();
      const finalStation = outages.getByRole("button", { name: /Scroll station 7/ });
      await expectLastItemReachable(finalStation);
      await finalStation.click();
      const finalDetails = outages.locator("*").filter({ visible: true }).last();
      await expectLastItemReachable(finalDetails);
    }
  });
}

test("Status, More and secondary list menus reach their final content on short screens", async ({ page, request, isMobile }) => {
  test.setTimeout(60_000);
  await setStubMode(request, "seeded");
  await installDismissedTransientUi(page);
  await page.setViewportSize({ width: isMobile ? 360 : 1440, height: 640 });
  await page.goto("/?previewTime=2026-08-14T16:00:00.000Z");
  await page.getByRole("button", { name: "Status", exact: true }).click();
  const status = page.locator(isMobile ? ".mobile-status-content-scroll" : ".desktop-status-overview");
  await expect(status).toBeVisible();
  await expectLastItemReachable(status.locator("*").filter({ visible: true }).last());
  await page.getByRole("button", { name: "More", exact: true }).click();
  const more = page.locator(isMobile ? ".mobile-more-content-scroll" : ".desktop-more-panel");
  await expect(more).toBeVisible();
  await expectLastItemReachable(more.locator("*").filter({ visible: true }).last());
  for (const [name, selector] of [
    ["Release Notes", ".release-notes-content"],
    ["Privacy & Acknowledgements", ".privacy-acknowledgements-scroll"],
    ["Notifications", ".notification-settings-scroll"],
    ["Reliability Analytics", ".reliability-list"],
    ["Alert History", ".alert-history-scroll"],
    ["TTC Announcements", ".notification-settings-scroll"],
    ["Leave Feedback", ".feedback-content"],
  ]) {
    await test.step(name, async () => {
      await more.getByRole("button", { name: new RegExp(name) }).click();
      const content = page.locator(selector);
      await expect(content).toBeVisible();
      await expectLastItemReachable(content.locator("*").filter({ visible: true }).last());
      await page.getByRole("button", { name: /^Back/ }).first().click();
      await expect(more).toBeVisible();
    });
  }
});

test("station browsing, detail and saved lists reach their final content", async ({ page, request, isMobile }) => {
  test.setTimeout(60_000);
  await setStubMode(request, "seeded");
  await installDismissedTransientUi(page);
  await page.setViewportSize({ width: isMobile ? 360 : 1440, height: 640 });
  await page.route("**/api/account/commutes", async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    if (payload.commutes?.length) payload.commutes = Array.from({ length: 8 }, (_, index) => ({
      ...payload.commutes[0], id: `scroll-commute-${index}`, name: `Scroll commute ${index}`,
    }));
    await route.fulfill({ response, json: payload });
  });
  await page.goto("/?previewTime=2026-08-14T16:00:00.000Z");
  await page.getByRole("searchbox", { name: "Station Search" }).click();
  const lineButtons = page.locator(".station-search-line-trigger");
  await expect(lineButtons.first()).toBeVisible();
  await expectLastItemReachable(lineButtons.last());
  await lineButtons.first().click();
  const stations = page.locator(".station-search-stations-list");
  await expect(stations).toBeVisible();
  await expectLastItemReachable(stations.locator("*").filter({ visible: true }).last());
  await stations.getByRole("button", { name: /station search result/ }).first().click();
  const detail = page.locator(".station-detail-scroll");
  await expect(detail).toBeVisible();
  await expectLastItemReachable(detail.locator("*").filter({ visible: true }).last());
  await page.getByRole("button", { name: /Close station detail/ }).click();
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("button", { name: "Demo Account", exact: true }).click();
  const commutes = page.locator(".saved-commute-list-scroll");
  await expect(commutes).toBeVisible();
  await expect(commutes.locator(".commute-card")).toHaveCount(8);
  await expectLastItemReachable(commutes.locator("*").filter({ visible: true }).last());
  if (isMobile) {
    await page.getByRole("button", { name: "Close", exact: true }).first().click();
    await expect(commutes).toBeHidden();
    await page.getByRole("navigation", { name: "Primary mobile navigation" }).getByRole("button", { name: "Saved", exact: true }).click();
    await expect(page.getByRole("heading", { name: "My Commutes", exact: true })).toBeVisible();
    await page.getByRole("navigation", { name: "Saved sections" }).getByRole("button", { name: /My Stations/ }).click();
  } else {
    await page.locator('.desktop-rail-item[data-dest="stations"]').click();
  }
  const myStations = page.getByRole("region", { name: "My Stations", exact: true });
  await expect(myStations).toBeVisible();
  await myStations.getByRole("button", { name: "Add Station", exact: true }).click();
  const picker = myStations.locator(".my-stations-picker-list");
  await expect(picker).toBeVisible();
  await expectLastItemReachable(picker.locator("*").filter({ visible: true }).last());
});
