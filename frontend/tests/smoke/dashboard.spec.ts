import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

const appUrl = process.env.LINEWATCH_SMOKE_APP_URL ?? "http://127.0.0.1:4173";
const stubUrl = process.env.LINEWATCH_SMOKE_STUB_URL ?? "http://127.0.0.1:4174";
const welcomeStorageKey = "linewatch-welcome-seen-v1";
const disclaimerStorageKey = "linewatch-unofficial-notice-ack-v1";

async function setStubMode(request: APIRequestContext, mode: "seeded" | "diagnostics-disabled" | "unavailable" | "map-authoritative-overlap" | "regional-live") {
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

async function expectActiveWelcomeSlideToFit(carousel: Locator) {
  await expect.poll(async () => carousel.evaluate((element) => {
    const viewport = element.querySelector<HTMLElement>(".opening-welcome-carousel-viewport");
    const activeSlide = element.querySelector<HTMLElement>(".opening-welcome-slide-item--active");
    const controls = element.querySelector<HTMLElement>(".opening-welcome-controls");
    const legend = activeSlide?.querySelector<HTMLElement>(".opening-welcome-map-legend");
    if (!viewport || !activeSlide || !controls) return false;

    const viewportRect = viewport.getBoundingClientRect();
    const activeSlideRect = activeSlide.getBoundingClientRect();
    const controlsRect = controls.getBoundingClientRect();
    const legendRect = legend?.getBoundingClientRect();
    return activeSlideRect.top >= viewportRect.top - 1
      && activeSlideRect.bottom <= viewportRect.bottom + 1
      && (!legendRect || legendRect.bottom <= viewportRect.bottom + 1)
      && controlsRect.top >= viewportRect.bottom;
  })).toBe(true);
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

async function expectRegionalChooserToClearReferencedAlerts(page: Page) {
  await page.locator("[data-overlap-chooser]").evaluate(async (chooser) => {
    await Promise.all(
      chooser.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined)),
    );
  });
  const overlapsReferencedAlert = await page.locator("[data-overlap-chooser]").evaluate((chooser) => {
    const chooserRect = chooser.getBoundingClientRect();
    const impactIds = new Set(
      [...chooser.querySelectorAll<HTMLElement>("[data-overlap-choice-id]")]
        .map((choice) => choice.dataset.overlapChoiceId),
    );
    return [...document.querySelectorAll<SVGPathElement>(
      ".regional-overlay-segment-group .regional-impact-path",
    )].some((path) => {
      const group = path.closest<SVGElement>(".regional-overlay-segment-group");
      if (!group?.dataset.regionalImpactId || !impactIds.has(group.dataset.regionalImpactId)) return false;
      const matrix = path.getScreenCTM();
      if (!matrix) return false;
      const radius = Number.parseFloat(getComputedStyle(path).strokeWidth) / 2 * Math.max(
        Math.hypot(matrix.a, matrix.b),
        Math.hypot(matrix.c, matrix.d),
      );
      const length = path.getTotalLength();
      const sampleCount = Math.max(12, Math.ceil(length / 80));
      return Array.from({ length: sampleCount + 1 }, (_unused, index) => {
        const point = path.getPointAtLength(length * index / sampleCount).matrixTransform(matrix);
        return point.x >= chooserRect.left - radius
          && point.x <= chooserRect.right + radius
          && point.y >= chooserRect.top - radius
          && point.y <= chooserRect.bottom + radius;
      }).some(Boolean);
    });
  });
  expect(overlapsReferencedAlert).toBe(false);
}

const mapChooserUiKeepoutSelector = [
  ".desktop-status-capsule-anchor",
  ".desktop-map-control-rail",
  ".desktop-map-legend",
  ".desktop-status-chip-row-container",
  ".mobile-bottom-nav",
  ".mobile-status-peek",
  ".mobile-legend-pill",
  ".mobile-train-toggle",
  ".mobile-alert-history-shortcut",
  ".mobile-my-stations-shortcut",
  ".map-utility-cluster",
  ".map-control-rail",
  ".mobile-map-controls",
  ".rotated-map-hud",
  ".rotated-map-selection-hud",
  ".subway-closing-soon-chip",
  ".subway-closed-peek-chip",
  ".release-notes-notice",
  ".saved-station-global-notice",
  "header button",
  "header a",
  "[data-map-chooser-keepout]",
].join(",");

async function expectChooserToClearUiKeepouts(page: Page) {
  const result = await page.locator("[data-overlap-chooser]").evaluate((chooser, selector) => {
    const chooserRect = chooser.getBoundingClientRect();
    const keepouts = Array.from(document.querySelectorAll(selector)).filter((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      for (let current: Element | null = element; current; current = current.parentElement) {
        const style = getComputedStyle(current);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
      }
      return true;
    }).map((element) => {
      const rect = element.getBoundingClientRect();
      return { className: element.className, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    });
    return { measuredKeepoutCount: chooser.parentElement?.dataset.overlapChooserKeepoutCount, chooser: { left: chooserRect.left, top: chooserRect.top, right: chooserRect.right, bottom: chooserRect.bottom }, keepouts, collisions: keepouts.filter((rect) => {
      return chooserRect.left < rect.right
        && chooserRect.right > rect.left
        && chooserRect.top < rect.bottom
        && chooserRect.bottom > rect.top;
    }).map((rect) => rect.className) };
  }, mapChooserUiKeepoutSelector);
  expect(result.collisions, JSON.stringify(result, null, 2)).toEqual([]);
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
  await page.addInitScript(({ disclaimerKey, welcomeKey }) => {
    window.localStorage.setItem(welcomeKey, "true");
    window.localStorage.setItem(disclaimerKey, "true");
    // Suppress the PWA install nudge during smoke tests to avoid UI layout conflicts
    window.localStorage.setItem("linewatch-pwa-install-dismissed-at-v1", String(Date.now()));
  }, { disclaimerKey: disclaimerStorageKey, welcomeKey: welcomeStorageKey });
});

test("foreground recovery restarts map and constellation animation with stale visibility state", async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");

  const chevrons = page.locator(".rsz-chevron");
  const constellation = page.locator(".constellation-background-canvas");
  await expect(chevrons.first()).toBeAttached();
  await expect(constellation).toBeVisible();
  const chevronTransforms = () => chevrons.evaluateAll((paths) => (
    paths.map((path) => path.parentElement?.getAttribute("transform") ?? null)
  ));

  await page.evaluate(() => {
    const lifecycleWindow = window as Window & { smokeVisibilityState?: DocumentVisibilityState };
    lifecycleWindow.smokeVisibilityState = "hidden";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => lifecycleWindow.smokeVisibilityState,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
  });

  await page.waitForTimeout(100);
  const pausedTransforms = await chevronTransforms();
  await page.waitForTimeout(150);
  expect(await chevronTransforms()).toEqual(pausedTransforms);

  // Reproduce the iOS standalone-PWA race: pageshow arrives while the public
  // visibilityState property still reports the pre-suspension hidden value.
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
  });

  await expect.poll(async () => {
    const first = await chevronTransforms();
    await page.waitForTimeout(150);
    return JSON.stringify(await chevronTransforms()) !== JSON.stringify(first);
  }).toBe(true);

  await expect.poll(async () => {
    const first = await constellation.evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL());
    await page.waitForTimeout(150);
    return (await constellation.evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL())) !== first;
  }).toBe(true);
});

test("introduces first-time riders before showing the unofficial-project notice", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  if (!isMobile) {
    await page.setViewportSize({ width: 900, height: 846 });
  }
  await page.addInitScript(({ disclaimerKey, welcomeKey }) => {
    if (!window.sessionStorage.getItem("linewatch-onboarding-smoke-initialized")) {
      window.localStorage.removeItem(welcomeKey);
      window.localStorage.removeItem(disclaimerKey);
      window.sessionStorage.setItem("linewatch-onboarding-smoke-initialized", "true");
    }
  }, { disclaimerKey: disclaimerStorageKey, welcomeKey: welcomeStorageKey });

  await page.goto(appUrl);

  const welcome = page.getByRole("dialog", { name: "Welcome to LineWatchTO" });
  await expect(welcome).toBeVisible();
  await expect(welcome).toContainText(/Read the live map/i);

  const carousel = welcome.locator(isMobile
    ? ".opening-welcome-carousel--mobile"
    : ".opening-welcome-carousel--desktop");
  const activeSlide = carousel.locator(".opening-welcome-slide-item--active");
  await expectActiveWelcomeSlideToFit(carousel);
  await carousel.getByRole("button", { name: "Next" }).click();
  await expect(activeSlide).toContainText(isMobile ? /Tap for alert details/i : /Explore an impact/i);
  await expectActiveWelcomeSlideToFit(carousel);
  await carousel.getByRole("button", { name: "Next" }).click();
  await expect(activeSlide).toContainText(isMobile ? /Monitor Your Commutes/i : /Make it yours/i);
  await expectActiveWelcomeSlideToFit(carousel);
  await expect(carousel.getByAltText(/My Commutes route/)).toBeVisible();
  if (isMobile) {
    await carousel.getByRole("button", { name: "Next" }).click();
    await expect(activeSlide).toContainText(/Watch Your Stations/i);
    await expectActiveWelcomeSlideToFit(carousel);
  }
  await expect(carousel.getByAltText(/My Stations panel/)).toBeVisible();
  await carousel.getByRole("button", { name: "Explore dashboard" }).click();
  await expect(welcome).toHaveCount(0);

  const notice = page.getByRole("region", { name: "Unofficial dashboard notice" });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("LineWatchTO is not affiliated with, endorsed by, or operated by the TTC or Metrolinx.");
  await page.getByRole("button", { name: "Got it" }).click();
  await expect(notice).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("dialog", { name: "Welcome to LineWatchTO" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Unofficial dashboard notice" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
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

test("reflows desktop chrome after resizing to a half-screen window", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "desktop-only responsive layout");
  await setStubMode(request, "seeded");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  await page.setViewportSize({ width: 900, height: 900 });
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));

  const viewportWidth = page.viewportSize()!.width;
  const [searchBox, utilityBox, statusBox, mapControlsBox] = await Promise.all([
    page.locator(".header-search-bar").boundingBox(),
    page.locator("header .map-utility-cluster").boundingBox(),
    page.locator(".desktop-status-capsule").boundingBox(),
    page.locator(".desktop-map-control-rail").boundingBox(),
  ]);
  for (const box of [searchBox, utilityBox, statusBox, mapControlsBox]) {
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewportWidth + 1);
  }
  expect(utilityBox!.x).toBeGreaterThanOrEqual(searchBox!.x + searchBox!.width);
  expect(statusBox!.y).toBeGreaterThanOrEqual(searchBox!.y + searchBox!.height);
  expect(mapControlsBox!.y).toBeGreaterThanOrEqual(statusBox!.y + statusBox!.height);

  await page.getByRole("button", { name: "Toggle menu" }).click();
  await page.getByRole("menuitem", { name: "Active Alerts" }).click();
  const floatingPanel = page.locator('.floating-panel-shell[data-floating-panel="alerts"]');
  await expect(floatingPanel).toBeVisible();
  const panelBox = await floatingPanel.boundingBox();
  expect(panelBox).not.toBeNull();
  expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(viewportWidth + 1);
  await expect(page.locator(".desktop-status-capsule-anchor")).toHaveCSS("opacity", "0");
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
  await expect(closedArrivalsSection.getByRole("heading", { name: "Train Arrivals" })).toBeVisible();
  await expect(closedArrivalsSection.getByText(/TTC scheduled service/i)).toBeVisible();
  await expect(closedArrivalsSection.getByText("Arrivals Not Available")).toHaveCount(0);
  await expect(closedArrivalsSection.getByText("Schedule May Be Disrupted")).toHaveCount(0);

  const surfaceSection = page.locator('[data-station-section="surface-connections"]');
  await expect(surfaceSection).toBeVisible();
  await surfaceSection.getByText("Surface Connections").click();
  await expect(surfaceSection.getByText("Arrivals Not Available")).toHaveCount(0);

  await page.getByRole("button", { name: "Closed Screen" }).click();
  await expect(page.getByRole("heading", { name: "Subway Closed" })).toBeVisible();
});

test("station activation survives repeated clicks and an earlier panel close", async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");

  const stubStation = page.getByRole("button", { name: "Stub Station station details" });
  const stubPanel = page.getByRole("complementary", { name: "Stub Station station details" });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await stubStation.click();
    await expect(stubPanel).toBeVisible();
    await page.getByRole("button", { name: "Close station details" }).click();
    await expect(stubPanel).toHaveCount(0);
  }

  await stubStation.click();
  await expect(stubPanel).toBeVisible();
  await stubStation.click({ force: true });
  await expect(stubPanel).toBeVisible();

  await page.getByRole("button", { name: "Close station details" }).click();
  await stubStation.click({ force: true });
  await expect(stubPanel).toBeVisible();
  await page.waitForTimeout(250);
  await expect(stubPanel).toBeVisible();
});

test("mapped station details expose compact source-honest surface connections", async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  await page.getByRole("button", { name: "Stub Station station details" }).click();

  const panel = page.getByRole("complementary", { name: "Stub Station station details" });
  const surface = panel.locator('[data-station-section="surface-connections"]');
  await expect(surface).toBeVisible();
  await expect(surface.getByText("TTC live surface estimates")).toBeVisible();
  await surface.getByText("Surface Connections").click();
  await expect(surface.locator('[data-surface-route="504"]')).toBeVisible();
  await expect(surface.getByText("Dundas West Station")).toBeVisible();
  await expect(surface.getByText(/Bay 7/)).toBeVisible();
  await expect(surface.getByText("Live", { exact: true })).toBeVisible();
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
  await expect(mapSurface.locator(".regional-map-stage")).toHaveAttribute("data-raster-map-ready", "true");
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
  await expect(page.getByRole("button", { name: /Toggle estimated train markers/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Subway Closed" })).toHaveCount(0);

  const regionalStage = page.locator(".regional-map-stage");
  const initialCamera = await regionalStage.evaluate((element) => (element as HTMLElement).style.transform);
  const regionalTopPlane = regionalStage.locator(":scope > .raster-map-top-plane");
  const initialViewBox = await regionalTopPlane.getAttribute("viewBox");
  const initialViewport = page.viewportSize();
  expect(initialViewport).not.toBeNull();
  await page.setViewportSize({
    width: Math.max(initialViewport!.width - 120, 360),
    height: Math.max(initialViewport!.height - 80, 540),
  });
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  await expect.poll(() => regionalStage.evaluate((element) => (element as HTMLElement).style.transform)).not.toBe(initialCamera);
  await expect(regionalTopPlane).toHaveAttribute("viewBox", initialViewBox!);
  const resizedCamera = await regionalStage.evaluate((element) => (element as HTMLElement).style.transform);

  await regionalStage.hover();
  await page.mouse.wheel(0, -180);
  await expect.poll(() => regionalStage.evaluate((element) => (element as HTMLElement).style.transform)).not.toBe(resizedCamera);
  const adjustedCamera = await regionalStage.evaluate((element) => (element as HTMLElement).style.transform);
  await page.setViewportSize({
    width: Math.min(page.viewportSize()!.width + 40, initialViewport!.width),
    height: page.viewportSize()!.height,
  });
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  await expect.poll(() => regionalStage.evaluate((element) => (element as HTMLElement).style.transform)).toBe(adjustedCamera);

  const weston = page.locator('.regional-station-hit-target[data-regional-station-id="weston"]');
  await expect(weston).toHaveAttribute("tabindex", "0");
  await weston.press("Enter");
  const westonPanel = page.getByRole("complementary", { name: "Weston regional station details" });
  await expect(westonPanel).toBeVisible();
  await expect(westonPanel.getByRole("button", { name: "Save Weston to My Stations" })).toBeVisible();
  await expect(westonPanel.getByRole("button", { name: "Close station details" })).toBeVisible();
  await expect(westonPanel.locator(".regional-route-pill").first()).toBeVisible();

  await page.getByRole("button", { name: "Fit regional network" }).click({ force: true });
  const [regionalFadeSamples] = await Promise.all([
    page.evaluate(() => new Promise<number[]>((resolve) => {
      const samples: number[] = [];
      const root = document.documentElement;
      const surface = document.querySelector<HTMLElement>(".network-map-transition-surface");
      if (!surface) {
        resolve(samples);
        return;
      }

      const sampleFade = () => {
        samples.push(Number.parseFloat(getComputedStyle(surface).opacity));
        if (root.dataset.networkTransitionDirection) {
          resolve(samples);
          return;
        }
        requestAnimationFrame(sampleFade);
      };
      const observer = new MutationObserver(() => {
        if (root.dataset.networkTransitionPhase !== "fade-out") return;
        observer.disconnect();
        requestAnimationFrame(sampleFade);
      });
      observer.observe(root, { attributes: true });
    })),
    networkSelector.getByRole("button", { name: "TTC", exact: true }).click(),
  ]);
  expect(regionalFadeSamples.some((opacity) => opacity > 0 && opacity < 1)).toBe(true);
  expect(regionalFadeSamples.at(-1)).toBeLessThanOrEqual(0.01);
  await expect(root).toHaveAttribute("data-network-transition-direction", "back");
  await expect(mapSurface.locator(".ttc-svg-container")).toHaveCount(1);
  await expect(mapSurface.locator(".regional-map")).toHaveCount(0);
  await expect(mapSurface.locator(".ttc-map-stage")).toHaveAttribute("data-raster-map-ready", "true");
  await expect(mapSurface.locator(".ttc-map-stage")).not.toHaveAttribute("data-map-recenter-effect");
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

test("uses decoded raster artwork while preserving live map geometry in both network modes", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "desktop raster compositor coverage");
  // Fixture fallback exposes the complete station catalog, including every
  // authored label hit target used by this compositor/hover check.
  await setStubMode(request, "unavailable");
  await page.goto("/");

  const ttcStage = page.locator(".ttc-map-stage");
  await expect(ttcStage).toHaveAttribute("data-raster-map-ready", "true");
  await expect(page.locator(".ttc-map-entrance-reveal")).toHaveCount(0);
  await expect(ttcStage.locator(".raster-map-plane")).toHaveCount(3);
  await expect(ttcStage.locator(".ttc-authored-svg-source").first()).toHaveCSS("visibility", "hidden");
  await ttcStage.locator('[data-station-label-id="kipling"]').hover();
  const rasterLabelHover = ttcStage.locator(".raster-station-label-text-hover");
  await expect(rasterLabelHover).toHaveCount(1);
  await expect(rasterLabelHover).toHaveAttribute("transform", /scale\(1\.045\)/);
  await expect(rasterLabelHover.locator(":scope > image")).toHaveAttribute("mask", "url(#ttc-hovered-station-label-mask)");
  await expect(rasterLabelHover.locator("#ttc-hovered-station-target-mask")).toHaveCount(1);
  await expect(rasterLabelHover.locator("#ttc-hovered-station-label-mask > g"))
    .toHaveAttribute("mask", "url(#ttc-hovered-station-target-mask)");
  await expect(ttcStage.locator(".raster-map-plane--labels > image")).toHaveAttribute("mask", "url(#ttc-labels-raster-mask)");
  await expect(ttcStage.locator('[data-station-label-for="kipling"]')).toHaveCSS("visibility", "hidden");
  const ttcRasterSources = await ttcStage.locator(".raster-map-plane").evaluateAll((images) =>
    images.map((image) => (image as HTMLImageElement).currentSrc)
  );
  await ttcStage.dispatchEvent("wheel", { deltaY: -160, clientX: 720, clientY: 500 });
  await expect(ttcStage.locator(".raster-map-plane")).toHaveCount(3);
  expect(await ttcStage.locator(".raster-map-plane").evaluateAll((images) =>
    images.map((image) => (image as HTMLImageElement).currentSrc)
  )).toEqual(ttcRasterSources);

  const networkSelector = page.getByRole("group", { name: "Select transit network" });
  await networkSelector.getByRole("button", { name: "GO/UP", exact: true }).click();
  const regionalStage = page.locator(".regional-map-stage");
  await expect(regionalStage).toHaveAttribute("data-raster-map-ready", "true");
  await expect(regionalStage.locator(".raster-map-plane")).toHaveCount(3);
  await expect(regionalStage.locator("#regional-lines-layer")).toHaveCSS("visibility", "hidden");
  await expect(regionalStage.locator("#regional-stations-layer")).toHaveCount(1);
  const unionLabelTarget = regionalStage.locator('.regional-station-label-hit-target[data-regional-station-id="union"]');
  await unionLabelTarget.hover();
  const regionalRasterLabelHover = regionalStage.locator(".raster-station-label-text-hover");
  await expect(regionalRasterLabelHover).toHaveCount(1);
  await expect(regionalRasterLabelHover).toHaveAttribute("transform", /scale\(1\.045\)/);
  await expect(regionalRasterLabelHover.locator(":scope > image")).toHaveAttribute("mask", "url(#regional-hovered-station-label-mask)");
  await expect(regionalRasterLabelHover.locator("#regional-hovered-station-target-mask")).toHaveCount(1);
  await expect(regionalRasterLabelHover.locator("#regional-hovered-station-label-mask > g"))
    .toHaveAttribute("mask", "url(#regional-hovered-station-target-mask)");
  await expect(regionalStage.locator(".raster-map-plane--labels > image")).toHaveAttribute("mask", "url(#regional-labels-raster-mask)");
  await unionLabelTarget.dispatchEvent("pointerdown", { pointerId: 31, pointerType: "mouse", button: 0 });
  await expect(unionLabelTarget).not.toHaveClass(/regional-raster-label-halo|regional-station-label-hovered/);
  await expect(regionalRasterLabelHover).toHaveCount(1);
  await unionLabelTarget.dispatchEvent("pointerup", { pointerId: 31, pointerType: "mouse", button: 0 });
  await expect(regionalStage.locator('[data-regional-station-label-for="union"]').locator("..")).toHaveCSS("opacity", "0");
});

test("waits for the authored map font before measuring station label hover geometry", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "desktop font-loading race coverage");
  await setStubMode(request, "unavailable");

  let releaseFont!: () => void;
  let fontRequested = false;
  const fontGate = new Promise<void>((resolve) => {
    releaseFont = resolve;
  });
  await page.route("**/assets/fonts/texgyreheros-regular.woff2", async (route) => {
    fontRequested = true;
    await fontGate;
    await route.continue();
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  const ttcStage = page.locator(".ttc-map-stage");
  await expect(ttcStage).toBeVisible();

  try {
    await expect.poll(() => fontRequested).toBe(true);
    await expect(ttcStage).toHaveAttribute("data-map-label-font-ready", "false");
    await expect(ttcStage.locator("[data-station-label-id]")).toHaveCount(0);
  } finally {
    releaseFont();
  }

  await expect(ttcStage).toHaveAttribute("data-map-label-font-ready", "true");
  await expect(ttcStage.locator("[data-station-label-id]")).toHaveCount(109);
  const tobermoryLabel = ttcStage.locator('[data-station-label-for="tobermory"]');
  await expect.poll(() => tobermoryLabel.evaluate((label: SVGGraphicsElement) => label.getBBox().width))
    .toBeGreaterThan(375);
  await ttcStage.locator('[data-station-label-id="tobermory"]').hover();
  await expect(ttcStage.locator("#ttc-hovered-station-target-mask")).toHaveCount(1);
});

test("mobile loads compact independent label textures for both maps", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "mobile raster compositor coverage");
  const rasterRequests: string[] = [];
  page.on("request", (browserRequest) => {
    const pathname = new URL(browserRequest.url()).pathname;
    if (pathname.includes("/assets/linewatch/raster-maps/")) rasterRequests.push(pathname);
  });

  await setStubMode(request, "unavailable");
  await page.goto("/");

  const ttcStage = page.locator(".ttc-map-stage");
  await expect(ttcStage).toHaveAttribute("data-raster-map-ready", "true");
  await expect(ttcStage.locator(".raster-map-plane")).toHaveCount(3);
  await expect(ttcStage.locator(".raster-map-plane--labels")).toHaveCount(1);
  await expect(ttcStage.locator('.raster-map-plane--labels image')).toHaveAttribute("href", /ttc-labels-dark-mobile\.png/);

  await page.getByRole("group", { name: "Select transit network" })
    .getByRole("button", { name: "GO/UP", exact: true })
    .click();
  const regionalStage = page.locator(".regional-map-stage");
  await expect(regionalStage).toHaveAttribute("data-raster-map-ready", "true");
  await expect(regionalStage.locator(".raster-map-plane")).toHaveCount(3);
  await expect(regionalStage.locator(".raster-map-plane--labels")).toHaveCount(1);
  await expect(regionalStage.locator('.raster-map-plane--labels image')).toHaveAttribute("href", /regional-labels-dark-mobile\.png/);

  expect(rasterRequests.length).toBeGreaterThanOrEqual(6);
  expect(rasterRequests.every((pathname) => pathname.endsWith("-mobile.png"))).toBe(true);
});

