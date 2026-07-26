import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const appUrl = "http://127.0.0.1:4173";
const stubUrl = "http://127.0.0.1:4174";
const disclaimerStorageKey = "linewatch-disclaimer-ack-v1";

async function setStubMode(request: APIRequestContext, mode: "seeded" | "unavailable" | "map-authoritative-overlap") {
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

async function expectStaticMobileMapEffects(page: Page) {
  const shell = page.locator(".linewatch-shell");
  await expect(shell).toHaveClass(/mobile-performance-mode/);

  const glow = page.locator(".asset-alert-path-glow").first();
  await expect(glow).toBeAttached();
  await expect(glow).toHaveCSS("animation-name", "none");
  await expect(glow).toHaveCSS("filter", "none");

  const mapFlash = page.locator(".asset-alert-path.map-selection-flash").first();
  await expect(mapFlash).toBeAttached();
  await expect(mapFlash).toHaveCSS("animation-name", "none");
  await expect(mapFlash).toHaveCSS("filter", "none");

  const mapLayer = page.locator(".ttc-svg-container").locator("xpath=..").first();
  await expect(mapLayer).toHaveCSS("transition-property", "none");
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
    // Suppress the PWA install nudge during smoke tests to avoid UI layout conflicts
    window.localStorage.setItem("linewatch-pwa-install-dismissed-at-v1", String(Date.now()));
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
  await expect(disclaimer).toContainText("LineWatchTO is a personal project that is not affiliated with, endorsed by, or operated by the TTC.");
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
  await expect(closingSoon).toContainText(/at 2:00 am/i);
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
  await expect(page.locator(".subway-closed-peek-title")).toHaveText(/Subway Closed/i);
  await expect(page.locator(".subway-closed-peek-subtitle")).toHaveText(/Resumes Today at 6:00 AM/i);

  if (!isMobile) {
    const searchBox = await page.locator(".header-search-bar").boundingBox();
    const closedNoticeBox = await page.locator(".subway-closed-peek-chip").boundingBox();
    expect(searchBox).not.toBeNull();
    expect(closedNoticeBox).not.toBeNull();
    expect(closedNoticeBox!.x).toBeGreaterThanOrEqual(searchBox!.x + searchBox!.width);

    const networkSelector = page.getByRole("group", { name: "Select transit network" });
    await networkSelector.getByRole("button", { name: "GO/UP", exact: true }).click();
    await expect(page.locator(".subway-closed-peek-chip")).toHaveCount(0);
    await networkSelector.getByRole("button", { name: "TTC", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Subway Closed" })).toHaveCount(0);
    await expect(page.locator(".subway-closed-peek-chip")).toBeVisible();
  }

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

test("switches the complete dashboard to the fixture-backed regional network", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "network selection is desktop-only");
  await setStubMode(request, "seeded");
  await page.goto("/");

  const networkSelector = page.getByRole("group", { name: "Select transit network" });
  const mapSurface = page.locator(".network-map-transition-surface");
  const root = page.locator("html");
  const mapLegend = mapSurface.locator(".desktop-map-legend");
  await expect(networkSelector.getByRole("button", { name: "TTC", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(mapLegend.getByText("Line 1 Yonge-University", { exact: true })).toBeVisible();
  await expect(mapSurface.locator(".ttc-svg-container")).toHaveCount(1);
  await expect(mapSurface.locator(".regional-map")).toHaveCount(0);
  await expect(mapSurface).toHaveCSS("view-transition-name", "none");
  await networkSelector.getByRole("button", { name: "GO/UP", exact: true }).click();

  await expect(root).toHaveAttribute("data-network-transition-direction", "forward");
  await expect(mapSurface.locator(".ttc-svg-container")).toHaveCount(0);
  await expect(mapSurface.locator(".regional-map")).toHaveCount(1);
  await expect(page.getByRole("region", { name: "Interactive GO and UP map" })).toBeVisible();
  await expect.poll(async () => {
    const box = await mapLegend.boundingBox();
    return box ? box.x + box.width <= page.viewportSize()!.width + 1 : false;
  }).toBe(true);
  await expect(mapLegend.getByText("Barrie Line", { exact: true })).toBeVisible();
  await expect(root).not.toHaveAttribute("data-network-transition-direction");
  await expect(mapSurface).toHaveCSS("view-transition-name", "none");
  await expect(page.getByText("Last Polled: regional fixture mode", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fit regional network" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Toggle live train markers" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Subway Closed" })).toHaveCount(0);

  const regionalStage = page.locator(".regional-map-stage");
  const initialCamera = await regionalStage.evaluate((element) => (element as HTMLElement).style.transform);
  const initialViewBox = await regionalStage.locator(":scope > svg").getAttribute("viewBox");
  const initialViewport = page.viewportSize();
  expect(initialViewport).not.toBeNull();
  await page.setViewportSize({
    width: Math.max(initialViewport!.width - 120, 360),
    height: Math.max(initialViewport!.height - 80, 540),
  });
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  await expect.poll(() => regionalStage.evaluate((element) => (element as HTMLElement).style.transform)).toBe(initialCamera);
  await expect(regionalStage.locator(":scope > svg")).toHaveAttribute("viewBox", initialViewBox!);

  const weston = page.locator('[data-regional-station-id="weston"]');
  await expect(weston).toHaveAttribute("tabindex", "0");
  await weston.press("Enter");
  await expect(page.getByRole("complementary", { name: "Weston regional station details" })).toBeVisible();

  await networkSelector.getByRole("button", { name: "TTC", exact: true }).click();
  await expect(root).toHaveAttribute("data-network-transition-direction", "back");
  await expect(mapSurface.locator(".ttc-svg-container")).toHaveCount(1);
  await expect(mapSurface.locator(".regional-map")).toHaveCount(0);
  await expect.poll(async () => {
    const box = await mapLegend.boundingBox();
    return box ? box.x + box.width <= page.viewportSize()!.width + 1 : false;
  }).toBe(true);
  await expect(mapLegend.getByText("Line 1 Yonge-University", { exact: true })).toBeVisible();
  await expect(root).not.toHaveAttribute("data-network-transition-direction");
  await expect(mapSurface).toHaveCSS("view-transition-name", "none");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Interactive GO and UP map" })).toBeHidden();
});

test("renders the seeded dashboard API payload", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await openDashboardMenu(page, isMobile);

  if (!isMobile) {
    await expect(page.getByText("Stub API Yonge-University", { exact: true })).toBeVisible();
    await expect(page.getByText("Stub API Sheppard", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Stub Station station details" })).toBeVisible();
    await expect(page.getByText(/Backend offline \(Fixture mode\)/)).toHaveCount(0);

    const countBadges = page.locator(".desktop-header-impact-chips .desktop-status-chip-count");
    await expect(countBadges).toHaveCount(4);
    const doubleDigitBadgeMetrics = await countBadges.nth(2).evaluate((badge) => {
      const value = badge.querySelector<HTMLElement>(".desktop-status-chip-count-value");
      if (!value) throw new Error("Missing desktop status count value");
      value.textContent = "11";
      badge.setAttribute("data-digit-count", "multiple");
      const badgeBounds = badge.getBoundingClientRect();
      const valueBounds = value.getBoundingClientRect();
      return {
        badgeHeight: badgeBounds.height,
        badgeWidth: badgeBounds.width,
        badgeFontFamily: getComputedStyle(badge).fontFamily,
        buttonFontFamily: getComputedStyle(badge.closest("button")!).fontFamily,
        horizontalOpticalOffset:
          badgeBounds.left + badgeBounds.width / 2 - (valueBounds.left + valueBounds.width / 2),
        verticalCenterDelta: Math.abs(
          badgeBounds.top + badgeBounds.height / 2 - (valueBounds.top + valueBounds.height / 2),
        ),
      };
    });
    expect(doubleDigitBadgeMetrics.badgeWidth).toBe(32);
    expect(doubleDigitBadgeMetrics.badgeHeight).toBe(32);
    expect(doubleDigitBadgeMetrics.badgeFontFamily).toBe(doubleDigitBadgeMetrics.buttonFontFamily);
    expect(doubleDigitBadgeMetrics.horizontalOpticalOffset).toBeGreaterThanOrEqual(0.5);
    expect(doubleDigitBadgeMetrics.horizontalOpticalOffset).toBeLessThanOrEqual(1);
    expect(doubleDigitBadgeMetrics.verticalCenterDelta).toBeLessThanOrEqual(1);
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

  if (isMobile) {
    await expectStaticMobileMapEffects(page);
    const inspector = page.locator('[data-mobile-impact-inspector]');
    await expect(inspector).toBeVisible();
    await expect(inspector).toContainText("Reduced Speed Zone");
    await expect(inspector).toContainText("Eglinton");
    await expect(page.getByRole("button", { name: "Map", exact: true })).toHaveCount(0);
    await expect(inspector).toContainText("Started");
    await inspector.getByRole("button", { name: "Show more map" }).click();
    await expect(inspector.getByText("Started", { exact: true })).toHaveCount(0);
    await expect(inspector.getByRole("button", { name: "Show more details" })).toBeVisible();
    await inspector.getByRole("button", { name: "View in List" }).click();
    await expect(page.getByRole("heading", { name: "Reduced Speed Zones" })).toBeVisible();
    await expect(page.locator('[data-impact-card-id="reduced-speed-zone-stub-zone-south-source"]')).toHaveClass(/highlight-active-card/);
  }
});

test("opens an impact notification deep link in the focused map view", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await page.goto("/?panel=delays&impactKind=delay&impactId=stub-delay-line-4");

  await expect(page.locator('[data-map-highlight-id="stub-delay-line-4"]')).toBeAttached();
  await expect(page.getByRole("heading", { name: "Delays" })).toHaveCount(0);

  if (isMobile) {
    const shell = page.locator(".linewatch-shell");
    const inspector = page.locator('[data-mobile-impact-inspector]');
    const mapViewport = shell.locator(":scope > main");

    await expect(shell).toHaveClass(/mobile-map-inspector-impact/);
    await expect(inspector).toBeVisible();
    await expect(inspector).toContainText("Delay");
    await expect(inspector).toContainText("Sheppard-Yonge");
    await expect(mapViewport).toHaveCSS("bottom", /^(?!0px$).+/);
    await expect(page.locator(".network-map-transition-surface").getByLabel("Zoom level slider")).toHaveValue("3.8");
  }
});

test("opens the site guide and blocks invalid account signup input", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  await page.getByRole("button", { name: "Open site guide" }).click();
  const guide = page.getByRole("dialog", { name: "LineWatchTO site guide" });
  await expect(guide).toBeVisible();
  await expect(guide).toContainText("What LineWatchTO Does");
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
  const choiceDialog = page.getByRole("dialog", { name: "Choose how to create a LineWatchTO account" });
  await expect(choiceDialog).toBeVisible();
  await choiceDialog.getByRole("button", { name: "Continue With Email" }).click();

  const dialog = page.getByRole("dialog", { name: "Create LineWatchTO account" });
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

  if (isMobile) {
    const inspector = page.locator('[data-mobile-impact-inspector]');
    await expect(inspector).toBeVisible();
    await expect(inspector).toContainText("Delay");
    await expect(inspector).toContainText("Sheppard-Yonge");
    await expect(page.locator('[data-map-highlight-id="stub-delay-line-4"]')).toBeAttached();
    await inspector.getByRole("button", { name: "View in List" }).click();
  }

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
  await page.getByRole("button", { name: "Center map view" }).click();
  await page.waitForTimeout(500);
  await clickSvgRingStroke(page, /Stub API signal problem: Stub Station/);

  if (isMobile) {
    const inspector = page.locator('[data-mobile-impact-inspector]');
    await expect(inspector).toBeVisible();
    await expect(inspector.getByRole("heading", { name: "Active Alert", exact: true })).toBeVisible();
    await expect(inspector).not.toContainText("Stub API signal problem");
    await inspector.getByRole("button", { name: "View in List" }).click();
  }

  await expect(page.getByRole("heading", { name: "Active Alerts" })).toBeVisible();
  const activeAlertCard = page.locator('[data-impact-card-id="stub-alert-line-1"]');
  await expect(activeAlertCard).toBeVisible();
  await expect(activeAlertCard).toHaveClass(/highlight-active-card/);
});

test("affected segment targets distinguish dragging from selection", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  const target = page.getByRole("button", { name: "delay: Sheppard-Yonge to Don Mills" });
  await expect(target).toBeVisible();
  await expect(target).toHaveClass("map-segment-hit-target");
  await expect(target).toHaveCSS("stroke-width", "96px");
  await page.waitForTimeout(900);

  const mapElement = page.locator(".absolute.top-0.left-0.w-full.h-full.origin-top-left").first();
  const initialTransform = await mapElement.evaluate((element) => element.style.transform);
  const start = await target.evaluate((element) => {
    const path = element as SVGPathElement;
    const point = path.getPointAtLength(path.getTotalLength() / 2);
    const matrix = path.getScreenCTM();
    if (!matrix) throw new Error("Missing segment screen transform");
    return {
      x: point.x * matrix.a + point.y * matrix.c + matrix.e,
      y: point.x * matrix.b + point.y * matrix.d + matrix.f,
    };
  });

  if (isMobile) {
    const viewport = page.locator(".touch-none").first();
    await target.dispatchEvent("pointerdown", {
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true,
      clientX: start.x,
      clientY: start.y,
      buttons: 1,
    });
    await viewport.dispatchEvent("pointermove", {
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true,
      clientX: start.x + 48,
      clientY: start.y + 24,
      buttons: 1,
    });
    await page.waitForTimeout(32);
    await viewport.dispatchEvent("pointerup", {
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true,
      clientX: start.x + 48,
      clientY: start.y + 24,
      buttons: 0,
    });
  } else {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 48, start.y + 24, { steps: 4 });
    await page.mouse.up();
  }

  expect(await mapElement.evaluate((element) => element.style.transform)).not.toEqual(initialTransform);
  await expect(page.locator('[data-mobile-impact-inspector]')).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Delays" })).toHaveCount(0);

  await target.click();
  await expect(target).toHaveClass(/selection-context/);
  await expect(target).toHaveCSS("stroke-width", "190px");
  await expect(page.locator('[data-station-id="stub-station"]')).toHaveAttribute("r", "32");
  if (isMobile) {
    await expect(page.locator('[data-mobile-impact-inspector]')).toBeVisible();
  } else {
    await expect(page.getByRole("heading", { name: "Delays" })).toBeVisible();
  }
});

test("mobile keeps lightweight map focus flashes and menu transitions", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "mobile-only motion smoke");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  await openServiceCategory(page, isMobile, /Reduced Speed Zone/);
  await page
    .locator(".alert-card")
    .filter({ hasText: "Eglinton" })
    .getByRole("button", { name: "Show on Map" })
    .click();

  const mapFlash = page.locator('[data-map-highlight-id="reduced-speed-zone-stub-zone-south-source"]').first();
  await expect(mapFlash).toBeAttached();
  await expect
    .poll(async () => mapFlash.evaluate((element) => getComputedStyle(element).animationName))
    .toBe("none");
  await expect
    .poll(async () => mapFlash.evaluate((element) => getComputedStyle(element).filter))
    .toBe("none");

  await page.locator('[data-mobile-impact-inspector]').getByRole("button", { name: "Unfocus impact" }).click();
  await page.getByRole("button", { name: "Stub Station station details" }).click();

  await expect(page.locator('[data-station-selected-id="stub-station"]')).toHaveCSS("fill", "rgb(129, 201, 255)");
  const stationFlash = page.locator('[data-map-highlight-id="stub-station"]').first();
  await expect(stationFlash).toBeAttached();
  await expect(stationFlash).toHaveAttribute("data-station-selection-foreground", "stub-station");
  await expect(stationFlash).toHaveCSS("fill", "rgb(129, 201, 255)");
  await expect
    .poll(async () => stationFlash.evaluate((element) => getComputedStyle(element).animationName))
    .toBe("none");
  await expect
    .poll(async () => stationFlash.evaluate((element) => getComputedStyle(element).filter))
    .toBe("none");

  await page.getByRole("button", { name: "Close station details" }).click();
  const searchNavItem = page.getByRole("button", { name: "Search", exact: true });
  const navTransitionProperty = await searchNavItem.evaluate((element) => getComputedStyle(element).transitionProperty);
  expect(navTransitionProperty).toContain("transform");
  expect(navTransitionProperty).not.toContain("width");

  await searchNavItem.click();
  const searchPanel = page.locator("[data-station-search-panel]");
  await expect(searchPanel).toBeVisible();
  // Initially, the nav bar is visible
  await expect(page.getByRole("navigation", { name: "Primary mobile navigation" })).toHaveCount(1);
  // Focus the input to move elements up and hide navigation
  await page.getByRole("searchbox", { name: "Station Search" }).click();
  await expect(page.getByRole("navigation", { name: "Primary mobile navigation" })).toHaveCount(0);
  const searchTransitionProperty = await searchPanel.evaluate((element) => getComputedStyle(element).transitionProperty);
  expect(searchTransitionProperty).toContain("opacity");
  expect(searchTransitionProperty).toContain("transform");
  expect(searchTransitionProperty).not.toContain("width");
});

test("mobile closing station details preserves the focused map camera", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "mobile-only station camera behavior");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  const mapLayer = page.locator(".absolute.top-0.left-0.w-full.h-full.origin-top-left").first();
  const defaultTransform = await mapLayer.evaluate((element) => element.style.transform);

  await page.getByRole("button", { name: "Stub Station station details" }).click();
  await expect(page.getByRole("complementary", { name: "Stub Station station details" })).toBeVisible();
  await expect
    .poll(async () => mapLayer.evaluate((element) => element.style.transform))
    .not.toBe(defaultTransform);

  const focusedTransform = await mapLayer.evaluate((element) => element.style.transform);

  await page.getByRole("button", { name: "Close station details" }).click();
  await expect(page.getByRole("complementary", { name: "Stub Station station details" })).toHaveCount(0);
  await page.waitForTimeout(500);

  await expect
    .poll(async () => mapLayer.evaluate((element) => element.style.transform))
    .toBe(focusedTransform);
});

test("desktop closing station details returns to the centered map camera", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "desktop-only station camera behavior");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  const mapLayer = page.locator(".absolute.top-0.left-0.w-full.h-full.origin-top-left").first();
  const defaultTransform = await mapLayer.evaluate((element) => element.style.transform);

  await page.getByRole("button", { name: "Stub Station station details" }).click();
  await expect(page.getByRole("complementary", { name: "Stub Station station details" })).toBeVisible();
  await expect
    .poll(async () => mapLayer.evaluate((element) => element.style.transform))
    .not.toBe(defaultTransform);

  await page.getByRole("button", { name: "Close station details" }).click();
  await expect(page.getByRole("complementary", { name: "Stub Station station details" })).toHaveCount(0);

  await expect
    .poll(async () => mapLayer.evaluate((element) => element.style.transform))
    .toBe(defaultTransform);
});

