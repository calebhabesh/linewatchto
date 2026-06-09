import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const appUrl = "http://127.0.0.1:4173";
const stubUrl = "http://127.0.0.1:4174";
const disclaimerStorageKey = "linewatch-disclaimer-ack-v1";

async function setStubMode(request: APIRequestContext, mode: "seeded" | "unavailable") {
  const response = await request.post(`${stubUrl}/__test/mode`, {
    data: { mode },
  });
  expect(response.ok()).toBeTruthy();
}

async function openDashboardMenu(page: Page, isMobile = false) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
  if (isMobile) {
    await page.getByRole("button", { name: "More", exact: true }).click();
  } else {
    await page.getByRole("button", { name: "Toggle menu" }).click();
  }
}

async function openServiceCategory(page: Page, isMobile: boolean, name: RegExp | string) {
  if (isMobile) {
    await page.getByRole("button", { name: "Status", exact: true }).click();
    await page.locator(".mobile-status-actions").getByRole("button", { name }).click();
  } else {
    const isExpanded = await page.getByRole("button", { name: "Toggle menu" }).getAttribute("aria-expanded");
    if (isExpanded !== "true") {
      await page.getByRole("button", { name: "Toggle menu" }).click();
    }
    await page.getByRole("menuitem", { name }).click();
  }
}

async function clickSvgRingStroke(page: Page, name: RegExp) {
  const ring = page.getByRole("button", { name });
  await expect(ring).toBeVisible();
  const box = await ring.boundingBox();
  expect(box).not.toBeNull();
  const handle = await ring.elementHandle();
  expect(handle).not.toBeNull();

  const center = {
    x: box!.x + box!.width / 2,
    y: box!.y + box!.height / 2,
  };
  const candidates = Array.from({ length: 72 }, (_, index) => index * 5)
    .flatMap((degrees) => {
      const radians = degrees * Math.PI / 180;
      return [0.72, 0.84, 0.96].map((scale) => ({
        x: center.x + Math.cos(radians) * box!.width * scale / 2,
        y: center.y + Math.sin(radians) * box!.height * scale / 2,
      }));
    });

  for (const point of candidates) {
    const hitsRing = await handle!.evaluate((target, candidate) => {
      return document.elementFromPoint(candidate.x, candidate.y) === target;
    }, point);
    if (hitsRing) {
      await page.mouse.click(point.x, point.y);
      return;
    }
  }

  throw new Error(`Could not find a clickable point on station impact ring ${name}`);
}

async function freezeBrowserTime(page: Page, isoTime: string) {
  await page.addInitScript(`
    {
      const fixedTime = new Date("${isoTime}").getTime();
      const RealDate = Date;
      class MockDate extends RealDate {
        constructor(...args) {
          if (args.length === 0) {
            super(fixedTime);
          } else {
            super(...args);
          }
        }
        static now() {
          return fixedTime;
        }
      }
      MockDate.UTC = RealDate.UTC;
      MockDate.parse = RealDate.parse;
      window.Date = MockDate;
    }
  `);
}

test.beforeEach(async ({ page }) => {
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
  await freezeBrowserTime(page, "2026-06-04T12:00:00-04:00");
  await page.addInitScript((storageKey) => {
    window.localStorage.setItem(storageKey, "true");
  }, disclaimerStorageKey);
});

test("requires a first-visit personal project disclaimer acknowledgement", async ({ browser, request }) => {
  await setStubMode(request, "seeded");
  const context = await browser.newContext();
  const disclaimerPage = await context.newPage();
  await freezeBrowserTime(disclaimerPage, "2026-06-04T12:00:00-04:00");

  await disclaimerPage.goto(appUrl);

  const disclaimer = disclaimerPage.getByRole("dialog", { name: "Unofficial dashboard" });
  await expect(disclaimer).toBeVisible();
  await expect(disclaimer).toContainText("LineWatch TO is a personal project that is not affiliated with, endorsed by, or operated by the TTC.");
  await expect(disclaimer).toContainText("I am not affiliated with the TTC in any capacity.");
  await expect(disclaimer).toContainText("Service alerts are fetched from TTC's public Live Alerts endpoint when live polling is enabled, with local fixture data used for offline demos and fallback mode.");

  await disclaimerPage.getByRole("button", { name: "I Understand" }).click();
  await expect(disclaimer).toHaveCount(0);

  await disclaimerPage.reload();
  await expect(disclaimerPage.getByRole("dialog", { name: "Unofficial dashboard" })).toHaveCount(0);
  await expect(disclaimerPage.getByRole("button", { name: "Center map view" })).toBeVisible();

  await context.close();
});