test("regional refresh, pan, zoom, and center preserve the authored SVG instance", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "desktop regional camera regression");
  await setStubMode(request, "seeded");
  await page.goto("/");

  await page.getByRole("group", { name: "Select transit network" })
    .getByRole("button", { name: "GO/UP", exact: true })
    .click();
  await expect(page.locator("html")).not.toHaveAttribute("data-network-transition-direction");

  const regionalMap = page.locator(".regional-map");
  const regionalViewport = regionalMap.locator(".regional-map-viewport");
  const regionalStage = regionalMap.locator(".regional-map-stage");
  const authoredSvg = regionalStage.locator('svg[aria-label="GO and UP regional rail schematic"]');
  const authoredLines = authoredSvg.locator("#regional-lines-layer");
  await expect(authoredSvg).toBeVisible();
  await authoredSvg.evaluate((element) => element.setAttribute("data-smoke-stable", "regional-base"));
  await authoredLines.evaluate((element) => element.setAttribute("data-smoke-stable", "regional-lines"));

  // Force the same dashboard refresh path used by the 30-second poll. The
  // dynamic impact layer should change without replacing the authored SVG.
  await setStubMode(request, "regional-live");
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.locator(
    '.regional-overlay-segment-group[data-regional-impact-id="regional-demo-delay"]',
  )).toBeAttached();
  await expect(authoredSvg).toHaveAttribute("data-smoke-stable", "regional-base");
  await expect(authoredLines).toHaveAttribute("data-smoke-stable", "regional-lines");

  const viewportBox = await regionalViewport.boundingBox();
  expect(viewportBox).not.toBeNull();
  const pointerX = viewportBox!.x + viewportBox!.width * 0.22;
  const pointerY = viewportBox!.y + viewportBox!.height * 0.24;
  await page.mouse.move(pointerX, pointerY);
  await page.mouse.down();
  await page.mouse.move(pointerX + 90, pointerY + 55, { steps: 5 });
  await page.mouse.up();
  await page.mouse.wheel(0, -80);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Fit regional network" }).click();
  await expect(regionalMap).toHaveAttribute("data-regional-map-camera-moving", "false", { timeout: 2_000 });

  await expect(authoredSvg).toHaveAttribute("data-smoke-stable", "regional-base");
  await expect(authoredLines).toHaveAttribute("data-smoke-stable", "regional-lines");
  expect(await regionalStage.evaluate((element) => getComputedStyle(element).willChange)).toBe("auto");
  await expect(regionalMap.locator(".regional-map-recenter-veil")).toHaveCount(0);
});

test("regional station names share the TTC raster hover glow and station selection", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "desktop hover behavior");
  await setStubMode(request, "seeded");
  await page.goto("/");

  await page.getByRole("group", { name: "Select transit network" })
    .getByRole("button", { name: "GO/UP", exact: true })
    .click();

  const authoredLabel = page.locator('[data-regional-station-label-for="kipling"]');
  const labelTarget = page.locator('[data-regional-station-label-id="kipling"]');
  await expect(authoredLabel).toHaveCount(1);
  await expect(labelTarget).toHaveCount(1);

  await labelTarget.hover();
  const rasterLabelHover = page.locator(".regional-map-stage .raster-station-label-text-hover");
  await expect(rasterLabelHover).toHaveCount(1);
  await expect(rasterLabelHover).toHaveAttribute("transform", /scale\(1\.045\)/);
  await expect(rasterLabelHover.locator("#regional-hovered-station-target-mask")).toHaveCount(1);
  await expect(rasterLabelHover.locator("#regional-hovered-station-label-mask > g"))
    .toHaveAttribute("mask", "url(#regional-hovered-station-target-mask)");

  await labelTarget.click();
  await expect(page.getByRole("complementary", { name: "Kipling regional station details" })).toBeVisible();
});

test("mobile preserves status and station interaction language across network switches", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "mobile-only cross-network parity smoke");
  await setStubMode(request, "seeded");
  await page.goto("/");

  const networkSelector = page.locator(".mobile-network-selector-slot")
    .getByRole("group", { name: "Select transit network" });
  await networkSelector.getByRole("button", { name: "GO/UP", exact: true }).click();

  await expect(page.getByText("Regional Demo · Not Live", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Status", exact: true }).click();
  const statusSheet = page.getByRole("region", { name: "Current service status" });
  await expect(statusSheet).toContainText("GO & UP regional rail");
  await expect(statusSheet).toContainText("Regional demo data — not live service information.");
  await expect(statusSheet.getByRole("button", { name: /Accessibility Outages/ })).toBeVisible();
  await expect(statusSheet.getByRole("button", { name: /Service Notices/ })).toBeVisible();
  await expect(statusSheet.getByRole("button", { name: /Trip Changes/ })).toBeVisible();
  await expect(statusSheet.getByRole("button", { name: /Reduced Speed Zones/ })).toHaveCount(0);

  await statusSheet.getByRole("button", { name: "Close status" }).click();
  await page.getByRole("button", { name: "More", exact: true }).click();
  const moreSheet = page.getByRole("region", { name: "More LineWatchTO options" });
  await expect(moreSheet.getByRole("button", { name: /My Commutes/ })).toBeVisible();
  await moreSheet.getByRole("button", { name: "Close more options" }).click();
  const weston = page.locator('.regional-station-hit-target[data-regional-station-id="weston"]');
  await weston.press("Enter");
  const stationPanel = page.getByRole("complementary", { name: "Weston regional station details" });
  await expect(stationPanel.getByRole("button", { name: "Save Weston to My Stations" })).toBeVisible();
  await expect(stationPanel.getByRole("button", { name: "Close station details" })).toBeVisible();
});

test("opens fresh regional notices from desktop and mobile navigation", async ({ page, request, isMobile }) => {
  await setStubMode(request, "regional-live");
  await page.goto("/");

  if (isMobile) {
    await page.locator(".mobile-network-selector-slot")
      .getByRole("group", { name: "Select transit network" })
      .getByRole("button", { name: "GO/UP", exact: true })
      .click();
    await page.getByRole("button", { name: "Status", exact: true }).click();
    await page.getByRole("region", { name: "Current service status" })
      .getByRole("button", { name: /Service Notices/ })
      .click();
  } else {
    await page.getByRole("group", { name: "Select transit network" })
      .getByRole("button", { name: "GO/UP", exact: true })
      .click();
    await expect(page.locator(".desktop-status-chip--trip-changes")).toBeVisible();
    await page.getByRole("button", { name: /Toggle menu/ }).click();
    await page.getByRole("menuitem", { name: "Service Notices" }).click();
  }

  await expect(page.getByRole("heading", { name: "GO / UP Notices" })).toBeVisible();
  await expect(page.getByText("Barrie station construction notice", { exact: true })).toBeVisible();
  await expect(page.getByText("Metrolinx notices", { exact: true })).toBeVisible();
  await expect(page.locator(".surface-notice-route-group").getByText("Barrie", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("GO Bus 31", { exact: true })).toBeVisible();
  await expect(page.getByText("Route 31 buses are detouring", { exact: true })).toBeVisible();

  const serviceFilter = page.getByRole("group", { name: "Filter GO / UP notices by service" });
  await serviceFilter.getByRole("button", { name: "Bus", exact: true }).click();
  await expect(page.getByText("Route 31 buses are detouring", { exact: true })).toBeVisible();
  await expect(page.getByText("Barrie station construction notice", { exact: true })).toHaveCount(0);
  await serviceFilter.getByRole("button", { name: "Train", exact: true }).click();
  await expect(page.getByText("Barrie station construction notice", { exact: true })).toBeVisible();
  await expect(page.getByText("Route 31 buses are detouring", { exact: true })).toHaveCount(0);

  await page.getByRole("group", { name: "GO / UP notice content" })
    .getByRole("button", { name: /Trip changes/i })
    .click();
  await expect(page.getByText("Train 681", { exact: true })).toBeVisible();
  await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
  await expect(page.getByText("Union Station", { exact: true })).toBeVisible();
  await expect(page.getByText(/Schedule-matched changes include published stop times/)).toBeVisible();
  await expect(page.locator(
    '[data-regional-impact-id="regional-trip-change-2026-06-04-BR681-cancellation"]',
  )).toHaveCount(0);
});

test("opens the dedicated regional Trip Changes entry", async ({ page, request, isMobile }) => {
  await setStubMode(request, "regional-live");
  await page.goto("/");

  if (isMobile) {
    await page.locator(".mobile-network-selector-slot")
      .getByRole("group", { name: "Select transit network" })
      .getByRole("button", { name: "GO/UP", exact: true })
      .click();
    const tripChangesPeek = page.locator(".mobile-status-peek-count-badge.trip-changes");
    await expect(tripChangesPeek).toContainText("1Trip Change");
    await tripChangesPeek.click();
  } else {
    await page.getByRole("group", { name: "Select transit network" })
      .getByRole("button", { name: "GO/UP", exact: true })
      .click();
    await page.getByRole("button", { name: /Toggle menu/ }).click();
    await page.getByRole("menuitem", { name: "Trip Changes" }).click();
  }
  await expect(page.getByRole("group", { name: "GO / UP notice content" })
    .getByRole("button", { name: "Trip Changes", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Train 681", { exact: true })).toBeVisible();
});

test("regional segment selections flash quickly then breathe", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "network selection is desktop-only");
  await setStubMode(request, "regional-live");

  await page.goto("/");
  await page.getByRole("group", { name: "Select transit network" })
    .getByRole("button", { name: "GO/UP", exact: true })
    .click();

  const delayOverlay = page.locator(
    '.regional-overlay-segment-group[data-regional-impact-kind="delay"][data-regional-impact-id="regional-demo-delay"]',
  );
  await expect(delayOverlay).toHaveCount(1);
  const delayHitTarget = delayOverlay.locator(".regional-impact-hit-target");
  await delayHitTarget.dispatchEvent("click");
  await expect(delayOverlay).toHaveAttribute("data-regional-impact-selected", "true");

  const selectedDelayGlow = delayOverlay.locator(".regional-impact-interactive-glow");
  await expect(page.locator(".regional-map")).toHaveAttribute(
    "data-regional-map-camera-moving",
    "true",
  );
  expect(await selectedDelayGlow.evaluate(
    (element) => getComputedStyle(element).animationName,
  )).toBe("regional-selection-path-intro, regional-selection-path-breathe");
  await expect.poll(() => selectedDelayGlow.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      animationName: style.animationName,
      animationDuration: style.animationDuration,
      animationDelay: style.animationDelay,
      transitionDuration: style.transitionDuration,
    };
  })).toEqual({
    animationName: "regional-selection-path-intro, regional-selection-path-breathe",
    animationDuration: "2.4s, 1.2s",
    animationDelay: "0s, 2.4s",
    transitionDuration: "0s",
  });
  await expect(selectedDelayGlow).not.toHaveAttribute("mask");
  await expect(selectedDelayGlow).toHaveCSS("stroke", "rgb(2, 132, 199)");
  expect(Number(await selectedDelayGlow.evaluate(
    (element) => getComputedStyle(element).opacity,
  ))).toBeGreaterThan(0);
  expect(await delayOverlay.evaluate((group) => {
    const visiblePath = group.querySelector(".regional-impact-path");
    const selectionPath = group.querySelector(".regional-impact-interactive-glow");
    const hitTarget = group.querySelector(".regional-impact-hit-target");
    if (!visiblePath || !selectionPath || !hitTarget) return false;
    return Boolean(
      visiblePath.compareDocumentPosition(selectionPath) & Node.DOCUMENT_POSITION_FOLLOWING,
    ) && Boolean(
      selectionPath.compareDocumentPosition(hitTarget) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
  })).toBe(true);
  const introSamples = await selectedDelayGlow.evaluate((element) => {
    const intro = element.getAnimations().find(
      (animation) => animation instanceof CSSAnimation
        && animation.animationName === "regional-selection-path-intro",
    );
    if (!intro) return null;
    intro.pause();
    intro.currentTime = 0;
    const restingStyle = getComputedStyle(element);
    const resting = {
      opacity: Number(restingStyle.opacity),
      strokeWidth: Number.parseFloat(restingStyle.strokeWidth),
    };
    intro.currentTime = 300;
    const flashingStyle = getComputedStyle(element);
    return {
      resting,
      flashing: {
        opacity: Number(flashingStyle.opacity),
        strokeWidth: Number.parseFloat(flashingStyle.strokeWidth),
      },
    };
  });
  expect(introSamples).not.toBeNull();
  expect(introSamples!.flashing.opacity).toBeGreaterThan(introSamples!.resting.opacity + 0.4);
  expect(introSamples!.flashing.strokeWidth).toBeGreaterThan(introSamples!.resting.strokeWidth + 20);
});