test("mobile rotated map mode keeps station and impact selections in the rotated HUD", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "mobile-only rotated map smoke");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  await page.getByRole("button", { name: "Rotate map" }).click();
  const shell = page.locator(".linewatch-shell");
  await expect(shell).toHaveClass(/mobile-map-rotated/);
  await expect(page.getByRole("navigation", { name: "Primary mobile navigation" })).toHaveCount(0);
  await expect(page.locator(".mobile-status-peek")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Toggle live train markers" })).toHaveCount(0);

  const mainDimensions = await page.locator(".linewatch-shell > main").evaluate((element) => ({
    clientWidth: element.clientWidth,
    clientHeight: element.clientHeight,
    visualWidth: element.getBoundingClientRect().width,
    visualHeight: element.getBoundingClientRect().height,
  }));
  expect(mainDimensions.clientWidth).toBeGreaterThan(mainDimensions.clientHeight);
  expect(mainDimensions.visualHeight).toBeGreaterThan(mainDimensions.visualWidth);

  await page.locator('[data-overlap-segment-id="stub-line-1-segment"]').dispatchEvent("click");
  const rotatedChooser = page.locator("[data-overlap-chooser]");
  const rotatedControls = page.locator(".rotated-map-hud");
  await expect(rotatedChooser).toBeVisible();
  await expect(rotatedControls).toBeVisible();
  await expect.poll(async () => {
    const chooserBox = await rotatedChooser.boundingBox();
    const controlsBox = await rotatedControls.boundingBox();
    if (!chooserBox || !controlsBox) return true;
    return chooserBox.x < controlsBox.x + controlsBox.width
      && chooserBox.x + chooserBox.width > controlsBox.x
      && chooserBox.y < controlsBox.y + controlsBox.height
      && chooserBox.y + chooserBox.height > controlsBox.y;
  }).toBe(false);
  await rotatedChooser.getByRole("button", { name: "Close alert chooser" }).click();

  await page.getByRole("button", { name: "delay: Sheppard-Yonge to Don Mills" }).dispatchEvent("click");
  await expect(page.locator('[data-map-highlight-id="stub-delay-line-4"]')).toBeAttached();
  await expect(page.locator("[data-mobile-impact-inspector]")).toHaveCount(0);
  await expect(page.locator("[data-rotated-map-selection-card]")).toBeVisible();
  await expect(page.locator(".rotated-map-selection-hud")).toHaveClass(/rotated-map-selection-hud-impact-selection/);
  await expect(page.locator("[data-rotated-map-selection-card]")).toContainText("Selected Service Impact");
  await expect(page.locator("[data-rotated-map-selection-card]")).toContainText("Sheppard-Yonge");

  await page.locator("[data-rotated-map-selection-card]").getByRole("button", { name: "Details" }).click();
  await expect(shell).not.toHaveClass(/mobile-map-rotated/);
  const inspector = page.locator("[data-mobile-impact-inspector]");
  await expect(inspector).toBeVisible();
  await expect(inspector).toContainText("Delay");

  await inspector.getByRole("button", { name: "Unfocus impact" }).click();
  await page.getByRole("button", { name: "Rotate map" }).click();
  await page.getByRole("button", { name: "Stub Station station details" }).click();
  await expect(page.locator("[data-rotated-map-selection-card]")).toBeVisible();
  await expect(page.locator(".rotated-map-selection-hud")).toHaveClass(/rotated-map-selection-hud-station-selection/);
  await expect(page.locator("[data-rotated-map-selection-card]")).toContainText("Station");
  await expect(page.locator("[data-rotated-map-selection-card]")).toContainText("Stub Station");
  await expect(page.getByRole("complementary", { name: "Stub Station station details" })).toHaveCount(0);

  await page.locator("[data-rotated-map-selection-card]").getByRole("button", { name: "Details" }).click();
  await expect(shell).not.toHaveClass(/mobile-map-rotated/);
  await expect(page.getByRole("complementary", { name: "Stub Station station details" })).toBeVisible();
});