test("shows a subway closing soon countdown before overnight closure", async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await page.goto("/?previewTime=2026-06-04T00:45:00-04:00");

  const closingSoon = page.getByRole("status").filter({ hasText: "Subway Closing Soon" });
  await expect(closingSoon).toBeVisible();
  await expect(closingSoon).toContainText("Closes in 1 hr 15 min");
  await expect(closingSoon).toContainText("Today at 2:00 AM");
  await expect(page.getByRole("heading", { name: "Subway Closed" })).toHaveCount(0);
});

test("shows subway closed screen overnight and lets riders peek at the map", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await freezeBrowserTime(page, "2026-06-04T03:20:00-04:00");
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Subway Closed" })).toBeVisible();
  await expect(page.getByText("Monday – Saturday")).toBeVisible();
  await expect(page.getByText("Sunday")).toBeVisible();
  await expect(page.getByText(/Service resumes/i)).toBeVisible();
  await expect(page.getByText(/Today at 6:00 AM/i)).toBeVisible();
  await expect(page.getByText(/Blue Night/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Toggle menu" })).toHaveCount(0);

  await page.getByRole("button", { name: "Peek at Map" }).click();

  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
  if (isMobile) {
    await expect(page.getByRole("button", { name: "Toggle menu" })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Primary mobile navigation" })).toBeVisible();
  } else {
    await expect(page.getByRole("button", { name: "Toggle menu" })).toBeVisible();
  }
  await expect(page.getByText(/Subway closed\. Resumes Today at 6:00 AM/i)).toBeVisible();

  await page.getByRole("button", { name: "Stub Station station details" }).click();
  await expect(page.getByRole("complementary", { name: "Stub Station station details" })).toBeVisible();
  const closedArrivalsSection = page.locator('[data-arrivals-subway-closed="true"]');
  await expect(closedArrivalsSection).toBeVisible();
  await expect(closedArrivalsSection.getByRole("heading", { name: "Arrivals" })).toBeVisible();
  await expect(closedArrivalsSection.getByText(/TTC scheduled service/i)).toBeVisible();
  await expect(closedArrivalsSection.getByText("Subway Closed")).toBeVisible();
  await expect(closedArrivalsSection.getByText("Arrivals Not Available")).toBeVisible();
  await expect(closedArrivalsSection.getByText("Schedule May Be Disrupted")).toHaveCount(0);

  await page.getByRole("button", { name: "Closed Screen" }).click();
  await expect(page.getByRole("heading", { name: "Subway Closed" })).toBeVisible();
});

test("renders the seeded dashboard API payload", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await openDashboardMenu(page, isMobile);

  if (!isMobile) {
    await expect(page.getByText("Stub API Yonge-University", { exact: true })).toBeVisible();
    await expect(page.getByText("Stub API Sheppard", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Stub Station station details" })).toBeVisible();
    await expect(page.getByText(/Backend offline \(Fixture mode\)/)).toHaveCount(0);
  }

  await openServiceCategory(page, isMobile, /Delay/);
  await expect(page.getByRole("heading", { name: "Delays" })).toBeVisible();
  const menuDelayCard = page.getByRole("article").filter({
    hasText: "Delay between Sheppard-Yonge and Don Mills",
  });
  await expect(menuDelayCard).toBeVisible();
  await expect(menuDelayCard.getByText("Started", { exact: true })).toBeVisible();
  await expect(menuDelayCard.getByText("Updated", { exact: true })).toBeVisible();

  await openServiceCategory(page, isMobile, /Reduced Speed Zone/);
  await expect(page.getByRole("heading", { name: "Reduced Speed Zones" })).toBeVisible();
  await expect(page.getByText("Southbound", { exact: true })).toBeVisible();
  await expect(page.getByText("Eglinton", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Davisville", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Track issue").first()).toBeVisible();
  await expect(page.getByText("Mid-June")).toBeVisible();

  await page.locator('.alert-card').filter({ hasText: 'Eglinton' }).getByRole("button", { name: "Show on Map" }).click();
  await expect(page.locator('[data-map-highlight-id="reduced-speed-zone-stub-zone-south-source"]')).toBeAttached();
});

test("opens the site guide and blocks invalid account signup input", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  await page.getByRole("button", { name: "Open site guide" }).click();
  const guide = page.getByRole("dialog", { name: "LineWatch TO site guide" });
  await expect(guide).toBeVisible();
  await expect(guide).toContainText("What LineWatch TO Does");
  await expect(guide).toContainText("Both Ways");
  await expect(guide).toContainText("Reduced Speed Zone");
  await expect(guide).toContainText("Shuttle Badge");
  await guide.getByRole("button", { name: "Close site guide" }).click();
  await expect(guide).toHaveCount(0);

  if (isMobile) {
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("button", { name: "Create Account" }).click();
  } else {
    await page.getByRole("button", { name: "Toggle menu" }).click();
    await page.getByRole("menuitem", { name: "Create Account" }).click();
  }
  const dialog = page.getByRole("dialog", { name: "Create LineWatch TO account" });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("Email").fill("rider@localhost");
  await dialog.getByLabel("Password").fill("correct horse battery staple");
  await dialog.getByRole("button", { name: "Create Account" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Enter a valid email address.");

  await dialog.getByLabel("Email").fill("rider@example.com");
  await dialog.getByLabel("Password").fill("aaaaaaaaaa");
  await dialog.getByRole("button", { name: "Create Account" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Password must include a number, symbol, or space.");
});

test("map overlays open the corresponding submenu cards", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  await page.getByRole("button", { name: "delay: Sheppard-Yonge to Don Mills" }).click();
  await expect(page.getByRole("heading", { name: "Delays" })).toBeVisible();
  const delayCard = page.locator('[data-impact-card-id="stub-delay-line-4"]');
  await expect(delayCard).toBeVisible();
  await expect(delayCard).toHaveClass(/highlight-active-card/);

  if (isMobile) {
    await page.getByRole("button", { name: "Map", exact: true }).click();
  } else {
    await page.getByRole("button", { name: "Toggle menu" }).click();
    await page.getByRole("menuitem", { name: "Map", exact: true }).click();
  }
  await page.waitForTimeout(500);
  await clickSvgRingStroke(page, /Stub API signal problem: Stub Station/);
  await expect(page.getByRole("heading", { name: "Active Alerts" })).toBeVisible();
  const activeAlertCard = page.locator('[data-impact-card-id="stub-alert-line-1"]');
  await expect(activeAlertCard).toBeVisible();
  await expect(activeAlertCard).toHaveClass(/highlight-active-card/);
});

test("station detail shows accessibility facilities and active outage warning", async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  await page.getByRole("button", { name: "Stub Station station details" }).click();

  const stationPanel = page.getByRole("complementary", { name: "Stub Station station details" });
  await expect(stationPanel).toBeVisible();
  const lineDetailCard = stationPanel.locator('[data-station-header-line-details] > div').first();
  await expect(lineDetailCard).toBeVisible();
  const lineDetailWidths = await lineDetailCard.evaluate((card) => {
    const panel = card.closest("aside");
    if (!panel) {
      return { cardWidth: 0, innerWidth: Number.POSITIVE_INFINITY };
    }

    const cardRect = card.getBoundingClientRect();
    const panelStyles = getComputedStyle(panel);
    const innerWidth = panel.clientWidth - parseFloat(panelStyles.paddingLeft) - parseFloat(panelStyles.paddingRight);
    return { cardWidth: cardRect.width, innerWidth };
  });
  expect(lineDetailWidths.cardWidth).toBeGreaterThanOrEqual(lineDetailWidths.innerWidth - 2);
  await expect(page.getByAltText("Wheelchair accessible", { exact: true })).toBeVisible();
  await expect(page.getByAltText("Elevator available, outage reported", { exact: true })).toBeVisible();
  await expect(page.locator('[data-facility-warning="elevator"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "Arrivals" })).toBeVisible();
  await expect(page.getByText("TTC scheduled service")).toBeVisible();
  await expect(page.getByText("Schedule May Be Disrupted")).toBeVisible();
  const arrivalsSection = page.locator('[data-arrivals-disrupted="true"]');
  await expect(arrivalsSection).toBeVisible();
  await expect(arrivalsSection.getByRole("link", { name: /Jump to station impact:/ })).toBeVisible();
  await expect(arrivalsSection.locator('[data-arrival-group="line-1:Northbound to Finch"]')).toBeVisible();
  await expect(arrivalsSection.locator('[data-arrival-group="line-1:Southbound to Union"]')).toBeVisible();
  await expect(arrivalsSection.locator('[data-arrival-due="true"]')).toBeVisible();
  await expect(arrivalsSection.getByText("Northbound to Finch")).toBeVisible();
  await expect(arrivalsSection.getByText("Southbound to Union")).toBeVisible();
  await expect(arrivalsSection.getByText("Due")).toBeVisible();
  await expect(arrivalsSection.getByText("3m")).toBeVisible();
  await expect(arrivalsSection.getByText("Scheduled arrivals use TTC timetable data and are not live train predictions.")).toBeVisible();
  await expect(arrivalsSection.getByText(/demo placeholders/)).toHaveCount(0);
});

test("LineLegend clicks open view but do not highlight any card", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "desktop-only legend interaction");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
  await page.getByTitle(/View reduced speed zone/i).click();
  await expect(page.getByRole("heading", { name: "Reduced Speed Zones" })).toBeVisible();
  await expect(page.locator(".highlight-active-card")).toHaveCount(0);
  await expect(page.locator(".alert-card").first()).not.toHaveClass(/!bg-amber-950|highlight-active-card/);
});

test("renders fixture fallback when the dashboard API is unavailable", async ({ page, request, isMobile }) => {
  await setStubMode(request, "unavailable");
  await openDashboardMenu(page, isMobile);

  if (!isMobile) {
    await expect(
      page.getByText("Last Polled: fixture mode", { exact: true }).first()
    ).toBeVisible();
  }
  await expect(page.getByText("Live status", { exact: true })).toHaveCount(0);
});

test("routes active planned closures to active alerts instead of upcoming closures", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await openDashboardMenu(page, isMobile);

  if (isMobile) {
    await page.getByRole("button", { name: "Status", exact: true }).click();
    await page.locator(".mobile-status-actions").getByRole("button", { name: /Active Alert/ }).click();
  } else {
    await page.getByRole("menuitem", { name: /^Active Alerts/ }).click();
  }
  await expect(page.getByRole("heading", { name: "Active Alerts" })).toBeVisible();
  await expect(page.locator('[data-impact-card-id="stub-closure-line-1"]')).toBeVisible();

  await page.locator('[data-impact-card-id="stub-closure-line-1"]').getByRole("button", { name: "Show on Map" }).click();
  await expect(page.locator('[data-impact-card-id="stub-closure-line-1"]')).toHaveClass(/highlight-active-card/);

  if (isMobile) {
    await page.getByRole("button", { name: "Status", exact: true }).click();
    await page.locator(".mobile-status-actions").getByRole("button", { name: /Closure/ }).click();
  } else {
    await page.getByRole("button", { name: "Toggle menu" }).click();
    await page.getByRole("menuitem", { name: /upcoming closures/i }).click();
  }
  await expect(page.getByRole("heading", { name: "Upcoming Closures" })).toBeVisible();
  const upcomingClosuresPanel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Upcoming Closures" }),
  });
  await expect(upcomingClosuresPanel.locator('[data-impact-card-id="stub-closure-line-1"]')).toHaveCount(0);
  const upcomingClosureCard = upcomingClosuresPanel.locator('[data-impact-card-id="stub-upcoming-closure-line-1"]');
  await expect(upcomingClosureCard).toBeVisible();
  await expect(upcomingClosureCard.getByText("Overlapping:")).toBeVisible();
  await expect(upcomingClosureCard.getByText("Active Alert", { exact: true })).toBeVisible();
  await expect(upcomingClosureCard.getByText("Active Closure", { exact: true })).toBeVisible();
});

test("shows a compact map hint when multiple alert types overlap", async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  const overlapMarker = page.locator('[data-overlap-segment-id="stub-line-1-segment"]');
  await expect(overlapMarker).toBeVisible();
  await expect(overlapMarker).toHaveAttribute("data-overlap-collision-avoided", "true");
  await expect(overlapMarker.locator('[data-overlap-kind="suspension"]')).toBeVisible();
  await expect(overlapMarker.locator('[data-overlap-kind="planned-closure"]')).toBeVisible();

  await overlapMarker.dispatchEvent("click");
  await expect(page.getByRole("heading", { name: "Active Alerts" })).toBeVisible();
  await expect(page.locator('[data-impact-card-id="stub-alert-line-1"]')).toHaveClass(/highlight-active-card/);
});