test("renders fresh Metrolinx impacts in regional mode", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "network selection is desktop-only");
  await setStubMode(request, "regional-live");

  await page.goto("/");
  await page.getByRole("group", { name: "Select transit network" })
    .getByRole("button", { name: "GO/UP", exact: true })
    .click();

  await expect(page.getByText("Last Polled: Metrolinx smoke poll", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pickering to Whitby delay impact" })).toBeAttached();
  await expect(page.getByText("Last Polled: regional fixture mode", { exact: true })).toHaveCount(0);

  const delayOverlay = page.locator(
    '.regional-overlay-segment-group[data-regional-impact-kind="delay"][data-regional-impact-id="regional-demo-delay"]',
  );
  await expect(delayOverlay).toHaveCount(1);
  await expect(delayOverlay).toHaveAttribute("data-regional-impact-segment-count", "2");
  expect(await delayOverlay.locator(".regional-impact-path").evaluate((path) => (
    (path.getAttribute("d")?.match(/\bM\b/g) ?? []).length
  ))).toBe(1);
  await expect(delayOverlay.locator(".delay-static-base")).toBeAttached();
  await expect(delayOverlay.locator('[data-regional-delay-direction="forward"]')).toBeAttached();
  await expect(delayOverlay.locator(".regional-delay-glyph--hourglass").first()).toBeAttached();
  await expect(delayOverlay.locator(".regional-delay-glyph--arrow").first()).toBeAttached();
  await expect(page.locator(".regional-station-impact-beacon-group")).toHaveCount(1);
  await expect(page.locator(".regional-station-impact-direction-glyph")).toHaveCount(1);
  const bloorBeacon = page.locator(
    '.regional-station-impact-beacon-group[data-regional-station-impact-anchor-id="station-bloor-up"]',
  );
  await expect(bloorBeacon).toBeVisible();
  await expect(page.locator(
    '.regional-station-impact-ring[data-regional-impact-id="regional-demo-bloor-station-delay"] :is(circle, ellipse)',
  )).toHaveCount(1);
  await expect(
    page.locator(".regional-station-impact-direction-glyph .station-impact-direction-arrow"),
  ).toBeAttached();
  const [bloorDotBox, bloorBeaconBox, bloorArrowBox] = await Promise.all([
    page.locator("#station-bloor-up").boundingBox(),
    bloorBeacon.boundingBox(),
    page.locator(
      '.regional-station-impact-direction-glyph[data-regional-station-impact-anchor-id="station-bloor-up"]',
    ).boundingBox(),
  ]);
  expect(bloorDotBox).not.toBeNull();
  expect(bloorBeaconBox).not.toBeNull();
  expect(bloorArrowBox).not.toBeNull();
  const center = (box: NonNullable<typeof bloorDotBox>) => ({
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  });
  const bloorDotCenter = center(bloorDotBox!);
  for (const effectBox of [bloorBeaconBox!, bloorArrowBox!]) {
    const effectCenter = center(effectBox);
    expect(Math.abs(effectCenter.x - bloorDotCenter.x)).toBeLessThan(3);
    expect(Math.abs(effectCenter.y - bloorDotCenter.y)).toBeLessThan(3);
  }
  expect(bloorArrowBox!.width).toBeLessThan(bloorDotBox!.width * 0.9);
  expect(bloorArrowBox!.height).toBeLessThan(bloorDotBox!.height * 0.9);
  expect(await page.locator(
    '.regional-station-impact-ring[data-regional-impact-id="regional-demo-bloor-station-delay"] :is(circle, ellipse)',
  ).evaluate((shape) => getComputedStyle(shape).stroke)).toBe("rgba(0, 0, 0, 0)");
  expect(await page.locator(".regional-station-impact-effects-layer").evaluate((effects) => {
    return effects.parentElement?.querySelector(".regional-station-impact-hover-foreground-layer") === null;
  })).toBe(true);

  const bloorImpactRing = page.locator(
    '.regional-station-impact-ring[data-regional-impact-id="regional-demo-bloor-station-delay"]',
  );
  const bloorImpactPoint = await bloorImpactRing.locator("circle, ellipse").evaluate((shape) => {
    const geometry = shape as SVGCircleElement | SVGEllipseElement;
    const centerX = Number(geometry.getAttribute("cx") ?? 0);
    const centerY = Number(geometry.getAttribute("cy") ?? 0);
    const radiusX = Number(geometry.getAttribute("r") ?? geometry.getAttribute("rx") ?? 0);
    const point = geometry.ownerSVGElement!.createSVGPoint();
    point.x = centerX + radiusX;
    point.y = centerY;
    const screenPoint = point.matrixTransform(geometry.getScreenCTM()!);
    return { x: screenPoint.x, y: screenPoint.y };
  });
  await page.mouse.move(bloorImpactPoint.x, bloorImpactPoint.y);
  const bloorStationHover = page.locator(
    '.regional-station-hover-indicator[data-regional-station-hover-id="bloor"]',
  );
  await expect(bloorStationHover).toHaveAttribute("data-regional-station-impact-hovered", "true");
  await expect(bloorStationHover).toHaveCSS("opacity", "1");
  await expect(bloorImpactRing).not.toHaveAttribute("data-regional-impact-hovered");

  const plannedOverlay = page.locator(
    '.regional-overlay-segment-group[data-regional-impact-kind="planned-closure"][data-regional-impact-id="regional-demo-planned"]',
  );
  await expect(plannedOverlay).toHaveCount(1);
  await expect(plannedOverlay).toHaveCSS("--regional-impact-width", "196px");
  await expect(delayOverlay).toHaveCSS("--regional-impact-width", "196px");
  await expect(delayOverlay.locator(".regional-impact-hit-target")).toHaveCSS("stroke-width", "365px");
  await expect(plannedOverlay).toHaveCSS("--map-pulse-offset", "0s");
  await expect(delayOverlay).toHaveCSS("--map-pulse-offset", "0s");
  const suspensionOverlay = page.locator(
    '.regional-overlay-segment-group[data-regional-impact-kind="suspension"][data-regional-impact-id="regional-demo-suspension"]',
  );
  await expect(suspensionOverlay).toHaveCount(1);
  await expect(suspensionOverlay.locator(".regional-suspension-glyph--no-entry > g").first())
    .toHaveAttribute("transform", /scale\(5\)/);
  await expect(plannedOverlay.locator(".regional-planned-closure-glyph--icon > g").first())
    .toHaveAttribute("transform", /scale\(6\.2\)/);
  const authoredRouteGap = await suspensionOverlay.locator(".regional-impact-path").evaluate((overlay) => {
    if (!(overlay instanceof SVGPathElement)) return Number.POSITIVE_INFINITY;
    const route = overlay.ownerSVGElement?.querySelector<SVGPathElement>("#regional-route-ki-path");
    if (!route) return Number.POSITIVE_INFINITY;
    const overlayLength = overlay.getTotalLength();
    const routeLength = route.getTotalLength();
    const overlayMatrix = overlay.getCTM();
    const routeMatrix = route.getCTM();
    if (!overlayMatrix || !routeMatrix) return Number.POSITIVE_INFINITY;
    const routePointCount = Math.ceil(routeLength / 8) + 1;
    const routePoints = Array.from({ length: routePointCount }, (_unused, index) => {
      const point = route.getPointAtLength(routeLength * index / Math.max(1, routePointCount - 1));
      return new DOMPoint(point.x, point.y).matrixTransform(routeMatrix);
    });
    return Math.max(...Array.from({ length: 17 }, (_unused, index) => {
      const localPoint = overlay.getPointAtLength(overlayLength * index / 16);
      const point = new DOMPoint(localPoint.x, localPoint.y).matrixTransform(overlayMatrix);
      return Math.min(...routePoints.map((routePoint) => Math.hypot(
        routePoint.x - point.x,
        routePoint.y - point.y,
      )));
    }));
  });
  expect(authoredRouteGap).toBeLessThan(12);
  expect(await delayOverlay.evaluate((delay, planned) => Boolean(
    delay.compareDocumentPosition(planned as Node) & Node.DOCUMENT_POSITION_FOLLOWING
  ), await plannedOverlay.elementHandle())).toBe(true);
  expect(await plannedOverlay.evaluate((planned, suspension) => Boolean(
    planned.compareDocumentPosition(suspension as Node) & Node.DOCUMENT_POSITION_FOLLOWING
  ), await suspensionOverlay.elementHandle())).toBe(true);

  const regionalOverlapMarker = page.locator('[data-overlap-segment-id^="regional-overlap-"]').first();
  await expect(regionalOverlapMarker).toBeVisible();
  const markerBox = await regionalOverlapMarker.boundingBox();
  const viewport = page.viewportSize();
  expect(markerBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(markerBox!.x).toBeGreaterThanOrEqual(0);
  expect(markerBox!.y).toBeGreaterThanOrEqual(0);
  expect(markerBox!.x + markerBox!.width).toBeLessThanOrEqual(viewport!.width);
  expect(markerBox!.y + markerBox!.height).toBeLessThanOrEqual(viewport!.height);

  const visibleOverlapBoxes = await page.locator('[data-overlap-segment-id^="regional-overlap-"]:visible')
    .evaluateAll((markers) => markers.map((marker) => marker.getBoundingClientRect().toJSON()));
  const visibleMapTextBoxes = await page.locator(
    'svg[aria-label="GO and UP regional rail schematic"] text:visible',
  ).evaluateAll((labels) => labels.map((label) => label.getBoundingClientRect().toJSON()));
  for (const overlapBox of visibleOverlapBoxes) {
    for (const textBox of visibleMapTextBoxes) {
      const overlapsText = overlapBox.x < textBox.x + textBox.width
        && overlapBox.x + overlapBox.width > textBox.x
        && overlapBox.y < textBox.y + textBox.height
        && overlapBox.y + overlapBox.height > textBox.y;
      expect(overlapsText).toBe(false);
    }
  }
  await page.waitForTimeout(250);
  const settledOverlapBoxes = await page.locator('[data-overlap-segment-id^="regional-overlap-"]:visible')
    .evaluateAll((markers) => markers.map((marker) => marker.getBoundingClientRect().toJSON()));
  expect(settledOverlapBoxes).toEqual(visibleOverlapBoxes);

  const lwOverlapMarker = page.getByRole("button", {
    name: /Overlapping alerts: Delay x2 on Union to Niagara Falls/,
  });
  await expect(lwOverlapMarker).toBeVisible();
  const [lwMarkerBox, applebyBox, burlingtonBox] = await Promise.all([
    lwOverlapMarker.boundingBox(),
    page.locator('.regional-station-hit-target[data-regional-station-id="appleby"]').boundingBox(),
    page.locator('.regional-station-hit-target[data-regional-station-id="burlington"]').boundingBox(),
  ]);
  expect(lwMarkerBox).not.toBeNull();
  expect(applebyBox).not.toBeNull();
  expect(burlingtonBox).not.toBeNull();
  const lwMarkerCenter = {
    x: lwMarkerBox!.x + lwMarkerBox!.width / 2,
    y: lwMarkerBox!.y + lwMarkerBox!.height / 2,
  };
  const lwOverlapCenter = {
    x: (applebyBox!.x + applebyBox!.width / 2 + burlingtonBox!.x + burlingtonBox!.width / 2) / 2,
    y: (applebyBox!.y + applebyBox!.height / 2 + burlingtonBox!.y + burlingtonBox!.height / 2) / 2,
  };
  expect(
    Math.abs(lwMarkerCenter.y - lwOverlapCenter.y) - lwMarkerBox!.height / 2,
  ).toBeGreaterThan(8);
  expect(Math.hypot(
    lwMarkerCenter.x - lwOverlapCenter.x,
    lwMarkerCenter.y - lwOverlapCenter.y,
  )).toBeLessThan(120);

  await lwOverlapMarker.click();
  const lwOverlapChooser = page.locator("[data-overlap-chooser]");
  await expect(lwOverlapChooser).toBeVisible();
  const lwChooserBox = await lwOverlapChooser.boundingBox();
  expect(lwChooserBox).not.toBeNull();
  await expectRegionalChooserToClearReferencedAlerts(page);
  await expectChooserToClearUiKeepouts(page);
  await lwOverlapChooser.getByRole("button", { name: "Close alert chooser" }).click();
  await expect(lwOverlapChooser).toHaveCount(0);

  await page.mouse.move(
    markerBox!.x + markerBox!.width / 2,
    markerBox!.y + markerBox!.height / 2,
  );
  const delayHoverForeground = page.locator(
    '.regional-impact-hover-foreground[data-regional-hover-impact-id="regional-demo-delay"]',
  );
  const plannedHoverForeground = page.locator(
    '.regional-impact-hover-foreground[data-regional-hover-impact-id="regional-demo-planned"]',
  );
  await expect(delayHoverForeground).toHaveAttribute("data-regional-impact-hovered", "true");
  await expect(plannedHoverForeground).toHaveAttribute("data-regional-impact-hovered", "true");
  const hoverForegrounds = page.locator(
    '.regional-impact-hover-foreground-layer .regional-impact-hover-foreground[data-regional-impact-hovered="true"]',
  );
  await expect(hoverForegrounds).toHaveCount(2);
  await expect(
    page.locator(".regional-impact-hover-foreground-layer .regional-impact-hit-target"),
  ).toHaveCount(0);

  await regionalOverlapMarker.click();
  const regionalOverlapChooser = page.locator("[data-overlap-chooser]");
  await expect(regionalOverlapChooser).toBeVisible();
  await expectRegionalChooserToClearReferencedAlerts(page);
  await expectChooserToClearUiKeepouts(page);
  await expect(regionalOverlapChooser.getByText("Choose Alert", { exact: true })).toBeVisible();
  await expect(regionalOverlapChooser.locator(".overlap-chooser-choice")).toHaveCount(2);
  await regionalOverlapChooser
    .locator('[data-overlap-choice-id="regional-demo-delay"]')
    .hover();
  await expect(delayHoverForeground).toHaveAttribute("data-regional-impact-hovered", "true");
  await expect(plannedHoverForeground).not.toHaveAttribute("data-regional-impact-hovered");
  await regionalOverlapChooser
    .locator('[data-overlap-choice-id="regional-demo-delay"]')
    .click();
  await expect(regionalOverlapChooser).toHaveCount(0);
  await expect(delayOverlay).toHaveAttribute("data-regional-impact-selected", "true");

  await delayOverlay.locator(".regional-impact-hit-target").dispatchEvent("click");
  await expect(delayOverlay).toHaveAttribute("data-regional-impact-selected", "true");
  expect(await delayOverlay.evaluate((delay, plannedSelector) => {
    const planned = document.querySelector(plannedSelector);
    return planned
      ? Boolean(planned.compareDocumentPosition(delay) & Node.DOCUMENT_POSITION_FOLLOWING)
      : false;
  }, '.regional-overlay-segment-group[data-regional-impact-id="regional-demo-planned"]')).toBe(true);

  const lwCorridorOverlay = page.locator(
    '.regional-overlay-segment-group[data-regional-impact-kind="delay"][data-regional-impact-id="regional-demo-lw-corridor-delay"]',
  );
  await expect(lwCorridorOverlay).toHaveCount(1);
  await expect(lwCorridorOverlay).toHaveAttribute("data-regional-impact-segment-count", "15");
  const lwCorridorPaths = await lwCorridorOverlay.locator(".regional-impact-path").evaluateAll(
    (paths) => paths.map((path) => path.getAttribute("d") ?? ""),
  );
  expect(lwCorridorPaths).toHaveLength(1);
  expect((lwCorridorPaths[0].match(/\bM\b/g) ?? []).length).toBe(2);
  expect((lwCorridorPaths[0].match(/\bL\b/g) ?? []).length).toBeGreaterThanOrEqual(15);
  const lwHoverMaskX = await page.locator(
    '.regional-impact-hover-foreground[data-regional-hover-impact-id="regional-demo-lw-corridor-delay"] mask',
  ).getAttribute("x");
  expect(Number(lwHoverMaskX)).toBeLessThan(-330);

  const delayHoverPoint = await delayOverlay.locator(".regional-impact-hit-target").evaluate((path) => {
    const geometry = path as SVGPathElement;
    const point = geometry.getPointAtLength(geometry.getTotalLength() * 0.85);
    const screenPoint = point.matrixTransform(geometry.getScreenCTM()!);
    return { x: screenPoint.x, y: screenPoint.y };
  });
  await page.mouse.move(delayHoverPoint.x, delayHoverPoint.y);
  await expect(delayHoverForeground).toHaveAttribute("data-regional-impact-hovered", "true");
  await expect(delayOverlay).not.toHaveAttribute("data-regional-impact-hovered");
  await expect(delayHoverForeground.locator(".regional-impact-aura, .regional-impact-path, .regional-delay-glyph-lane"))
    .toHaveCount(0);
  await expect(delayHoverForeground.locator(".regional-impact-hover-boundary"))
    .toHaveAttribute("mask", /regional-hover-boundary-mask-/);
  await expect(delayHoverForeground.locator("mask path[stroke='white']"))
    .toHaveAttribute("stroke-width", "234");
  await expect(delayHoverForeground.locator("mask path[stroke='black']"))
    .toHaveAttribute("stroke-width", "196");
  await expect(delayOverlay.locator(".regional-impact-interactive-glow"))
    .not.toHaveAttribute("mask");
  await expect(delayOverlay.locator(".regional-impact-interactive-glow"))
    .toHaveCSS("stroke", "rgb(2, 132, 199)");
  await expect(lwCorridorOverlay.locator(".regional-impact-interactive-glow")).toHaveCSS("opacity", "0");

  // Station hit targets sit above the authored rails. Crossing one must keep
  // the whole impact highlight on instead of briefly switching it off.
  const whitbyBox = await page.locator('.regional-station-hit-target[data-regional-station-id="whitby"]').boundingBox();
  expect(whitbyBox).not.toBeNull();
  await page.mouse.move(
    whitbyBox!.x + whitbyBox!.width / 2,
    whitbyBox!.y + whitbyBox!.height / 2,
  );
  await expect(delayHoverForeground).toHaveAttribute("data-regional-impact-hovered", "true");

  const pickeringStation = page.locator('.regional-station-hit-target[data-regional-station-id="pickering"]');
  await pickeringStation.press("Enter");
  const stationPanel = page.getByRole("complementary", { name: "Pickering regional station details" });
  await expect(stationPanel).toBeVisible();
  await expect(stationPanel.getByText("Metrolinx GO live estimates", { exact: true })).toBeVisible();
  await expect(stationPanel.getByText("To Kitchener", { exact: true })).toBeVisible();
  await expect(stationPanel.getByText("7 min", { exact: true })).toBeVisible();
  await expect(stationPanel.getByRole("heading", { name: "Platform 11" })).toBeVisible();
  await expect(stationPanel.getByText("Delayed estimate", { exact: true })).toBeVisible();
});

test("keeps transformed regional junction selection aligned with its station dots", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "network selection is desktop-only");
  await setStubMode(request, "seeded");

  await page.goto("/");
  await page.getByRole("group", { name: "Select transit network" })
    .getByRole("button", { name: "GO/UP", exact: true })
    .click();

  const bloorTarget = page.locator('.regional-station-hit-target[data-regional-station-id="bloor"]');
  await expect(bloorTarget).toBeVisible();
  await bloorTarget.click();

  const bloorSelection = page.locator(
    '[data-regional-station-selection-id="bloor"][data-regional-station-selected="true"]',
  );
  await expect(bloorSelection).toBeVisible();
  await expect(page.locator(".regional-map")).toHaveAttribute(
    "data-regional-map-camera-moving",
    "true",
  );
  await expect.poll(() => bloorSelection.evaluate(
    (element) => getComputedStyle(element).animationName,
  )).toBe("none");
  const bloorTopSelection = page.locator(
    '.regional-station-top-selection[data-regional-station-top-selected="true"]',
  );
  await expect(bloorTopSelection).toBeVisible();
  await expect.poll(() => bloorTopSelection.evaluate(
    (element) => getComputedStyle(element).animationName,
  )).toContain("map-selection-station-intro");
  await page.waitForTimeout(850);

  const [dotCenters, selectionCenters] = await Promise.all([
    page.locator("#station-bloor > :is(circle, ellipse)").evaluateAll((shapes) => shapes.map((shape) => {
      const bounds = shape.getBoundingClientRect();
      return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    }).sort((left, right) => left.x - right.x)),
    bloorSelection.locator(":scope > :is(circle, ellipse)").evaluateAll((shapes) => shapes.map((shape) => {
      const bounds = shape.getBoundingClientRect();
      return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    }).sort((left, right) => left.x - right.x)),
  ]);

  expect(selectionCenters).toHaveLength(dotCenters.length);
  for (let index = 0; index < dotCenters.length; index += 1) {
    expect(Math.abs(selectionCenters[index].x - dotCenters[index].x)).toBeLessThan(3);
    expect(Math.abs(selectionCenters[index].y - dotCenters[index].y)).toBeLessThan(3);
  }
  const [sourceSelectionBox, topSelectionBox] = await Promise.all([
    bloorSelection.boundingBox(),
    bloorTopSelection.boundingBox(),
  ]);
  expect(sourceSelectionBox).not.toBeNull();
  expect(topSelectionBox).not.toBeNull();
  expect(Math.abs(
    sourceSelectionBox!.x + sourceSelectionBox!.width / 2
      - (topSelectionBox!.x + topSelectionBox!.width / 2),
  )).toBeLessThan(3);
  expect(Math.abs(
    sourceSelectionBox!.y + sourceSelectionBox!.height / 2
      - (topSelectionBox!.y + topSelectionBox!.height / 2),
  )).toBeLessThan(3);
  await expect(bloorTopSelection).toHaveClass(/selection-intro-complete/, { timeout: 4_000 });
  await expect.poll(() => bloorTopSelection.evaluate(
    (element) => getComputedStyle(element).animationName,
  )).toBe("map-selection-station-breathe");
});