test("station detail shows accessibility facilities and active outage warning", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  await page.getByRole("button", { name: "Stub Station station details" }).click();

  const stationPanel = page.getByRole("complementary", { name: "Stub Station station details" });
  await expect(stationPanel).toBeVisible();

  if (isMobile) {
    await expect(page.locator(".linewatch-shell.mobile-map-inspector-station")).toBeVisible();
    await expect(page.getByRole("button", { name: "Map", exact: true })).toHaveCount(0);
  }
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
  await expect(stationPanel.getByAltText("Wheelchair accessible", { exact: true })).toBeVisible();
  await expect(stationPanel.getByAltText("Elevator available, outage reported", { exact: true })).toBeVisible();
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
  await expect(arrivalsSection.getByText("Northbound", { exact: true })).toBeVisible();
  await expect(arrivalsSection.getByText("To Finch", { exact: true })).toBeVisible();
  await expect(arrivalsSection.getByText("Southbound", { exact: true })).toBeVisible();
  await expect(arrivalsSection.getByText("To Union", { exact: true })).toBeVisible();
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

test("shows an active planned closure in both current and scheduled views", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await openDashboardMenu(page, isMobile);

  if (isMobile) {
    await page.getByRole("button", { name: "Status", exact: true }).click();
    await page.locator(".mobile-status-actions").getByRole("button", { name: /Active Alert/ }).click();
  } else {
    await page.getByRole("menuitem", { name: /^Active Alerts/ }).click();
  }
  await expect(page.getByRole("heading", { name: "Active Alerts" })).toBeVisible();
  const activeClosureChildCard = page.locator('[data-impact-card-id="stub-active-closure-child-line-1"]');
  await expect(activeClosureChildCard).toBeVisible();
  await expect(activeClosureChildCard.getByText("Planned Closure", { exact: true })).toBeVisible();
  await expect(activeClosureChildCard.getByRole("button", { name: "View related planned closure details" })).toBeVisible();

  await activeClosureChildCard.getByRole("button", { name: "Show on Map" }).click();
  if (isMobile) {
    const inspector = page.locator('[data-mobile-impact-inspector]');
    await expect(inspector).toBeVisible();
    await inspector.getByRole("button", { name: "View in List" }).click();
  }
  await expect(page.locator('[data-impact-card-id="stub-active-closure-child-line-1"]')).toHaveClass(/highlight-active-card/);

  await activeClosureChildCard.getByRole("button", { name: "View related planned closure details" }).click();
  if (isMobile) {
    const relatedClosureInspector = page.locator('[data-mobile-impact-inspector]');
    await expect(relatedClosureInspector.getByText("Active Closure Window", { exact: true })).toBeVisible();
    await relatedClosureInspector.getByRole("button", { name: "View in List" }).click();
  }
  await expect(page.getByRole("heading", { name: "Planned Closures" })).toBeVisible();
  await expect(page.locator('[data-impact-card-id="stub-closure-line-1"]')).toHaveClass(/highlight-active-card/);

  if (isMobile) {
    await page.getByRole("button", { name: "Status", exact: true }).click();
    await page.locator(".mobile-status-actions").getByRole("button", { name: /Closure/ }).click();
  } else {
    await page.getByRole("button", { name: "Toggle menu" }).click();
    await page.getByRole("menuitem", { name: /planned closures/i }).click();
  }
  await expect(page.getByRole("heading", { name: "Planned Closures" })).toBeVisible();
  const plannedClosuresPanel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Planned Closures" }),
  });
  const activeClosureCard = plannedClosuresPanel.locator('[data-impact-card-id="stub-closure-line-1"]');
  await expect(activeClosureCard).toBeVisible();
  await expect(activeClosureCard.getByText("Active Now", { exact: true })).toBeVisible();
  await expect(activeClosureCard.getByText("Closure hours", { exact: true })).toBeVisible();
  await expect(activeClosureCard.getByText("11:59 PM – 3:30 AM", { exact: true })).toBeVisible();
  await expect(activeClosureCard.getByText("Closure dates", { exact: true })).toBeVisible();
  await expect(activeClosureCard.getByText("Mon, Jul 20 – Wed, Jul 22", { exact: true })).toBeVisible();
  await expect(activeClosureCard.getByText("Current window", { exact: true })).toBeVisible();
  await expect(activeClosureCard.getByText("Wed 11:59 PM – Thu 3:30 AM", { exact: true })).toBeVisible();
  await expect.poll(async () => activeClosureCard.locator(".planned-closure-schedule dd").evaluateAll((values) =>
    values.every((value) => value.scrollWidth <= value.clientWidth),
  )).toBe(true);
  const upcomingClosureCard = plannedClosuresPanel.locator('[data-impact-card-id="stub-upcoming-closure-line-1"]');
  await expect(upcomingClosureCard).toBeVisible();
  await expect(upcomingClosureCard.getByText("Overlap:")).toBeVisible();
  await expect(upcomingClosureCard.getByText("Active Alert", { exact: true })).toHaveCount(2);
  await expect(upcomingClosureCard.getByText("Active Closure", { exact: true })).toHaveCount(0);
});

