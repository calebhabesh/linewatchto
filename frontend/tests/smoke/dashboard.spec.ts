import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const appUrl = "http://127.0.0.1:4173";
const stubUrl = "http://127.0.0.1:4174";
const disclaimerStorageKey = "linewatch-disclaimer-ack-v1";

async function setStubMode(request: APIRequestContext, mode: "seeded" | "unavailable" | "map-authoritative-overlap" | "regional-live") {
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

async function expectRegionalChooserToClearReferencedAlerts(page: Page) {
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
  await expect(page.getByRole("button", { name: /Toggle estimated train markers/ })).toBeVisible();
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
  const westonPanel = page.getByRole("complementary", { name: "Weston regional station details" });
  await expect(westonPanel).toBeVisible();
  await expect(westonPanel.getByRole("button", { name: "Save Weston to My Stations" })).toBeVisible();
  await expect(westonPanel.getByRole("button", { name: "Close station details" })).toBeVisible();
  await expect(westonPanel.locator(".regional-route-pill").first()).toBeVisible();

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

test("regional refresh, pan, zoom, and center preserve the authored SVG instance", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "desktop regional camera regression");
  await setStubMode(request, "seeded");
  await page.goto("/");

  await page.getByRole("group", { name: "Select transit network" })
    .getByRole("button", { name: "GO/UP", exact: true })
    .click();

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
  await expect(statusSheet.getByRole("button", { name: /Reduced Speed Zones/ })).toHaveCount(0);

  await statusSheet.getByRole("button", { name: "Close status" }).click();
  const weston = page.locator('[data-regional-station-id="weston"]');
  await weston.press("Enter");
  const stationPanel = page.getByRole("complementary", { name: "Weston regional station details" });
  await expect(stationPanel.getByRole("button", { name: "Save Weston to My Stations" })).toBeVisible();
  await expect(stationPanel.getByRole("button", { name: "Close station details" })).toBeVisible();
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
    .toHaveAttribute("transform", /scale\(4\.2\)/);
  await expect(plannedOverlay.locator(".regional-planned-closure-glyph--icon > g").first())
    .toHaveAttribute("transform", /scale\(6\)/);
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
    page.locator('[data-regional-station-id="appleby"]').boundingBox(),
    page.locator('[data-regional-station-id="burlington"]').boundingBox(),
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
  await expect(lwCorridorOverlay).toHaveAttribute("data-regional-impact-segment-count", "16");
  const lwCorridorPaths = await lwCorridorOverlay.locator(".regional-impact-path").evaluateAll(
    (paths) => paths.map((path) => path.getAttribute("d") ?? ""),
  );
  expect(lwCorridorPaths).toHaveLength(1);
  expect((lwCorridorPaths[0].match(/\bM\b/g) ?? []).length).toBe(2);
  expect((lwCorridorPaths[0].match(/\bL\b/g) ?? []).length).toBeGreaterThan(16);

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
    .toHaveAttribute("mask", /regional-hover-boundary-mask-/);
  await expect(delayOverlay.locator(".regional-impact-interactive-glow"))
    .toHaveCSS("stroke", "rgba(248, 250, 252, 0.98)");
  await expect(lwCorridorOverlay.locator(".regional-impact-interactive-glow")).toHaveCSS("opacity", "0");

  // Station hit targets sit above the authored rails. Crossing one must keep
  // the whole impact highlight on instead of briefly switching it off.
  const whitbyBox = await page.locator('[data-regional-station-id="whitby"]').boundingBox();
  expect(whitbyBox).not.toBeNull();
  await page.mouse.move(
    whitbyBox!.x + whitbyBox!.width / 2,
    whitbyBox!.y + whitbyBox!.height / 2,
  );
  await expect(delayHoverForeground).toHaveAttribute("data-regional-impact-hovered", "true");

  const pickeringStation = page.locator('[data-regional-station-id="pickering"]');
  await pickeringStation.press("Enter");
  const stationPanel = page.getByRole("complementary", { name: "Pickering regional station details" });
  await expect(stationPanel).toBeVisible();
  await expect(stationPanel.getByText("Metrolinx GO Next Service", { exact: true })).toBeVisible();
  await expect(stationPanel.getByText("To Kitchener GO", { exact: true })).toBeVisible();
  await expect(stationPanel.getByText("7 min", { exact: true })).toBeVisible();
  await expect(stationPanel.getByRole("heading", { name: "Platform 11" })).toBeVisible();
  await expect(stationPanel.getByText("Delayed estimate", { exact: true })).toBeVisible();
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
  await expect(stationPanel).toBeVisible();
  await expect(stationPanel.getByText("Metrolinx Open API", { exact: true })).toBeHidden();
  await expect(stationPanel.getByText("Elevator out of service", { exact: true })).toBeHidden();
  await stationPanel.locator("summary.station-accessibility-summary").click();
  await expect(stationPanel.getByText("Metrolinx Open API", { exact: true })).toBeVisible();
  await expect(stationPanel.getByText("Elevator out of service", { exact: true })).toBeVisible();
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
  const marker = page.locator('[data-marker-key="regional-ki:outbound:3775:cab-3775"]');
  await expect(page.locator(".estimated-train-marker-regional-ki")).toHaveCount(1);
  await expect(marker).toBeAttached();
  await expect(marker.locator(".estimated-train-marker-outline")).toHaveCount(1);
  await expect(marker.locator(".estimated-train-marker-core")).toHaveCount(1);
  await expect(marker.locator(".estimated-train-marker-window")).toHaveCount(3);
  await expect(marker.locator(".estimated-train-marker-arrow")).toHaveCount(1);
  expect(await marker.evaluate((node) => node.parentElement?.parentElement?.id)).toBe(
    "regional-stations-layer",
  );

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
  await expect(firstCompactRow).toContainText("Reduced speed:");
  await expect(firstCompactRow).toContainText("Est. resolution:");
  await expect(firstCompactRow).toContainText("Updated:");
  await expect(firstCompactRow).toHaveCSS("border-left-color", "rgb(245, 158, 11)");
  await expect(firstCompactRow).toHaveCSS("border-left-width", cardEdgeWidth);
  const compactGridColumnCount = await firstCompactRow.locator(".compact-impact-list-item__facts").evaluate(
    (element) => getComputedStyle(element).gridTemplateColumns.split(" ").length,
  );
  expect(compactGridColumnCount).toBe(isMobile ? 2 : 4);
  const firstStartedBounds = await firstCompactRow.locator(".is-column-2").boundingBox();
  const secondStartedBounds = await page.locator(".compact-impact-list-item").nth(1).locator(".is-column-2").boundingBox();
  expect(firstStartedBounds).not.toBeNull();
  expect(secondStartedBounds).not.toBeNull();
  expect(Math.abs(firstStartedBounds!.x - secondStartedBounds!.x)).toBeLessThanOrEqual(1);
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
  await expect(page.getByRole("button", { name: /Toggle estimated train markers/ })).toHaveCount(0);

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
  await expect(page.getByText("Maps & Alerts", { exact: true })).toBeVisible();
  await page.getByRole("menuitem", { name: /Reduced Speed Zones/ }).click();
  await expect(page.locator('select[aria-label="Filter Reduced Speed Zones by line"]')).toHaveValue("all");
});