test("uses one station selection animation in both map modes", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "desktop verifies the animated selection lifecycle");
  await setStubMode(request, "seeded");

  await page.goto("/");
  await page.getByRole("button", { name: "Stub Station station details" }).click();

  const ttcUnderlay = page.locator(
    '.station-selected-indicator.foreground-flash-active[data-station-selected-id="stub-station"]',
  );
  const ttcForeground = page.locator(
    '.station-selection-flash[data-station-selection-foreground="stub-station"]',
  );
  await expect(ttcUnderlay).toBeAttached();
  await expect.poll(() => ttcUnderlay.evaluate(
    (element) => getComputedStyle(element).animationName,
  )).toBe("none");
  await expect.poll(() => ttcUnderlay.evaluate(
    (element) => getComputedStyle(element).opacity,
  )).toBe("0");
  await expect.poll(() => ttcForeground.evaluate(
    (element) => getComputedStyle(element).animationName,
  )).toContain("map-selection-station-intro");

  await page.goto("/");
  await page.getByRole("group", { name: "Select transit network" })
    .getByRole("button", { name: "GO/UP", exact: true })
    .click();
  await page.locator('.regional-station-hit-target[data-regional-station-id="union"]').click();

  const regionalUnderlay = page.locator(
    '.regional-station-selected-indicator.foreground-flash-active[data-regional-station-selection-id="union"]',
  );
  const regionalForeground = page.locator(
    '.regional-station-top-selection[data-regional-station-top-selected="true"]',
  );
  await expect(regionalUnderlay).toBeAttached();
  await expect.poll(() => regionalUnderlay.evaluate(
    (element) => getComputedStyle(element).animationName,
  )).toBe("none");
  await expect.poll(() => regionalUnderlay.evaluate(
    (element) => getComputedStyle(element).opacity,
  )).toBe("0");
  await expect.poll(() => regionalForeground.evaluate(
    (element) => getComputedStyle(element).animationName,
  )).toContain("map-selection-station-intro");
});

test("renders regional accessibility outages in the global and station views", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "regional network selection is covered on desktop");
  await setStubMode(request, "regional-live");
  await page.goto("/");
  await page.getByRole("group", { name: "Select transit network" })
    .getByRole("button", { name: "GO/UP", exact: true })
    .click();
  await page.getByRole("button", { name: "Toggle menu" }).click();
  await page.getByRole("menuitem", { name: /^Accessibility Outages/ }).click();

  await expect(page.getByRole("heading", { name: "Accessibility Outages" })).toBeVisible();
  await page.getByRole("button", { name: /Elevator Outages/ }).click();
  await expect(page.getByText("Lakeshore East corridor", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Eglinton.*1 outage/ }).click();
  await expect(page.getByText("The east tunnel elevator is out of service.", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "View Station" }).click();
  const stationPanel = page.getByRole("complementary", { name: "Eglinton regional station details" });
  const accessibilityOutages = stationPanel.locator('[data-station-section="accessibility"]');
  await expect(stationPanel).toBeVisible();
  await expect(accessibilityOutages.getByText("Metrolinx Open API", { exact: true })).toBeHidden();
  await expect(accessibilityOutages.getByText("Elevator out of service", { exact: true })).toBeHidden();
  await stationPanel.locator("summary.station-accessibility-summary").click();
  await expect(accessibilityOutages.getByText("Metrolinx Open API", { exact: true })).toBeVisible();
  await expect(accessibilityOutages.getByText("Elevator out of service", { exact: true })).toBeVisible();
});

test("renders regional estimated train markers from the network-scoped endpoint", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "regional network selection is covered on desktop");
  await setStubMode(request, "regional-live");
  await page.goto("/");
  const networkSelector = page.getByRole("group", { name: "Select transit network" });
  await networkSelector.getByRole("button", { name: "GO/UP", exact: true }).click();
  await expect(page.getByRole("region", { name: "Interactive GO and UP map" })).toBeVisible();
  await expect(page.locator(".regional-estimated-train-marker-layer")).toBeAttached();
  await expect(page.locator(".regional-estimated-train-marker-layer .estimated-train-marker")).toHaveCount(0);

  await page.getByRole("button", { name: /Toggle estimated train markers/ }).click();

  await expect(page.locator(".regional-estimated-train-marker-layer")).toBeAttached();
  const marker = page.locator('[data-marker-key="regional-ki:vehicle:cab-3775"]');
  await expect(page.locator(".estimated-train-marker-regional-ki")).toHaveCount(1);
  await expect(marker).toBeAttached();
  await expect(marker.locator(".estimated-train-marker-outline")).toHaveCount(1);
  await expect(marker.locator(".estimated-train-marker-core")).toHaveCount(1);
  await expect(marker.locator(".estimated-train-marker-window")).toHaveCount(3);
  await expect(marker.locator(".estimated-train-marker-arrow")).toHaveCount(1);
  expect(await marker.evaluate((node) => node.parentElement?.id)).toBe(
    "regional-train-marker-layer",
  );
  expect(await marker.evaluate((node) => Boolean(node.closest(".raster-map-top-plane")))).toBe(
    true,
  );
  expect(await marker.evaluate((node) => node.getAttribute("transform"))).toMatch(
    /^translate\(-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?\)/,
  );

  const upMarkers = page.locator('[data-train-marker-line-id="regional-up"]');
  await expect(upMarkers).toHaveCount(4);
  const regionalMarkerCenterlineDeviations = await page.locator(
    '.regional-estimated-train-marker-layer .estimated-train-marker',
  ).evaluateAll((markers) => {
    const airportSegments = new Set([
      "segment-up-mount-dennis-weston",
      "segment-up-weston-pearson-airport",
    ]);
    return markers.map((marker) => {
      const segmentId = (marker as SVGElement).dataset.trainMarkerSegmentId ?? "";
      const lineId = (marker as SVGElement).dataset.trainMarkerLineId ?? "";
      const routePathId = lineId === "regional-up"
        ? airportSegments.has(segmentId)
          ? "regional-route-up-airport-path"
          : "regional-route-up-path"
        : `regional-route-${lineId.replace("regional-", "")}-path`;
      const route = document.getElementById(routePathId) as SVGPathElement | null;
      const markerMatrix = (marker as SVGGraphicsElement).getCTM();
      const routeMatrix = route?.getCTM();
      const markerRootMatrix = (marker as SVGGraphicsElement).ownerSVGElement?.getCTM();
      if (!route || !markerMatrix || !routeMatrix || !markerRootMatrix) {
        return {
          segmentId,
          deviation: Number.POSITIVE_INFINITY,
          expectedDeviation: 0,
        };
      }
      const markerCenter = new DOMPoint(0, 0).matrixTransform(markerMatrix);
      const routeLength = route.getTotalLength();
      const sampleCount = Math.max(64, Math.ceil(routeLength / 12));
      let closestDistance = 0;
      let closestDistanceSquared = Number.POSITIVE_INFINITY;
      const distanceSquaredAt = (distance: number) => {
        const point = route.getPointAtLength(distance).matrixTransform(routeMatrix);
        return (point.x - markerCenter.x) ** 2 + (point.y - markerCenter.y) ** 2;
      };
      for (let index = 0; index <= sampleCount; index += 1) {
        const distance = routeLength * index / sampleCount;
        const distanceSquared = distanceSquaredAt(distance);
        if (distanceSquared < closestDistanceSquared) {
          closestDistance = distance;
          closestDistanceSquared = distanceSquared;
        }
      }
      let step = routeLength / sampleCount;
      for (let iteration = 0; iteration < 14; iteration += 1) {
        for (const candidate of [
          Math.max(0, closestDistance - step),
          Math.min(routeLength, closestDistance + step),
        ]) {
          const distanceSquared = distanceSquaredAt(candidate);
          if (distanceSquared < closestDistanceSquared) {
            closestDistance = candidate;
            closestDistanceSquared = distanceSquared;
          }
        }
        step /= 2;
      }
      return {
        segmentId,
        deviation: Math.sqrt(closestDistanceSquared),
        expectedDeviation: 44 * Math.hypot(markerRootMatrix.a, markerRootMatrix.b),
      };
    });
  });
  for (const { segmentId, deviation, expectedDeviation } of regionalMarkerCenterlineDeviations) {
    expect(
      Math.abs(deviation - expectedDeviation),
      `${segmentId} marker should use its scaled directional lane`,
    ).toBeLessThan(1);
  }

  const disruptionOverlay = page.locator(".regional-overlay-segment-group").first();
  await expect(disruptionOverlay).toBeAttached();
  const originalDisruptionOverlay = await disruptionOverlay.elementHandle();
  expect(originalDisruptionOverlay).not.toBeNull();
  await page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/api/regional/trains"
  );
  expect(await originalDisruptionOverlay!.evaluate((node) => node.isConnected)).toBe(true);
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
  await expect(page.getByText("Southbound", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Eglinton", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Davisville", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Track issue").first()).toBeVisible();
  await expect(page.getByText("Mid-June")).toBeVisible();

  const groupedTimingCard = page.locator(".alert-card").filter({ hasText: "King" });
  await expect(groupedTimingCard.locator(".rsz-timing-breakdown")).toHaveCount(2);
  await expect(groupedTimingCard.locator(".rsz-timing-row")).toHaveCount(4);
  await expect(groupedTimingCard.locator('time[datetime="2026-06-03T09:00:00-04:00"]')).toBeVisible();
  await expect(groupedTimingCard.locator('time[datetime="2026-06-03T09:30:00-04:00"]')).toBeVisible();
  await expect(groupedTimingCard.locator('time[datetime="2026-06-03T10:00:00-04:00"]')).toBeVisible();
  await expect(groupedTimingCard.locator('time[datetime="2026-06-03T10:30:00-04:00"]')).toBeVisible();
  const startedTimingRows = groupedTimingCard.locator(".rsz-timing-breakdown").first().locator(".rsz-timing-row");
  const startedRowTops = await startedTimingRows.evaluateAll((rows) =>
    rows.map((row) => row.getBoundingClientRect().top),
  );
  expect(startedRowTops[1]).toBeGreaterThan(startedRowTops[0]);
  const timingCountColor = await groupedTimingCard.locator(".rsz-timing-count").first().evaluate(
    (element) => getComputedStyle(element).color,
  );
  const zoneCountColor = await groupedTimingCard.locator(".rsz-zone-count-label-total").evaluate(
    (element) => getComputedStyle(element).color,
  );
  expect(timingCountColor).toBe(zoneCountColor);
  if (isMobile) {
    const directionalTimingColumns = await groupedTimingCard.locator(".has-directional-timing").evaluateAll(
      (fields) => fields.map((field) => ({
        start: getComputedStyle(field).gridColumnStart,
        end: getComputedStyle(field).gridColumnEnd,
      })),
    );
    expect(directionalTimingColumns).toEqual([
      { start: "1", end: "-1" },
      { start: "1", end: "-1" },
    ]);

    await groupedTimingCard.getByRole("button", { name: "Show on Map" }).click();
    const groupedTimingInspector = page.locator('[data-mobile-impact-inspector]');
    await expect(groupedTimingInspector).toBeVisible();
    const inspectorTimingColumns = await groupedTimingInspector.locator(".has-directional-timing").evaluateAll(
      (fields) => fields.map((field) => ({
        start: getComputedStyle(field).gridColumnStart,
        end: getComputedStyle(field).gridColumnEnd,
      })),
    );
    expect(inspectorTimingColumns).toEqual([
      { start: "1", end: "-1" },
      { start: "1", end: "-1" },
    ]);
    await groupedTimingInspector.getByRole("button", { name: "View in List" }).click();
    await expect(page.getByRole("heading", { name: "Reduced Speed Zones" })).toBeVisible();
  }

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

test("opens the site guide and completes verified email signup", async ({ page, request, isMobile }) => {
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
  await dialog.getByRole("button", { name: "Create Account" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Enter a valid email address.");

  await dialog.getByLabel("Email").fill("rider@example.com");
  await dialog.getByRole("button", { name: "Create Account" }).click();

  const verificationDialog = page.getByRole("dialog", { name: "Verify your email for LineWatchTO" });
  await expect(verificationDialog).toContainText("Check your email to verify your LineWatchTO account");
  await verificationDialog.getByLabel("Password", { exact: true }).fill("aaaaaaaaaa");
  await verificationDialog.getByLabel("Confirm password").fill("aaaaaaaaaa");
  await verificationDialog.getByRole("button", { name: "Verify Local Account" }).click();
  await expect(verificationDialog.getByRole("alert")).toContainText("Password must include a number, symbol, or space.");

  await verificationDialog.getByLabel("Password", { exact: true }).fill("correct horse battery staple");
  await verificationDialog.getByLabel("Confirm password").fill("correct horse battery staple");
  await verificationDialog.getByRole("button", { name: "Verify Local Account" }).click();
  await expect(verificationDialog).toContainText("Email verified. You are now signed in.");
  await verificationDialog.getByRole("button", { name: "Continue" }).click();
  await expect(verificationDialog).toHaveCount(0);
});

test("accepts a one-time email verification link", async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await page.goto("/verify-email#token=smoke-verification-token");

  const dialog = page.getByRole("dialog", { name: "Verify your email for LineWatchTO" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Verification links expire after 24 hours");
  await dialog.getByLabel("Password", { exact: true }).fill("correct horse battery staple");
  await dialog.getByLabel("Confirm password").fill("correct horse battery staple");
  await dialog.getByRole("button", { name: "Verify Email" }).click();

  await expect(dialog).toContainText("Email verified. You are now signed in.");
  await expect(page).toHaveURL("/");
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

  const mapElement = page.locator(".ttc-map-stage").first();
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
  await expect(page.locator('[data-station-id="stub-station"]')).toHaveAttribute("r", "37");
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

test("alert submenus persist one per-device card or list preference", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  await openServiceCategory(page, isMobile, /Reduced Speed Zone/);
  const cardEdgeWidth = await page.locator(".alert-card").first().evaluate(
    (element) => getComputedStyle(element).borderLeftWidth,
  );
  await page.getByRole("button", { name: "List view" }).click();
  await expect(page.locator(".alert-stack")).toHaveClass(/is-list-view/);
  await expect(page.locator(".compact-impact-list-item")).toHaveCount(2);
  await expect(page.locator(".alert-card")).toHaveCount(0);
  const firstCompactRow = page.locator(".compact-impact-list-item").first();
  await expect(firstCompactRow).toContainText("Direction:");
  await expect(firstCompactRow).toContainText("Reduced Speed:");
  await expect(firstCompactRow).toContainText("Est. Resolution:");
  await expect(firstCompactRow).toContainText("Updated:");
  await expect(firstCompactRow).not.toContainText("Zone Count:");
  const secondCompactRow = page.locator(".compact-impact-list-item").nth(1);
  await expect(secondCompactRow).toContainText("Zone Count:");
  await expect(firstCompactRow).toHaveCSS("border-left-color", "rgb(245, 158, 11)");
  await expect(firstCompactRow).toHaveCSS("border-left-width", cardEdgeWidth);
  await expect(firstCompactRow.locator(".compact-impact-list-item__facts")).toBeVisible();
  const firstStartedBounds = await firstCompactRow.locator(".is-column-3").boundingBox();
  const secondStartedBounds = await secondCompactRow.locator(".is-column-3").boundingBox();
  expect(firstStartedBounds).not.toBeNull();
  expect(secondStartedBounds).not.toBeNull();
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("linewatch-impact-list-view-v1"))).toBe("list");

  await openServiceCategory(page, isMobile, /Delay/);
  await expect(page.locator(".alert-stack")).toHaveClass(/is-list-view/);
  await expect(page.locator(".compact-impact-list-item").first()).toBeVisible();
  await expect(page.locator(".compact-impact-list-item").first()).toHaveCSS("border-left-color", "rgb(254, 236, 65)");

  await page.getByRole("button", { name: "Card view" }).click();
  await expect(page.locator(".alert-stack")).not.toHaveClass(/is-list-view/);
  await expect(page.locator(".alert-card").first()).toBeVisible();
});

test("mobile closing station details preserves the focused map camera", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "mobile-only station camera behavior");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  const mapLayer = page.locator(".ttc-map-stage").first();
  const defaultTransform = await mapLayer.evaluate((element) => element.style.transform);

  await page.getByRole("button", { name: "Stub Station station details" }).click();
  await expect(page.getByRole("complementary", { name: "Stub Station station details" })).toBeVisible();
  await expect
    .poll(async () => mapLayer.evaluate((element) => element.style.transform))
    .not.toBe(defaultTransform);
  await page.waitForTimeout(500);

  const focusedTransform = await mapLayer.evaluate((element) => element.style.transform);

  await page.getByRole("button", { name: "Close station details" }).click();
  await expect(page.getByRole("complementary", { name: "Stub Station station details" })).toHaveCount(0);
  await page.waitForTimeout(500);

  await expect
    .poll(async () => mapLayer.evaluate((element) => element.style.transform))
    .toBe(focusedTransform);
});

test("desktop TTC station focus keeps one camera target while the SVG settles", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "desktop programmatic camera flight");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  const viewport = page.locator("[data-map-pan-zoom-viewport]");
  const mapStage = viewport.locator(".ttc-map-stage");
  const authoredMap = mapStage.locator(".ttc-svg-container > svg");
  await expect(mapStage).toHaveCSS("width", "4500px");
  await expect(mapStage).toHaveCSS("height", "2181.8px");
  await authoredMap.evaluate((element) => {
    element.dataset.cameraTestIdentity = "stable-authored-map";
  });
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.waitForTimeout(150);
  const zoomedTransform = await mapStage.evaluate((element) => (element as HTMLElement).style.transform);

  await page.getByRole("button", { name: "Stub Station station details" }).dispatchEvent("click");
  await expect(viewport).toHaveAttribute("data-map-camera-moving", "true");
  await expect.poll(
    () => mapStage.evaluate((element) => (element as HTMLElement).style.transform),
  ).not.toBe(zoomedTransform);

  const focusTarget = await mapStage.evaluate((element) => (element as HTMLElement).style.transform);
  const stationAttention = page.locator(".station-selection-flash.map-selection-attention").first();
  const decorativeOverlayGlow = page.locator(
    ".overlay-segment-group .asset-alert-path-glow:is(.delay, .suspension, .reduced-speed-zone, .delay-static):not(.interactive-glow)",
  ).first();
  await expect(stationAttention).toBeAttached();
  await expect(decorativeOverlayGlow).toBeAttached();
  expect(await stationAttention.evaluate(
    (element) => getComputedStyle(element).animationPlayState,
  )).not.toContain("paused");
  expect(await stationAttention.evaluate(
    (element) => getComputedStyle(element).animationName,
  )).toContain("map-selection-station-intro");
  expect(await decorativeOverlayGlow.evaluate(
    (element) => getComputedStyle(element).filter,
  )).toContain("blur");
  expect(await decorativeOverlayGlow.evaluate(
    (element) => getComputedStyle(element).animationName,
  )).toContain("aura-pulse");
  expect(await decorativeOverlayGlow.evaluate(
    (element) => getComputedStyle(element).animationPlayState,
  )).toContain("paused");
  await expect(authoredMap).toHaveCSS("shape-rendering", "geometricprecision");
  await expect(authoredMap).toHaveCSS("text-rendering", "geometricprecision");
  const authoredTrack = mapStage.locator("#ttc-tracks-layer path").first();
  await expect(authoredTrack).toHaveCSS("shape-rendering", "geometricprecision");
  await expect(authoredTrack).toHaveCSS("text-rendering", "geometricprecision");

  await page.waitForTimeout(160);
  expect(await mapStage.evaluate((element) => (element as HTMLElement).style.transform)).toBe(focusTarget);
  await expect(viewport).toHaveAttribute("data-map-camera-moving", "false", { timeout: 2_000 });
  expect(await mapStage.evaluate((element) => (element as HTMLElement).style.transform)).toBe(focusTarget);
  await expect(authoredMap).toHaveAttribute("data-camera-test-identity", "stable-authored-map");
  await expect(authoredMap).toHaveCSS("shape-rendering", "geometricprecision");
  await expect(authoredMap).toHaveCSS("text-rendering", "geometricprecision");
  expect(await decorativeOverlayGlow.evaluate(
    (element) => getComputedStyle(element).filter,
  )).toContain("blur");
  expect(await decorativeOverlayGlow.evaluate(
    (element) => getComputedStyle(element).animationPlayState,
  )).not.toContain("paused");
});