test("shows a compact map hint when multiple alert types overlap", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  const overlapMarker = page.locator('[data-overlap-segment-id="stub-line-1-segment"]');
  await expect(overlapMarker).toBeVisible();
  await expect(overlapMarker).toHaveAttribute("data-overlap-collision-avoided", "true");
  await expect(overlapMarker.locator('[data-overlap-kind="suspension"]')).toBeVisible();
  await expect(overlapMarker.locator('[data-overlap-kind="planned-closure"]')).toBeVisible();
  const overlapMarkerBox = await overlapMarker.boundingBox();

  if (!isMobile && overlapMarkerBox) {
    await page.mouse.move(
      overlapMarkerBox.x + overlapMarkerBox.width / 2,
      overlapMarkerBox.y + overlapMarkerBox.height / 2,
    );
    await expect.poll(() => page.locator("[data-hover-priority-impact]").count()).toBeGreaterThan(0);
  }

  await overlapMarker.dispatchEvent("click");
  await expect(page.locator("[data-hover-priority-impact]")).toHaveCount(0);
  const overlapChooser = page.locator("[data-overlap-chooser]");
  await expect.poll(async () => overlapChooser.evaluate((element) =>
    element.getAnimations().some((animation) => animation.playState === "running"),
  ), { timeout: 500 }).toBe(true);
  await expect(overlapChooser).toBeVisible();
  await expect(overlapChooser.getByText("Choose Alert", { exact: true })).toBeVisible();
  await expect.poll(async () => overlapChooser.locator(".overlap-chooser-choice").evaluateAll((choices) =>
    choices.every((choice) => choice.scrollHeight <= choice.clientHeight + 1),
  )).toBe(true);
  await expect.poll(async () => overlapChooser.evaluate((element) =>
    element.getAnimations().every((animation) => animation.playState !== "running"),
  )).toBe(true);
  const chooserWidthAtDefaultZoom = (await overlapChooser.boundingBox())?.width ?? 0;
  if (isMobile) {
    expect(chooserWidthAtDefaultZoom).toBeGreaterThanOrEqual(275);
    expect(chooserWidthAtDefaultZoom).toBeLessThanOrEqual(285);
  } else {
    expect(chooserWidthAtDefaultZoom).toBeGreaterThanOrEqual(350);
  }
  const chooserBox = await overlapChooser.boundingBox();
  expect(chooserBox && overlapMarkerBox && (
    chooserBox.x + chooserBox.width <= overlapMarkerBox.x
    || chooserBox.x >= overlapMarkerBox.x + overlapMarkerBox.width
    || chooserBox.y + chooserBox.height <= overlapMarkerBox.y
    || chooserBox.y >= overlapMarkerBox.y + overlapMarkerBox.height
  )).toBe(true);
  if (chooserBox && overlapMarkerBox) {
    const horizontalGap = Math.max(
      chooserBox.x - (overlapMarkerBox.x + overlapMarkerBox.width),
      overlapMarkerBox.x - (chooserBox.x + chooserBox.width),
      0,
    );
    const verticalGap = Math.max(
      chooserBox.y - (overlapMarkerBox.y + overlapMarkerBox.height),
      overlapMarkerBox.y - (chooserBox.y + chooserBox.height),
      0,
    );
    expect(Math.hypot(horizontalGap, verticalGap)).toBeLessThanOrEqual(96);
  }
  const keepoutSelector = [
    ".desktop-status-capsule-anchor",
    ".desktop-map-control-rail",
    ".desktop-map-legend",
    ".desktop-status-chip-row-container",
    ".mobile-bottom-nav",
    ".mobile-status-peek",
    ".mobile-legend-pill",
    ".mobile-train-toggle",
    ".map-utility-cluster",
    ".map-control-rail",
  ].join(",");
  const collisions = await overlapChooser.evaluate((chooser, selector) => {
    const chooserRect = chooser.getBoundingClientRect();
    return Array.from(document.querySelectorAll(selector)).filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0 || rect.width === 0 || rect.height === 0) return false;
      return chooserRect.left < rect.right
        && chooserRect.right > rect.left
        && chooserRect.top < rect.bottom
        && chooserRect.bottom > rect.top;
    }).map((element) => element.className);
  }, keepoutSelector);
  expect(collisions).toEqual([]);
  if (!isMobile) {
    const viewport = page.locator("[data-map-pan-zoom-viewport]");
    const viewportBox = await viewport.boundingBox();
    expect(viewportBox).not.toBeNull();
    if (viewportBox) {
      await page.mouse.move(viewportBox.x + viewportBox.width * 0.72, viewportBox.y + viewportBox.height * 0.72);
      await page.mouse.down();
      await page.mouse.move(viewportBox.x + viewportBox.width * 0.64, viewportBox.y + viewportBox.height * 0.64, { steps: 4 });
      await page.mouse.up();
      await expect(overlapChooser).toBeVisible();
    }
  }
  if (!isMobile) {
    await page.locator(".network-map-transition-surface").getByLabel("Zoom level slider").fill("2");
    await expect.poll(async () => Math.abs(((await overlapChooser.boundingBox())?.width ?? 0) - chooserWidthAtDefaultZoom))
      .toBeLessThan(2);
  }
  const chooserCount = overlapChooser.locator(".overlap-chooser-header-count");
  await expect(chooserCount).toHaveText("3");
  await expect.poll(async () => chooserCount.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      borderRadius: style.borderRadius,
      height: style.height,
      width: style.width,
    };
  })).toEqual({
    backgroundColor: "rgb(239, 68, 68)",
    borderRadius: "50%",
    height: isMobile ? "26px" : "28px",
    width: isMobile ? "26px" : "28px",
  });
  await expect(overlapChooser.getByText("Active Alert", { exact: true })).toHaveCount(2);
  await expect(overlapChooser.getByText("Active Closure", { exact: true })).toHaveCount(0);
  await expect(overlapChooser.getByText("Planned Closure", { exact: true })).toBeVisible();
  await expect(overlapChooser.getByText("Line 1: Stub Station to Stub Terminal (Northbound & Southbound)")).toHaveCount(3);
  await expect(overlapChooser.locator(".overlap-chooser-choice-action")).toHaveCount(0);
  await expect(overlapChooser.locator('[data-overlap-choice-kind="planned-closure"]').first()).toHaveCSS("border-left-width", "2px");
  if (!isMobile) {
    await overlapChooser.locator('[data-overlap-choice-id="stub-alert-line-1"]').hover();
    const foregroundImpact = page.locator('[data-hover-foreground-impact="chooser:suspension:stub-alert-line-1"]');
    await expect(foregroundImpact).toBeVisible();
    await expect(foregroundImpact.locator(".asset-alert-path.suspension-candy")).toBeVisible();
    const stationImpactHover = page.locator('[data-station-impact-hover-id="stub-alert-line-1"]');
    await expect(stationImpactHover).toBeVisible();
    await expect(stationImpactHover).toHaveCSS("stroke", "rgb(129, 201, 255)");
  }
  await overlapChooser.getByRole("button", { name: "Close alert chooser" }).click();
  await expect.poll(async () => overlapChooser.evaluate((element) =>
    element.getAnimations().some((animation) => animation.playState === "running"),
  ), { timeout: 300 }).toBe(true);
  await expect(overlapChooser).toBeHidden();
  await overlapMarker.dispatchEvent("pointerdown", { pointerId: 19, pointerType: "mouse", button: 0 });
  await overlapMarker.dispatchEvent("pointerup", { pointerId: 19, pointerType: "mouse", button: 0 });
  await overlapMarker.dispatchEvent("click");
  await expect(overlapChooser).toBeVisible();
  await overlapChooser.locator('[data-overlap-choice-id="stub-alert-line-1"]').click();
  await expect(page.locator('[data-station-impact-selection-id="stub-alert-line-1"]')).toBeAttached();
  if (isMobile) {
    const inspector = page.locator('[data-mobile-impact-inspector]');
    await expect(inspector).toBeVisible();
    await inspector.getByRole("button", { name: "View in List" }).click();
  }
  await expect(page.getByRole("heading", { name: "Active Alerts" })).toBeVisible();
  await expect(page.locator('[data-impact-card-id="stub-alert-line-1"]')).toHaveClass(/highlight-active-card/);
});

test("uses an active-alert overlap badge for an in-effect cached planned closure", async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  const overlapMarker = page.locator('[data-overlap-segment-id="stub-line-1-segment"]');
  await expect(overlapMarker.locator('[data-overlap-kind="suspension"]'))
    .toHaveAttribute("data-overlap-kind-count", "2");
  await expect(overlapMarker.locator('[data-overlap-kind="planned-closure"]'))
    .toHaveAttribute("data-overlap-kind-count", "1");
});

test("Spadina uses two visual dots for one station selection", async ({ page, request, isMobile }) => {
  await setStubMode(request, "unavailable");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  const spadinaTargets = page.locator('[data-station-id="spadina"]');
  const line1Target = page.locator(
    '[data-station-id="spadina"][data-station-anchor-id="spadina-1"]',
  );
  const line2Target = page.locator(
    '[data-station-id="spadina"][data-station-anchor-id="spadina-2"]',
  );

  await expect(spadinaTargets).toHaveCount(2);
  await expect(line1Target).toHaveCount(1);
  await expect(line2Target).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Spadina station details" }),
  ).toHaveCount(1);

  const selectedIndicators = page.locator('[data-station-selected-id="spadina"]');
  await expect(selectedIndicators).toHaveCount(2);
  if (isMobile) {
    await expect(selectedIndicators.nth(0)).toHaveCSS("opacity", "0");
    await expect(selectedIndicators.nth(1)).toHaveCSS("opacity", "0");
  }

  await line1Target.dispatchEvent("pointerover");
  await expect(page.locator('[data-station-hover-id="spadina"]')).toHaveCount(2);

  await line2Target.dispatchEvent("click");
  await expect(selectedIndicators).toHaveCount(2);
  if (isMobile) {
    await expect(selectedIndicators.nth(0)).toHaveCSS("opacity", "0.85");
    await expect(selectedIndicators.nth(1)).toHaveCSS("opacity", "0.85");
  }
  await expect(
    page.getByRole("complementary", { name: "Spadina station details" }),
  ).toBeVisible();

  if (isMobile) {
    await page.getByRole("button", { name: "Close station details" }).click();
    const hoverIndicators = page.locator('[data-station-hover-id="spadina"]');
    await expect(hoverIndicators).toHaveCount(2);
    await expect(hoverIndicators.nth(0)).not.toHaveClass(/active/);
    await expect(hoverIndicators.nth(1)).not.toHaveClass(/active/);
    await expect(hoverIndicators.nth(0)).toHaveCSS("fill", "rgba(0, 0, 0, 0)");
    await expect(hoverIndicators.nth(1)).toHaveCSS("fill", "rgba(0, 0, 0, 0)");
  }
});