test("opens logs dropdown and expands raw JSON payload", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  if (isMobile) {
    await page.getByRole("button", { name: "More", exact: true }).click();
  }

  // Click on the Toggle Ingestion Logs button
  await page.getByRole("button", { name: "Toggle Ingestion Logs" }).click();
  await expect(page.getByText("Ingested TTC Alerts")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Routes (1)" })).toBeVisible();

  // Click the alert accordion
  await page.getByRole("button", { name: "Seeded raw alert title for testing. Active Planned Route 1" }).click();
  await expect(page.getByText("Raw JSON Payload")).toBeVisible();
  await expect(page.locator("pre").filter({ hasText: "stub-route-raw-id" })).toBeVisible();

  // Click copy button and verify
  await page.getByRole("button", { name: "Copy JSON" }).click();
  await expect(page.getByText("Copied!")).toBeVisible();
});

test("nonlinear guide-backed overlays open their corresponding cards", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  await page.getByRole("button", { name: "reduced-speed-zone: King to Union" }).dispatchEvent("click");
  await expect(page.getByRole("heading", { name: "Reduced Speed Zones" })).toBeVisible();
  const unionCurveCard = page.locator('[data-impact-card-id="reduced-speed-zone-stub-union-curve"]');
  await expect(unionCurveCard).toBeVisible();
  await expect(unionCurveCard).toHaveClass(/highlight-active-card/);
  await expect(unionCurveCard.getByText("King", { exact: true })).toBeVisible();
  await expect(unionCurveCard.getByText("Union", { exact: true })).toBeVisible();

  if (isMobile) {
    await page.getByRole("button", { name: "Map", exact: true }).click();
  } else {
    await page.getByRole("button", { name: "Toggle menu" }).click();
    await page.getByRole("menuitem", { name: "Map", exact: true }).click();
  }
  await page.getByRole("button", { name: "delay: Spadina to St George" }).dispatchEvent("click");
  await expect(page.getByRole("heading", { name: "Delays" })).toBeVisible();
  const stGeorgeCurveCard = page.locator('[data-impact-card-id="stub-delay-st-george-curve"]');
  await expect(stGeorgeCurveCard).toBeVisible();
  await expect(stGeorgeCurveCard).toHaveClass(/highlight-active-card/);
});