test("desktop TTC overlay press arms the camera before the next frame", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "desktop animated camera behavior");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  const viewport = page.locator("[data-map-pan-zoom-viewport]");
  const target = page.getByRole("button", { name: "delay: Sheppard-Yonge to Don Mills" });
  await expect(target).toBeVisible();
  await expect(viewport).toHaveAttribute("data-map-camera-moving", "false", { timeout: 2_000 });

  await page.evaluate(() => {
    const viewportElement = document.querySelector<HTMLElement>("[data-map-pan-zoom-viewport]");
    const mapStage = document.querySelector<HTMLElement>(".ttc-map-stage");
    const overlayTarget = document.querySelector<SVGPathElement>(
      '[aria-label="delay: Sheppard-Yonge to Don Mills"]',
    );
    if (!viewportElement || !mapStage || !overlayTarget) {
      throw new Error("Missing TTC map timing elements");
    }

    const initialTransform = mapStage.style.transform;
    let nextFrameStarted = false;
    overlayTarget.addEventListener("click", () => {
      window.requestAnimationFrame(() => {
        nextFrameStarted = true;
      });
    }, { capture: true, once: true });

    const observer = new MutationObserver(() => {
      if (mapStage.style.transform === initialTransform) return;
      observer.disconnect();
      viewportElement.dataset.cameraArmedBeforeNextFrame = String(!nextFrameStarted);
    });
    observer.observe(mapStage, { attributes: true, attributeFilter: ["style"] });
  });

  await target.dispatchEvent("click");
  await expect(viewport).toHaveAttribute("data-camera-armed-before-next-frame", "true");
  await expect(viewport).toHaveAttribute("data-map-camera-moving", "true");
  const selectedOverlay = page.locator('[data-selected-impact-emphasis="stub-delay-line-4"]');
  await expect(selectedOverlay).toBeAttached();
  expect(await selectedOverlay.evaluate(
    (element) => getComputedStyle(element).animationName,
  )).toContain("map-selection-path-intro");
  expect(await selectedOverlay.evaluate(
    (element) => getComputedStyle(element).animationPlayState,
  )).not.toContain("paused");
});

test("desktop map gestures pause every overlay pulse while preserving glows", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "desktop map gesture paint behavior");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
  await page.waitForTimeout(900);

  const viewport = page.locator("[data-map-pan-zoom-viewport]");
  const authoredMap = viewport.locator(".ttc-svg-container > svg");
  const authoredTrack = viewport.locator("#ttc-tracks-layer path").first();
  const glow = page.locator(
    ".overlay-segment-group .asset-alert-path-glow:is(.delay, .suspension, .reduced-speed-zone, .delay-static):not(.interactive-glow)",
  ).first();
  const plannedPath = page.locator(".overlay-segment-group .asset-alert-path.planned-preview").first();
  await expect(glow).toBeAttached();
  await expect(plannedPath).toBeAttached();
  const viewportBox = await viewport.boundingBox();
  if (!viewportBox) throw new Error("Missing TTC map viewport bounds");
  const gesturePoint = {
    clientX: viewportBox.x + viewportBox.width * 0.75,
    clientY: viewportBox.y + viewportBox.height * 0.75,
  };

  await viewport.dispatchEvent("pointerdown", {
    ...gesturePoint,
    pointerId: 41,
    pointerType: "mouse",
    button: 0,
    buttons: 1,
    isPrimary: true,
  });
  await expect(page.locator("[data-map-gesture-active=true]")).toBeAttached();
  expect(await glow.evaluate((element) => getComputedStyle(element).filter)).toContain("blur");
  expect(await glow.evaluate((element) => getComputedStyle(element).animationName)).toBe("aura-pulse");
  expect(await glow.evaluate((element) => getComputedStyle(element).animationPlayState)).toBe("paused");
  expect(Number(await glow.evaluate((element) => getComputedStyle(element).opacity))).toBeGreaterThan(0);
  expect(await plannedPath.evaluate((element) => getComputedStyle(element).animationName)).toBe("map-overlay-rail-pulse");
  expect(await plannedPath.evaluate((element) => getComputedStyle(element).animationPlayState)).toBe("paused");
  await expect(authoredMap).toHaveCSS("shape-rendering", "geometricprecision");
  await expect(authoredTrack).toHaveCSS("shape-rendering", "geometricprecision");

  await viewport.dispatchEvent("pointerup", {
    ...gesturePoint,
    pointerId: 41,
    pointerType: "mouse",
    button: 0,
    buttons: 0,
    isPrimary: true,
  });
  await expect(page.locator("[data-map-gesture-active=true]")).toHaveCount(0);
  expect(await glow.evaluate((element) => getComputedStyle(element).filter)).toContain("blur");
  expect(await glow.evaluate((element) => getComputedStyle(element).animationPlayState)).toBe("running");
  expect(await plannedPath.evaluate((element) => getComputedStyle(element).animationPlayState)).toBe("running");
  await expect(authoredMap).toHaveCSS("shape-rendering", "geometricprecision");
  await expect(authoredTrack).toHaveCSS("shape-rendering", "geometricprecision");

  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const ttcZoomPaint = await viewport.evaluate((root) => {
    const zoomGlow = root.querySelector<SVGElement>(
      ".overlay-segment-group .asset-alert-path-glow:is(.delay, .suspension, .reduced-speed-zone, .delay-static):not(.interactive-glow)",
    );
    const zoomPlannedPath = root.querySelector<SVGElement>(
      ".overlay-segment-group .asset-alert-path.planned-preview",
    );
    if (!zoomGlow || !zoomPlannedPath) throw new Error("Missing TTC zoom overlays");
    return {
      zoomActive: root.dataset.mapZoomActive,
      cameraMoving: root.dataset.mapCameraMoving,
      glowFilter: getComputedStyle(zoomGlow).filter,
      glowPlayState: getComputedStyle(zoomGlow).animationPlayState,
      plannedPlayState: getComputedStyle(zoomPlannedPath).animationPlayState,
    };
  });
  expect(ttcZoomPaint).toMatchObject({
    zoomActive: "true",
    cameraMoving: "false",
    glowPlayState: "paused",
    plannedPlayState: "paused",
  });
  expect(ttcZoomPaint.glowFilter).toContain("blur");
  await expect(viewport).toHaveAttribute("data-map-zoom-active", "false");
  expect(await glow.evaluate((element) => getComputedStyle(element).animationPlayState)).toBe("running");
  expect(await plannedPath.evaluate((element) => getComputedStyle(element).animationPlayState)).toBe("running");

  const ttcRecenterPaint = await page.getByRole("button", { name: "Center map view" }).evaluate((button) => {
    (button as HTMLElement).click();
    const root = document.querySelector<HTMLElement>("[data-map-pan-zoom-viewport]");
    const stage = root?.querySelector<HTMLElement>(".ttc-map-stage");
    return {
      cameraMoving: root?.dataset.mapCameraMoving,
      transitionDuration: stage ? getComputedStyle(stage).transitionDuration : null,
      stageOpacity: stage ? getComputedStyle(stage).opacity : null,
      stageWillChange: stage ? getComputedStyle(stage).willChange : null,
      stageAnimationIds: stage?.getAnimations().map((candidate) => candidate.id) ?? [],
      recenterLayerCount: root?.querySelectorAll(".ttc-map-recenter-veil").length ?? -1,
    };
  });
  expect(ttcRecenterPaint).toEqual({
    cameraMoving: "false",
    transitionDuration: "0s",
    stageOpacity: "1",
    stageWillChange: "auto",
    stageAnimationIds: [],
    recenterLayerCount: 0,
  });
  await expect(authoredMap).toHaveCSS("shape-rendering", "geometricprecision");
  await expect(authoredTrack).toHaveCSS("shape-rendering", "geometricprecision");
  expect(await glow.evaluate((element) => getComputedStyle(element).filter)).toContain("blur");
  expect(Number(await glow.evaluate((element) => getComputedStyle(element).opacity))).toBeGreaterThan(0);
  expect(await glow.evaluate((element) => getComputedStyle(element).animationPlayState)).toBe("running");
  expect(await plannedPath.evaluate((element) => getComputedStyle(element).animationPlayState)).toBe("running");
  await expect(viewport).toHaveAttribute("data-map-camera-moving", "false");
  expect(await glow.evaluate((element) => getComputedStyle(element).filter)).toContain("blur");
  expect(await glow.evaluate((element) => getComputedStyle(element).animationPlayState)).toBe("running");

  await setStubMode(request, "regional-live");
  await page.getByRole("group", { name: "Select transit network" })
    .getByRole("button", { name: "GO/UP", exact: true })
    .click();

  const regionalMap = page.locator(".regional-map");
  const regionalViewport = regionalMap.locator(".regional-map-viewport");
  const regionalMapStage = regionalMap.locator(".regional-map-stage");
  const regionalAuthoredMap = regionalMapStage.locator(":scope > div > svg");
  const regionalAuthoredTrack = regionalMapStage.locator("#regional-route-lw-main-path");
  const regionalGlow = regionalMap.locator(
    '.regional-overlay-segment-group[data-regional-impact-id="regional-demo-delay"] .regional-impact-aura',
  );
  const regionalPlannedPath = regionalMap.locator(
    '.regional-overlay-segment-group[data-regional-impact-id="regional-demo-planned"] .regional-impact-path',
  );
  await expect(regionalGlow).toBeAttached();
  await expect(regionalPlannedPath).toBeAttached();
  const regionalViewportBox = await regionalViewport.boundingBox();
  if (!regionalViewportBox) throw new Error("Missing regional map viewport bounds");
  const regionalGesturePoint = {
    // This authored-map coordinate is also used by the regional stability
    // smoke test and reliably reaches the viewport's drag handler.
    x: regionalViewportBox.x + regionalViewportBox.width * 0.22,
    y: regionalViewportBox.y + regionalViewportBox.height * 0.24,
  };
  await regionalViewport.dispatchEvent("pointerdown", {
    clientX: regionalGesturePoint.x,
    clientY: regionalGesturePoint.y,
    pointerId: 42,
    pointerType: "mouse",
    button: 0,
    buttons: 1,
    isPrimary: true,
  });
  await expect(regionalMap).toHaveAttribute("data-map-gesture-active", "true");
  await expect(regionalMap).toHaveAttribute("data-regional-map-camera-moving", "false");
  expect(await regionalGlow.evaluate((element) => getComputedStyle(element).filter)).toContain("blur");
  expect(await regionalGlow.evaluate((element) => getComputedStyle(element).animationName)).toBe("aura-pulse");
  expect(await regionalGlow.evaluate((element) => getComputedStyle(element).animationPlayState)).toBe("paused");
  expect(await regionalPlannedPath.evaluate((element) => getComputedStyle(element).animationName)).toBe("map-overlay-rail-pulse");
  expect(await regionalPlannedPath.evaluate((element) => getComputedStyle(element).animationPlayState)).toBe("paused");
  await expect(regionalAuthoredMap).toHaveCSS("shape-rendering", "geometricprecision");
  await expect(regionalAuthoredTrack).toHaveCSS("shape-rendering", "geometricprecision");

  await regionalViewport.dispatchEvent("pointerup", {
    clientX: regionalGesturePoint.x,
    clientY: regionalGesturePoint.y,
    pointerId: 42,
    pointerType: "mouse",
    button: 0,
    buttons: 0,
    isPrimary: true,
  });
  await expect(regionalMap).toHaveAttribute("data-map-gesture-active", "false");
  expect(await regionalGlow.evaluate((element) => getComputedStyle(element).filter)).toContain("blur");
  await expect.poll(() => regionalGlow.evaluate(
    (element) => getComputedStyle(element).animationPlayState,
  )).toBe("running");
  await expect.poll(() => regionalPlannedPath.evaluate(
    (element) => getComputedStyle(element).animationPlayState,
  )).toBe("running");
  await expect(regionalAuthoredMap).toHaveCSS("shape-rendering", "geometricprecision");
  await expect(regionalAuthoredTrack).toHaveCSS("shape-rendering", "geometricprecision");

  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const regionalZoomPaint = await regionalMap.evaluate((root) => {
    const zoomGlow = root.querySelector<SVGElement>(
      '.regional-overlay-segment-group[data-regional-impact-id="regional-demo-delay"] .regional-impact-aura',
    );
    const zoomPlannedPath = root.querySelector<SVGElement>(
      '.regional-overlay-segment-group[data-regional-impact-id="regional-demo-planned"] .regional-impact-path',
    );
    if (!zoomGlow || !zoomPlannedPath) throw new Error("Missing regional zoom overlays");
    return {
      zoomActive: root.dataset.mapZoomActive,
      cameraMoving: root.dataset.regionalMapCameraMoving,
      glowFilter: getComputedStyle(zoomGlow).filter,
      glowPlayState: getComputedStyle(zoomGlow).animationPlayState,
      plannedPlayState: getComputedStyle(zoomPlannedPath).animationPlayState,
    };
  });
  expect(regionalZoomPaint).toMatchObject({
    zoomActive: "true",
    cameraMoving: "false",
    glowPlayState: "paused",
    plannedPlayState: "paused",
  });
  expect(regionalZoomPaint.glowFilter).toContain("blur");
  await expect(regionalMap).toHaveAttribute("data-map-zoom-active", "false");
  expect(await regionalGlow.evaluate((element) => getComputedStyle(element).animationPlayState)).toBe("running");
  expect(await regionalPlannedPath.evaluate((element) => getComputedStyle(element).animationPlayState)).toBe("running");

  const regionalRecenterPaint = await page.getByRole("button", { name: "Fit regional network" }).evaluate(async (button) => {
    const root = document.querySelector<HTMLElement>(".regional-map");
    const stage = root?.querySelector<HTMLElement>(".regional-map-stage");
    const zoomIn = root?.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]');
    if (!stage || !zoomIn) throw new Error("Missing regional Center regression controls");

    const cycles: Array<{
      cameraChanged: boolean;
      stageWillChange: string;
      stageAnimations: number;
      recenterLayerCount: number;
    }> = [];
    for (let cycle = 0; cycle < 8; cycle += 1) {
      zoomIn.click();
      await new Promise((resolve) => window.setTimeout(resolve, 140));
      const movedTransform = stage.style.transform;
      (button as HTMLElement).click();
      cycles.push({
        cameraChanged: movedTransform !== stage.style.transform,
        stageWillChange: getComputedStyle(stage).willChange,
        stageAnimations: stage.getAnimations().length,
        recenterLayerCount: root?.querySelectorAll(".regional-map-recenter-veil").length ?? -1,
      });
      if (cycle < 7) await new Promise((resolve) => window.setTimeout(resolve, 20));
    }

    return {
      cameraMoving: root?.dataset.regionalMapCameraMoving,
      transitionDuration: stage ? getComputedStyle(stage).transitionDuration : null,
      stageWillChange: stage ? getComputedStyle(stage).willChange : null,
      recenterLayerCount: root?.querySelectorAll(".regional-map-recenter-veil").length ?? -1,
      documentViewTransitionAnimations: document.getAnimations().filter((candidate) => (
        candidate.effect instanceof KeyframeEffect
        && candidate.effect.pseudoElement?.startsWith("::view-transition")
      )).length,
      transform: stage?.style.transform ?? null,
      cycles,
    };
  });
  expect(regionalRecenterPaint).toMatchObject({
    cameraMoving: "false",
    transitionDuration: "0s",
    stageWillChange: "auto",
    recenterLayerCount: 0,
    documentViewTransitionAnimations: 0,
  });
  expect(regionalRecenterPaint.transform).toMatch(/^translate\(.+px, .+px\) scale\(.+\)$/);
  expect(regionalRecenterPaint.cycles).toHaveLength(8);
  expect(regionalRecenterPaint.cycles.every((cycle) => (
    cycle.cameraChanged
    && cycle.stageWillChange === "auto"
    && cycle.stageAnimations === 0
    && cycle.recenterLayerCount === 0
  ))).toBe(true);
  await expect(regionalMap.locator(".regional-map-recenter-veil")).toHaveCount(0);
  await expect(regionalAuthoredMap).toHaveCSS("shape-rendering", "geometricprecision");
  await expect(regionalAuthoredTrack).toHaveCSS("shape-rendering", "geometricprecision");
  expect(await regionalGlow.evaluate((element) => getComputedStyle(element).filter)).toContain("blur");
  expect(Number(await regionalGlow.evaluate((element) => getComputedStyle(element).opacity))).toBeGreaterThan(0);
  expect(await regionalGlow.evaluate((element) => getComputedStyle(element).animationPlayState)).toBe("running");
  expect(await regionalPlannedPath.evaluate((element) => getComputedStyle(element).animationPlayState)).toBe("running");
  await expect(regionalMap).toHaveAttribute("data-regional-map-camera-moving", "false");
  expect(await regionalGlow.evaluate((element) => getComputedStyle(element).filter)).toContain("blur");
  expect(await regionalGlow.evaluate((element) => getComputedStyle(element).animationPlayState)).toBe("running");
});