test("uses map overlap metadata for active-alert and sibling submenu overlap refs", async ({ page, request, isMobile }) => {
  await setStubMode(request, "map-authoritative-overlap");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  const overlapMarker = page.locator('[data-overlap-segment-id="stub-line-1-segment"]');
  await expect(overlapMarker).toBeVisible();
  await overlapMarker.dispatchEvent("click");
  const overlapChooser = page.locator("[data-overlap-chooser]");
  await expect(overlapChooser).toBeVisible();
  await overlapChooser.locator('[data-overlap-choice-id="stub-alert-line-1"]').click();

  if (isMobile) {
    const inspector = page.locator('[data-mobile-impact-inspector]');
    await expect(inspector).toBeVisible();
    await inspector.getByRole("button", { name: "View in List" }).click();
  }

  await expect(page.getByRole("heading", { name: "Active Alerts" })).toBeVisible();
  const activeAlertCard = page.locator('[data-impact-card-id="stub-alert-line-1"]');
  await expect(activeAlertCard).toBeVisible();
  await expect(activeAlertCard.getByText("Overlap:")).toBeVisible();
  await expect(activeAlertCard.getByText("Delay", { exact: true })).toBeVisible();
  await expect(activeAlertCard.getByText("Reduced Speed Zone", { exact: true })).toBeVisible();

  await openServiceCategory(page, isMobile, /Delay/);
  const delaysPanel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Delays" }),
  });
  const delayCard = delaysPanel.locator('[data-impact-card-id="stub-delay-line-1-overlap"]');
  await expect(delayCard).toBeVisible();
  await expect(delayCard.getByText("Overlap:")).toBeVisible();
  await expect(delayCard.getByText("Active Alert", { exact: true })).toHaveCount(2);

  await openServiceCategory(page, isMobile, /Active Alert/);
  const boundaryActiveCard = page.locator('[data-impact-card-id="stub-alert-st-george-boundary"]');
  await expect(boundaryActiveCard).toBeVisible();
  await expect(boundaryActiveCard.getByText("Overlap:")).toBeVisible();
  await expect(boundaryActiveCard.getByText("Upcoming Closure", { exact: true })).toBeVisible();

  await openServiceCategory(page, isMobile, /Closure/);
  const closuresPanel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Planned Closures" }),
  });
  const boundaryClosureCard = closuresPanel.locator('[data-impact-card-id="stub-upcoming-closure-st-george-boundary"]');
  await expect(boundaryClosureCard).toBeVisible();
  await expect(boundaryClosureCard.getByText("Overlap:")).toBeVisible();
  await expect(boundaryClosureCard.getByText("Active Alert", { exact: true })).toBeVisible();
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
  if (isMobile) {
    const inspector = page.locator('[data-mobile-impact-inspector]');
    await expect(inspector).toBeVisible();
    await expect(inspector).toContainText("Reduced Speed Zone");
    await expect(inspector).toContainText("King");
    await inspector.getByRole("button", { name: "View in List" }).click();
  }
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
  if (isMobile) {
    const inspector = page.locator('[data-mobile-impact-inspector]');
    await expect(inspector).toBeVisible();
    await expect(inspector).toContainText("Delay");
    await expect(inspector).toContainText("Spadina");
    await inspector.getByRole("button", { name: "View in List" }).click();
  }
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
    await page.getByRole("searchbox", { name: "Station Search" }).click();
  } else {
    await page.getByRole("searchbox", { name: "Station Search" }).click();
  }
  await expect(page.getByRole("searchbox", { name: "Station Search" })).toBeFocused();

  await page.getByRole("searchbox", { name: "Station Search" }).fill("stub");
  await expect(page.getByRole("button", { name: "Stub Station TTC station search result" })).toBeVisible();

  await page.getByRole("searchbox", { name: "Station Search" }).fill("stb stn");
  await expect(page.getByRole("button", { name: "Stub Station TTC station search result" })).toBeVisible();

  await page.keyboard.press("Enter");
  await expect(page.getByRole("complementary", { name: "Stub Station station details" })).toBeVisible();
  await expect(page.locator('[data-station-search-panel][data-open="false"]')).toBeVisible();
});

test("global station search switches maps for a station on the other network", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  if (isMobile) {
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByRole("searchbox", { name: "Station Search" }).click();
  } else {
    await page.getByRole("searchbox", { name: "Station Search" }).click();
  }

  await page.getByRole("searchbox", { name: "Station Search" }).fill("Oakville");
  const oakville = page.getByRole("button", { name: "Oakville GO and UP station search result" });
  await expect(oakville).toBeVisible();
  await oakville.click();

  await expect(page.getByRole("region", { name: "Interactive GO and UP map" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Oakville regional station details" })).toBeVisible();
  await expect(page.getByRole("button", { name: "GO/UP" })).toHaveAttribute("aria-pressed", "true");
});

test("pinned desktop menu focuses impacts in the unobscured map area", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "desktop-only pinned menu layout");
  await setStubMode(request, "seeded");
  await page.addInitScript(() => {
    window.localStorage.setItem("linewatch-menu-pinned", "true");
  });
  await page.goto("/?panel=delays");

  const panel = page.locator(".floating-panel-shell");
  const viewport = page.locator("[data-map-pan-zoom-viewport]");
  await expect(page.locator(".linewatch-shell")).toHaveAttribute("data-menu-pinned", "true");
  await expect(panel).toBeVisible();

  const delayCard = page.locator('[data-impact-card-id="stub-delay-line-4"]');
  await delayCard.getByRole("button", { name: "Show on Map" }).click();
  const highlight = page.locator('[data-map-highlight-id="stub-delay-line-4"]');
  await expect(highlight).toBeAttached();
  await page.waitForTimeout(900);

  const [panelBox, viewportBox, highlightBox] = await Promise.all([
    panel.boundingBox(),
    viewport.boundingBox(),
    highlight.boundingBox(),
  ]);
  expect(panelBox).not.toBeNull();
  expect(viewportBox).not.toBeNull();
  expect(highlightBox).not.toBeNull();

  const visibleMapCenter = (
    panelBox!.x + panelBox!.width + 16 + viewportBox!.x + viewportBox!.width
  ) / 2;
  const highlightCenter = highlightBox!.x + highlightBox!.width / 2;
  expect(highlightCenter).toBeGreaterThan(panelBox!.x + panelBox!.width);
  expect(Math.abs(highlightCenter - visibleMapCenter)).toBeLessThan(100);
});

test("global search opens a condensed alert result in its detailed card and mobile map inspector", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");

  if (isMobile) {
    await page.getByRole("button", { name: "Search", exact: true }).click();
  } else {
    await page.locator(".header-search-bar").click({ position: { x: 5, y: 5 } });
  }

  const searchbox = page.getByRole("searchbox", { name: "Station Search" });
  await expect(searchbox).toHaveAttribute("placeholder", "Search Stations and Alerts...");
  const searchPanel = page.locator("[data-station-search-panel]");
  await expect(searchPanel).toBeVisible();
  if (!isMobile) {
    await expect
      .poll(async () => {
        const [searchBarBox, searchPanelBox] = await Promise.all([
          page.locator(".header-search-bar").boundingBox(),
          searchPanel.boundingBox(),
        ]);
        return Math.abs((searchBarBox?.width ?? 0) - (searchPanelBox?.width ?? 1));
      })
      .toBeLessThanOrEqual(1);

    const [activeAlertsBox, plannedClosuresBox, reducedSpeedZonesBox] = await Promise.all([
      page.getByRole("button", { name: "Active Alerts", exact: true }).boundingBox(),
      page.getByRole("button", { name: "Planned Closures", exact: true }).boundingBox(),
      page.getByRole("button", { name: "Reduced Speed Zones", exact: true }).boundingBox(),
    ]);
    expect(activeAlertsBox).not.toBeNull();
    expect(plannedClosuresBox).not.toBeNull();
    expect(reducedSpeedZonesBox).not.toBeNull();
    expect(Math.abs(plannedClosuresBox!.y - activeAlertsBox!.y)).toBeLessThanOrEqual(1);
    expect(reducedSpeedZonesBox!.y).toBeGreaterThan(activeAlertsBox!.y);

    const linesColumn = page.locator(".station-search-lines-column");
    await expect(linesColumn).toHaveAttribute("data-scroll-more-below", "");
    expect(await linesColumn.evaluate((element) => getComputedStyle(element).maskImage)).toContain("linear-gradient");
    await linesColumn.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(linesColumn).not.toHaveAttribute("data-scroll-more-below", "");
  }
  await expect(page.locator(".global-search-browse-alerts button").first()).toHaveCSS("font-size", "11px");
  await searchbox.fill("Don Mills");

  const result = page.getByRole("button", { name: /Delay: Line 4,.*Sheppard-Yonge to Don Mills/i });
  await expect(result).toBeVisible();
  await expect(result).toHaveCSS("border-left-width", "2px");
  await expect(result).toHaveCSS("border-left-color", "rgb(254, 236, 65)");
  await expect(result.locator(".global-search-impact-badges")).toHaveCount(0);
  await result.click();

  const delayCard = page.locator('[data-impact-card-id="stub-delay-line-4"]');
  await expect(delayCard).toBeVisible();
  await expect(delayCard).toHaveClass(/highlight-active-card/);
  await expect(page.locator('[data-map-highlight-id="stub-delay-line-4"]')).toBeAttached();

  if (isMobile) {
    await delayCard.getByRole("button", { name: "Show on Map" }).click();
    const inspector = page.locator("[data-mobile-impact-inspector]");
    await expect(inspector).toBeVisible();
    await expect(inspector).toContainText("Delay");
    await inspector.getByRole("button", { name: "View in List" }).click();
    await expect(delayCard).toBeVisible();
  }
});

test("shows seamless continuation gradients on constrained desktop and mobile lists", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await page.setViewportSize(isMobile
    ? { width: 390, height: 480 }
    : { width: 1100, height: 420 });
  await openDashboardMenu(page, isMobile);

  const primaryList = isMobile
    ? page.locator(".mobile-more-content-scroll")
    : page.locator("#linewatch-main-menu-scroll");
  await expect(primaryList).toHaveAttribute("data-scroll-more-below", "");
  expect(await primaryList.evaluate((element) => getComputedStyle(element).maskImage))
    .toContain("linear-gradient");

  await primaryList.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(primaryList).not.toHaveAttribute("data-scroll-more-below", "");

  if (!isMobile) {
    await page.getByRole("menuitem", { name: /^Active Alerts/ }).click();
    const submenuList = page.locator(".alert-stack");
    await expect(submenuList).toHaveAttribute("data-scroll-more-below", "");
    expect(await submenuList.evaluate((element) => getComputedStyle(element).maskImage))
      .toContain("linear-gradient");
  }
});