test("station search dynamically filters mapped stations and opens station details", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  if (isMobile) {
    await page.getByRole("button", { name: "Search", exact: true }).click();
  } else {
    await page.getByRole("button", { name: "Search stations" }).click();
  }
  await expect(page.getByRole("searchbox", { name: "Search mapped stations" })).toBeFocused();

  await page.getByRole("searchbox", { name: "Search mapped stations" }).fill("stub");
  await expect(page.getByRole("button", { name: "Stub Station station search result" })).toBeVisible();

  await page.getByRole("searchbox", { name: "Search mapped stations" }).fill("stb stn");
  await expect(page.getByRole("button", { name: "Stub Station station search result" })).toBeVisible();

  await page.keyboard.press("Enter");
  await expect(page.getByRole("complementary", { name: "Stub Station station details" })).toBeVisible();
  await expect(page.locator('[data-station-search-panel][data-open="false"]')).toBeVisible();
});

test("station search browses fallback station lists by line", async ({ page, request, isMobile }) => {
  await setStubMode(request, "unavailable");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  if (isMobile) {
    await page.getByRole("button", { name: "Search", exact: true }).click();
  } else {
    await page.getByRole("button", { name: "Search stations" }).click();
  }
  await page.getByRole("button", { name: /Line 5\s+Eglinton Crosstown/ }).click();
  await expect(page.getByRole("button", { name: "Mount Dennis station search result" })).toBeVisible();

  await page.getByRole("button", { name: "Mount Dennis station search result" }).click();
  await expect(page.getByRole("complementary", { name: "Mount Dennis station details" })).toBeVisible();
  await expect(page.getByText("Backend unavailable. Showing local fallback station data.")).toBeVisible();
});