test("overlapping alert rails share one pulse cadence and size across both maps", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "desktop ambient overlay pulse verification");
  await setStubMode(request, "map-authoritative-overlap");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
  await page.waitForTimeout(900);

  const ttcPulse = await page.locator('g[aria-label="Disruption overlays"]').evaluate((root) => {
    const planned = root.querySelector<SVGPathElement>(
      '[data-map-impact-id="stub-active-closure-child-line-1"] .asset-alert-path.suspension-candy',
    );
    const plannedPreview = root.querySelector<SVGPathElement>(".asset-alert-path.planned-preview");
    const rsz = root.querySelector<SVGPathElement>(
      '[data-map-impact-kind="reduced-speed-zone"] .asset-alert-path.delay-candy',
    );
    const closureMask = root.querySelector<SVGPathElement>(
      '[data-map-impact-id="stub-active-closure-child-line-1"] .suspension-mask-path',
    );
    if (!planned || !plannedPreview || !rsz || !closureMask) {
      throw new Error("Missing overlapping TTC current closure, closure preview, and RSZ rails");
    }
    const pulseProgress = (element: Element, name: string) => {
      const animation = element.getAnimations().find((candidate) =>
        "animationName" in candidate && candidate.animationName === name);
      if (!animation?.effect) throw new Error(`Missing ${name} animation`);
      const timing = animation.effect.getComputedTiming();
      return {
        progress: timing.progress,
        duration: timing.duration,
      };
    };
    return {
      planned: pulseProgress(planned, "map-overlay-rail-pulse"),
      plannedPreview: pulseProgress(plannedPreview, "map-overlay-rail-pulse"),
      rsz: pulseProgress(rsz, "map-overlay-rail-pulse"),
      plannedWidth: getComputedStyle(planned).strokeWidth,
      plannedPreviewWidth: getComputedStyle(plannedPreview).strokeWidth,
      rszWidth: getComputedStyle(rsz).strokeWidth,
      closureMaskAnimation: getComputedStyle(closureMask).animationName,
      closureMaskWidth: getComputedStyle(closureMask).strokeWidth,
    };
  });
  expect(ttcPulse.planned.duration).toBe(1200);
  expect(ttcPulse.plannedPreview.duration).toBe(1200);
  expect(ttcPulse.rsz.duration).toBe(1200);
  expect(Math.abs((ttcPulse.planned.progress ?? 0) - (ttcPulse.rsz.progress ?? 0))).toBeLessThan(0.02);
  expect(Math.abs((ttcPulse.plannedPreview.progress ?? 0) - (ttcPulse.rsz.progress ?? 0))).toBeLessThan(0.02);
  expect(ttcPulse.plannedWidth).toBe(ttcPulse.rszWidth);
  expect(ttcPulse.plannedPreviewWidth).toBe(ttcPulse.rszWidth);
  expect(ttcPulse.closureMaskAnimation).toBe("none");
  expect(ttcPulse.closureMaskWidth).toBe("102px");

  await setStubMode(request, "regional-live");
  await page.getByRole("group", { name: "Select transit network" })
    .getByRole("button", { name: "GO/UP", exact: true })
    .click();
  await expect(page.locator("html")).not.toHaveAttribute("data-network-transition-direction");

  const regionalPulse = await page.locator(".regional-map").evaluate((root) => {
    const delay = root.querySelector<SVGPathElement>(
      '.regional-overlay-segment-group[data-regional-impact-id="regional-demo-delay"] .regional-impact-path',
    );
    const planned = root.querySelector<SVGPathElement>(
      '.regional-overlay-segment-group[data-regional-impact-id="regional-demo-planned"] .regional-impact-path',
    );
    if (!delay || !planned) throw new Error("Missing overlapping regional delay and planned-closure rails");
    const pulseProgress = (element: Element) => {
      const animation = element.getAnimations().find((candidate) =>
        "animationName" in candidate && candidate.animationName === "map-overlay-rail-pulse");
      if (!animation?.effect) throw new Error("Missing regional pulse animation");
      const timing = animation.effect.getComputedTiming();
      return { progress: timing.progress, duration: timing.duration };
    };
    return {
      delay: pulseProgress(delay),
      planned: pulseProgress(planned),
      delayWidth: getComputedStyle(delay).strokeWidth,
      plannedWidth: getComputedStyle(planned).strokeWidth,
    };
  });
  expect(regionalPulse.delay.duration).toBe(1200);
  expect(regionalPulse.planned.duration).toBe(1200);
  expect(Math.abs((regionalPulse.delay.progress ?? 0) - (regionalPulse.planned.progress ?? 0))).toBeLessThan(0.02);
  expect(regionalPulse.delayWidth).toBe(regionalPulse.plannedWidth);
});

test("mobile closing impact details preserves the focused map camera", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "mobile-only impact camera behavior");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  const mapLayer = page.locator(".ttc-map-stage").first();
  const defaultTransform = await mapLayer.evaluate((element) => element.style.transform);

  await page.getByRole("button", { name: "delay: Sheppard-Yonge to Don Mills" }).dispatchEvent("click");
  const inspector = page.locator("[data-mobile-impact-inspector]");
  await expect(inspector).toBeVisible();
  await expect
    .poll(async () => mapLayer.evaluate((element) => element.style.transform))
    .not.toBe(defaultTransform);

  const focusedTransform = await mapLayer.evaluate((element) => element.style.transform);

  await inspector.getByRole("button", { name: "Unfocus impact" }).click();
  await expect(inspector).toHaveCount(0);
  await page.waitForTimeout(500);

  await expect
    .poll(async () => mapLayer.evaluate((element) => element.style.transform))
    .toBe(focusedTransform);
});

test("desktop closing station details preserves the focused map camera", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "desktop-only station camera behavior");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  const mapLayer = page.locator(".ttc-map-stage").first();
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

test("desktop closing impact details preserves the focused map camera", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "desktop-only impact camera behavior");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  const mapLayer = page.locator(".ttc-map-stage").first();
  const defaultTransform = await mapLayer.evaluate((element) => element.style.transform);

  await page.getByRole("button", { name: "delay: Sheppard-Yonge to Don Mills" }).click();
  const delayPanel = page.locator(".floating-panel-shell");
  await expect(delayPanel.getByRole("heading", { name: "Delays" })).toBeVisible();
  await expect
    .poll(async () => mapLayer.evaluate((element) => element.style.transform))
    .not.toBe(defaultTransform);

  const focusedTransform = await mapLayer.evaluate((element) => element.style.transform);

  await delayPanel.getByRole("button", { name: "Close" }).click();
  await expect(delayPanel).toHaveCount(0);
  await page.waitForTimeout(500);

  await expect
    .poll(async () => mapLayer.evaluate((element) => element.style.transform))
    .toBe(focusedTransform);
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
  await expect(page.getByRole("button", { name: /Toggle estimated train markers/ })).toHaveCount(0);

  const mainDimensions = await page.locator(".linewatch-shell > main").evaluate((element) => ({
    clientWidth: element.clientWidth,
    clientHeight: element.clientHeight,
    visualWidth: element.getBoundingClientRect().width,
    visualHeight: element.getBoundingClientRect().height,
    transform: getComputedStyle(element).transform,
  }));
  expect(mainDimensions.clientHeight).toBeGreaterThan(mainDimensions.clientWidth);
  expect(mainDimensions.visualHeight).toBeGreaterThan(mainDimensions.visualWidth);
  expect(mainDimensions.transform).toBe("none");
  const rotatedStageMatrix = await page.locator(".ttc-map-stage").evaluate((element) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
    return { a: matrix.a, b: matrix.b };
  });
  expect(Math.abs(rotatedStageMatrix.a)).toBeLessThan(0.0001);
  expect(Math.abs(rotatedStageMatrix.b)).toBeGreaterThan(0);

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

  const rotatedMapLayer = page.locator(".ttc-map-stage").first();
  const rotatedFocusedTransform = await rotatedMapLayer.evaluate((element) => element.style.transform);
  await page.locator("[data-rotated-map-selection-card]").getByRole("button", { name: "Clear selected map item" }).click();
  await expect(page.locator("[data-rotated-map-selection-card]")).toHaveCount(0);
  await page.waitForTimeout(500);
  await expect
    .poll(async () => rotatedMapLayer.evaluate((element) => element.style.transform))
    .toBe(rotatedFocusedTransform);

  await page.getByRole("button", { name: "delay: Sheppard-Yonge to Don Mills" }).dispatchEvent("click");
  await expect(page.locator("[data-rotated-map-selection-card]")).toBeVisible();

  await page.locator("[data-rotated-map-selection-card]").getByRole("button", { name: "Details" }).click();
  await expect(shell).not.toHaveClass(/mobile-map-rotated/);
  const inspector = page.locator("[data-mobile-impact-inspector]");
  await expect(inspector).toBeVisible();
  await expect(inspector).toContainText("Delay");

  await inspector.getByRole("button", { name: "Unfocus impact" }).click();
  await page.getByRole("button", { name: "Rotate map" }).click();
  await page.getByRole("button", { name: "Stub Station station details" }).dispatchEvent("click");
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
  await expect(page.getByRole("heading", { name: "Train Arrivals" })).toBeVisible();
  await expect(page.getByText("TTC scheduled service")).toBeVisible();
  await expect(page.getByText("Schedule May Be Disrupted")).toBeVisible();
  const arrivalsSection = page.locator('[data-arrivals-disrupted="true"]');
  await expect(arrivalsSection).toBeVisible();
  await expect(arrivalsSection.getByRole("link", { name: /Jump to station impact:/ }).first()).toBeVisible();
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
  const lineOnePinButtons = arrivalsSection.getByRole("button", { name: "Pin Line 1 arrivals at Stub Station" });
  await expect(lineOnePinButtons).toHaveCount(1);
  await lineOnePinButtons.first().click();
  const unpinButton = arrivalsSection.getByRole("button", { name: "Unpin Line 1 arrivals at Stub Station" });
  await expect(unpinButton).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("linewatch-arrival-line-pins-v1")))
    .toContain('"lineId":"line-1"');
  await unpinButton.click();
  await expect(arrivalsSection.getByRole("button", { name: "Pin Line 1 arrivals at Stub Station" })).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("linewatch-arrival-line-pins-v1")))
    .not.toContain('"lineId":"line-1"');

  const activeClosureImpact = stationPanel.locator("#station-impact-stub-closure-line-1");
  await expect(activeClosureImpact.getByText("Active Closure", { exact: true })).toBeVisible();
  await expect(activeClosureImpact.getByText("Planned Closure", { exact: true })).toHaveCount(0);
  await activeClosureImpact.getByRole("button", { name: "Open Active Closure details" }).click();
  if (isMobile) {
    const inspector = page.locator('[data-mobile-impact-inspector]');
    await expect(inspector.getByRole("heading", { name: "Active Closure", exact: true })).toBeVisible();
    await inspector.getByRole("button", { name: "View in List" }).click();
  }
  await expect(page.getByRole("heading", { name: "Active Alerts" })).toBeVisible();
  await expect(page.locator('[data-impact-card-id="stub-active-closure-child-line-1"]')).toBeVisible();
});

test("LineLegend clicks open a temporary line-focused view without highlighting a card", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "desktop-only legend interaction");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
  await page.getByRole("button", { name: "View reduced speed zone for Line 1 Yonge-University" }).click();
  await expect(page.getByRole("heading", { name: "Reduced Speed Zones" })).toBeVisible();
  await expect(page.locator('select[aria-label="Filter Reduced Speed Zones by line"]')).toHaveValue("line-1");
  await expect(page.locator(".highlight-active-card")).toHaveCount(0);
  await expect(page.locator(".alert-card").first()).not.toHaveClass(/!bg-amber-950|highlight-active-card/);

  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("heading", { name: "Reduced Speed Zones" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Toggle menu" })).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "Toggle menu" }).click();
  await expect(page.getByText("Maps & Alerts", { exact: true })).toBeVisible();
  await page.getByRole("menuitem", { name: /Reduced Speed Zones/ }).click();
  await expect(page.locator('select[aria-label="Filter Reduced Speed Zones by line"]')).toHaveValue("all");
});

test("Line Status opens an all-types line submenu on desktop and mobile", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  if (isMobile) {
    await page.setViewportSize({ width: 390, height: 600 });
  }
  await page.goto("/");
  if (isMobile) {
    await page.getByRole("button", { name: "Status", exact: true }).click();
  } else {
    await openDashboardMenu(page, isMobile);
  }

  const originScroll = isMobile
    ? page.locator(".mobile-status-content-scroll")
    : page.locator("#linewatch-main-menu-scroll");
  const lineStatusButton = page.getByRole("button", { name: /View all service impacts for .*Yonge-University/ });
  if (isMobile) {
    await originScroll.evaluate((element) => {
      element.scrollTop = Math.min(40, element.scrollHeight - element.clientHeight);
    });
  } else {
    await lineStatusButton.scrollIntoViewIfNeeded();
  }
  const enteredScrollTop = await originScroll.evaluate((element) => element.scrollTop);
  expect(enteredScrollTop).toBeGreaterThan(0);
  if (isMobile) {
    await lineStatusButton.evaluate((element: HTMLButtonElement) => element.click());
  } else {
    await lineStatusButton.click();
  }
  await expect(page.getByRole("heading", { name: /Yonge-University/ })).toBeVisible();
  const typeFilters = page.getByRole("group", { name: /Filter .*Yonge-University impacts by alert type/ });
  await expect(typeFilters).toBeVisible();
  await expect(page.locator('select[aria-label^="Sort "][aria-label$="Yonge-University impacts"]')).toHaveValue("updated");
  await expect(page.getByRole("searchbox", { name: /Filter .*Yonge-University impacts/ })).toBeVisible();
  await expect(typeFilters.getByRole("button", { name: /Reduced Speed Zones/ })).toBeVisible();
  if (!isMobile) {
    const filterTops = await typeFilters.getByRole("button").evaluateAll((buttons) => buttons.map((button) => Math.round(button.getBoundingClientRect().top)));
    expect(new Set(filterTops).size).toBe(1);
  }
  await expect(page.locator(".line-impact-total-badge")).toContainText(/\d+ Service Impacts/);
  await typeFilters.getByRole("button", { name: /Reduced Speed Zones/ }).click();
  await expect(page.locator(".line-impact-panel-stack .rsz-card-border").first()).toBeVisible();
  await expect(page.locator(".line-impact-panel-stack .embedded-impact-panel > .panel-heading")).toBeHidden();
  await page.getByRole("button", { name: "Back" }).click();
  await expect.poll(async () => originScroll.evaluate((element) => Math.round(element.scrollTop)))
    .toBe(Math.round(enteredScrollTop));
});

test("regional corridor status opens the same all-types submenu", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "regional network selection is covered on desktop");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await page.getByRole("group", { name: "Select transit network" })
    .getByRole("button", { name: "GO/UP", exact: true }).click();
  await expect(page.getByRole("button", { name: "Fit regional network" })).toBeVisible();
  await expect(page.getByText("Last Polled: regional fixture mode", { exact: true })).toBeVisible();
  await expect(page.locator("html")).not.toHaveAttribute("data-network-transition-direction");
  await page.getByRole("button", { name: "Toggle menu" }).click();
  await page.getByRole("button", { name: /View all service impacts for .*Barrie/ }).click();
  await expect(page.getByRole("heading", { name: /Barrie/ })).toBeVisible();
  await expect(page.getByRole("group", { name: /Filter .*Barrie impacts by alert type/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Reduced Speed Zones/ })).toHaveCount(0);
});