test("alert category panels filter by line and sort without changing dashboard data", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await page.goto("/?panel=delays");

  const toolbar = page.locator(".impact-list-toolbar");
  await expect(toolbar).toHaveCSS("border-top-width", "1px");
  await expect(toolbar).toHaveCSS("border-bottom-width", "1px");
  expect(await toolbar.evaluate((element) => {
    const style = getComputedStyle(element);
    return style.borderTopColor === style.borderBottomColor;
  })).toBeTruthy();

  await page.getByRole("button", { name: "Filter delays by line" }).click();
  await page.getByRole("listbox").getByRole("option", { name: "Line 4 Sheppard" }).click();
  const lineFilterTrigger = page.getByRole("button", { name: "Filter delays by line" });
  await expect(lineFilterTrigger).toContainText("Sheppard");
  await expect(lineFilterTrigger.locator(".impact-list-line-badge")).toHaveAttribute("src", /line-4-legend\.svg/);
  await expect(page.locator('[data-impact-card-id="stub-delay-line-4"]')).toBeVisible();
  await expect(page.locator('[data-impact-card-id="stub-delay-st-george-curve"]')).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: /1 of 2/ })).toBeAttached();

  const sortTrigger = page.getByRole("button", { name: "Sort delays" });
  const defaultSortWidth = (await sortTrigger.boundingBox())?.width ?? 0;
  await sortTrigger.click();
  const sortOptions = page.getByRole("listbox");
  await expect(sortOptions).toBeVisible();
  const sortTriggerBox = await sortTrigger.boundingBox();
  const sortOptionsBox = await sortOptions.boundingBox();
  expect(sortTriggerBox).not.toBeNull();
  expect(sortOptionsBox).not.toBeNull();
  if (sortTriggerBox && sortOptionsBox) {
    if (isMobile) {
      expect(Math.abs(sortOptionsBox.x - sortTriggerBox.x)).toBeLessThanOrEqual(1);
    } else {
      expect(Math.abs(
        sortOptionsBox.x + sortOptionsBox.width - (sortTriggerBox.x + sortTriggerBox.width),
      )).toBeLessThanOrEqual(1);
    }
  }
  await sortOptions.getByRole("option", { name: "Line", exact: true }).click();
  await expect(sortTrigger).toContainText("Line");
  const lineSortWidth = (await sortTrigger.boundingBox())?.width ?? 0;
  expect(lineSortWidth).toBeLessThan(defaultSortWidth);
  await expect(page.locator('[data-impact-card-id="stub-delay-line-4"]')).toBeVisible();
});

test("station search browses fallback station lists by line", async ({ page, request, isMobile }) => {
  await setStubMode(request, "unavailable");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  if (isMobile) {
    await page.getByRole("button", { name: "Search", exact: true }).click();
  } else {
    await page.getByRole("searchbox", { name: "Station Search" }).click();
  }
  await page.getByRole("button", { name: /Line 5\s+Eglinton Crosstown/ }).click();
  await expect(page.getByRole("button", { name: "Mount Dennis TTC station search result" })).toBeVisible();

  await page.getByRole("button", { name: "Mount Dennis TTC station search result" }).click();
  await expect(page.getByRole("complementary", { name: "Mount Dennis station details" })).toBeVisible();
  await expect(page.getByText("Backend unavailable. Showing local fallback station data.")).toBeVisible();
});

test("drag after focus zoom cancels animation and retains transform", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "desktop-only map controls drag behavior");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  // Verify the control rail styling and visibility
  const rail = page.locator(".network-map-transition-surface").locator(".map-control-rail");
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