test("drag after focus zoom cancels animation and retains transform", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "desktop-only map controls drag behavior");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  // Verify the control rail styling and visibility
  const rail = page.locator(".map-control-rail");
  await expect(rail).toBeVisible();
  await expect(rail).toHaveCSS("border-radius", "8px");

  // Click a station to trigger focus zoom animation
  await page.getByRole("button", { name: "Stub Station station details" }).click();
  await page.waitForTimeout(100); // let it start animating

  // Locate the map wrapper
  const mapElement = page.locator(".absolute.top-0.left-0.w-full.h-full.origin-top-left").first();

  // Get initial transform style
  const initialTransform = await mapElement.evaluate((el) => el.style.transform);

  // Drag the map slightly
  const viewport = page.locator(".cursor-grab").first();
  const dragBox = await viewport.boundingBox();
  expect(dragBox).not.toBeNull();
  
  const startX = dragBox!.x + dragBox!.width / 4;
  const startY = dragBox!.y + dragBox!.height / 3;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 100, startY + 100, { steps: 5 });
  await page.mouse.up();

  // Verify the transform has updated and does not snap back after a delay
  await page.waitForTimeout(600);
  const finalTransform = await mapElement.evaluate((el) => el.style.transform);
  expect(finalTransform).not.toEqual(initialTransform);
});