test("mobile More restores its scroll position after submenu back navigation", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "mobile-only More sheet behavior");
  await setStubMode(request, "seeded");
  await openDashboardMenu(page, isMobile);

  const moreScroll = page.locator(".mobile-more-content-scroll");
  const historyButton = page.getByRole("button", { name: "Alert History", exact: true });
  await historyButton.scrollIntoViewIfNeeded();
  const enteredScrollTop = await moreScroll.evaluate((element) => element.scrollTop);
  expect(enteredScrollTop).toBeGreaterThan(0);
  await historyButton.click();
  await expect(page.getByRole("heading", { name: "Alert History", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect.poll(async () => moreScroll.evaluate((element) => Math.round(element.scrollTop)))
    .toBe(Math.round(enteredScrollTop));
});

test("alert history renders one stable card per incident occurrence with its full lifecycle", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "desktop incident history behavior is sufficient here");
  await setStubMode(request, "seeded");
  await openDashboardMenu(page, isMobile);
  await page.getByRole("menuitem", { name: "Alert History", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Alert History", exact: true })).toBeVisible();
  await expect(page.locator(".alert-history-item")).toHaveCount(2);

  const clearedIncident = page.locator(".alert-history-item").filter({ hasText: "Track issue at Warden" });
  await expect(clearedIncident).toHaveCount(1);
  await expect(clearedIncident.locator(".alert-history-status-label")).toHaveText("Cleared");
  await expect(clearedIncident.locator(".alert-history-lifecycle-event")).toHaveCount(3);
  await expect(clearedIncident.getByText("Alert Opened", { exact: true })).toBeVisible();
  await expect(clearedIncident.getByText("Alert Updated", { exact: true })).toBeVisible();
  await expect(clearedIncident.getByText("Service Restored", { exact: true })).toBeVisible();

  const activeIncident = page.locator(".alert-history-item").filter({ hasText: "Reduced speed zone near Rosedale" });
  await expect(activeIncident.locator(".alert-history-status-label")).toHaveText("Updated");
  await page.getByRole("button", { name: "Active", exact: true }).click();
  await expect(page.locator(".alert-history-item")).toHaveCount(1);
  await expect(activeIncident).toBeVisible();
  await page.getByRole("button", { name: "Cleared", exact: true }).click();
  await expect(page.locator(".alert-history-item")).toHaveCount(1);
  await expect(clearedIncident).toBeVisible();
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
  await expect(activeClosureChildCard.getByRole("term").filter({ hasText: "Planned Closure" })).toBeVisible();
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
  if (isMobile) await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  if (isMobile) {
    await page.getByRole("button", { name: "Transit line legend" }).click();
    await expect(page.getByRole("button", { name: "Transit line legend" })).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".mobile-status-peek")).toContainText(/Current Impacts?/);
    await expect(page.locator(".mobile-my-stations-shortcut")).toBeVisible();
  }

  const overlapMarker = page.locator('[data-overlap-segment-id="stub-line-1-segment"]');
  await expect(overlapMarker).toBeVisible();
  await expect(overlapMarker).toHaveAttribute("data-overlap-collision-avoided", "true");
  await expect(overlapMarker.locator('[data-overlap-kind="suspension"]')).toBeVisible();
  await expect(overlapMarker.locator('[data-overlap-kind="planned-closure"]')).toBeVisible();

  if (!isMobile) {
    await overlapMarker.hover();
    await expect.poll(() => page.locator("[data-hover-priority-impact]").count()).toBeGreaterThan(0);
  }
  const overlapMarkerBox = await overlapMarker.boundingBox();

  await overlapMarker.dispatchEvent("click");
  await expect(page.locator("[data-hover-priority-impact]")).toHaveCount(0);
  const overlapChooser = page.locator("[data-overlap-chooser]");
  await expect.poll(async () => overlapChooser.evaluate((element) =>
    element.getAnimations().some((animation) => animation.playState === "running"),
  ), { timeout: 500 }).toBe(true);
  await expect(overlapChooser).toBeVisible();
  if (isMobile) {
    await expect(page.getByRole("button", { name: "Transit line legend" })).toBeVisible();
    await expect(page.locator(".mobile-status-peek")).toBeVisible();
    await expect(page.locator(".mobile-my-stations-shortcut")).toBeVisible();
  }
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
  if (!isMobile) {
    expect(chooserBox && overlapMarkerBox && (
      chooserBox.x + chooserBox.width <= overlapMarkerBox.x
      || chooserBox.x >= overlapMarkerBox.x + overlapMarkerBox.width
      || chooserBox.y + chooserBox.height <= overlapMarkerBox.y
      || chooserBox.y >= overlapMarkerBox.y + overlapMarkerBox.height
    )).toBe(true);
  }
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
  await expectChooserToClearUiKeepouts(page);
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

test("keeps the rotated alert chooser clear of Center and Exit controls", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "Rotated map controls are mobile-only");
  await setStubMode(request, "seeded");
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/");
  await page.getByRole("button", { name: "Rotate map" }).click();
  await expect(page.getByRole("button", { name: "Exit rotated map" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Center map", exact: true })).toBeVisible();

  const overlapMarker = page.locator('[data-overlap-segment-id="stub-line-1-segment"]');
  await expect(overlapMarker).toBeVisible();
  await overlapMarker.dispatchEvent("click");
  await expect(page.locator("[data-overlap-chooser]")).toBeVisible();
  await expectChooserToClearUiKeepouts(page);
});

test("keeps the rotated GO/UP alert chooser clear of Center and Exit controls", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "Rotated map controls are mobile-only");
  await setStubMode(request, "regional-live");
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/");
  await page.getByRole("group", { name: "Select transit network" })
    .getByRole("button", { name: "GO/UP", exact: true })
    .click();
  await page.getByRole("button", { name: "Rotate map" }).click();
  await expect(page.getByRole("button", { name: "Exit rotated map" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Center map", exact: true })).toBeVisible();

  const overlapMarker = page.locator('[data-overlap-segment-id^="regional-overlap-"]').first();
  await expect(overlapMarker).toBeVisible();
  await overlapMarker.dispatchEvent("click");
  await expect(page.locator("[data-overlap-chooser]")).toBeVisible();
  await expectChooserToClearUiKeepouts(page);
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

test("station names share hover and selection behavior with station dots", async ({ page, request, isMobile }) => {
  await setStubMode(request, "unavailable");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  await expect(page.locator("[data-station-label-id]")).toHaveCount(109);
  await expect(page.locator("[data-station-id]")).toHaveCount(110);
  const labelTarget = page.locator('[data-station-label-id="kipling"]');
  await expect(labelTarget).toHaveCount(1);

  if (!isMobile) {
    const authoredLabel = page.locator('[data-station-label-for="kipling"]');
    const hoverEffect = authoredLabel.locator("..");
    await expect.poll(() => authoredLabel.evaluate((element) => getComputedStyle(element).fontSize))
      .not.toBe("");
    const authoredFontSize = await authoredLabel.evaluate((element) => getComputedStyle(element).fontSize);
    await labelTarget.hover();
    await expect(authoredLabel).toHaveClass(/station-label-hovered/);
    await expect(hoverEffect).toHaveCSS("transition-duration", "0.28s, 0.28s");
    await expect(hoverEffect).toHaveCSS("transition-delay", "0.06s");
    await expect(hoverEffect).toHaveCSS("animation-name", "none");
    await expect(authoredLabel).toHaveCSS("font-size", authoredFontSize);
    await expect(page.locator('[data-station-hover-id="kipling"]')).not.toHaveClass(/active/);
    await expect(labelTarget).toHaveCSS("outline-style", "none");

    const angledLabel = page.locator('[data-station-label-for="islington"]');
    const angledLabelTarget = page.locator('[data-station-label-id="islington"]');
    const authoredAngledTransform = await angledLabel.getAttribute("transform");
    await angledLabelTarget.hover();
    await expect(angledLabel).toHaveClass(/station-label-hovered/);
    await expect(angledLabel).toHaveAttribute("transform", authoredAngledTransform ?? "");
    await page.locator('[data-station-label-id="royal-york"]').hover();
    await expect(authoredLabel).not.toHaveClass(/station-label-hovered/);
    await expect(hoverEffect).toHaveCSS("animation-name", "none");
    await expect(hoverEffect).toHaveCSS("opacity", "1");
  }

  await labelTarget.click();
  await expect(
    page.getByRole("complementary", { name: "Kipling station details" }),
  ).toBeVisible();
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
  await expect(boundaryActiveCard.getByText("Planned Closure", { exact: true })).toBeVisible();

  await openServiceCategory(page, isMobile, /Closure/);
  const closuresPanel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Planned Closures" }),
  });
  const boundaryClosureCard = closuresPanel.locator('[data-impact-card-id="stub-upcoming-closure-st-george-boundary"]');
  await expect(boundaryClosureCard).toBeVisible();
  await expect(boundaryClosureCard.getByText("Overlap:")).toBeVisible();
  await expect(boundaryClosureCard.getByText("Active Alert", { exact: true })).toBeVisible();
});

test("production capability keeps TTC source status sanitized", async ({ page, request, isMobile }) => {
  await setStubMode(request, "diagnostics-disabled");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  if (isMobile) {
    await page.getByRole("button", { name: "More", exact: true }).click();
  }

  await page.getByRole("button", { name: "Toggle Source Status" }).click();
  await expect(page.getByText("TTC Source Status").last()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dashboard feed" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Processing summary" })).toBeVisible();
  await expect(page.getByText("Rider summaries")).toBeVisible();
  await expect(page.getByText("12", { exact: true })).toBeVisible();
  await expect(page.getByText("original source records are not publicly exposed", { exact: false })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Source records" })).toHaveCount(0);
  await expect(page.getByText("Raw JSON Payload")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Copy JSON" })).toHaveCount(0);
});

test("opens TTC retained records when non-production diagnostics are enabled", async ({ page, request, context, isMobile }) => {
  await setStubMode(request, "seeded");
  await context.grantPermissions(["clipboard-write"], { origin: appUrl });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  if (isMobile) {
    await page.getByRole("button", { name: "More", exact: true }).click();
  }

  await page.getByRole("button", { name: "Toggle Source Status" }).click();
  await expect(page.getByRole("tab", { name: "Source records" })).toBeVisible();
  await page.getByRole("tab", { name: "Source records" }).click();
  await expect(page.getByText("Development / staging diagnostics")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Routes (1)" })).toBeVisible();
  await page.getByRole("button", { name: /Seeded raw alert title for testing/ }).click();
  await expect(page.getByText("Raw JSON payload")).toBeVisible();
  await expect(page.locator("pre").filter({ hasText: "stub-route-raw-id" })).toBeVisible();
  await page.getByRole("button", { name: "Copy JSON" }).click();
  await expect(page.getByText("Copied!")).toBeVisible();
});

test("opens regional source coverage and retained records in non-production", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  await page.getByRole("group", { name: "Select transit network" })
    .getByRole("button", { name: "GO/UP", exact: true })
    .click();
  await expect(page.getByRole("region", { name: "Interactive GO and UP map" })).toBeVisible();
  await expect(page.locator("html")).not.toHaveAttribute("data-network-transition-direction");

  if (isMobile) {
    await page.getByRole("button", { name: "More", exact: true }).click();
    await expect(page.getByText("GO / UP Source Status")).toBeVisible();
  }

  await page.getByRole("button", { name: "Toggle Source Status" }).click();
  await expect(page.getByText("GO / UP Source Status").last()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Collection coverage" })).toBeVisible();
  await expect(page.getByText("GO service alerts", { exact: true })).toBeVisible();
  await expect(page.getByText("UP rail service alerts", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Source records" }).click();
  await expect(page.getByRole("heading", { name: "GO Rail (1)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "UP Express (1)" })).toBeVisible();
  await page.getByRole("button", { name: /Lakeshore East service adjustment/ }).click();
  await expect(page.getByText("Raw JSON payload")).toBeVisible();
  await expect(page.locator("pre").filter({ hasText: "Service Disruption" })).toBeVisible();
});

test("nonlinear guide-backed overlays open their corresponding cards", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  await page.getByRole("button", { name: "reduced-speed-zone: King to Union" }).click();
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
    await page.locator(".header-search-bar").click({ position: { x: 5, y: 5 } });
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

test("mobile GO and UP map uses the rotated logical landscape viewport", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "mobile-only regional rotation smoke");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  const mobileNetworkSelector = page.locator(".mobile-network-selector-slot").getByRole("group", { name: "Select transit network" });
  const siteGuideButton = page.getByRole("button", { name: "Open site guide" });
  const mobileLegend = page.getByRole("button", { name: "Transit line legend" });
  await expect(mobileNetworkSelector).toBeVisible();
  await expect(mobileLegend).toBeVisible();
  await expect(mobileLegend).not.toHaveClass(/mobile-legend-pill--regional/);
  await expect.poll(async () => {
    const [selectorBox, guideBox] = await Promise.all([
      mobileNetworkSelector.boundingBox(),
      siteGuideButton.boundingBox(),
    ]);
    return selectorBox && guideBox
      ? {
          belowGuide: selectorBox.y >= guideBox.y + guideBox.height,
          sameWidth: Math.abs(selectorBox.width - guideBox.width) <= 1,
        }
      : null;
  }).toEqual({ belowGuide: true, sameWidth: true });
  await mobileNetworkSelector.getByRole("button", { name: "GO/UP", exact: true }).click();
  await expect(page.getByRole("region", { name: "Interactive GO and UP map" })).toBeVisible();
  await expect(mobileLegend).toBeVisible();
  await expect(mobileLegend).toHaveClass(/mobile-legend-pill--regional/);
  await expect(page.locator(".regional-station-selected-indicator")).toHaveCount(72);
  await expect.poll(() => page.locator(".regional-station-selected-indicator").evaluateAll((indicators) => (
    indicators.every((indicator) => getComputedStyle(indicator).opacity === "0")
  ))).toBe(true);

  await page.getByRole("button", { name: "Rotate map" }).click();
  const shell = page.locator(".linewatch-shell");
  const regionalViewport = page.locator(".regional-map-viewport");
  await expect(shell).toHaveClass(/mobile-map-rotated/);
  await expect(regionalViewport).toHaveAttribute("data-map-viewport-orientation", "rotated-landscape");
  await expect(page.getByRole("button", { name: "Exit rotated map" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Center map" })).toBeVisible();

  const dimensions = await regionalViewport.evaluate((element) => ({
    clientWidth: element.clientWidth,
    clientHeight: element.clientHeight,
    visualWidth: element.getBoundingClientRect().width,
    visualHeight: element.getBoundingClientRect().height,
  }));
  expect(dimensions.clientWidth).toBeGreaterThan(dimensions.clientHeight);
  expect(dimensions.visualHeight).toBeGreaterThan(dimensions.visualWidth);

  await page.getByRole("button", { name: "Center map" }).click();
  await page.getByRole("button", { name: "Exit rotated map" }).click();
  await expect(shell).not.toHaveClass(/mobile-map-rotated/);
  await expect(regionalViewport).toHaveAttribute("data-map-viewport-orientation", "standard");
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
  } else {
    const linesColumn = page.locator(".station-search-lines-column");
    await expect(linesColumn).toHaveAttribute("data-scroll-more-below", "");
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
      )).toBeLessThanOrEqual(3);
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
  const mapElement = page.locator(".ttc-map-stage").first();

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
  const mapElement = mapSurface.locator(".ttc-map-stage");
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
  const mapViewport = page.locator("[data-map-pan-zoom-viewport]");
  const mapStage = page.locator(".ttc-map-stage");
  await expect(mapStage).toHaveAttribute("data-raster-map-ready", "true");
  await expect(mapViewport).toHaveAttribute("data-map-camera-moving", "false", { timeout: 2_000 });
  const settledMapTransform = await mapStage.evaluate((element) => element.style.transform);

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
  await expect.poll(() => mapStage.evaluate((element) => element.style.transform)).toBe(settledMapTransform);
  await expect(mapViewport).toHaveAttribute("data-map-camera-moving", "false");
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
  await expect(page.getByText("Stub Station", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Union", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Default Scheduled Route · To Union")).toBeVisible();
  await expect(page.getByText("5 Stations", { exact: true })).toBeVisible();
  await expect(page.getByText("Travel Time Unreliable", { exact: true })).toBeVisible();
  await expect(page.getByText("Major Disruption on Route", { exact: true })).toBeVisible();
  await expect(page.getByText("Travel Time", { exact: true })).toBeVisible();
  await expect(page.locator('[data-travel-time-severity="severe"]')).toBeVisible();
  await expect(page.getByText("Major Disruption on Route — Travel Time Not Reliable", { exact: true })).toBeVisible();
  await expect(page.getByText("Typical 13 min", { exact: true })).toBeVisible();
  await expect(page.getByText("Confidence: Low", { exact: true })).toBeVisible();
  await expect(page.locator(".saved-commute-time-status-value").filter({ hasText: "13 min" })).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(page.locator(".saved-commute-time-status-value").filter({ hasText: "Low" })).toHaveCSS("text-transform", "none");
  const unreliableMetadata = page.locator(".saved-commute-time-estimate.unreliable p");
  await expect(unreliableMetadata.locator(":scope > strong")).toHaveCSS("font-size", "16px");
  await expect(unreliableMetadata.locator(":scope > span")).toHaveCSS("font-size", "16px");
  await expect(unreliableMetadata.locator(":scope > span")).toHaveCSS("text-transform", "none");
  await expect(page.getByText("Route Notifications: On", { exact: true })).toBeVisible();
  await expect(page.getByText("Outbound: Weekdays · 6:30 AM-9:30 AM", { exact: true })).toBeVisible();
  await expect(page.getByText("Return: Weekdays · 3:00 PM-7:00 PM", { exact: true })).toBeVisible();
  await expect(page.getByText("All Events", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit commute Morning commute" }).click();
  await expect(page.getByRole("heading", { name: "Edit Route" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Commute label" })).toHaveValue("Morning commute");
  await expect(page.locator(".commute-station-picker").filter({ hasText: "Origin" })).toContainText("Stub Station");
  await expect(page.locator(".commute-station-picker").filter({ hasText: "Destination" })).toContainText("Union");
  await expect(page.getByRole("checkbox", { name: "Track Return Route" })).toBeChecked();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Stub Station", { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Alerts" })).toBeVisible();
  await page.getByRole("button", { name: "Edit Alerts" }).click();
  await expect(page.locator(".saved-commute-notification-checks > label")).toHaveCount(5);
  const eventTypeVisualOrder = await page.locator(".saved-commute-notification-checks > label")
    .evaluateAll((labels) => labels
      .sort((left, right) => Number.parseInt(getComputedStyle(left).order) - Number.parseInt(getComputedStyle(right).order))
      .map((label) => label.textContent?.trim().replace(/\s+/g, " ")));
  expect(eventTypeVisualOrder).toEqual(isMobile
    ? ["Suspensions", "Delays", "Planned Closures", "Service Restored", "Reduced Speed Zones"]
    : ["Suspensions", "Delays", "Reduced Speed Zones", "Planned Closures", "Service Restored"]);
  const outboundWindow = page.getByRole("group", { name: "Outbound Route notification window" });
  await expect(outboundWindow.getByRole("button", { name: "AM Rush" })).toHaveAttribute("aria-pressed", "true");
  await outboundWindow.getByRole("button", { name: "Custom" }).click();
  await expect(outboundWindow.getByRole("button", { name: "Custom" })).toHaveAttribute("aria-pressed", "true");
  await expect(outboundWindow.getByRole("button", { name: "AM Rush" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("group", { name: "Outbound Route notification days" })).toBeVisible();
  await expect(page.getByLabel("Outbound Route start time")).toBeEnabled();
  await expect(page.getByLabel("Outbound Route end time")).toBeEnabled();
  await page.getByLabel("Outbound Route start time").fill("07:15");
  await expect(page.getByLabel("Outbound Route start time")).toHaveValue("07:15");
  await expect(page.getByRole("group", { name: "Return Route notification window" })
    .getByRole("button", { name: "PM Rush" })).toHaveAttribute("aria-pressed", "true");
  await page.getByText("How Scheduling Works", { exact: true }).click();
  await expect(page.getByText(/If a time window continues past midnight/)).toBeVisible();
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
  await expect(impactDisclosure.getByText("1 Active Closure", { exact: true })).toBeVisible();
  await expect(impactDisclosure.getByText(/Line 1: Stub Station To Stub Terminal/).first()).toBeHidden();
  await impactDisclosure.locator("summary").click();
  await expect(impactDisclosure).toHaveAttribute("open", "");
  await expect(impactDisclosure.getByText("Suspension", { exact: true })).toBeVisible();
  await expect(impactDisclosure.getByText("Active Closure", { exact: true })).toBeVisible();
  await expect(impactDisclosure.getByText(/Line 1: Stub Station To Stub Terminal/).first()).toBeVisible();

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
  expect(commuteHeaderMetrics.alignItems).toBe(isMobile ? "flex-start" : "center");
  expect(commuteHeaderMetrics.badgeFontSize).toBeGreaterThanOrEqual(isMobile ? 10.5 : 11.5);
  expect(commuteHeaderMetrics.badgeHeight).toBeGreaterThanOrEqual(28);
  if (!isMobile) {
    expect(commuteHeaderMetrics.centerDelta).toBeLessThanOrEqual(1);
  }

  await page.getByRole("button", { name: /View Suspension on the map for Morning commute/ }).click();
  await expect(page.locator("[data-commute-path-preview]")).toBeVisible();
  if (isMobile) {
    await expect(page.getByRole("complementary", { name: "Selected map impact details" })).toBeVisible();
    await expect(page.getByText("Seeded smoke alert for browser verification.", { exact: true })).toBeVisible();
  } else {
    await expect(page.getByRole("heading", { name: "Active Alerts" })).toBeVisible();
    await expect(page.locator('[data-impact-card-id="stub-alert-line-1"]')).toBeVisible();
  }
  if (isMobile) {
    const mobileChip = page.getByRole("complementary", { name: "Selected map impact details" }).locator(".commute-path-preview-chip");
    await expect(mobileChip).toBeVisible();
    await expect(mobileChip.getByRole("button", { name: "Back to My Commutes" })).toBeVisible();
  } else {
    const desktopChip = page.locator('[data-impact-card-id="stub-alert-line-1"]').locator(".commute-path-preview-chip");
    await expect(desktopChip).toBeVisible();
    await expect(desktopChip.getByRole("button", { name: "Back to My Commutes" })).toBeVisible();
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
  await expect(page.locator("[data-map-pan-zoom-viewport]")).toHaveAttribute(
    "data-map-camera-moving",
    "false",
    { timeout: 2_000 },
  );
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
    expect(commutePathStyle.animationName).toBe("map-overlay-rail-pulse");
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
  await expect(stopsList.getByText("Union", { exact: true })).toBeVisible();

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

test("saved commute active closure focuses its current active-alert overlay", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  if (isMobile) {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("button", { name: "Demo Account" }).click();
  } else {
    await openDashboardMenu(page, isMobile);
    await page.getByRole("menuitem", { name: "Demo account" }).click({ force: true });
    await page.getByRole("button", { name: "Toggle menu" }).click({ force: true });
    await page.getByRole("menuitem", { name: "My Commutes" }).click({ force: true });
  }

  const impactDisclosure = page.locator(".saved-commute-impact-disclosure").first();
  await impactDisclosure.locator("summary").click();
  await page.getByRole("button", { name: /View Active Closure on the map for Morning commute/ }).click();

  const activeClosureOverlay = page.locator(
    '[data-selected-commute-impact-overlay="stub-active-closure-child-line-1"]',
  );
  await expect(activeClosureOverlay).toBeAttached();
  await expect(activeClosureOverlay.locator(".suspension-candy")).toBeVisible();
  await expect(page.locator('[data-selected-commute-impact-overlay] .planned-preview.selected')).toHaveCount(0);

  if (isMobile) {
    const inspector = page.getByRole("complementary", { name: "Selected map impact details" });
    await expect(inspector).toContainText("Active Alert");
    await expect(inspector).toContainText("Seeded active planned closure for browser verification.");
  } else {
    await expect(page.getByRole("heading", { name: "Active Alerts" })).toBeVisible();
    await expect(page.locator('[data-impact-card-id="stub-active-closure-child-line-1"]')).toBeVisible();
  }
});

test("custom commute notification schedules are non-blocking", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  if (isMobile) {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("button", { name: "Demo Account" }).click();
  } else {
    await openDashboardMenu(page, isMobile);
    await page.getByRole("menuitem", { name: "Demo account" }).click({ force: true });
    await page.getByRole("button", { name: "Toggle menu" }).click({ force: true });
    await page.getByRole("menuitem", { name: "My Commutes" }).click({ force: true });
  }

  await page.getByRole("button", { name: "Edit Alerts" }).click();
  await expect(page.getByRole("button", { name: "Configure Outbound Route schedule" })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "Configure Return Route schedule" })).toHaveAttribute("aria-expanded", "true");
  const outboundWindow = page.getByRole("group", { name: "Outbound Route notification window" });
  await outboundWindow.getByRole("button", { name: "Custom" }).click();
  await expect(outboundWindow.getByRole("button", { name: "Custom" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("group", { name: "Outbound Route notification days" })).toBeVisible();
  await page.getByRole("group", { name: "Outbound Route notification days" }).getByRole("button", { name: "Sat" }).click();
  await expect(page.getByRole("group", { name: "Outbound Route notification days" }).getByRole("button", { name: "Sat" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("group", { name: "Outbound Route notification days" }).getByRole("button", { name: "Sun" }).click();
  await page.getByLabel("Outbound Route start time").fill("07:15");
  await expect(page.getByLabel("Outbound Route start time")).toHaveValue("07:15");
  await expect(page.getByRole("button", { name: "Configure Outbound Route schedule" })).toContainText("Every Day · 7:15 AM-9:30 AM");
  await expect(outboundWindow).toBeVisible();
  const returnWindow = page.getByRole("group", { name: "Return Route notification window" });
  await expect(returnWindow).toBeVisible();
  await returnWindow.getByRole("button", { name: "Every Day" }).click();
  await expect(returnWindow.getByRole("button", { name: "Every Day" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Configure Return Route schedule" })).toContainText("Every Day · All Day");
  await expect(page.getByRole("button", { name: "Save Alerts" })).toBeEnabled();
});

test("regional commute notifications omit TTC-only event types", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  if (isMobile) {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("button", { name: "Demo Account" }).click();
  } else {
    await openDashboardMenu(page, isMobile);
    await page.getByRole("menuitem", { name: "Demo account" }).click({ force: true });
    await page.getByRole("button", { name: "Toggle menu" }).click({ force: true });
    await page.getByRole("menuitem", { name: "My Commutes" }).click({ force: true });
  }

  const commutePanel = page.locator(".commute-panel");
  await commutePanel.getByRole("button", { name: "+ Add Route" }).click();
  await commutePanel.getByRole("button", { name: "Customize Commute Notifications" }).click();
  await expect(commutePanel.getByText("Reduced Speed Zones", { exact: true })).toBeVisible();
  await commutePanel.getByRole("button", { name: "GO & UP", exact: true }).click();
  await expect(commutePanel.getByText("Reduced Speed Zones", { exact: true })).toHaveCount(0);
  await expect(commutePanel.getByText("Suspensions", { exact: true })).toBeVisible();
  await expect(commutePanel.getByText("Delays", { exact: true })).toBeVisible();
  await expect(commutePanel.getByText("Planned Closures", { exact: true })).toBeVisible();
  await expect(commutePanel.getByText("Service Restored", { exact: true })).toBeVisible();
});

test("saved commute View on Map transitions cleanly across network modes and pans to overlay", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  const networkSelector = page.getByRole("group", { name: "Select transit network" });
  if (isMobile) {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
    await networkSelector.getByRole("button", { name: "GO/UP", exact: true }).click();
    await expect(page.locator(".regional-map-stage")).toBeVisible();
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("button", { name: "Demo Account" }).click();
    await expect(page.getByRole("heading", { name: "My Commutes" })).toBeVisible();
  } else {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
    await networkSelector.getByRole("button", { name: "GO/UP", exact: true }).click();
    await expect(page.locator(".regional-map-stage")).toBeVisible();
    await openDashboardMenu(page, isMobile);
    await page.getByRole("menuitem", { name: "Demo account" }).click({ force: true });
    await page.getByRole("button", { name: "Toggle menu" }).click({ force: true });
    await page.getByRole("menuitem", { name: "My Commutes" }).click({ force: true });
  }

  // Find TTC morning commute and click View on Map for the suspension impact
  const impactDisclosure = page.locator(".saved-commute-impact-disclosure").first();
  await impactDisclosure.locator("summary").click();
  const viewImpactBtn = page.getByRole("button", { name: /View Suspension on the map for Morning commute/ });
  await expect(viewImpactBtn).toBeVisible();
  await viewImpactBtn.click();

  // Verify transition to TTC network
  await expect(page.locator(".ttc-map-stage")).toBeVisible();
  await expect(page.locator("[data-commute-path-preview]")).toBeVisible();
  const selectedImpactOverlay = page.locator('[data-selected-commute-impact-overlay="stub-alert-line-1"]');
  await expect(selectedImpactOverlay).toBeAttached();
  await expect(selectedImpactOverlay.locator(".suspension-candy")).toBeVisible();

  // Verify camera animated and zoomed in on the disruption
  await expect(page.locator("[data-map-pan-zoom-viewport]")).toHaveAttribute(
    "data-map-camera-moving",
    "false",
    { timeout: 3_000 },
  );
  const mapTransform = await page.locator(".ttc-map-stage").evaluate((el) => {
    return el.style.transform;
  });
  expect(mapTransform).toContain("scale(");
  expect(mapTransform).not.toBe("translate(0px, 0px) scale(1)");
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
  if (isMobile) {
    const myStationsShortcut = page.getByRole("button", { name: "Open My Stations" });
    const mobileNetworkSelector = page.locator(".mobile-network-selector-slot");
    await expect(myStationsShortcut).toBeVisible();
    await expect.poll(async () => {
      const [selectorBox, shortcutBox] = await Promise.all([
        mobileNetworkSelector.boundingBox(),
        myStationsShortcut.boundingBox(),
      ]);
      return selectorBox && shortcutBox
        ? {
            belowSwitcher: shortcutBox.y >= selectorBox.y + selectorBox.height,
            sameWidth: Math.abs(shortcutBox.width - selectorBox.width) <= 1,
          }
        : null;
    }).toEqual({ belowSwitcher: true, sameWidth: true });
    await myStationsShortcut.click();
    await expect(page.getByRole("region", { name: "My Stations" })).toBeVisible();
    await page.getByRole("button", { name: "Close My Stations" }).click();
    await expect(myStationsShortcut).toBeVisible();
  }
  await page.getByRole("button", { name: "Stub Station station details" }).click();
  await expect(page.getByRole("button", { name: "Save Stub Station to My Stations" })).toBeVisible();
  await page.getByRole("button", { name: "Save Stub Station to My Stations" }).click();
  await expect(page.getByRole("button", { name: "Remove Stub Station from My Stations" })).toBeVisible();
  const saveNotice = page.getByRole("status").filter({ hasText: "Stub Station added to" });
  await expect(saveNotice).toBeVisible();
  await saveNotice.getByRole("button", { name: "My Stations" }).click();

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
  await expect(panel.getByText("1 Active Closure", { exact: true })).toBeVisible();
  const viewAlertDetails = panel.getByRole("button", { name: "View Stub Station alert details" }).first();
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

test("My Stations shows regional disruptions, accessibility outages, and arrivals", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "regional My Stations integration is covered on desktop");
  await setStubMode(request, "regional-live");
  await page.goto("/");

  await openDashboardMenu(page, isMobile);
  await page.getByRole("menuitem", { name: "Demo account" }).click({ force: true });
  await expect(page.getByRole("heading", { name: "My Commutes" })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).first().click();
  await page.getByRole("group", { name: "Select transit network" })
    .getByRole("button", { name: "GO/UP", exact: true })
    .click();

  await page.locator('.regional-station-hit-target[data-regional-station-id="pickering"]').press("Enter");
  const stationPanel = page.getByRole("complementary", { name: "Pickering regional station details" });
  await stationPanel.getByRole("button", { name: "Save Pickering to My Stations" }).click();
  const saveNotice = page.getByRole("status").filter({ hasText: "Pickering added to" });
  await saveNotice.getByRole("button", { name: "My Stations" }).click();

  const panel = page.getByRole("region", { name: "My Stations" });
  const pickeringRow = panel.locator(".saved-station-rich-row", { hasText: "Pickering" });
  await expect(pickeringRow.getByText("Active Disruptions", { exact: true })).toBeVisible();
  await expect(pickeringRow.getByText("Metrolinx GO Next Service", { exact: true })).toBeVisible();
  await expect(pickeringRow.getByText("7 min", { exact: true })).toBeVisible();
  await pickeringRow.getByText("Active Disruptions", { exact: true }).click();
  await expect(pickeringRow.getByText(/Delay/).first()).toBeVisible();

  await panel.getByRole("button", { name: "Add Station", exact: true }).click();
  await panel.getByPlaceholder("Search All Stations...").fill("Eglinton");
  await panel.getByRole("button", { name: "Save Eglinton to My Stations" }).click();
  await panel.getByRole("button", { name: "Done adding stations" }).click();
  const eglintonRow = panel.locator(".saved-station-rich-row", { hasText: "Eglinton" });
  await expect(eglintonRow.locator(".saved-station-disruption-summary")).toContainText("1 Elevator Outage");
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

  const onTimePerformance = page.getByRole("heading", { name: "On-Time Performance" }).locator("..");
  const line1Row = onTimePerformance.locator(".reliability-row").filter({
    has: page.locator("strong", { hasText: /^Line 1 Yonge-University$/ }),
  });
  await expect(line1Row).toBeVisible();
  await expect(line1Row.getByText("94%")).toBeVisible();

  const availability = page.getByRole("heading", { name: "Availability" }).locator("..");
  const elevatorsRow = availability.locator(".reliability-row").filter({
    has: page.locator("strong", { hasText: /^Elevators$/ }),
  });
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

test("mobile browser Back restores the path that launched Show on Map", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "mobile-only browser history behavior");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  await page.getByRole("button", { name: "Status", exact: true }).click();
  await expect(page.getByRole("heading", { name: "System Status" })).toBeVisible();
  await page.locator(".mobile-status-actions").getByRole("button", { name: /Delay/ }).click();
  await expect(page.getByRole("heading", { name: "Delays" })).toBeVisible();

  await page.getByRole("button", { name: "Show on Map" }).first().click();
  await expect(page.locator("[data-mobile-impact-inspector]")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Delays" })).toHaveCount(0);

  await page.goBack();
  await expect(page.locator("[data-mobile-impact-inspector]")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Delays" })).toBeVisible();

  await page.goBack();
  await expect(page.getByRole("heading", { name: "System Status" })).toBeVisible();

  await page.goBack();
  await expect(page.getByRole("heading", { name: "System Status" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
});

test("map impact shortcuts return directly to the map", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  const openMapDelayShortcut = async () => {
    if (isMobile) {
      await page.locator(".mobile-status-peek-count-badge.delays").click();
    } else {
      await page.locator(".desktop-status-chip--delays").click();
    }
    await expect(page.getByRole("heading", { name: "Delays" })).toBeVisible();
  };

  const expectMapOrigin = async () => {
    await expect(page.getByRole("heading", { name: "Delays" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
    if (isMobile) {
      await expect(page.locator(".mobile-status-peek")).toBeVisible();
      await expect(page.getByRole("heading", { name: "System Status" })).toHaveCount(0);
    } else {
      await expect(page.getByRole("button", { name: "Toggle menu" })).toHaveAttribute("aria-expanded", "false");
    }
  };

  await openMapDelayShortcut();
  await page.getByRole("button", { name: "Back" }).click();
  await expectMapOrigin();

  await openMapDelayShortcut();
  await page.goBack();
  await expectMapOrigin();

  if (isMobile) {
    await page.getByRole("button", { name: "Status", exact: true }).click();
    await expect(page.getByRole("heading", { name: "System Status" })).toBeVisible();
    const mobileSheet = page.locator('[data-floating-panel="mobile-panel"]');
    await mobileSheet.evaluate((element) => { element.setAttribute("data-smoke-stable-sheet", "true"); });
    await page.locator(".mobile-status-actions").getByRole("button", { name: /Delay/ }).click();
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByRole("heading", { name: "System Status" })).toBeVisible();
    await expect(page.locator('[data-floating-panel="mobile-panel"][data-smoke-stable-sheet="true"]')).toBeVisible();
  }
});

test("desktop browser Back unfocuses an impact before leaving its submenu", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "desktop-only browser history behavior");
  await setStubMode(request, "seeded");
  await openDashboardMenu(page, isMobile);
  await openServiceCategory(page, isMobile, /Delay/);

  const showOnMap = page.getByRole("button", { name: "Show on Map" }).first();
  await showOnMap.click();
  await expect(page.getByRole("heading", { name: "Delays" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Unfocus" }).first()).toBeVisible();

  await page.goBack();
  await expect(page.getByRole("heading", { name: "Delays" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show on Map" }).first()).toBeVisible();

  await page.goBack();
  await expect(page.getByRole("menu")).toBeVisible();
});

test("submenu Back reverses the path used to open account features", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await openDashboardMenu(page, isMobile);

  const openFeature = async (name: "My Commutes" | "My Stations" | "Notifications") => {
    if (isMobile) {
      const mobileName = name === "Notifications" ? /^Notifications/ : name;
      await page.getByRole("button", { name: mobileName, exact: name !== "Notifications" }).click();
    } else {
      await page.getByRole("menuitem", { name, exact: true }).click();
    }
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    if (isMobile) {
      await expect(page.getByRole("heading", { name: "More", exact: true })).toBeVisible();
    } else {
      await expect(page.getByRole("menu")).toBeVisible();
    }
  };

  await openFeature("My Commutes");
  await openFeature("My Stations");
  await openFeature("Notifications");
});

test("manages push notification preferences on mobile", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "mobile-only push notification preferences smoke");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
  await page.locator(".mobile-network-selector-slot")
    .getByRole("group", { name: "Select transit network" })
    .getByRole("button", { name: "GO/UP", exact: true })
    .click();
  await expect(page.getByRole("region", { name: "Interactive GO and UP map" })).toBeVisible();

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
  await expect(page.getByRole("heading", { name: "Line & Corridor Subscriptions" })).toBeVisible();
  const subscriptionNetwork = page.getByRole("group", { name: "Notification subscription network" });
  await expect(subscriptionNetwork.getByRole("button", { name: "GO & UP", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/Corridor alerts use fresh, supported GO\/UP service disruptions/)).toBeVisible();
  await expect(page.getByLabel("Subscribe to LW Lakeshore West")).toBeAttached();
  await subscriptionNetwork.getByRole("button", { name: "TTC", exact: true }).click();
  await expect(subscriptionNetwork.getByRole("button", { name: "TTC", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "Planned Closure Follow-ups" })).toBeVisible();
  const smartFollowUp = page.getByRole("radio", { name: /^Smart/ });
  await expect(smartFollowUp).toBeChecked();
  const announcementsOnly = page.getByRole("radio", { name: /^Announcements Only/ });
  await announcementsOnly.check();
  await expect(announcementsOnly).toBeChecked();
  await expect(page.getByText("Event Starts/Changes")).toHaveCount(0);

  const line1Switch = page.getByLabel("Subscribe to Line 1 Yonge-University");
  await expect(line1Switch).toBeAttached();
  await line1Switch.locator("xpath=ancestor::label").click();
  await expect(line1Switch).toBeChecked();

  const rszSwitch = page.getByLabel("Line subscription Reduced Speed Zones");
  await expect(rszSwitch).toBeAttached();
  await expect(rszSwitch).toBeChecked();
  await rszSwitch.locator("xpath=ancestor::label").click();
  await expect(rszSwitch).not.toBeChecked();

  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("heading", { name: "More" })).toBeVisible();

  await expect(page.getByRole("navigation", { name: "Primary mobile navigation" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary mobile navigation" }).getByRole("button", { name: "Notifications" })).toHaveCount(0);
});

test("renders and incrementally moves estimated train markers on desktop and mobile", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
  await expect(page.locator(".linewatch-shell")).not.toHaveClass(/motion-paused/);
  await expect(page.locator(".estimated-train-marker-core")).toHaveCount(0);

  await page.getByRole("button", { name: /Toggle estimated train markers/ }).click();

  const marker = page.locator('[data-train-marker-line-id="line-1"]');
  await expect(page.locator(".estimated-train-marker-core")).toHaveCount(1);
  await expect(marker).toBeVisible();
  const markerBorderStyles = await marker.evaluate((node) => {
    const outline = getComputedStyle(
      node.querySelector<SVGPathElement>(".estimated-train-marker-outline")!,
    );
    const core = getComputedStyle(
      node.querySelector<SVGPathElement>(".estimated-train-marker-core")!,
    );
    return {
      strokes: [outline.stroke, core.stroke].sort(),
      outlineWidth: outline.strokeWidth,
      coreWidth: core.strokeWidth,
    };
  });
  expect(markerBorderStyles.strokes).toEqual(
    ["rgb(9, 13, 22)", "rgb(255, 255, 255)"].sort(),
  );
  expect(markerBorderStyles.outlineWidth).toBe(isMobile ? "7.5px" : "5.5px");
  expect(markerBorderStyles.coreWidth).toBe(isMobile ? "4px" : "2.2px");
  await marker.evaluate((node) => {
    const motionWindow = window as Window & {
      __lineWatchTrainMarkerFrames?: Array<{ at: number; transform: string | null }>;
      __lineWatchTrainMarkerObserver?: MutationObserver;
    };
    motionWindow.__lineWatchTrainMarkerFrames = [];
    motionWindow.__lineWatchTrainMarkerObserver?.disconnect();
    motionWindow.__lineWatchTrainMarkerObserver = new MutationObserver(() => {
      motionWindow.__lineWatchTrainMarkerFrames?.push({
        at: performance.now(),
        transform: node.getAttribute("transform"),
      });
    });
    motionWindow.__lineWatchTrainMarkerObserver.observe(node, {
      attributeFilter: ["transform"],
    });
  });
  const initialTransform = await marker.getAttribute("transform");
  expect(await page.evaluate(() => document.visibilityState)).toBe("visible");
  const nextTrainResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/api/trains"
      && response.request().method() === "GET",
  );
  const advanceResponse = await request.post(`${stubUrl}/__test/train-marker-advance`);
  expect(advanceResponse.ok()).toBeTruthy();
  const refreshedTrainResponse = await nextTrainResponse;
  expect((await refreshedTrainResponse.json()).markers[0].progress).toBe(0.5);
  await expect.poll(() => marker.getAttribute("transform"), { timeout: 4_000 })
    .not.toBe(initialTransform);
  const intermediateTransform = await marker.getAttribute("transform");
  await page.waitForTimeout(240);
  expect(await marker.getAttribute("transform")).not.toBe(intermediateTransform);
  const markerFrames = await page.evaluate(() => {
    const motionWindow = window as Window & {
      __lineWatchTrainMarkerFrames?: Array<{ at: number; transform: string | null }>;
      __lineWatchTrainMarkerObserver?: MutationObserver;
    };
    motionWindow.__lineWatchTrainMarkerObserver?.disconnect();
    return motionWindow.__lineWatchTrainMarkerFrames ?? [];
  });
  expect(new Set(markerFrames.map((frame) => frame.transform)).size).toBeGreaterThanOrEqual(6);
  const frameSpan = markerFrames.at(-1)!.at - markerFrames[0].at;
  expect(frameSpan).toBeGreaterThanOrEqual(160);
});

test("shows train-marker connection progress until markers return on desktop and mobile", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  const disconnectResponse = await request.post(`${stubUrl}/__test/train-marker-disconnect`);
  expect(disconnectResponse.ok()).toBeTruthy();
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  const toggle = page.getByRole("button", { name: /Toggle estimated train markers/ });
  await toggle.click();
  const pendingIndicator = page.locator(isMobile
    ? ".mobile-train-pending-spinner"
    : ".estimated-train-pending-indicator:visible");
  await expect(pendingIndicator).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-label", /Connecting|Reconnecting/);
  if (isMobile) await expect(toggle).toHaveAttribute("aria-busy", "true");
  await expect(page.locator(".estimated-train-marker")).toHaveCount(0);

  const nextTrainResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/api/trains"
      && response.request().method() === "GET"
      && response.status() === 200,
  );
  const reconnectResponse = await request.post(`${stubUrl}/__test/train-marker-reconnect`);
  expect(reconnectResponse.ok()).toBeTruthy();
  await nextTrainResponse;

  await expect(page.locator(".estimated-train-marker")).toHaveCount(1);
  await expect(pendingIndicator).toHaveCount(0);
  await expect(toggle).toHaveAttribute("aria-label", /1 shown/);
});