test("desktop wheel zoom keeps the main-map compositor topology and updates smoothly", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "desktop wheel-zoom behavior");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  const mapSurface = page.locator(".network-map-transition-surface");
  const mapElement = mapSurface.locator(".absolute.top-0.left-0.w-full.h-full.origin-top-left");
  const viewport = mapSurface.locator(".cursor-grab").first();
  const viewportBox = await viewport.boundingBox();
  expect(viewportBox).not.toBeNull();

  await expect(mapSurface.locator(".ttc-svg-container")).toHaveCount(1);
  await expect(mapSurface.locator(".regional-map")).toHaveCount(0);
  await expect(mapSurface).toHaveCSS("view-transition-name", "none");

  await page.mouse.move(
    viewportBox!.x + viewportBox!.width / 2,
    viewportBox!.y + viewportBox!.height / 2,
  );

  const transformSamples: string[] = [];
  for (let index = 0; index < 6; index += 1) {
    await page.mouse.wheel(0, -24);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    transformSamples.push(await mapElement.evaluate((element) => (element as HTMLElement).style.transform));
  }

  expect(new Set(transformSamples).size).toBeGreaterThanOrEqual(4);
  await expect(mapSurface).toHaveCSS("view-transition-name", "none");
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

  await page.getByRole("searchbox", { name: "Station Search" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("searchbox", { name: "Station Search" })).toBeFocused();

  await page.keyboard.type("Stub");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  await expect(page.getByRole("complementary", { name: "Stub Station station details" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Station Search" })).toBeFocused();
});

test("demo account shows account-backed saved commutes", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  if (isMobile) {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("button", { name: "Demo Account" }).click();
    await expect(page.getByRole("heading", { name: "My Commutes" })).toBeVisible();
  } else {
    await openDashboardMenu(page, isMobile);
    await page.getByRole("menuitem", { name: "Demo account" }).click({ force: true });
    await page.getByRole("button", { name: "Toggle menu" }).click({ force: true });
    await page.getByRole("menuitem", { name: "My Commutes" }).click({ force: true });
  }

  await expect(page.getByText("Demo account").filter({ visible: true })).toBeVisible();
  await expect(page.getByText("Stub Station <-> Union")).toBeVisible();
  await expect(page.getByText("Default Scheduled Route · To Union")).toBeVisible();
  await expect(page.getByText("5 Stations", { exact: true })).toBeVisible();
  await expect(page.getByText("Travel Time Unreliable", { exact: true })).toBeVisible();
  await expect(page.getByText("Major Disruption on Route", { exact: true })).toBeVisible();
  await expect(page.getByText("Travel Time", { exact: true })).toBeVisible();
  await expect(page.locator('[data-travel-time-severity="severe"]')).toBeVisible();
  await expect(page.getByText("Major disruption on this route; travel time is not reliable.")).toBeVisible();
  await expect(page.getByText("Route Notifications: On", { exact: true })).toBeVisible();
  await expect(page.getByText("Outbound: Weekdays · 6:30 AM-9:30 AM", { exact: true })).toBeVisible();
  await expect(page.getByText("Return: Weekdays · 3:00 PM-7:00 PM", { exact: true })).toBeVisible();
  await expect(page.getByText("All Events", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Alerts" })).toBeVisible();
  await page.getByRole("button", { name: "Edit Alerts" }).click();
  await expect(page.getByRole("group", { name: "Outbound Route notification window" })
    .getByRole("button", { name: "AM Rush" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("group", { name: "Return Route notification window" })
    .getByRole("button", { name: "PM Rush" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/Overnight windows belong to the day they start/)).toBeVisible();
  await page.locator(".saved-commute-rule-summary").getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByText("Outbound Affected", { exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "To Union" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "To Stub Station" })).toBeVisible();
  await expect(page.getByText("Default Scheduled Route · To Union")).toBeVisible();
  await expect(page.getByText("Affected Now", { exact: true })).toBeVisible();
  await expect(page.getByText("Clear", { exact: true })).not.toBeVisible();
  const impactDisclosure = page.locator(".saved-commute-impact-disclosure").first();
  await expect(impactDisclosure).toBeVisible();
  await expect(impactDisclosure).not.toHaveAttribute("open", "");
  await expect(impactDisclosure.getByText("1 Suspension", { exact: true })).toBeVisible();
  await expect(impactDisclosure.getByText(/Line 1: Stub Station To Stub Terminal/)).toBeHidden();
  await impactDisclosure.locator("summary").click();
  await expect(impactDisclosure).toHaveAttribute("open", "");
  await expect(impactDisclosure.getByText("Suspension", { exact: true })).toBeVisible();
  await expect(impactDisclosure.getByText(/Line 1: Stub Station To Stub Terminal/)).toBeVisible();

  const commuteHeaderMetrics = await page.locator(".commute-card").first().evaluate((card) => {
    const header = card.querySelector<HTMLElement>(".saved-commute-card-header");
    const identity = card.querySelector<HTMLElement>(".saved-commute-card-identity");
    const badge = card.querySelector<HTMLElement>(".saved-commute-current-impact-badge");
    if (!header || !identity || !badge) throw new Error("Missing saved commute card header elements");
    const identityBounds = identity.getBoundingClientRect();
    const badgeBounds = badge.getBoundingClientRect();
    return {
      alignItems: getComputedStyle(header).alignItems,
      badgeFontSize: Number.parseFloat(getComputedStyle(badge).fontSize),
      badgeHeight: badgeBounds.height,
      centerDelta: Math.abs(
        identityBounds.top + identityBounds.height / 2 - (badgeBounds.top + badgeBounds.height / 2),
      ),
    };
  });
  expect(commuteHeaderMetrics.alignItems).toBe("center");
  expect(commuteHeaderMetrics.badgeFontSize).toBeGreaterThanOrEqual(11.5);
  expect(commuteHeaderMetrics.badgeHeight).toBeGreaterThanOrEqual(28);
  expect(commuteHeaderMetrics.centerDelta).toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: /View Suspension on the map for Morning commute/ }).click();
  await expect(page.locator("[data-commute-path-preview]")).toBeVisible();
  if (isMobile) {
    await expect(page.getByRole("complementary", { name: "Selected map impact details" })).toBeVisible();
    await expect(page.getByText("Seeded smoke alert for browser verification.", { exact: true })).toBeVisible();
  } else {
    await expect(page.getByRole("heading", { name: "Active Alerts" })).toBeVisible();
    await expect(page.locator('[data-impact-card-id="stub-alert-line-1"]')).toBeVisible();
  }
  const previewChipMetrics = await page.locator(".commute-path-preview-chip").evaluate((chip) => {
    const bounds = chip.getBoundingClientRect();
    return { height: bounds.height, width: bounds.width };
  });
  expect(previewChipMetrics.height).toBeGreaterThanOrEqual(60);
  if (isMobile) {
    expect(previewChipMetrics.width).toBeGreaterThanOrEqual((page.viewportSize()?.width ?? 320) - 40);
    const previewInspectorGap = async () => {
      const chipBounds = await page.locator(".commute-path-preview-chip").boundingBox();
      const inspectorBounds = await page
        .getByRole("complementary", { name: "Selected map impact details" })
        .boundingBox();
      if (!chipBounds || !inspectorBounds) return Number.POSITIVE_INFINITY;
      return inspectorBounds.y - (chipBounds.y + chipBounds.height);
    };
    await expect.poll(previewInspectorGap).toBeGreaterThanOrEqual(8);
    await expect.poll(previewInspectorGap).toBeLessThanOrEqual(12);

    await page.getByRole("button", { name: "Show more map" }).click();
    await expect(page.getByRole("button", { name: "Show more details" })).toBeVisible();
    await expect.poll(previewInspectorGap).toBeGreaterThanOrEqual(8);
    await expect.poll(previewInspectorGap).toBeLessThanOrEqual(12);
  } else {
    expect(previewChipMetrics.width).toBeGreaterThanOrEqual(560);
  }
  const selectedImpactOverlay = page.locator('[data-selected-commute-impact-overlay="stub-alert-line-1"]');
  await expect(selectedImpactOverlay).toBeAttached();
  await expect(selectedImpactOverlay.locator(".suspension-candy")).toBeVisible();
  await expect(selectedImpactOverlay.locator(".suspension-no-entry-lane")).toBeVisible();
  const selectedImpactGlowStyle = await selectedImpactOverlay.locator(".interactive-glow.selected").evaluate((glow) => {
    const style = getComputedStyle(glow);
    return {
      display: style.display,
      opacity: Number.parseFloat(style.opacity),
      strokeWidth: Number.parseFloat(style.strokeWidth),
    };
  });
  expect(
    await selectedImpactOverlay.evaluate((overlay) => {
      const routePath = document.querySelector(".commute-path-preview-path");
      return Boolean(routePath && (routePath.compareDocumentPosition(overlay) & Node.DOCUMENT_POSITION_FOLLOWING));
    }),
  ).toBe(true);
  const commutePathStyle = await page.locator(".commute-path-preview-path").evaluate((path) => {
    const style = getComputedStyle(path);
    return {
      animationName: style.animationName,
      strokeWidth: Number.parseFloat(style.strokeWidth),
    };
  });
  const commuteGlowStyle = await page.locator(".commute-path-preview-glow").evaluate((path) => {
    const style = getComputedStyle(path);
    return {
      animationName: style.animationName,
      filter: style.filter,
      strokeWidth: Number.parseFloat(style.strokeWidth),
    };
  });
  await expect(page.locator(".station-commute-green-flash").first()).toBeVisible();
  const commuteBeaconStyle = await page.locator(".station-commute-green-flash").first().evaluate((beacon) => {
    const style = getComputedStyle(beacon);
    return {
      animationDelay: style.animationDelay,
      animationDirection: style.animationDirection,
      animationDuration: style.animationDuration,
      animationName: style.animationName,
    };
  });
  if (isMobile) {
    expect(commutePathStyle).toEqual({ animationName: "none", strokeWidth: 112 });
    expect(commuteGlowStyle.animationName).toBe("none");
    expect(commuteGlowStyle.filter).toBe("none");
    expect(commuteGlowStyle.strokeWidth).toBe(132);
    expect(commuteBeaconStyle.animationName).toBe("none");
    expect(selectedImpactGlowStyle.display).toBe("none");
  } else {
    expect(commutePathStyle.animationName).toBe("candy-pulse");
    expect(commutePathStyle.strokeWidth).toBeGreaterThanOrEqual(102);
    expect(commuteGlowStyle.animationName).toBe("aura-pulse");
    expect(commuteGlowStyle.strokeWidth).toBe(155);
    expect(commuteBeaconStyle.animationName).toBe("station-commute-green-flash-anim");
    expect(commuteBeaconStyle.animationDuration).toBe("1.2s");
    expect(commuteBeaconStyle.animationDirection).toBe("alternate");
    expect(commuteBeaconStyle.animationDelay).toBe(
      await page.locator(".commute-path-preview-path").evaluate((path) => getComputedStyle(path).animationDelay),
    );
  }
  await expect(page.getByRole("button", { name: "Back to My Commutes" })).toBeVisible();
  await page.getByRole("button", { name: "Back to My Commutes" }).click({ force: true });
  await expect(page.locator("[data-commute-path-preview]")).toHaveCount(0);

  await page.getByRole("tab", { name: "To Stub Station" }).click();
  await expect(page.getByText("Default Scheduled Route · To Stub Station")).toBeVisible();
  await expect(page.getByText("About 13 min", { exact: true })).toBeVisible();
  await expect(page.getByText("Typical Scheduled Time", { exact: true })).toBeVisible();
  await expect(page.getByText("No extra time", { exact: true })).not.toBeVisible();
  await expect(page.locator('[data-travel-time-severity="good"]')).not.toBeVisible();
  await expect(page.getByText("Clear", { exact: true })).toBeVisible();
  await expect(page.getByText("Affected Now", { exact: true })).not.toBeVisible();
  await expect(page.getByText("Suspension", { exact: true })).not.toBeVisible();

  if (isMobile) {
    await page.getByRole("button", { name: "+ Add Route" }).first().click();
    const originPicker = page.locator(".commute-station-picker").filter({ hasText: "Origin" });
    const originTrigger = originPicker.getByRole("button").first();
    await originTrigger.click();
    const originPopover = page.getByRole("listbox", { name: "Origin station choices" });
    await expect(originPopover).toBeVisible();
    await expect
      .poll(async () => {
        const triggerBox = await originTrigger.boundingBox();
        const popoverBox = await originPopover.boundingBox();
        if (!triggerBox || !popoverBox) return false;
        return (
          Math.abs(popoverBox.y - (triggerBox.y + triggerBox.height + 6)) <= 4 &&
          Math.abs(popoverBox.x - triggerBox.x) <= 4 &&
          Math.abs(popoverBox.width - triggerBox.width) <= 8
        );
      })
      .toBe(true);
    const triggerBox = await originTrigger.boundingBox();
    const popoverBox = await originPopover.boundingBox();
    expect(triggerBox).not.toBeNull();
    expect(popoverBox).not.toBeNull();
    expect(Math.abs(popoverBox!.y - (triggerBox!.y + triggerBox!.height + 6))).toBeLessThanOrEqual(4);
    expect(Math.abs(popoverBox!.x - triggerBox!.x)).toBeLessThanOrEqual(4);
    expect(Math.abs(popoverBox!.width - triggerBox!.width)).toBeLessThanOrEqual(8);
    await originPopover.getByRole("button", { name: /Line 1 Yonge-University/ }).click();
    await expect(originPopover.getByRole("option", { name: /Stub Station/ })).toBeVisible();
    await originPopover.getByRole("button", { name: "Back to Lines" }).click();
    await expect(originPopover.getByRole("button", { name: /Line 1 Yonge-University/ })).toBeVisible();
    const originSearch = originPopover.getByRole("searchbox", { name: "Search origin stations" });
    await originSearch.fill("stub");
    await expect(originPopover).toHaveAttribute("data-placement", "below");
    await expect(page.getByRole("navigation", { name: "Primary mobile navigation" })).toBeHidden();
    await expect
      .poll(async () => {
        const liftedTriggerBox = await originTrigger.boundingBox();
        const viewportPopoverBox = await originPopover.boundingBox();
        const commuteContainerBox = await page.locator(".floating-panel-scroll").boundingBox();
        const pickerBox = await originPicker.boundingBox();
        const commuteScrollBox = await page.locator(".commute-grid").boundingBox();
        if (!liftedTriggerBox || !viewportPopoverBox || !commuteContainerBox || !pickerBox || !commuteScrollBox) return false;
        return (
          Math.abs(pickerBox.y - commuteScrollBox.y - 8) <= 4 &&
          Math.abs(viewportPopoverBox.y - (liftedTriggerBox.y + liftedTriggerBox.height + 6)) <= 4 &&
          viewportPopoverBox.height < 320 &&
          viewportPopoverBox.y + viewportPopoverBox.height <= commuteContainerBox.y + commuteContainerBox.height + 1
        );
      })
      .toBe(true);
    await originPopover.getByRole("option", { name: /Stub Station/ }).click();
    await expect(originPopover).toHaveCount(0);
    await page.getByRole("button", { name: "Cancel" }).first().click();
  }

  // Switch back to outbound for the rest of the test
  await page.getByRole("tab", { name: "To Union" }).click();

  await page.getByRole("button", { name: /View 5 stops/ }).click();
  await expect(page.getByRole("list", { name: "Stops for Morning commute" })).toBeVisible();
  const stopsList = page.getByRole("list", { name: "Stops for Morning commute" });
  await expect(stopsList.getByText("Stub Station", { exact: true })).toBeVisible();
  await expect(stopsList.getByText("stub-union", { exact: true })).toBeVisible();

  const viewPathButton = page.getByRole("button", { name: "View path on map" });
  await expect(viewPathButton).toBeVisible();
  const viewPathButtonStyle = await viewPathButton.evaluate((button) => {
    const style = getComputedStyle(button);
    return {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
      borderRadius: style.borderRadius,
      borderStyle: style.borderStyle,
      borderWidth: style.borderWidth,
      color: style.color,
      fontSize: style.fontSize,
      minHeight: style.minHeight,
      padding: style.padding,
    };
  });
  expect(viewPathButtonStyle.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(viewPathButtonStyle.borderStyle).toBe("solid");
  expect(Number.parseFloat(viewPathButtonStyle.borderWidth)).toBeGreaterThanOrEqual(1);
  const impactMapButtonStyle = await page.locator(".saved-commute-impact-map-button").first().evaluate((button) => {
    const style = getComputedStyle(button);
    return {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
      borderRadius: style.borderRadius,
      borderStyle: style.borderStyle,
      borderWidth: style.borderWidth,
      color: style.color,
      fontSize: style.fontSize,
      minHeight: style.minHeight,
      padding: style.padding,
    };
  });
  expect(viewPathButtonStyle).toEqual(impactMapButtonStyle);
  await viewPathButton.click();
  await expect(page.locator("[data-commute-path-preview]")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Viewing" })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click({ force: true });
  await expect(page.locator("[data-commute-path-preview]")).toHaveCount(0);
});

test("signed-in riders save, browse, remove, undo, and reload My Stations", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  if (isMobile) {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("button", { name: "Demo Account" }).click();
  } else {
    await openDashboardMenu(page, isMobile);
    await page.getByRole("menuitem", { name: "Demo account" }).click({ force: true });
  }

  await expect(page.getByRole("heading", { name: "My Commutes" })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).first().click();
  await page.getByRole("button", { name: "Stub Station station details" }).click();
  await expect(page.getByRole("button", { name: "Save Stub Station to My Stations" })).toBeVisible();
  await page.getByRole("button", { name: "Save Stub Station to My Stations" }).click();
  await expect(page.getByRole("button", { name: "Remove Stub Station from My Stations" })).toBeVisible();
  await page.getByRole("button", { name: "Close station details" }).click();

  if (isMobile) {
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("button", { name: "My Stations" }).click();
  } else {
    await page.getByRole("button", { name: "Toggle menu" }).click();
    await page.getByRole("menuitem", { name: "My Stations" }).click();
  }

  const panel = page.getByRole("region", { name: "My Stations" });
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Add Station", exact: true }).click();
  const doneButton = panel.getByRole("button", { name: "Done adding stations" });
  await expect(doneButton).toBeVisible();
  await expect.poll(async () => (await doneButton.boundingBox())?.width ?? 0).toBeLessThanOrEqual(56);
  await expect.poll(async () => (await panel.locator(".my-stations-picker-section-heading").first().boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(46);
  const pickerRowStyle = await panel.locator(".my-stations-picker-row").first().evaluate((row) => {
    const style = getComputedStyle(row);
    return { backgroundColor: style.backgroundColor, opacity: style.opacity };
  });
  expect(pickerRowStyle.opacity).toBe("1");
  expect(pickerRowStyle.backgroundColor).toBe("rgb(21, 24, 33)");
  await doneButton.click();
  await expect(panel.locator(".my-stations-row-heading strong", { hasText: "Stub Station" })).toBeVisible();
  await expect(panel.getByText("Active Disruptions", { exact: true })).toBeVisible();
  await panel.getByText("Active Disruptions", { exact: true }).click();
  const viewAlertDetails = panel.getByRole("button", { name: "View Stub Station alert details" });
  await expect(viewAlertDetails).toContainText("View Details");
  await viewAlertDetails.click();
  await expect(page.getByRole("heading", { name: "Active Alerts" })).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(panel).toBeVisible();
  await expect(panel.locator(".saved-station-disruption-disclosure")).toHaveAttribute("open", "");
  await panel.getByRole("button", { name: "Remove Stub Station from My Stations" }).click();
  await expect(panel.getByText("No Saved Stations", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(panel.locator(".my-stations-row-heading strong", { hasText: "Stub Station" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
  if (isMobile) {
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("button", { name: "My Stations" }).click();
  } else {
    await page.getByRole("button", { name: "Toggle menu" }).click();
    await page.getByRole("menuitem", { name: "My Stations" }).click();
  }
  await expect(page.locator(".my-stations-row-heading strong", { hasText: "Stub Station" })).toBeVisible();
});

test("requests and confirms a password reset from the sign-in dialog", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  if (isMobile) {
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
  } else {
    await page.getByRole("button", { name: "Toggle menu" }).click();
    await page.getByRole("menuitem", { name: "Sign In" }).click();
  }

  const choiceDialog = page.getByRole("dialog", { name: "Choose how to sign in to LineWatchTO" });
  await expect(choiceDialog).toBeVisible();
  await choiceDialog.getByRole("button", { name: "Continue With Email" }).click();

  const signInDialog = page.getByRole("dialog", { name: "Sign in to LineWatchTO" });
  await expect(signInDialog).toBeVisible();
  await signInDialog.getByRole("button", { name: "Forgot Password?" }).click();

  const resetDialog = page.getByRole("dialog", { name: "Reset LineWatchTO password" });
  await expect(resetDialog).toBeVisible();
  await resetDialog.getByLabel("Email").fill("rider@example.com");
  await resetDialog.getByRole("button", { name: "Send Reset Link" }).click();
  await expect(resetDialog.getByRole("status")).toContainText("If an account exists");
  await resetDialog.getByRole("button", { name: "Open Local Reset Form" }).click();

  const confirmDialog = page.getByRole("dialog", { name: "Choose a new LineWatchTO password" });
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

  const confirmDialog = page.getByRole("dialog", { name: "Choose a new LineWatchTO password" });
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
  const multiImpactLineRow = page.locator(".mobile-line-status-row").nth(1);
  const [lineRowBox, lineBadgeBox] = await Promise.all([
    multiImpactLineRow.boundingBox(),
    multiImpactLineRow.locator(".mobile-line-status-number").boundingBox(),
  ]);
  expect(lineRowBox).not.toBeNull();
  expect(lineBadgeBox).not.toBeNull();
  const lineRowCenter = lineRowBox!.y + lineRowBox!.height / 2;
  const lineBadgeCenter = lineBadgeBox!.y + lineBadgeBox!.height / 2;
  expect(Math.abs(lineBadgeCenter - lineRowCenter)).toBeLessThanOrEqual(1);
  await page.locator(".mobile-status-actions").getByRole("button", { name: /Delay/ }).click();
  await expect(page.getByRole("heading", { name: "Delays" })).toBeVisible();

  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.waitForTimeout(300); // let open transition finish
  // Initially, the nav bar is visible and search is not focused
  const mobileNavigation = page.getByRole("navigation", { name: "Primary mobile navigation" });
  const searchPanel = page.locator("[data-station-search-panel]");
  await expect(mobileNavigation).toBeVisible();
  await expect(searchPanel).toBeVisible();
  const searchPanelBox = await searchPanel.boundingBox();
  const mobileNavigationBox = await mobileNavigation.boundingBox();
  const lastSearchLineBox = await searchPanel.locator(".station-search-line-trigger").last().boundingBox();
  expect(searchPanelBox).not.toBeNull();
  expect(mobileNavigationBox).not.toBeNull();
  expect(lastSearchLineBox).not.toBeNull();
  const searchNavGap = mobileNavigationBox!.y - (searchPanelBox!.y + searchPanelBox!.height);
  expect(searchNavGap).toBeGreaterThanOrEqual(8);
  expect(searchNavGap).toBeLessThanOrEqual(16);
  expect(searchPanelBox!.y + searchPanelBox!.height - (lastSearchLineBox!.y + lastSearchLineBox!.height)).toBeLessThanOrEqual(32);
  // Focus the input to move elements up and hide navigation
  await page.getByRole("searchbox", { name: "Station Search" }).click();
  await expect(page.getByRole("searchbox", { name: "Station Search" })).toBeFocused();
  await expect(page.getByRole("navigation", { name: "Primary mobile navigation" })).toHaveCount(0);

  await page.getByRole("button", { name: "Close station search" }).click();
  await expect(page.getByRole("navigation", { name: "Primary mobile navigation" })).toBeVisible();
  await page.getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByRole("heading", { name: "More" })).toBeVisible();
  await expect(page.getByRole("button", { name: /High Contrast Mode/ })).toBeVisible();
});

test("manages push notification preferences on mobile", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "mobile-only push notification preferences smoke");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  await page.getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByRole("heading", { name: "More" })).toBeVisible();

  await page.getByRole("button", { name: "Demo Account" }).click();

  await page.getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByLabel("More LineWatchTO options").getByText("Demo Rider")).toBeVisible();
  await page.getByRole("button", { name: "Notifications" }).click();

  await expect(page.getByRole("heading", { name: "Notifications", exact: true })).toBeVisible();
  await expect(page.getByText("Device Notifications")).toBeVisible();
  await expect(page.getByText(/Push for this browser|This Device|Enable on This Device/)).toBeVisible();
  await expect(page.getByText(/Account notifications are on|This device is receiving notifications|Push not configured/).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Line subscriptions" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Planned Closure Follow-ups" })).toBeVisible();
  const smartFollowUp = page.getByRole("radio", { name: /^Smart/ });
  await expect(smartFollowUp).toBeChecked();
  const announcementsOnly = page.getByRole("radio", { name: /^Announcements Only/ });
  await announcementsOnly.check();
  await expect(announcementsOnly).toBeChecked();
  await expect(page.getByText("Event Starts/Changes")).toHaveCount(0);

  const line1Switch = page.getByLabel("Subscribe to Line 1");
  await expect(line1Switch).toBeAttached();
  await page.locator('label:has(input[aria-label="Subscribe to Line 1"])').click();
  await expect(line1Switch).toBeChecked();

  const rszSwitch = page.getByLabel("Line subscription Reduced Speed Zones");
  await expect(rszSwitch).toBeAttached();
  await expect(rszSwitch).toBeChecked();
  await page.locator('label:has(input[aria-label="Line subscription Reduced Speed Zones"])').click();
  await expect(rszSwitch).not.toBeChecked();

  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("heading", { name: "More" })).toBeVisible();

  await expect(page.getByRole("navigation", { name: "Primary mobile navigation" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary mobile navigation" }).getByRole("button", { name: "Notifications" })).toHaveCount(0);
});

test("renders estimated train markers only after the layer is enabled", async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
  await expect(page.locator(".estimated-train-marker-core")).toHaveCount(0);

  await page.getByRole("button", { name: "Toggle live train markers" }).click();

  await expect(page.locator(".estimated-train-marker-core")).toHaveCount(1);
  await expect(page.locator('[data-train-marker-line-id="line-1"]')).toBeVisible();
});