test("keyboard opens and closes the main menu", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "desktop-only menu keyboard accessibility");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  await page.getByRole("button", { name: "Toggle menu" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.waitForTimeout(100);

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("End");
  await page.keyboard.press("Escape");

  await expect(page.getByRole("menu")).toBeHidden();
  await expect(page.getByRole("button", { name: "Toggle menu" })).toBeFocused();
});

test("keyboard searches and selects a station", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "desktop-only search keyboard accessibility");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  await page.getByRole("button", { name: "Search stations" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("searchbox", { name: "Search mapped stations" })).toBeFocused();

  await page.keyboard.type("Stub");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  await expect(page.getByRole("complementary", { name: "Stub Station station details" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Search stations" })).toBeFocused();
});

test("demo account shows account-backed saved commutes", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  if (isMobile) {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("button", { name: "Demo Account" }).click();
    await expect(page.getByRole("heading", { name: "Saved Commutes" })).toBeVisible();
  } else {
    await openDashboardMenu(page, isMobile);
    await page.getByRole("menuitem", { name: "Demo account" }).click({ force: true });
    await page.getByRole("button", { name: "Toggle menu" }).click({ force: true });
    await page.getByRole("menuitem", { name: "Saved Commutes" }).click({ force: true });
  }

  await expect(page.getByText("Demo account").filter({ visible: true })).toBeVisible();
  await expect(page.getByText("Stub Station -> Union")).toBeVisible();
  await expect(page.getByText("Default scheduled route: 5 stations on Line 1, about 13 min")).toBeVisible();
  await expect(page.getByText("Affected now", { exact: true })).toBeVisible();
  await expect(page.getByText("Suspension", { exact: true })).toBeVisible();
  await expect(page.getByText(/Line 1: Stub Station to Stub Terminal/)).toBeVisible();

  await page.getByRole("button", { name: /View 5 stops/ }).click();
  await expect(page.getByRole("list", { name: "Stops for Morning commute" })).toBeVisible();
  const stopsList = page.getByRole("list", { name: "Stops for Morning commute" });
  await expect(stopsList.getByText("Stub Station", { exact: true })).toBeVisible();
  await expect(stopsList.getByText("stub-union", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "View path on map" }).click();
  await expect(page.locator("[data-commute-path-preview]")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Viewing" })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click({ force: true });
  await expect(page.locator("[data-commute-path-preview]")).toHaveCount(0);
});

test("requests and confirms a password reset from the sign-in dialog", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  if (isMobile) {
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("button", { name: "Sign In" }).click();
  } else {
    await page.getByRole("button", { name: "Toggle menu" }).click();
    await page.getByRole("menuitem", { name: "Sign In" }).click();
  }

  const signInDialog = page.getByRole("dialog", { name: /Sign in/i });
  await expect(signInDialog).toBeVisible();
  await signInDialog.getByRole("button", { name: "Forgot Password?" }).click();

  const resetDialog = page.getByRole("dialog", { name: "Reset LineWatch TO password" });
  await expect(resetDialog).toBeVisible();
  await resetDialog.getByLabel("Email").fill("rider@example.com");
  await resetDialog.getByRole("button", { name: "Send Reset Link" }).click();
  await expect(resetDialog.getByRole("status")).toContainText("If an account exists");
  await resetDialog.getByRole("button", { name: "Open Local Reset Form" }).click();

  const confirmDialog = page.getByRole("dialog", { name: "Choose a new LineWatch TO password" });
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByLabel("New password").fill("new correct horse 2");
  await confirmDialog.getByLabel("Confirm password").fill("new correct horse 2");
  await confirmDialog.getByRole("button", { name: "Reset Password" }).click();
  await expect(confirmDialog).toHaveCount(0);

  if (isMobile) {
    await page.getByRole("button", { name: "More", exact: true }).click();
  }
  await expect(page.getByText("Rider").filter({ visible: true })).toBeVisible();
});

test("opens emailed password reset links directly", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await page.goto("/reset-password?token=smoke-reset-token");

  const confirmDialog = page.getByRole("dialog", { name: "Choose a new LineWatch TO password" });
  await expect(confirmDialog).toBeVisible();
  await expect(confirmDialog.getByText("Enter a new password to finish recovery.")).toBeVisible();
  await expect(confirmDialog.getByLabel("Reset token")).toHaveCount(0);
  await confirmDialog.getByLabel("New password").fill("new correct horse 2");
  await confirmDialog.getByLabel("Confirm password").fill("new correct horse 2");
  await confirmDialog.getByRole("button", { name: "Reset Password" }).click();
  await expect(confirmDialog).toHaveCount(0);
  await expect(page).toHaveURL("/");

  if (isMobile) {
    await page.getByRole("button", { name: "More", exact: true }).click();
  }
  await expect(page.getByText("Rider").filter({ visible: true })).toBeVisible();
});