test("mobile Line Status opens a temporary line-focused alert category", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "mobile-only System Status interaction");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await page.getByRole("button", { name: "Status", exact: true }).click();

  const statusSheet = page.getByRole("region", { name: "Current service status" });
  const lineOneStatus = statusSheet.locator(".mobile-line-status-row").filter({ hasText: "Yonge-University" });
  await lineOneStatus.getByRole("button", { name: /Reduced Speed Zone/ }).click();
  await expect(page.locator('select[aria-label="Filter Reduced Speed Zones by line"]')).toHaveValue("line-1");

  await page.getByRole("button", { name: "Back" }).click();
  await statusSheet.getByRole("button", { name: /Reduced Speed Zones/ }).first().click();
  await expect(page.locator('select[aria-label="Filter Reduced Speed Zones by line"]')).toHaveValue("all");
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

test("opens GO and UP ingested alert JSONs in regional map mode", async ({ page, request, isMobile }) => {
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
    await expect(page.getByText("GO / UP Ingested Alerts")).toBeVisible();
  }

  await page.getByRole("button", { name: "Toggle Ingestion Logs" }).click();
  await expect(page.getByText("Ingested GO / UP Alerts")).toBeVisible();
  await expect(page.getByRole("heading", { name: "GO Rail (1)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "UP Express (1)" })).toBeVisible();

  await page.getByRole("button", { name: /Lakeshore East service adjustment/ }).click();
  await expect(page.getByText("Raw JSON Payload")).toBeVisible();
  await expect(page.locator("pre").filter({ hasText: "Service Disruption" })).toBeVisible();
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
  await expect(mobileNetworkSelector).toBeVisible();
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
  await page.getByRole("button", { name: "Edit commute Morning commute" }).click();
  await expect(page.getByRole("heading", { name: "Edit Route" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Commute label" })).toHaveValue("Morning commute");
  await expect(page.locator(".commute-station-picker").filter({ hasText: "Origin" })).toContainText("Stub Station");
  await expect(page.locator(".commute-station-picker").filter({ hasText: "Destination" })).toContainText("Union");
  await expect(page.getByRole("checkbox", { name: "Track Return Route" })).toBeChecked();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Stub Station <-> Union")).toBeVisible();
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

  await page.locator('[data-regional-station-id="pickering"]').press("Enter");
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

test("renders estimated train markers only after the layer is enabled", async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
  await expect(page.locator(".estimated-train-marker-core")).toHaveCount(0);

  await page.getByRole("button", { name: /Toggle estimated train markers/ }).click();

  await expect(page.locator(".estimated-train-marker-core")).toHaveCount(1);
  await expect(page.locator('[data-train-marker-line-id="line-1"]')).toBeVisible();
});