test("shows official TTC performance metrics from backend", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  if (isMobile) {
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("button", { name: "Reliability Analytics" }).click();
  } else {
    await page.getByRole("button", { name: "Toggle menu" }).click();
    await page.getByRole("menuitem", { name: "Reliability Analytics" }).click();
  }
  await expect(page.getByText("Official TTC Performance")).toBeVisible();
  await expect(page.getByText("Source: TTC.ca")).toBeVisible();

  const line1Row = page.locator(".reliability-row").filter({ has: page.locator("strong", { hasText: /^Line 1 Yonge-University$/ }) });
  await expect(line1Row).toBeVisible();
  await expect(line1Row.getByText("94%")).toBeVisible();

  const elevatorsRow = page.locator(".reliability-row").filter({ has: page.locator("strong", { hasText: /^Elevators$/ }) });
  await expect(elevatorsRow).toBeVisible();
  await expect(elevatorsRow.getByText("99%")).toBeVisible();
});

test("mobile uses bottom navigation and status sheets", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "mobile-only bottom navigation smoke");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  await expect(page.getByRole("navigation", { name: "Primary mobile navigation" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Toggle menu" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open current service status" })).toBeVisible();

  await page.getByRole("button", { name: "Status", exact: true }).click();
  await expect(page.getByRole("heading", { name: "System Status" })).toBeVisible();
  await page.locator(".mobile-status-actions").getByRole("button", { name: /Delay/ }).click();
  await expect(page.getByRole("heading", { name: "Delays" })).toBeVisible();

  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("searchbox", { name: "Search mapped stations" })).toBeFocused();

  await page.getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByRole("heading", { name: "More" })).toBeVisible();
  await expect(page.getByRole("button", { name: /High Contrast Mode/ })).toBeVisible();
});
