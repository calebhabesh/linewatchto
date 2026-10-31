import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  appUrl,
  installDismissedTransientUi,
  reportBrowserErrors,
  setStubMode,
  stubUrl,
  waitForNetworkTransition,
} from "./test-support";
import { currentReleaseNote, RELEASE_NOTES_SEEN_STORAGE_KEY } from "../../src/app/release-notes";

const welcomeStorageKey = "linewatch-welcome-seen-v1";
const disclaimerStorageKey = "linewatch-unofficial-notice-ack-v1";

// Mobile opens the More tab. Desktop has no menu: the sidebar opens on Status,
// and its rail reaches every other destination (see openDesktopDestination).
async function openDashboardMenu(page: Page, isMobile = false) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" }).first()).toBeVisible();
  if (isMobile) {
    await page.getByRole("button", { name: "More", exact: true }).click();
  } else {
    await expect(page.locator("#desktop-sidebar-container")).toBeVisible();
  }
}

type DesktopDestination =
  | "status" | "sign-in" | "stations" | "commutes" | "alert-history" | "more" | "source-status"
  | "accessibility-outages" | "surface-notices" | "announcements"
  | "alerts" | "delays" | "reduced-speed-zones" | "closures" | "trip-changes";

async function openDesktopDestination(page: Page, destination: DesktopDestination) {
  await page.locator(`.desktop-nav-rail [data-dest="${destination}"]`).click();
}

async function signInDesktopDemoAccount(page: Page) {
  await openDesktopDestination(page, "more");
  await page.locator(".desktop-more-panel").getByRole("button", { name: "Demo Account" }).click();
  await expect(page.locator(".desktop-nav-rail [data-dest=\"sign-in\"]")).toHaveAttribute("aria-label", "Account, Signed in");
}

// Desktop shows a switch; mobile shows a pressed-state "View Trains" button.
function estimatedTrainToggle(page: Page) {
  const name = /Toggle estimated train markers/;
  return page.getByRole("switch", { name }).or(page.getByRole("button", { name })).filter({ visible: true });
}

function serviceCategoryDestination(name: RegExp | string): DesktopDestination {
  const label = typeof name === "string" ? name : name.source;
  if (/Delay/i.test(label)) return "delays";
  if (/Reduced Speed/i.test(label)) return "reduced-speed-zones";
  if (/Suspension/i.test(label)) return "alerts";
  if (/Closure|Planned/i.test(label)) return "closures";
  if (/Trip Change/i.test(label)) return "trip-changes";
  throw new Error(`No desktop rail shortcut for ${label}`);
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

  const mapLayer = page.locator("[data-system-map=ttc] .map-stage").first();
  await expect(mapLayer).toHaveCSS("transition-property", "none");
}

async function openServiceCategory(page: Page, isMobile: boolean, name: RegExp | string) {
  if (isMobile) {
    await page.getByRole("button", { name: "Status", exact: true }).click();
    await page.locator(".mobile-status-actions").getByRole("button", { name }).click();
  } else {
    await openDesktopDestination(page, serviceCategoryDestination(name));
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
      "[data-system-map=regional] .overlay-segment-group > .asset-alert-path",
    )].some((path) => {
      const group = path.closest<SVGElement>(".overlay-segment-group");
      if (!group?.dataset.mapImpactId || !impactIds.has(group.dataset.mapImpactId)) return false;
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
  ".desktop-map-control-rail",
  ".desktop-map-legend",
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
  reportBrowserErrors(page);
  await freezeBrowserTime(page, "2026-06-04T12:00:00-04:00");
  await page.addInitScript(({ disclaimerKey, welcomeKey, releaseNotesKey, releaseVersion }) => {
    window.localStorage.setItem(welcomeKey, "true");
    window.localStorage.setItem(disclaimerKey, "true");
    if (releaseVersion) window.localStorage.setItem(releaseNotesKey, releaseVersion);
    // Suppress the PWA install nudge during smoke tests to avoid UI layout conflicts
    window.localStorage.setItem("linewatch-pwa-install-dismissed-at-v1", String(Date.now()));
  }, {
    disclaimerKey: disclaimerStorageKey,
    welcomeKey: welcomeStorageKey,
    releaseNotesKey: RELEASE_NOTES_SEEN_STORAGE_KEY,
    releaseVersion: currentReleaseNote?.version,
  });
});

test("foreground recovery restarts the constellation animation with stale visibility state", async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");

  const chevrons = page.locator(".rsz-chevron");
  const constellation = page.locator(".constellation-background-canvas");
  await expect(chevrons.first()).toBeAttached();
  await expect(constellation).toBeVisible();
  const chevronTransforms = () => chevrons.evaluateAll((paths) => (
    paths.map((path) => {
      const matrix = (path.parentElement as SVGGElement | null)?.getCTM();
      return matrix
        ? [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f]
            .map((value) => Number(value.toFixed(3)))
        : null;
    })
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

  // Alert glyphs never move (docs/map-renderer-parity.md); only the background animates.
  expect(await chevronTransforms()).toEqual(pausedTransforms);

  // Phones in performance mode draw a still background, so there is nothing to restart.
  const staticBackground = await page.locator(".linewatch-shell")
    .evaluate((shell) => shell.classList.contains("mobile-performance-mode"));
  if (staticBackground) return;
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
  await page.getByRole("button", { name: "Got It" }).click();
  await expect(notice).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("dialog", { name: "Welcome to LineWatchTO" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Unofficial dashboard notice" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
});

test("shows a subway closing soon countdown before overnight closure", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await page.goto("/?previewTime=2026-06-04T00:45:00-04:00");

  const closingSoon = isMobile
    ? page.locator(".mobile-service-sheet-notice-row--closing-soon")
    : page.getByRole("status").filter({ hasText: "Subway Closing Soon" });
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
  const [railBox, sidebarBox, workspaceBox, mapControlsBox] = await Promise.all([
    page.locator(".desktop-nav-rail").boundingBox(),
    page.locator("#desktop-sidebar-container").boundingBox(),
    page.locator(".desktop-map-workspace").boundingBox(),
    page.locator(".desktop-map-control-rail").boundingBox(),
  ]);
  for (const box of [railBox, sidebarBox, workspaceBox, mapControlsBox]) {
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewportWidth + 1);
  }
  expect(workspaceBox!.x).toBe(railBox!.x + railBox!.width);
  expect(sidebarBox!.x).toBe(workspaceBox!.x);
  expect(mapControlsBox!.x).toBeGreaterThanOrEqual(workspaceBox!.x);

  await page.locator('[data-dest="alerts"]').click();
  const detailSidebar = page.locator("#desktop-sidebar-container");
  await expect(detailSidebar.getByRole("heading", { name: "Suspensions" })).toBeVisible();
  const panelBox = await detailSidebar.boundingBox();
  expect(panelBox).not.toBeNull();
  expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(viewportWidth + 1);
});

test("keeps the overnight map available and opens subway closed details on demand", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await freezeBrowserTime(page, "2026-06-04T03:20:00-04:00");
  await page.goto("/");

  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Subway Closed" })).toHaveCount(0);
  await expect(page.locator(".mobile-service-sheet-notice-row--closed")).toBeVisible();
  if (isMobile) {
    await page.locator(".mobile-service-sheet-notice-row--closed").click();
  } else {
    await page.getByRole("button", { name: /Subway Closed.*Resumes/ }).press("Enter");
  }
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
    await expect(page.locator(".mobile-service-sheet-notice-row--closed .mobile-service-sheet-notice-title")).toHaveText(/Subway Closed/i);
    await expect(page.locator(".mobile-service-sheet-notice-row--closed .mobile-service-sheet-notice-details")).toHaveText(/Resumes today at 6:00 AM/i);
  } else {
    await expect(page.getByRole("navigation", { name: "Desktop primary navigation" })).toBeVisible();
    await expect(page.locator(".mobile-service-sheet-notice-row--closed .mobile-service-sheet-notice-title")).toHaveText(/Subway Closed/i);
    await expect(page.locator(".mobile-service-sheet-notice-row--closed .mobile-service-sheet-notice-details")).toHaveText(/Resumes today at 6:00 am/i);

    const searchBox = await page.locator(".desktop-sidebar-search-field").boundingBox();
    const closedNoticeBox = await page.locator(".mobile-service-sheet-notice-row--closed").boundingBox();
    expect(searchBox).not.toBeNull();
    expect(closedNoticeBox).not.toBeNull();
    expect(closedNoticeBox!.y).toBeGreaterThanOrEqual(searchBox!.y + searchBox!.height);
    expect(await page.locator(".mobile-service-sheet-notice-row--closed").evaluate(
      (notice) => notice.scrollWidth <= notice.clientWidth,
    )).toBe(true);

    const networkSelector = page.locator("#desktop-sidebar-container")
      .getByRole("group", { name: "Select transit network" });
    await networkSelector.getByRole("button", { name: "GO/UP", exact: true }).click();
    await expect(page.getByText("Subway Closed")).toHaveCount(0);
    await networkSelector.getByRole("button", { name: "TTC", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Subway Closed" })).toHaveCount(0);
    await expect(page.locator(".mobile-service-sheet-notice-row--closed")).toBeVisible();
  }

  await page.getByRole("button", { name: "Stub Station station details" }).press("Enter");
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

  await page.getByRole("button", { name: "Close station details" }).click();

  if (isMobile) {
    await page.locator(".mobile-service-sheet-notice-row--closed").click();
  } else {
    await page.getByRole("button", { name: /Subway Closed.*Resumes/ }).press("Enter");
  }
  await expect(page.getByRole("heading", { name: "Subway Closed" })).toBeVisible();
});

test("keeps the overnight GO/UP map available and opens rail closed details on demand", async ({ page, request, isMobile }) => {
  await setStubMode(request, "regional-live");
  await freezeBrowserTime(page, "2026-06-04T03:20:00-04:00");
  if (isMobile) await page.setViewportSize({ width: 360, height: 800 });
  await page.addInitScript(() => localStorage.setItem("linewatch-default-network-v1", "regional"));
  await page.goto("/?previewTime=2026-06-04T03:20:00-04:00");

  await expect(page.locator(".linewatch-shell")).toHaveAttribute("data-network", "regional");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "GO & UP Rail Closed" })).toHaveCount(0);
  const notice = page.locator(".mobile-service-sheet-notice-row--closed");
  await expect(notice).toContainText("GO & UP Rail Closed");
  await notice.press("Enter");
  await expect(page.getByRole("heading", { name: "GO & UP Rail Closed" })).toBeVisible();
  await page.getByRole("button", { name: "Peek at Regional Map" }).click();
  await expect(page.getByRole("heading", { name: "GO & UP Rail Closed" })).toHaveCount(0);
  await expect(notice).toBeVisible();
  await page.reload();
  await expect(notice).toBeVisible();
  await expect(page.getByRole("heading", { name: "GO & UP Rail Closed" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("station activation survives repeated clicks and an earlier panel close", async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");

  const stubStation = page.getByRole("button", { name: "Stub Station station details" });
  const stubPanel = page.getByRole("complementary", { name: "Stub Station station details" });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await stubStation.press("Enter");
    await expect(stubPanel).toBeVisible();
    await page.getByRole("button", { name: "Close station details" }).click();
    await expect(stubPanel).toHaveCount(0);
  }

  await stubStation.press("Enter");
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
  await page.getByRole("button", { name: "Stub Station station details" }).press("Enter");

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

test("mapped station details expose reviewed TTC station notices", async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  await page.getByRole("button", { name: "Stub Station station details" }).dispatchEvent("click");

  const panel = page.getByRole("complementary", { name: "Stub Station station details" });
  await panel.locator('[data-station-nav-target="notices"]').click();
  const notices = panel.locator('[data-station-section="notices"]');
  await expect(notices).toBeVisible();
  await expect(notices).toHaveAttribute("open", "");
  await expect(notices.getByText("Reviewed TTC station information")).toBeVisible();
  await expect(notices.getByText("Stub Station bus terminal construction")).toBeVisible();
  await expect(notices.getByText(/temporary stops/)).toBeVisible();
  await expect(notices.getByRole("link", { name: "TTC details" })).toHaveAttribute(
    "href",
    "https://www.ttc.ca/subway-stations/stub-station",
  );
});

test("switches the complete dashboard to the fixture-backed regional network", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "network selection is desktop-only");
  await setStubMode(request, "seeded");
  await page.goto("/");

  const networkSelector = page.locator("#desktop-sidebar-container")
    .getByRole("group", { name: "Select transit network" });
  const mapSurface = page.locator(".network-map-transition-surface");
  const mapLegend = mapSurface.locator(".desktop-map-legend");
  const activeLayer = (network: "ttc" | "regional") =>
    mapSurface.locator(`[data-network-map-layer="${network}"]:not([data-preparing])`);
  await expect(networkSelector.getByRole("button", { name: "TTC", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(mapLegend.getByText("Line 1 Yonge-University", { exact: true })).toBeVisible();
  await expect(activeLayer("ttc").locator("[data-system-map=ttc] .map-stage .map-authored-svg")).toHaveCount(1);
  await networkSelector.getByRole("button", { name: "GO/UP", exact: true }).click();

  // Both diagrams stay mounted; the switch makes the GO/UP layer the active one.
  await waitForNetworkTransition(page, "regional");
  await expect(activeLayer("regional").locator("[data-system-map=regional]")).toHaveCount(1);
  await expect(mapSurface.locator('[data-network-map-layer="ttc"]')).toHaveAttribute("data-preparing", "true");
  await expect(mapSurface.locator("[data-system-map=regional] .map-stage")).toHaveAttribute("data-raster-map-ready", "true");
  await expect(page.getByRole("region", { name: "Interactive GO and UP map" })).toBeVisible();
  await expect.poll(async () => {
    const box = await mapLegend.boundingBox();
    return box ? box.x + box.width <= page.viewportSize()!.width + 1 : false;
  }).toBe(true);
  await expect(mapLegend.getByText("Barrie Line", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
  await expect(page.getByRole("switch", { name: /Toggle estimated train markers/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Subway Closed" })).toHaveCount(0);

  const regionalStage = page.locator("[data-system-map=regional] .map-stage");
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
  // Notches ease in; read the camera once the zoom has settled.
  await expect(page.locator("[data-system-map=regional]")).toHaveAttribute("data-map-zoom-active", "false");
  const adjustedCamera = await regionalStage.evaluate((element) => (element as HTMLElement).style.transform);
  await page.setViewportSize({
    width: Math.min(page.viewportSize()!.width + 40, initialViewport!.width),
    height: page.viewportSize()!.height,
  });
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  await expect.poll(() => regionalStage.evaluate((element) => (element as HTMLElement).style.transform)).not.toBe(adjustedCamera);
  const resizedAdjustedCamera = await regionalStage.evaluate((element) => (element as HTMLElement).style.transform);
  const adjustedScale = Number(adjustedCamera.match(/scale\(([^)]+)\)/)?.[1]);
  const resizedAdjustedScale = Number(resizedAdjustedCamera.match(/scale\(([^)]+)\)/)?.[1]);
  expect(resizedAdjustedScale).toBeCloseTo(adjustedScale, 6);

  const weston = page.locator('.station-hit-target[data-station-id="weston"]');
  await expect(weston).toHaveAttribute("tabindex", "0");
  await weston.press("Enter");
  const westonPanel = page.getByRole("complementary", { name: "Weston regional station details" });
  await expect(westonPanel).toBeVisible();
  await expect(westonPanel.getByRole("button", { name: "Save Weston to My Stations" })).toBeVisible();
  await expect(westonPanel.getByRole("button", { name: "Close station details" })).toBeVisible();
  await expect(westonPanel.locator(".regional-route-pill").first()).toBeVisible();
  await westonPanel.getByRole("button", { name: "Close station details" }).click();

  await page.getByRole("button", { name: "Center map view" }).click({ force: true });
  // The fade itself is covered by network-fade.spec.ts.
  await networkSelector.getByRole("button", { name: "TTC", exact: true }).click();
  await waitForNetworkTransition(page, "ttc");
  await expect(activeLayer("ttc").locator("[data-system-map=ttc] .map-stage .map-authored-svg")).toHaveCount(1);
  await expect(mapSurface.locator('[data-network-map-layer="regional"]')).toHaveAttribute("data-preparing", "true");
  await expect(mapSurface.locator("[data-system-map=ttc] .map-stage")).toHaveAttribute("data-raster-map-ready", "true");
  await expect(mapSurface.locator("[data-system-map=ttc] .map-stage")).not.toHaveAttribute("data-map-recenter-effect");
  await expect.poll(async () => {
    const box = await mapLegend.boundingBox();
    return box ? box.x + box.width <= page.viewportSize()!.width + 1 : false;
  }).toBe(true);
  await expect(mapLegend.getByText("Line 1 Yonge-University", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Interactive GO and UP map" })).toBeHidden();
});

test("uses decoded raster artwork while preserving live map geometry in both network modes", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "desktop raster compositor coverage");
  // Fixture fallback exposes the complete station catalog, including every
  // authored label hit target used by this compositor/hover check.
  await setStubMode(request, "unavailable");
  await page.goto("/");

  const ttcStage = page.locator("[data-system-map=ttc] .map-stage");
  await expect(ttcStage).toHaveAttribute("data-raster-map-ready", "true");
  await expect(page.locator(".ttc-map-entrance-reveal")).toHaveCount(0);
  await expect(ttcStage.locator(".raster-map-plane")).toHaveCount(4);
  await expect(ttcStage.locator(".map-authored-svg")).toHaveCSS("visibility", "hidden");
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await ttcStage.locator('[data-station-label-id="kipling"]').hover();
  const rasterLabelHover = ttcStage.locator(".raster-station-label-text-hover");
  await expect(rasterLabelHover).toHaveCount(1);
  await expect(rasterLabelHover).toHaveCSS("transform", /matrix\(1\.035, 0, 0, 1\.035, 0, 0\)/);
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
  await expect(ttcStage.locator(".raster-map-plane")).toHaveCount(4);
  expect(await ttcStage.locator(".raster-map-plane").evaluateAll((images) =>
    images.map((image) => (image as HTMLImageElement).currentSrc)
  )).toEqual(ttcRasterSources);

  await page.getByRole("button", { name: "Expand sidebar" }).click();
  const networkSelector = page.locator("#desktop-sidebar-container")
    .getByRole("group", { name: "Select transit network" });
  await networkSelector.getByRole("button", { name: "GO/UP", exact: true }).click();
  await waitForNetworkTransition(page, "regional");
  const regionalStage = page.locator("[data-system-map=regional] .map-stage");
  await expect(regionalStage).toHaveAttribute("data-raster-map-ready", "true");
  await expect(regionalStage.locator(".raster-map-plane")).toHaveCount(3);
  await expect(regionalStage.locator("#regional-lines-layer")).toHaveCSS("visibility", "hidden");
  await expect(regionalStage.locator("#regional-stations-layer")).toHaveCount(1);
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  const regionalLabelTarget = regionalStage.locator('.station-label-hit-target[data-station-label-id="kipling"]');
  await regionalLabelTarget.hover();
  const regionalRasterLabelHover = regionalStage.locator(".raster-station-label-text-hover");
  await expect(regionalRasterLabelHover).toHaveCount(1);
  await expect(regionalRasterLabelHover).toHaveCSS("transform", /matrix\(1\.035, 0, 0, 1\.035, 0, 0\)/);
  await expect(regionalRasterLabelHover.locator(":scope > image")).toHaveAttribute("mask", "url(#regional-hovered-station-label-mask)");
  await expect(regionalRasterLabelHover.locator("#regional-hovered-station-target-mask")).toHaveCount(1);
  await expect(regionalRasterLabelHover.locator("#regional-hovered-station-label-mask > g"))
    .toHaveAttribute("mask", "url(#regional-hovered-station-target-mask)");
  await expect(regionalStage.locator(".raster-map-plane--labels > image")).toHaveAttribute("mask", "url(#regional-labels-raster-mask)");
  await regionalLabelTarget.dispatchEvent("pointerdown", { pointerId: 31, pointerType: "mouse", button: 0 });
  await expect(regionalLabelTarget).not.toHaveClass(/regional-raster-label-halo|regional-station-label-hovered/);
  await expect(regionalRasterLabelHover).toHaveCount(1);
  await regionalLabelTarget.dispatchEvent("pointerup", { pointerId: 31, pointerType: "mouse", button: 0 });
  // The authored label stays hidden under its raster copy.
  await expect(regionalStage.locator('[data-regional-station-label-for="kipling"]')).toHaveCSS("visibility", "hidden");
});

test("waits for the authored map font before lifting a hovered station label", async ({ page, request, isMobile }) => {
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
  const ttcStage = page.locator("[data-system-map=ttc] .map-stage");
  await expect(ttcStage).toBeVisible();

  try {
    await expect.poll(() => fontRequested).toBe(true);
    await expect(ttcStage).toHaveAttribute("data-map-label-font-ready", "false");
    // Name boxes are prepared data, so every name is a target at once; the
    // lifted label is cut from the live text, so it waits for the font.
    await expect(ttcStage.locator("[data-station-label-id]")).toHaveCount(109);
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await ttcStage.locator('[data-station-label-id="tobermory"]').hover();
    await expect(ttcStage.locator("#ttc-hovered-station-target-mask")).toHaveCount(0);
  } finally {
    releaseFont();
  }

  await expect(ttcStage).toHaveAttribute("data-map-label-font-ready", "true");
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

  const ttcStage = page.locator("[data-system-map=ttc] .map-stage");
  await expect(ttcStage).toHaveAttribute("data-raster-map-ready", "true");
  await expect(ttcStage.locator(".raster-map-plane")).toHaveCount(4);
  await expect(ttcStage.locator(".raster-map-plane--labels")).toHaveCount(1);
  await expect(ttcStage.locator('img.raster-map-plane--labels')).toHaveAttribute("src", /ttc-labels-dark-mobile\.png/);

  await page.getByRole("group", { name: "Select transit network" })
    .getByRole("button", { name: "GO/UP", exact: true })
    .click();
  const regionalStage = page.locator("[data-system-map=regional] .map-stage");
  await expect(regionalStage).toHaveAttribute("data-raster-map-ready", "true");
  await expect(regionalStage.locator(".raster-map-plane")).toHaveCount(3);
  await expect(regionalStage.locator(".raster-map-plane--labels")).toHaveCount(1);
  await expect(regionalStage.locator('img.raster-map-plane--labels')).toHaveAttribute("src", /regional-labels-dark-mobile\.png/);

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
  await page.getByRole("button", { name: "Collapse sidebar" }).click();

  const regionalMap = page.locator("[data-system-map=regional]");
  const regionalViewport = regionalMap.locator(".system-map-viewport");
  const regionalStage = regionalMap.locator(".map-stage");
  const authoredSvg = regionalStage.locator(".map-authored-svg svg");
  const authoredLines = authoredSvg.locator("#regional-lines-layer");
  await expect(authoredSvg).toBeAttached();
  await authoredSvg.evaluate((element) => element.setAttribute("data-smoke-stable", "regional-base"));
  await authoredLines.evaluate((element) => element.setAttribute("data-smoke-stable", "regional-lines"));

  // Force the same dashboard refresh path used by the 30-second poll. The
  // dynamic impact layer should change without replacing the authored SVG.
  await setStubMode(request, "regional-live");
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.locator(
    '[data-system-map=regional] .overlay-segment-group[data-map-impact-id="regional-demo-delay"]',
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
  await page.getByRole("button", { name: "Center map view" }).click();
  await expect(regionalMap).toHaveAttribute("data-map-camera-moving", "false", { timeout: 2_000 });

  await expect(authoredSvg).toHaveAttribute("data-smoke-stable", "regional-base");
  await expect(authoredLines).toHaveAttribute("data-smoke-stable", "regional-lines");
  expect(await regionalStage.evaluate((element) => getComputedStyle(element).willChange)).toBe("auto");
  await expect(regionalMap.locator(".regional-map-recenter-veil")).toHaveCount(0);
});

test.describe("regional overlay reconciliation", () => {
  // The service worker would answer the dashboard fetch before page.route.
  test.use({ serviceWorkers: "block" });

  test("a change to one regional alert leaves the other alert overlays mounted", async ({ page, request, isMobile }) => {
    test.skip(isMobile, "the overlay session is shared by desktop and mobile");
    await setStubMode(request, "regional-live");
    let removedCardId: string | null = null;
    await page.route("**/api/dashboard?network=regional*", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      for (const segment of body.map.segments) {
        segment.impacts = (segment.impacts ?? []).filter((impact: { cardId: string }) => impact.cardId !== removedCardId);
      }
      await route.fulfill({ response, json: body });
    });
    await page.goto("/");
    await page.getByRole("group", { name: "Select transit network" })
      .getByRole("button", { name: "GO/UP", exact: true })
      .click();

    const removed = page.locator('[data-system-map=regional] .overlay-segment-group[data-map-impact-id="regional-demo-planned"]');
    await expect(removed).toBeAttached();
    const overlayNodes = [
      "#regional-dynamic-segment-layer .overlay-segment-group",
      "#regional-dynamic-hover-layer .map-impact-hover-foreground",
      "[data-system-map=regional] .map-impact-hover-foreground-layer .map-impact-hover-foreground",
      "[data-system-map=regional] .map-station-alert",
      "[data-system-map=regional] .map-station-alert-anchor > *",
    ].join(", ");
    const markMounted = () => page.evaluate((selector) => {
      document.querySelectorAll<SVGElement>(selector).forEach((node) => {
        node.dataset.smokeMounted ??= "true";
      });
    }, overlayNodes);
    const unmarkedCount = () => page.evaluate((selector) => (
      [...document.querySelectorAll<SVGElement>(selector)].filter((node) => !node.dataset.smokeMounted).length
    ), overlayNodes);
    await markMounted();

    // Drop one alert, then restore it, through the dashboard refresh path. Only
    // that alert's nodes (its tube, hover copy and hover outline) may be rebuilt.
    removedCardId = "regional-demo-planned";
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(removed).toHaveCount(0);
    expect(await unmarkedCount()).toBe(0);

    removedCardId = null;
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(removed).toBeAttached();
    expect(await unmarkedCount()).toBe(3);
    await expect(removed).not.toHaveAttribute("data-smoke-mounted", "true");
  });
});

test("regional station names share the TTC raster hover glow and station selection", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "desktop hover behavior");
  await setStubMode(request, "seeded");
  await page.goto("/");

  await page.getByRole("group", { name: "Select transit network" })
    .getByRole("button", { name: "GO/UP", exact: true })
    .click();
  await waitForNetworkTransition(page, "regional");
  await page.getByRole("button", { name: "Collapse sidebar" }).click();

  const authoredLabel = page.locator('[data-regional-station-label-for="kipling"]');
  const labelTarget = page.locator('[data-station-label-id="kipling"]');
  await expect(authoredLabel).toHaveCount(1);
  await expect(labelTarget).toHaveCount(1);

  await labelTarget.hover();
  const rasterLabelHover = page.locator("[data-system-map=regional] .map-stage .raster-station-label-text-hover");
  await expect(rasterLabelHover).toHaveCount(1);
  await expect(rasterLabelHover).toHaveCSS("transform", /matrix\(1\.035, 0, 0, 1\.035, 0, 0\)/);
  await expect(rasterLabelHover.locator("#regional-hovered-station-target-mask")).toHaveCount(1);
  await expect(rasterLabelHover.locator("#regional-hovered-station-label-mask > g"))
    .toHaveAttribute("mask", "url(#regional-hovered-station-target-mask)");
  await expect(rasterLabelHover).toHaveCSS("transition-duration", "0.12s, 0.12s");
  await page.mouse.move(20, 20);
  await expect(rasterLabelHover).toHaveCount(0);
  await labelTarget.hover();
  await expect(rasterLabelHover).toHaveAttribute("data-hover-active", "true");
  await page.mouse.down();
  await expect(rasterLabelHover).toBeVisible();
  await expect(rasterLabelHover).toHaveCSS("transform", /matrix\(0\.985, 0, 0, 0\.985, 0, 0\)/);
  await page.mouse.up();



  await labelTarget.click();
  await expect(page.getByRole("complementary", { name: "Kipling regional station details" })).toBeVisible();
});

test("mobile preserves status and station interaction language across network switches", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "mobile-only cross-network parity smoke");
  // Seeded mode has no GO/UP source; use the live stub so GO/UP has a status to show.
  await setStubMode(request, "regional-live");
  await page.goto("/");

  const networkSelector = page.locator(".mobile-network-selector-slot")
    .getByRole("group", { name: "Select transit network" });
  await networkSelector.getByRole("button", { name: "GO/UP", exact: true }).click();
  await waitForNetworkTransition(page, "regional");

  await page.getByRole("button", { name: "Status", exact: true }).click();
  const statusSheet = page.getByRole("region", { name: "Current service status" });
  await expect(statusSheet).toContainText("GO & UP regional rail");
  await expect(statusSheet.getByRole("button", { name: /Accessibility Outages/ })).toBeVisible();
  await expect(statusSheet.getByRole("button", { name: /Service Notices/ })).toBeVisible();
  await expect(statusSheet.getByRole("button", { name: /Trip Changes/ })).toBeVisible();
  await expect(statusSheet.getByRole("button", { name: /Reduced Speed Zones/ })).toHaveCount(0);

  await statusSheet.getByRole("button", { name: "Close status" }).click();
  await expect(statusSheet).toBeHidden();
  await page.getByRole("button", { name: "More", exact: true }).click();
  const moreSheet = page.getByRole("region", { name: "More LineWatchTO options" });
  await expect(moreSheet.getByRole("button", { name: /My Commutes/ })).toBeVisible();
  await moreSheet.getByRole("button", { name: "Close more options" }).click();
  const weston = page.locator('.station-hit-target[data-station-id="weston"]');
  await weston.press("Enter");
  const stationPanel = page.getByRole("complementary", { name: "Weston regional station details" });
  await expect(stationPanel.getByRole("button", { name: "Save Weston to My Stations" })).toBeVisible();
  await expect(stationPanel.getByRole("button", { name: "Close station details" })).toBeVisible();
});

test.describe("regional notice source labels", () => {
  test.use({ serviceWorkers: "block" });

test("opens fresh regional notices from desktop and mobile navigation", async ({ page, request, isMobile }) => {
  await setStubMode(request, "regional-live");
  await page.route(url => url.pathname === "/api/surface-notices" && url.searchParams.get("network") === "regional", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.notices.push({
      id: "holiday-schedule", category: "service-change", routeType: "GO / UP",
      routeIds: ["LE"], title: "We are running on a Saturday schedule for Labour Day",
      description: "There will be no GO train service on Richmond Hill or Milton lines.",
      location: "", stopIds: [], stops: [], updatedAt: data.generatedAt,
      source: "Metrolinx GO service notices", scheduleAnnouncement: true,
    });
    await route.fulfill({ response, json: data });
  });
  await page.goto("/");

  if (isMobile) {
    await page.locator(".mobile-network-selector-slot")
      .getByRole("group", { name: "Select transit network" })
      .getByRole("button", { name: "GO/UP", exact: true })
      .click();
    await waitForNetworkTransition(page, "regional");
    await page.getByRole("button", { name: "Status", exact: true }).click();
    await page.getByRole("region", { name: "Current service status" })
      .getByRole("button", { name: /Service Notices/ })
      .click();
  } else {
    await page.getByRole("group", { name: "Select transit network" })
      .getByRole("button", { name: "GO/UP", exact: true })
      .click();
    await waitForNetworkTransition(page, "regional");
    await page.locator('[data-dest="surface-notices"]').click();
  }

  await expect(page.getByRole("heading", { name: "GO / UP Notices" })).toBeVisible();
  await expect(page.getByText("Barrie station construction notice", { exact: true })).toBeVisible();
  await expect(page.getByText("Metrolinx notices", { exact: true })).toBeVisible();
  await expect(page.locator(".surface-notice-route-group").getByText("Barrie", { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel("GO Bus 31", { exact: true })).toBeVisible();
  await expect(page.getByText("Route 31 buses are detouring", { exact: true })).toBeVisible();

  const scheduleCard = page.locator(".surface-notice-route-group").filter({
    hasText: "We are running on a Saturday schedule for Labour Day",
  });
  await expect(scheduleCard.getByText("Schedule Announcement", { exact: true })).toBeVisible();
  await expect(scheduleCard.getByText("Published for:", { exact: true })).toBeVisible();
  await expect(scheduleCard.getByText("Lakeshore East", { exact: true })).toBeVisible();
  await expect(scheduleCard).not.toContainText("Station / Lines Affected");
  await expect(scheduleCard).not.toContainText("Route-wide Notice");
  await expect(scheduleCard.getByRole("button", { name: /Show more details/ })).toHaveCount(0);
  await expect(scheduleCard).toHaveAttribute("data-emphasis", "no-service");
  await expect(page.locator(".surface-notice-route-group").first()).toContainText("Saturday schedule");
  await expect(scheduleCard).toHaveCSS("border-left-style", "solid");
  await page.getByRole("button", { name: "Sort notices" }).click();
  await page.getByRole("menuitemradio", { name: "Most Recent" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Newest Updates First" })).toBeVisible();
  await page.getByRole("button", { name: "Sort notices" }).click();
  await page.getByRole("menuitemradio", { name: "Importance" }).click();
  await page.screenshot({ path: `/tmp/notices-${isMobile ? "mobile" : "desktop"}.png` });
  await expect(scheduleCard.getByText("There will be no GO train service on Richmond Hill or Milton lines.", { exact: true })).toBeVisible();

  const routeControl = page.getByRole("button", { name: "Filter notices by route or line" });
  await routeControl.click();
  const controlBox = await routeControl.locator("..").boundingBox();
  const menuBox = await page.getByRole("menu", { name: "Filter notices by route or line" }).boundingBox();
  expect(Math.abs(menuBox!.x - controlBox!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(menuBox!.width - controlBox!.width)).toBeLessThanOrEqual(2);
  await expect(page.getByRole("menu", { name: "Filter notices by route or line" }).locator(".notice-route-badge").first()).toHaveCSS("background-color", "rgb(0, 133, 62)");

  await page.getByRole("menuitemradio", { name: /^Barrie/ }).click();
  await expect(page.getByText("Barrie station construction notice", { exact: true })).toBeVisible();
  const selectedIdentity = routeControl.locator(".regional-line-identity");
  const imageBox = await selectedIdentity.locator("img").boundingBox();
  const identityBox = await selectedIdentity.boundingBox();
  expect(Math.abs(imageBox!.y + imageBox!.height / 2 - identityBox!.y - identityBox!.height / 2)).toBeLessThanOrEqual(1);
  await expect(scheduleCard).toHaveCount(0);
  await expect(page.getByText("Route 31 buses are detouring", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Reset filters" }).click();
  await expect(scheduleCard).toBeVisible();

  const serviceFilter = page.getByRole("button", { name: "Filter GO / UP notices by service" });
  await serviceFilter.click();
  await page.screenshot({ path: `/tmp/notices-menu-${isMobile ? "mobile" : "desktop"}.png` });
  await page.keyboard.press("Escape");
  await expect(serviceFilter).toBeFocused();
  await expect(page.getByRole("heading", { name: "GO / UP Notices" })).toBeVisible();
  await serviceFilter.press("ArrowDown");
  await page.getByRole("menuitemradio", { name: /^Bus(?: \d+)?$/ }).click();
  await expect(page.getByText("Route 31 buses are detouring", { exact: true })).toBeVisible();
  await expect(page.getByText("Barrie station construction notice", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Filter notices by route or line" }).click();
  await expect(page.getByRole("menuitemradio", { name: /^Barrie/ })).toHaveCount(0);
  await expect(page.getByRole("menuitemradio", { name: /^GO Bus 31/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await serviceFilter.click();
  await page.getByRole("menuitemradio", { name: /^Train(?: \d+)?$/ }).click();
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
    '[data-map-impact-id="regional-trip-change-2026-06-04-BR681-cancellation"]',
  )).toHaveCount(0);
});

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
    await waitForNetworkTransition(page, "regional");
    await page.locator('[data-dest="trip-changes"]').click();
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

  // GO/UP draws TTC's selection emphasis (the shared overlay layer) in its
  // selected-alert layer, above every alert and below station artwork.
  const delayHitTarget = page.locator(
    '[data-system-map=regional] .map-segment-hit-target[data-map-impact-kind="delay"][data-map-impact-id="regional-demo-delay"]',
  );
  await expect(delayHitTarget).toHaveCount(1);
  await delayHitTarget.dispatchEvent("click");
  const selectedDelayGlow = page.locator(
    '#regional-dynamic-selected-segment-layer [data-selected-impact-emphasis="regional-demo-delay"]',
  ).first();
  await expect(selectedDelayGlow).toBeAttached();

  await expect(page.locator("[data-system-map=regional]")).toHaveAttribute(
    "data-map-camera-moving",
    "true",
  );
  await expect.poll(() => selectedDelayGlow.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      animationName: style.animationName,
      animationDuration: style.animationDuration,
      animationDelay: style.animationDelay,
    };
  })).toEqual({
    animationName: "map-selection-path-intro, map-selection-path-breathe",
    animationDuration: "2.4s, 1.2s",
    animationDelay: "0s, 2.4s",
  });
  await expect(selectedDelayGlow).toHaveCSS("stroke", "rgb(2, 132, 199)");
  expect(Number(await selectedDelayGlow.evaluate(
    (element) => getComputedStyle(element).opacity,
  ))).toBeGreaterThan(0);
  // Emphasis paints over every alert's tube, and targets stay on top of both.
  expect(await page.evaluate(() => {
    const tubes = document.querySelector("#regional-dynamic-segment-layer");
    const selected = document.querySelector("#regional-dynamic-selected-segment-layer");
    const targets = document.querySelector("#regional-dynamic-target-layer");
    if (!tubes || !selected || !targets) return false;
    return Boolean(tubes.compareDocumentPosition(selected) & Node.DOCUMENT_POSITION_FOLLOWING)
      && Boolean(selected.compareDocumentPosition(targets) & Node.DOCUMENT_POSITION_FOLLOWING);
  })).toBe(true);
  const introSamples = await selectedDelayGlow.evaluate((element) => {
    const intro = element.getAnimations().find(
      (animation) => animation instanceof CSSAnimation
        && animation.animationName === "map-selection-path-intro",
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

  await waitForNetworkTransition(page, "regional");
  await expect(page.locator(".desktop-status-header-row")).toContainText(/Live/i);
  await expect(page.getByRole("button", { name: /^delay: .*Ajax to Whitby/ })).toBeAttached();

  const delayOverlay = page.locator(
    '[data-system-map=regional] .overlay-segment-group[data-map-impact-kind="delay"][data-map-impact-id="regional-demo-delay"]',
  );
  await expect(delayOverlay).toHaveCount(1);
  // Within each line, alerts paint by priority (the shared overlay layer).
  const expectRegionalPriorityOrder = async () => {
    const lines = await page.locator("#regional-dynamic-segment-layer > [data-map-alert-line]")
      .evaluateAll((groups) => groups.map((group) => [...group.querySelectorAll(":scope > [data-map-impact-kind]")]
        .map((element) => element.getAttribute("data-map-impact-kind")!)));
    const priorities: Record<string, number> = { "planned-closure": 0, "reduced-speed-zone": 1, delay: 2, suspension: 3 };
    expect(lines.flat().length).toBeGreaterThan(1);
    for (const kinds of lines) {
      expect(kinds.map((kind) => priorities[kind])).toEqual(kinds.map((kind) => priorities[kind]).sort((a, b) => a - b));
    }
  };
  await expectRegionalPriorityOrder();
  // One continuous tube over both segments, with a one-way lane of
  // hourglasses and arrows (TTC's delay design).
  await expect(delayOverlay).toHaveClass(/connected-corridor/);
  expect(await delayOverlay.locator("> .asset-alert-path").evaluate((path) => (
    (path.getAttribute("d")?.match(/\bM\b/g) ?? []).length
  ))).toBe(1);
  await expect(delayOverlay.locator(".delay-static-base")).toBeAttached();
  await expect(delayOverlay.locator("[data-glyph-lane]")).toHaveCount(1);
  await expect(delayOverlay.locator(".delay-hourglass").first()).toBeAttached();
  await expect(delayOverlay.locator('[data-glyph-lane] path[d="M -12 -10 L 8 0 L -12 10"]').first()).toBeAttached();
  // Station alerts come from the shared layer (TTC's design) in the top plane.
  const bloorAlert = page.locator(
    '[data-system-map=regional] .map-station-alert[data-map-impact-id="regional-demo-bloor-station-delay"]',
  );
  // Upcoming station-only planned closures also show (TTC's rule); count the rest.
  await expect(page.locator('[data-system-map=regional] .map-station-alert:not([data-map-impact-kind="planned-closure"])')).toHaveCount(1);
  await expect(page.locator("[data-system-map=regional] .station-impact-direction-glyph")).toHaveCount(1);
  const bloorBeacon = bloorAlert.locator(
    '.map-station-alert-anchor[data-map-station-anchor-id="station-bloor-up"] .station-impact-dot-red-beacon',
  );
  await expect(bloorBeacon).toBeVisible();
  await expect(
    page.locator("[data-system-map=regional] .station-impact-direction-glyph .station-impact-direction-arrow"),
  ).toBeAttached();
  const [bloorDotBox, bloorBeaconBox, bloorArrowBox] = await Promise.all([
    page.locator("#station-bloor-up").boundingBox(),
    bloorBeacon.boundingBox(),
    page.locator(
      '[data-system-map=regional] .station-impact-direction-glyph[data-map-station-anchor-id="station-bloor-up"]',
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

  // Hovering the alert's ring lights its hover priority ring, as on TTC.
  const bloorImpactPoint = await bloorAlert.locator(".station-impact-ring").evaluate((shape) => {
    const ring = shape as SVGCircleElement;
    const point = ring.ownerSVGElement!.createSVGPoint();
    point.x = ring.cx.baseVal.value + ring.r.baseVal.value;
    point.y = ring.cy.baseVal.value;
    const screenPoint = point.matrixTransform(ring.getScreenCTM()!);
    return { x: screenPoint.x, y: screenPoint.y };
  });
  await page.mouse.move(bloorImpactPoint.x, bloorImpactPoint.y);
  if (!isMobile) {
    const bloorHover = page.locator(
      '[data-system-map=regional] .station-impact-hover-priority[data-map-hover-impact-id="regional-demo-bloor-station-delay"]',
    );
    await expect(bloorHover).toHaveAttribute("data-map-impact-hovered", "true");
    await expect(bloorHover).toHaveCSS("opacity", "1");
  }

  const plannedOverlay = page.locator(
    '[data-system-map=regional] .overlay-segment-group[data-map-impact-kind="planned-closure"][data-map-impact-id="regional-demo-planned"]',
  );
  await expect(plannedOverlay).toHaveCount(1);
  // GO/UP draws the shared design at its rail's width: 196 units, TTC's 96 scaled.
  await expect(plannedOverlay.locator(".asset-alert-path.planned-preview")).toHaveCSS("stroke-width", "196px");
  await expect(delayOverlay.locator(".delay-static-base")).toHaveCSS("stroke-width", "196px");
  const suspensionOverlay = page.locator(
    '[data-system-map=regional] .overlay-segment-group[data-map-impact-kind="suspension"][data-map-impact-id="regional-demo-suspension"]',
  );
  await expect(suspensionOverlay).toHaveCount(1);
  // Glyph art is TTC's, scaled by GO/UP's overlay unit.
  await expect(suspensionOverlay.locator(".suspension-no-entry-lane > g").first())
    .toHaveAttribute("transform", /scale\(2\.04\d*\)/);
  await expect(plannedOverlay.locator(".planned-closure-icon-lane > g").first())
    .toHaveAttribute("transform", /scale\(2\.04\d*\)/);
  const authoredRouteGap = await suspensionOverlay.locator("> .asset-alert-path").evaluate((overlay) => {
    if (!(overlay instanceof SVGPathElement)) return Number.POSITIVE_INFINITY;
    // The route is in the authored SVG; the overlay plane shares its view box.
    const route = overlay.closest("[data-system-map=regional] .map-stage")?.querySelector<SVGPathElement>(".map-authored-svg #regional-route-ki-path");
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
  // The delay and planned closures meet Pickering's station-only planned
  // closure there, so one station badge covers all three (TTC's rule).
  const regionalOverlapMarker = page.locator('[data-overlap-segment-id*="delay:regional-demo-delay|"]').first();
  await expect(regionalOverlapMarker).toBeVisible();
  const markerBox = await regionalOverlapMarker.boundingBox();
  const viewport = page.viewportSize();
  expect(markerBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(markerBox!.x).toBeGreaterThanOrEqual(0);
  expect(markerBox!.y).toBeGreaterThanOrEqual(0);
  expect(markerBox!.x + markerBox!.width).toBeLessThanOrEqual(viewport!.width);
  expect(markerBox!.y + markerBox!.height).toBeLessThanOrEqual(viewport!.height);

  // Measure the visible badge; the marker's box also spans its anchor dot on the line.
  const visibleOverlapBoxes = await page.locator('[data-overlap-segment-id^="regional-overlap-"]:visible')
    .evaluateAll((markers) => markers.map((marker) => (
      marker.querySelector(".overlap-indicator-pill") ?? marker
    ).getBoundingClientRect().toJSON()));
  const visibleMapTextBoxes = await page.locator(
    "[data-system-map=regional] .map-stage .station-label-hit-target",
  ).evaluateAll((labels) => labels.map((label) => label.getBoundingClientRect().toJSON()));
  expect(visibleMapTextBoxes.length).toBeGreaterThan(0);
  // The map runs under the docked sidebar; only badges a rider can see must clear the labels.
  const sidebarBox = await page.locator("#desktop-sidebar-container").boundingBox();
  const underSidebar = (box: { x: number; width: number }) => Boolean(sidebarBox)
    && box.x + box.width / 2 < sidebarBox!.x + sidebarBox!.width;
  for (const overlapBox of visibleOverlapBoxes.filter((box) => !underSidebar(box))) {
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
    .evaluateAll((markers) => markers.map((marker) => (
      marker.querySelector(".overlap-indicator-pill") ?? marker
    ).getBoundingClientRect().toJSON()));
  expect(settledOverlapBoxes).toEqual(visibleOverlapBoxes);

  const lwOverlapMarker = page.getByRole("button", {
    name: /Overlapping alerts: Delay x2 on Union to Niagara Falls/,
  });
  await expect(lwOverlapMarker).toBeVisible();
  // Measure the visible badge; the marker's box also spans its anchor dot on the line.
  const [lwMarkerBox, applebyBox, burlingtonBox] = await Promise.all([
    lwOverlapMarker.locator(".overlap-indicator-pill").boundingBox(),
    page.locator('.station-hit-target[data-station-id="appleby"]').boundingBox(),
    page.locator('.station-hit-target[data-station-id="burlington"]').boundingBox(),
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
    // Collision avoidance may slide the badge along the long Lakeshore West corridor.
  )).toBeLessThan(200);

  // The badge can sit under the docked sidebar; dispatch the click to it.
  await lwOverlapMarker.dispatchEvent("click");
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
  // The shared hover copy (a <use> of the alert's artwork, under station
  // artwork) and its outline in the top plane.
  const delayHoverForeground = page.locator(
    '#regional-dynamic-hover-layer .map-impact-hover-foreground[data-map-hover-impact-id="regional-demo-delay"]',
  );
  const plannedHoverForeground = page.locator(
    '#regional-dynamic-hover-layer .map-impact-hover-foreground[data-map-hover-impact-id="regional-demo-planned"]',
  );
  const delayTopHoverForeground = page.locator(
    '[data-system-map=regional] .map-impact-hover-foreground-layer .map-impact-hover-foreground[data-map-hover-impact-id="regional-demo-delay"]',
  );
  // Hovering an overlap badge outlines its whole group (fad18679) instead of
  // marking each alert hovered.
  const groupPreview = page.locator("[data-system-map=regional] .map-impact-preview-outline");
  await expect(groupPreview).toHaveAttribute("data-map-preview-impacts", /delay:regional-demo-delay/);
  await expect(groupPreview).toHaveAttribute("data-map-preview-impacts", /planned-closure:regional-demo-planned/);
  await expect(page.locator("#regional-dynamic-hover-layer .map-segment-hit-target")).toHaveCount(0);

  await regionalOverlapMarker.dispatchEvent("click");
  const regionalOverlapChooser = page.locator("[data-overlap-chooser]");
  await expect(regionalOverlapChooser).toBeVisible();
  await expectRegionalChooserToClearReferencedAlerts(page);
  await expectChooserToClearUiKeepouts(page);
  await expect(regionalOverlapChooser.getByText("Choose Alert", { exact: true })).toBeVisible();
  // The delay, the corridor closure, and Pickering's station-only closure.
  await expect(regionalOverlapChooser.locator(".overlap-chooser-choice")).toHaveCount(3);
  await regionalOverlapChooser
    .locator('[data-overlap-choice-id="regional-demo-delay"]')
    .hover();
  await expect(delayHoverForeground).toHaveAttribute("data-map-impact-hovered", "true");
  await expect(plannedHoverForeground).not.toHaveAttribute("data-map-impact-hovered");
  await expect(delayHoverForeground).toHaveCSS("display", "inline");
  await expect(delayHoverForeground.locator("use")).toHaveCount(1);
  // Preview the lower-priority closure above the delay, then restore the chooser selection.
  await regionalOverlapChooser.locator('[data-overlap-choice-id="regional-demo-planned"]').hover();
  await expect(plannedHoverForeground).toHaveAttribute("data-map-impact-hovered", "true");
  await expect(delayHoverForeground).not.toHaveAttribute("data-map-impact-hovered");
  await expect(plannedHoverForeground).toHaveCSS("display", "inline");
  expect(await plannedHoverForeground.evaluate((foreground) => {
    const segmentLayer = foreground.closest("svg")!.querySelector("#regional-dynamic-segment-layer")!;
    return Boolean(segmentLayer.compareDocumentPosition(foreground) & Node.DOCUMENT_POSITION_FOLLOWING);
  })).toBe(true);

  await regionalOverlapChooser
    .locator('[data-overlap-choice-id="regional-demo-delay"]')
    .click();
  await expect(regionalOverlapChooser).toHaveCount(0);
  const delayEmphasis = page.locator(
    '#regional-dynamic-selected-segment-layer [data-selected-impact-emphasis="regional-demo-delay"]',
  ).first();
  await expect(delayEmphasis).toBeAttached();
  await expect(delayOverlay.locator(".interactive-glow.selected")).toHaveCount(1);

  const delayTarget = page.locator('[data-system-map=regional] .map-segment-hit-target[data-map-impact-id="regional-demo-delay"]');
  await delayTarget.dispatchEvent("click");
  await expect(delayEmphasis).toBeAttached();
  expect(await delayOverlay.evaluate((delay, plannedSelector) => {
    const planned = document.querySelector(plannedSelector);
    return planned
      ? Boolean(planned.compareDocumentPosition(delay) & Node.DOCUMENT_POSITION_FOLLOWING)
      : false;
  }, '[data-system-map=regional] .overlay-segment-group[data-map-impact-id="regional-demo-planned"]')).toBe(true);

  const lwCorridorOverlay = page.locator(
    '[data-system-map=regional] .overlay-segment-group[data-map-impact-kind="delay"][data-map-impact-id="regional-demo-lw-corridor-delay"]',
  );
  await expect(lwCorridorOverlay).toHaveCount(1);
  await expect(lwCorridorOverlay).toHaveClass(/connected-corridor/);
  const lwCorridorPaths = await lwCorridorOverlay.locator("> .asset-alert-path").evaluateAll(
    (paths) => paths.map((path) => path.getAttribute("d") ?? ""),
  );
  expect(lwCorridorPaths).toHaveLength(1);
  // One path in two runs (the corridor's two branches).
  expect((lwCorridorPaths[0].match(/\bM\b/g) ?? []).length).toBe(2);
  // Outline masks extend past the corridor's west end at West Harbour.
  const lwHoverMaskX = await page.locator(
    '[data-system-map=regional] .map-impact-hover-foreground[data-map-hover-impact-id="regional-demo-lw-corridor-delay"] mask',
  ).first().getAttribute("x");
  expect(Number(lwHoverMaskX)).toBeLessThan(-330);
  const delayHoverPoint = await delayTarget.evaluate((path) => {
    const geometry = path as SVGPathElement;
    const point = geometry.getPointAtLength(geometry.getTotalLength() * 0.85);
    const screenPoint = point.matrixTransform(geometry.getScreenCTM()!);
    return { x: screenPoint.x, y: screenPoint.y };
  });
  await page.mouse.move(delayHoverPoint.x, delayHoverPoint.y);
  await expect(delayHoverForeground).toHaveAttribute("data-map-impact-hovered", "true");
  await expect(delayTopHoverForeground).toHaveAttribute("data-map-impact-hovered", "true");
  await expect(delayTopHoverForeground.locator(".map-impact-hover-outline")).toHaveCount(2);
  // The outline stops at Union's pill in both of its masks.
  await expect(delayTopHoverForeground.locator(".map-impact-hover-outline-cutout")).toHaveCount(2);
  // The top-plane outline follows the tube drawn in the stations layer.
  expect(await delayTopHoverForeground.evaluate((foreground) => {
    const topPath = foreground.querySelector<SVGPathElement>(".map-impact-hover-outline-core");
    const lowerPath = document.querySelector<SVGPathElement>(
      '#regional-dynamic-segment-layer .overlay-segment-group[data-map-impact-id="regional-demo-delay"] > .asset-alert-path',
    );
    if (!topPath || !lowerPath) return Number.POSITIVE_INFINITY;
    const ratios = [0, 0.25, 0.5, 0.75, 1];
    return Math.max(...ratios.map((ratio) => {
      const topPoint = topPath.getPointAtLength(topPath.getTotalLength() * ratio)
        .matrixTransform(topPath.getScreenCTM()!);
      const lowerPoint = lowerPath.getPointAtLength(lowerPath.getTotalLength() * ratio)
        .matrixTransform(lowerPath.getScreenCTM()!);
      return Math.hypot(topPoint.x - lowerPoint.x, topPoint.y - lowerPoint.y);
    }));
  })).toBeLessThan(1);
  // TTC's keyline proportions at GO/UP's scale: outer 117.2, divider 108.2,
  // inner 96 (the rail), times 196 / 96.
  const hoverMaskWidths = await delayTopHoverForeground.locator("mask")
    .evaluateAll((masks) => masks.map((mask) => ({
      outer: mask.id.endsWith("-outer"),
      outline: Number(mask.querySelector("path[stroke='white']")?.getAttribute("stroke-width")),
      cutout: Number(mask.querySelector("path[stroke='black']")?.getAttribute("stroke-width")),
    })));
  expect(hoverMaskWidths).toHaveLength(2);
  const coreMaskWidths = hoverMaskWidths.find((mask) => !mask.outer);
  const edgeMaskWidths = hoverMaskWidths.find((mask) => mask.outer);
  expect(coreMaskWidths!.outline).toBe(edgeMaskWidths!.outline);
  expect(coreMaskWidths!.outline).toBeCloseTo(117.2 * 196 / 96, 3);
  expect(coreMaskWidths!.cutout).toBeCloseTo(196, 3);
  expect(edgeMaskWidths!.cutout).toBeCloseTo(108.2 * 196 / 96, 3);
  // Hover copies paint below station artwork (the foreground raster plane).
  expect(await delayHoverForeground.evaluate((foreground) => {
    const plane = foreground.closest(".regional-overlay-plane");
    const stationArtwork = plane?.parentElement?.querySelector(".raster-map-plane--foreground");
    return Boolean(
      plane
      && stationArtwork
      && (plane.compareDocumentPosition(stationArtwork) & Node.DOCUMENT_POSITION_FOLLOWING),
    );
  })).toBe(true);
  await expect(delayEmphasis).not.toHaveAttribute("mask");
  await expect(delayEmphasis).toHaveCSS("stroke", "rgb(2, 132, 199)");
  await expect(lwCorridorOverlay.locator(".interactive-glow")).toHaveCSS("display", "none");

  // Station hit targets sit above the authored rails. Crossing one must keep
  // the whole impact highlight on instead of briefly switching it off.
  const whitbyBox = await page.locator('.station-hit-target[data-station-id="whitby"]').boundingBox();
  expect(whitbyBox).not.toBeNull();
  await page.mouse.move(
    whitbyBox!.x + whitbyBox!.width / 2,
    whitbyBox!.y + whitbyBox!.height / 2,
  );
  await expect(delayHoverForeground).toHaveAttribute("data-map-impact-hovered", "true");

  const pickeringStation = page.locator('.station-hit-target[data-station-id="pickering"]');
  await pickeringStation.press("Enter");
  const stationPanel = page.getByRole("complementary", { name: "Pickering regional station details" });
  await expect(stationPanel).toBeVisible();
  await expect(stationPanel.getByText("Metrolinx GO live estimates", { exact: true })).toBeVisible();
  await expect(stationPanel.getByText("To Kitchener", { exact: true })).toBeVisible();
  await expect(stationPanel.getByText("7 min", { exact: true })).toBeVisible();
  await expect(stationPanel.getByRole("heading", { name: "Platform 11" })).toBeVisible();
  await expect(stationPanel.getByText("Delayed estimate", { exact: true })).toBeVisible();
  await expect(stationPanel.getByText("6 Min Late", { exact: true })).toBeVisible();
  await expectRegionalPriorityOrder();
});

test("regional corridor hover encloses the entire referenced impact", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "network selection is desktop-only");
  await setStubMode(request, "regional-live");

  await page.goto("/");
  await page.getByRole("group", { name: "Select transit network" })
    .getByRole("button", { name: "GO/UP", exact: true })
    .click();
  await waitForNetworkTransition(page, "regional");

  // One target covers the whole corridor alert (TTC's model); focus, hover
  // and selection all outline the entire alert.
  const target = page.locator('[data-system-map=regional] .map-segment-hit-target[data-map-impact-id="regional-demo-lw-corridor-delay"]');
  const hoverForeground = page.locator(
    '#regional-dynamic-hover-layer .map-impact-hover-foreground[data-map-hover-impact-id="regional-demo-lw-corridor-delay"]',
  );
  await expect(target).toHaveCount(1);

  // Keyboard focus hovers; a key press first, since the network was chosen by mouse.
  await page.keyboard.press("Shift");
  await target.focus();
  await expect(hoverForeground).toHaveAttribute("data-map-impact-hovered", "true");
  await expect(hoverForeground).not.toHaveAttribute("mask");

  const hoverPoint = await target.evaluate((path) => {
    const geometry = path as SVGPathElement;
    const point = geometry.getPointAtLength(geometry.getTotalLength() / 3);
    const screenPoint = point.matrixTransform(geometry.getScreenCTM()!);
    return { x: screenPoint.x, y: screenPoint.y };
  });
  await page.mouse.move(hoverPoint.x, hoverPoint.y);
  await expect(hoverForeground).toHaveAttribute("data-map-impact-hovered", "true");
  await expect(hoverForeground).not.toHaveAttribute("mask");

  await target.dispatchEvent("click");
  const emphasis = page.locator(
    '#regional-dynamic-selected-segment-layer [data-selected-impact-emphasis="regional-demo-lw-corridor-delay"]',
  );
  await expect(emphasis.first()).toBeAttached();
  await target.focus();
  await expect(hoverForeground).not.toHaveAttribute("mask");
  await expect(emphasis.first()).toBeAttached();
});

test("a press on a GO/UP line alert reaches its target and selects it", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "hover requires a pointer");
  await setStubMode(request, "regional-live");

  await page.goto("/");
  await page.getByRole("group", { name: "Select transit network" })
    .getByRole("button", { name: "GO/UP", exact: true })
    .click();
  await waitForNetworkTransition(page, "regional");

  // A visible point on any line alert, where that alert's target is on top.
  const pressPoint = await page.evaluate(() => {
    const viewport = document.querySelector("[data-system-map=regional] .system-map-viewport")!;
    // Planned closures first: their tubes are the ones riders press most.
    const targets = [...document.querySelectorAll<SVGPathElement>("[data-system-map=regional] .map-segment-hit-target")]
      .sort((a, b) => Number(b.dataset.mapImpactKind === "planned-closure") - Number(a.dataset.mapImpactKind === "planned-closure"));
    for (const path of targets) {
      for (let step = 1; step < 20; step += 1) {
        const point = path.getPointAtLength(path.getTotalLength() * step / 20).matrixTransform(path.getScreenCTM()!);
        const hit = document.elementFromPoint(point.x, point.y);
        if (hit === path && viewport.contains(hit)) return { x: point.x, y: point.y, id: path.dataset.mapImpactId!, kind: path.dataset.mapImpactKind };
      }
    }
    throw new Error("no visible line alert");
  });
  const hoverForeground = page.locator(
    `#regional-dynamic-hover-layer .map-impact-hover-foreground[data-map-hover-impact-id="${pressPoint.id}"]`,
  );
  await page.mouse.move(pressPoint.x, pressPoint.y);
  await expect(hoverForeground).toHaveAttribute("data-map-impact-hovered", "true");

  // Neither the tube nor its hover copy, drawn above the targets, takes the
  // pointer. When they did, the press selected nothing and focused GO/UP's
  // hover layer, which drew the browser's focus box around the alert.
  const hit = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y) as SVGElement | null;
    return `${element?.getAttribute("class")}:${element?.dataset.mapImpactId}`;
  }, pressPoint);
  expect(hit).toBe(`map-segment-hit-target:${pressPoint.id}`);
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.locator(
    `#regional-dynamic-selected-segment-layer [data-selected-impact-emphasis="${pressPoint.id}"]`,
  ).first()).toBeAttached();
  expect(await page.evaluate(() => document.activeElement?.closest("#regional-dynamic-hover-layer") ?? null)).toBeNull();
});

test("selecting a hovered regional station preserves distinct overlays", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "hover requires a pointer");
  await setStubMode(request, "regional-live");
  const duplicateKeys: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("same key")) duplicateKeys.push(message.text());
  });
  await page.goto("/");
  await page.getByRole("group", { name: "Select transit network" })
    .getByRole("button", { name: "GO/UP", exact: true }).click();
  await waitForNetworkTransition(page, "regional");
  const station = page.locator('.station-hit-target[data-station-id="pickering"]');
  await station.focus();
  await expect(page.locator('[data-system-map=regional] .map-stage .raster-station-label-text-hover')).toHaveCount(1);
  await station.press("Enter");
  await expect(page.getByRole("complementary", { name: "Pickering regional station details" })).toBeVisible();
  await expect(page.locator('.station-selection-flash[data-map-selected-station-id]')).toHaveCount(1);
  expect(duplicateKeys).toEqual([]);
});

test.describe("regional planned station impacts", () => {
  test.use({ serviceWorkers: "block" });

  test("Pickering station impacts include corridor and station planned closures", async ({ page, request, isMobile }) => {
    test.skip(isMobile, "desktop regional station regression");
    await setStubMode(request, "regional-live");
    const duplicateKeys: string[] = [];
    page.on("console", (message) => {
      if (message.text().includes("same key")) duplicateKeys.push(message.text());
    });
    await page.context().route(url => url.pathname === "/api/dashboard" && url.searchParams.get("network") === "regional", async (route) => {
      const response = await route.fetch();
      const data = await response.json();
      data.plannedClosures = [...data.plannedClosures.filter((closure: { id: string }) => closure.id !== "regional-station-only-planned"), {
        ...data.plannedClosures[0],
        id: "regional-station-only-planned",
        title: "Pickering station construction",
        previewSegmentIds: [],
        previewStationIds: ["pickering"],
        activeNow: false,
        timingStatus: "upcoming",
      }];
      await route.fulfill({ response, json: data });
    });
    await page.goto("/");
    await page.getByRole("group", { name: "Select transit network" })
      .getByRole("button", { name: "GO/UP", exact: true }).click();
    await waitForNetworkTransition(page, "regional");
    await page.locator('.station-hit-target[data-station-id="pickering"]').press("Enter");
    const panel = page.getByRole("complementary", { name: "Pickering regional station details" });
    const impacts = panel.locator('[data-station-section="station-impacts"]');
    await expect(impacts.getByText("Pickering station construction", { exact: true })).toBeVisible();
    await expect(impacts.getByText("Synthetic planned service change", { exact: true })).toBeVisible();
    expect(duplicateKeys).toEqual([]);
  });

});

test("focuses a station-only regional planned closure on the map", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "network selection is desktop-only");
  await setStubMode(request, "regional-live");

  await page.goto("/");
  await page.getByRole("group", { name: "Select transit network" })
    .getByRole("button", { name: "GO/UP", exact: true })
    .click();
  await waitForNetworkTransition(page, "regional");
  await page.locator('[data-dest="closures"]').click();

  const card = page.locator('[data-impact-card-id="regional-station-only-planned"]');
  const mapStage = page.locator("[data-system-map=regional] .map-stage");
  const initialTransform = await mapStage.getAttribute("style");
  const mapButton = card.getByRole("button", { name: "View Pickering station construction on map" });
  await mapButton.click();

  // A station-only planned closure is a shared station alert (TTC's design).
  const marker = page.locator(
    '[data-system-map=regional] .map-station-alert[data-map-impact-kind="planned-closure"][data-map-impact-id="regional-station-only-planned"][data-map-station-id="pickering"] .station-impact-ring',
  );
  await expect(marker).toHaveClass(/\bselected\b/);
  await expect(marker).toBeVisible();
  await expect.poll(() => mapStage.getAttribute("style")).not.toBe(initialTransform);

  // The card's map button now reads "Back to Map"; the selection survives the sidebar returning.
  await expect(card.getByRole("button", { name: "Back to Map: Pickering station construction" })).toBeVisible();
  const expandSidebar = page.getByRole("button", { name: "Expand sidebar" });
  if (await expandSidebar.isVisible()) await expandSidebar.click();
  await expect(marker).toHaveClass(/\bselected\b/);

  const viewport = page.locator("[data-system-map=regional] .system-map-viewport");
  await viewport.dispatchEvent("pointerdown", { pointerId: 91, pointerType: "mouse", button: 0, clientX: 12, clientY: 12 });
  await viewport.dispatchEvent("pointerup", { pointerId: 91, pointerType: "mouse", button: 0, clientX: 12, clientY: 12 });
  await expect(marker).not.toHaveClass(/\bselected\b/);
});

test("keeps transformed regional junction selection aligned with its station dots", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "network selection is desktop-only");
  await setStubMode(request, "seeded");

  await page.goto("/");
  await page.getByRole("group", { name: "Select transit network" })
    .getByRole("button", { name: "GO/UP", exact: true })
    .click();

  const bloorTarget = page.locator('.station-hit-target[data-station-id="bloor"]');
  await expect(bloorTarget).toBeVisible();
  await bloorTarget.click();

  // One React marker, above the station artwork, in the junction's authored transform.
  const bloorTopSelection = page.locator(
    '.station-selection-flash[data-map-selected-station-id="bloor"]',
  );
  await expect(bloorTopSelection).toBeVisible();
  await expect(page.locator(".station-selection-flash[data-map-selected-station-id]")).toHaveCount(1);
  await expect(page.locator("[data-system-map=regional]")).toHaveAttribute(
    "data-map-camera-moving",
    "true",
  );
  await expect.poll(() => bloorTopSelection.evaluate(
    (element) => getComputedStyle(element).animationName,
  )).toContain("map-selection-station-intro");
  await page.waitForTimeout(850);

  const [dotCenters, selectionCenters] = await Promise.all([
    page.locator("#station-bloor > :is(circle, ellipse)").evaluateAll((shapes) => shapes.map((shape) => {
      const bounds = shape.getBoundingClientRect();
      return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    }).sort((left, right) => left.x - right.x)),
    bloorTopSelection.locator(":scope > :is(circle, ellipse)").evaluateAll((shapes) => shapes.map((shape) => {
      const bounds = shape.getBoundingClientRect();
      return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    }).sort((left, right) => left.x - right.x)),
  ]);

  expect(selectionCenters).toHaveLength(dotCenters.length);
  for (let index = 0; index < dotCenters.length; index += 1) {
    expect(Math.abs(selectionCenters[index].x - dotCenters[index].x)).toBeLessThan(3);
    expect(Math.abs(selectionCenters[index].y - dotCenters[index].y)).toBeLessThan(3);
  }
  await expect(bloorTopSelection).toHaveClass(/selection-intro-complete/, { timeout: 4_000 });
  await expect.poll(() => bloorTopSelection.evaluate(
    (element) => getComputedStyle(element).animationName,
  )).toBe("map-selection-station-breathe");
});

test("uses one station selection animation in both map modes", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "desktop verifies the animated selection lifecycle");
  await setStubMode(request, "seeded");

  await page.goto("/");
  await page.getByRole("button", { name: "Stub Station station details" }).press("Enter");

  // One marker per selected station; no underlay competes with it.
  const ttcForeground = page.locator(
    '.station-selection-flash[data-station-selection-foreground="stub-station"]',
  );
  await expect(page.locator(".station-selected-indicator")).toHaveCount(0);
  await expect.poll(() => ttcForeground.evaluate(
    (element) => getComputedStyle(element).animationName,
  )).toContain("map-selection-station-intro");

  await page.goto("/");
  await page.getByRole("group", { name: "Select transit network" })
    .getByRole("button", { name: "GO/UP", exact: true })
    .click();
  await waitForNetworkTransition(page, "regional");
  await page.locator('.station-hit-target[data-station-id="union"]').press("Enter");

  const regionalForeground = page.locator(
    '.station-selection-flash[data-map-selected-station-id]',
  );
  // GO/UP draws only the foreground marker; it has no hidden underlay copy.
  await expect(page.locator(".station-selection-flash[data-map-selected-station-id]")).toHaveCount(1);
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
  await waitForNetworkTransition(page, "regional");
  await openDesktopDestination(page, "accessibility-outages");

  await expect(page.getByRole("heading", { name: "Accessibility Outages" })).toBeVisible();
  await page.getByRole("button", { name: /Elevator Outages/ }).click();
  await expect(page.locator(".accessibility-outages-scroll")).toContainText("Lakeshore East Line");
  const eglinton = page.getByRole("button", { name: /Eglinton.*1 outage/ });
  if (await eglinton.getAttribute("aria-expanded") !== "true") await eglinton.click();
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

test("advances a timed regional marker toward its next station between polls", async ({ page, request }) => {
  // The shared setup freezes Date; markers advance by the clock, so restore it
  // (the frozen Date subclasses the real one).
  await page.addInitScript(() => {
    const RealDate = Object.getPrototypeOf(Date);
    if (typeof RealDate === "function" && RealDate.prototype instanceof Object && "now" in RealDate) {
      window.Date = RealDate;
    }
  });
  await setStubMode(request, "regional-timed-trains");
  await page.goto("/");
  const networkSelector = page.getByRole("group", { name: "Select transit network" });
  await networkSelector.getByRole("button", { name: "GO/UP", exact: true }).click();
  await expect(page.getByRole("region", { name: "Interactive GO and UP map" })).toBeVisible();
  await estimatedTrainToggle(page).click();
  const marker = page.locator('[data-marker-key="regional-ki:vehicle:cab-3775"]');
  await expect(marker).toBeAttached();

  const position = async () => {
    const transform = await marker.getAttribute("transform") ?? "";
    const [, x, y] = /translate\((-?[\d.]+)\s+(-?[\d.]+)\)/.exec(transform) ?? [];
    // Screen distance to Weston, the station it is heading for.
    const toWeston = await marker.evaluate((node) => {
      const station = document.querySelector("[data-system-map=regional] .map-stage .map-authored-svg #station-weston");
      if (!station) return Number.NaN;
      const a = node.getBoundingClientRect();
      const b = station.getBoundingClientRect();
      return Math.hypot(a.x + a.width / 2 - (b.x + b.width / 2), a.y + a.height / 2 - (b.y + b.height / 2));
    });
    return { x: Number(x), y: Number(y), toWeston };
  };
  await page.waitForTimeout(1_500);
  const before = await position();
  // Inside one 10 s poll: the marker moves by the clock alone.
  await page.waitForTimeout(4_000);
  const after = await position();
  expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(1);
  expect(after.toWeston).toBeLessThan(before.toWeston);
});

test("renders regional estimated train markers from the network-scoped endpoint", async ({ page, request }) => {
  await setStubMode(request, "regional-live");
  await page.goto("/");
  const networkSelector = page.getByRole("group", { name: "Select transit network" });
  await networkSelector.getByRole("button", { name: "GO/UP", exact: true }).click();
  await expect(page.getByRole("region", { name: "Interactive GO and UP map" })).toBeVisible();
  await expect(page.locator("#regional-train-marker-layer")).toBeAttached();
  await expect(page.locator("#regional-train-marker-layer .estimated-train-marker")).toHaveCount(0);

  await estimatedTrainToggle(page).click();

  await expect(page.locator("#regional-train-marker-layer")).toBeAttached();
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
    '#regional-train-marker-layer .estimated-train-marker',
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

  const disruptionOverlay = page.locator("[data-system-map=regional] .overlay-segment-group").first();
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
    // The sidebar lists the API's line names (rail badge sizing is covered in
    // overlapping-count-badges.spec.ts).
    const overview = page.locator(".desktop-status-overview");
    await expect(overview.getByRole("button", { name: "View Stub API Yonge-University line impacts" })).toBeVisible();
    await expect(overview.getByRole("button", { name: "View Stub API Sheppard line impacts" })).toBeVisible();
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
  // Per-direction counts render only for two or more zones in one direction;
  // the stub's King zones have one per direction.
  await expect(groupedTimingCard.locator(".rsz-timing-count")).toHaveCount(0);
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

    await groupedTimingCard.getByRole("button", { name: /^View .* on map$/ }).click();
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

  await page.locator('.alert-card').filter({ hasText: 'Eglinton' }).getByRole("button", { name: /^View .* on map$/ }).click();
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
  if (!isMobile) await page.setViewportSize({ width: 1440, height: 900 });
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
    await expect(inspector).toHaveCSS("background-color", "rgb(10, 12, 16)");
    await expect(page.locator(".mobile-train-toggle")).toBeHidden();
    await expect(inspector).toContainText("Delay");
    await expect(inspector).toContainText("Sheppard-Yonge");
    await expect(mapViewport).toHaveCSS("bottom", "0px");
    await expect.poll(() => mapViewport.evaluate((element) => {
      const map = element.getBoundingClientRect();
      const sheet = document.querySelector(".mobile-impact-inspector")?.getBoundingClientRect();
      return Boolean(sheet && map.bottom >= sheet.bottom && map.top < sheet.top);
    })).toBe(true);
    await expect(page.locator(".network-map-transition-surface").getByLabel("Zoom level slider")).toHaveValue("3.8");
  }
});

test("reveals the map beneath a closing mobile impact sheet", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "Mobile split view only");
  await page.setViewportSize({ width: 360, height: 780 });
  await setStubMode(request, "seeded");
  await page.goto("/");
  await page.getByRole("button", { name: "delay: Sheppard-Yonge to Don Mills" }).dispatchEvent("click");

  const inspector = page.locator("[data-mobile-impact-inspector]");
  const mapViewport = page.locator(".linewatch-shell > main");
  await expect(inspector).toBeVisible();
  await expect(mapViewport).toHaveCSS("bottom", "0px");
  await inspector.getByRole("button", { name: "Unfocus impact" }).click();
  await expect(inspector).toHaveCount(0);
  await expect(mapViewport).toHaveCSS("bottom", "0px");
});

test("keeps the regional map beneath a selected impact sheet", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "Mobile split view only");
  await setStubMode(request, "regional-live");
  await page.goto("/?network=regional&panel=delays&impactKind=delay&impactId=regional-demo-delay");

  const shell = page.locator(".linewatch-shell");
  const inspector = page.locator("[data-mobile-impact-inspector]");
  const mapViewport = shell.locator(":scope > main");
  await expect(shell).toHaveClass(/mobile-map-inspector-impact/);
  await expect(inspector).toBeVisible();
  await expect(mapViewport).toHaveCSS("bottom", "0px");
  await expect.poll(() => mapViewport.evaluate((element) => {
    const map = element.getBoundingClientRect();
    const sheet = document.querySelector(".mobile-impact-inspector")?.getBoundingClientRect();
    return Boolean(sheet && map.bottom >= sheet.bottom && map.top < sheet.top);
  })).toBe(true);
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
    await openDesktopDestination(page, "more");
    await page.getByRole("button", { name: "Register", exact: true }).click();
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
  await verificationDialog.getByLabel("Confirm Password").fill("aaaaaaaaaa");
  await verificationDialog.getByRole("button", { name: "Verify Local Account" }).click();
  await expect(verificationDialog.getByRole("alert")).toContainText("Password must include a number, symbol, or space.");

  await verificationDialog.getByLabel("Password", { exact: true }).fill("correct horse battery staple");
  await verificationDialog.getByLabel("Confirm Password").fill("correct horse battery staple");
  await verificationDialog.getByRole("button", { name: "Verify Local Account" }).click();
  // Signing in closes the dialog and opens My Commutes.
  await expect(verificationDialog).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "My Commutes" })).toBeVisible();
});

test("accepts a one-time email verification link", async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await page.goto("/verify-email#token=smoke-verification-token");

  const dialog = page.getByRole("dialog", { name: "Verify your email for LineWatchTO" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Verification links expire after 24 hours");
  await dialog.getByLabel("Password", { exact: true }).fill("correct horse battery staple");
  await dialog.getByLabel("Confirm Password").fill("correct horse battery staple");
  await dialog.getByRole("button", { name: "Verify Email" }).click();

  await expect(dialog).toHaveCount(0);
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
    await openDesktopDestination(page, "status");
  }
  await page.getByRole("button", { name: "Center map view" }).click();
  await page.waitForTimeout(500);
  await clickSvgRingStroke(page, /Stub API signal problem: Stub Station/);

  if (isMobile) {
    const inspector = page.locator('[data-mobile-impact-inspector]');
    await expect(inspector).toBeVisible();
    await expect(inspector.getByRole("heading", { name: "Suspension", exact: true })).toBeVisible();
    await inspector.getByRole("button", { name: "View in List" }).click();
  }

  await expect(page.getByRole("heading", { name: "Suspensions" })).toBeVisible();
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
  await expect(target).toHaveCSS("stroke-width", isMobile ? "144px" : "96px");
  await page.waitForTimeout(900);

  const mapElement = page.locator("[data-system-map=ttc] .map-stage").first();
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
    const viewport = page.locator("[data-system-map=ttc] .system-map-viewport");
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
  // Selection draws its own emphasis; hit targets keep their width (f5ffcd35).
  await expect(page.locator("[data-selected-impact-emphasis]").first()).toBeAttached();
  await expect(target).toHaveCSS("stroke-width", isMobile ? "144px" : "96px");
  // Station targets keep the manifest's hit padding (TTC: 6 units, 22 for touch).
  await expect(page.locator('[data-station-id="stub-station"] circle')).toHaveCSS("stroke-width", isMobile ? "44px" : "12px");
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
    .getByRole("button", { name: /^View .* on map$/ })
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
  await page.getByRole("button", { name: "Stub Station station details" }).press("Enter");

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
  const searchNavItem = page.getByRole("navigation", { name: "Primary mobile navigation" }).getByRole("button", { name: "Saved", exact: true });
  const navTransitionProperty = await searchNavItem.evaluate((element) => getComputedStyle(element).transitionProperty);
  expect(navTransitionProperty).toContain("transform");
  expect(navTransitionProperty).not.toContain("width");

  await page.getByRole("searchbox", { name: "Station Search" }).click();
  const searchPanel = page.locator("[data-station-search-panel]");
  await expect(searchPanel).toBeVisible();
  // Initially, the nav bar is visible
  await expect(page.getByRole("navigation", { name: "Primary mobile navigation" })).toHaveCount(1);
  // The keyboard, rather than query text alone, controls navigation visibility.
  await page.locator("html").evaluate(element => element.setAttribute("data-visual-keyboard", "open"));
  await expect(page.getByRole("navigation", { name: "Primary mobile navigation" })).toBeHidden();
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
  // A row with Details wraps its button in an outer row, so count top-level rows.
  const compactRows = page.locator(".alert-stack > .compact-impact-list-item");
  await expect(compactRows).toHaveCount(2);
  await expect(page.locator(".alert-card")).toHaveCount(0);
  const firstCompactRow = compactRows.first();
  await expect(firstCompactRow).toContainText("Directions:");
  await expect(firstCompactRow).toContainText("Speed:");
  await expect(firstCompactRow).toContainText("Est. Resolution:");
  await expect(firstCompactRow).toContainText("Updated:");
  const secondCompactRow = compactRows.nth(1);
  await expect(secondCompactRow).toContainText("Directions:");
  await expect(firstCompactRow).toHaveCSS("border-left-color", "rgba(245, 158, 11, 0.85)");
  await expect(firstCompactRow).toHaveCSS("border-left-width", cardEdgeWidth);
  await expect(firstCompactRow.locator(".compact-impact-list-item__facts")).toBeVisible();
  // Reduced speed zone rows align their Directions facts in column 2.
  const firstStartedBounds = await firstCompactRow.locator(".is-column-2").first().boundingBox();
  const secondStartedBounds = await secondCompactRow.locator(".is-column-2").first().boundingBox();
  expect(firstStartedBounds).not.toBeNull();
  expect(secondStartedBounds).not.toBeNull();
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("linewatch-impact-list-view-v1"))).toBe("list");

  await openServiceCategory(page, isMobile, /Delay/);
  await expect(page.locator(".alert-stack")).toHaveClass(/is-list-view/);
  await expect(page.locator(".compact-impact-list-item").first()).toBeVisible();
  await expect(page.locator(".compact-impact-list-item").first()).toHaveCSS("border-left-color", "rgba(254, 236, 65, 0.85)");

  await page.getByRole("button", { name: "Card view" }).click();
  await expect(page.locator(".alert-stack")).not.toHaveClass(/is-list-view/);
  await expect(page.locator(".alert-card").first()).toBeVisible();
});

test("mobile closing station details preserves the focused map camera", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "mobile-only station camera behavior");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  const mapLayer = page.locator("[data-system-map=ttc] .map-stage").first();
  const defaultTransform = await mapLayer.evaluate((element) => element.style.transform);

  await page.getByRole("button", { name: "Stub Station station details" }).press("Enter");
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

  const viewport = page.locator("[data-system-map=ttc] .system-map-viewport");
  const mapStage = viewport.locator(".map-stage");
  const authoredMap = mapStage.locator(".map-authored-svg > svg");
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
  await expect(page.locator("[data-system-map=ttc]")).toHaveAttribute("data-map-camera-moving", "true");
  await expect.poll(
    () => mapStage.evaluate((element) => (element as HTMLElement).style.transform),
  ).not.toBe(zoomedTransform);

  const focusTarget = await mapStage.evaluate((element) => (element as HTMLElement).style.transform);
  const stationAttention = page.locator(".station-selection-flash.map-selection-attention").first();
  await expect(stationAttention).toBeAttached();
  expect(await stationAttention.evaluate(
    (element) => getComputedStyle(element).animationPlayState,
  )).not.toContain("paused");
  expect(await stationAttention.evaluate(
    (element) => getComputedStyle(element).animationName,
  )).toContain("map-selection-station-intro");
  await expect(authoredMap).toHaveCSS("shape-rendering", "geometricprecision");
  await expect(authoredMap).toHaveCSS("text-rendering", "geometricprecision");
  const authoredTrack = mapStage.locator("#ttc-tracks-layer path").first();
  await expect(authoredTrack).toHaveCSS("shape-rendering", "geometricprecision");
  await expect(authoredTrack).toHaveCSS("text-rendering", "geometricprecision");

  await page.waitForTimeout(160);
  expect(await mapStage.evaluate((element) => (element as HTMLElement).style.transform)).toBe(focusTarget);
  await expect(page.locator("[data-system-map=ttc]")).toHaveAttribute("data-map-camera-moving", "false", { timeout: 2_000 });
  expect(await mapStage.evaluate((element) => (element as HTMLElement).style.transform)).toBe(focusTarget);
  await expect(authoredMap).toHaveAttribute("data-camera-test-identity", "stable-authored-map");
  await expect(authoredMap).toHaveCSS("shape-rendering", "geometricprecision");
  await expect(authoredMap).toHaveCSS("text-rendering", "geometricprecision");
});

test("desktop TTC overlay press arms the camera before the next frame", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "desktop animated camera behavior");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  const viewport = page.locator("[data-system-map=ttc] .system-map-viewport");
  const target = page.getByRole("button", { name: "delay: Sheppard-Yonge to Don Mills" });
  await expect(target).toBeVisible();
  await expect(page.locator("[data-system-map=ttc]")).toHaveAttribute("data-map-camera-moving", "false", { timeout: 2_000 });

  await page.evaluate(() => {
    const viewportElement = document.querySelector<HTMLElement>("[data-system-map=ttc] .system-map-viewport");
    const mapStage = document.querySelector<HTMLElement>("[data-system-map=ttc] .map-stage");
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
  await expect(page.locator("[data-system-map=ttc]")).toHaveAttribute("data-map-camera-moving", "true");
  const selectedOverlay = page.locator('[data-selected-impact-emphasis="stub-delay-line-4"]');
  await expect(selectedOverlay).toBeAttached();
  expect(await selectedOverlay.evaluate(
    (element) => getComputedStyle(element).animationName,
  )).toContain("map-selection-path-intro");
  expect(await selectedOverlay.evaluate(
    (element) => getComputedStyle(element).animationPlayState,
  )).not.toContain("paused");
});

test("desktop map gestures pause overlay pulses and suppress expensive glows", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "desktop map gesture paint behavior");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
  await page.waitForTimeout(900);

  const viewport = page.locator("[data-system-map=ttc] .system-map-viewport");
  const authoredMap = viewport.locator(".map-authored-svg > svg");
  const authoredTrack = viewport.locator("#ttc-tracks-layer path").first();
  const stationGlow = page.locator(".station-impact-dot-red-glow").first();
  const plannedPath = page.locator(".overlay-segment-group .asset-alert-path.planned-preview").first();
  await expect(stationGlow).toBeAttached();
  await expect(plannedPath).toBeAttached();
  expect(await stationGlow.evaluate((element) => getComputedStyle(element).filter)).toContain("drop-shadow");
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
  expect(await stationGlow.evaluate((element) => getComputedStyle(element).filter)).toBe("none");
  expect(await plannedPath.evaluate((element) => getComputedStyle(element).transitionDuration)).toBe("0s");
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
  expect(await stationGlow.evaluate((element) => getComputedStyle(element).filter)).toContain("drop-shadow");
  await expect(authoredMap).toHaveCSS("shape-rendering", "geometricprecision");
  await expect(authoredTrack).toHaveCSS("shape-rendering", "geometricprecision");

  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const ttcZoomPaint = await viewport.evaluate((root) => {
    const zoomGlow = root.querySelector<SVGElement>(
      ".station-impact-dot-red-glow",
    );
    if (!zoomGlow) throw new Error("Missing TTC station glow");
    return {
      zoomActive: root.closest<HTMLElement>(".system-map")!.dataset.mapZoomActive,
      cameraMoving: root.closest<HTMLElement>(".system-map")!.dataset.mapCameraMoving,
      glowFilter: getComputedStyle(zoomGlow).filter,
    };
  });
  expect(ttcZoomPaint).toMatchObject({
    zoomActive: "true",
    cameraMoving: "false",
    glowFilter: "none",
  });
  await expect(page.locator("[data-system-map=ttc]")).toHaveAttribute("data-map-zoom-active", "false");
  expect(await stationGlow.evaluate((element) => getComputedStyle(element).filter)).toContain("drop-shadow");

  const ttcRecenterPaint = await page.getByRole("button", { name: "Center map view" }).evaluate((button) => {
    (button as HTMLElement).click();
    const root = document.querySelector<HTMLElement>("[data-system-map=ttc] .system-map-viewport");
    const stage = root?.querySelector<HTMLElement>("[data-system-map=ttc] .map-stage");
    return {
      cameraMoving: root?.closest<HTMLElement>(".system-map")?.dataset.mapCameraMoving,
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
  expect(await stationGlow.evaluate((element) => getComputedStyle(element).filter)).toContain("drop-shadow");
  await expect(page.locator("[data-system-map=ttc]")).toHaveAttribute("data-map-camera-moving", "false");
  expect(await stationGlow.evaluate((element) => getComputedStyle(element).filter)).toContain("drop-shadow");

  await setStubMode(request, "regional-live");
  await page.getByRole("group", { name: "Select transit network" })
    .getByRole("button", { name: "GO/UP", exact: true })
    .click();

  const regionalMap = page.locator("[data-system-map=regional]");
  const regionalViewport = regionalMap.locator(".system-map-viewport");
  const regionalMapStage = regionalMap.locator(".map-stage");
  const regionalAuthoredMap = regionalMapStage.locator(":scope > div > svg");
  const regionalAuthoredTrack = regionalMapStage.locator("#regional-route-lw-main-path");
  const regionalGlow = regionalMap.locator(
    '.overlay-segment-group[data-map-impact-id="regional-demo-delay"] .asset-alert-path-glow:not(.interactive-glow)',
  );
  const regionalPlannedPath = regionalMap.locator(
    '.overlay-segment-group[data-map-impact-id="regional-demo-planned"] > .asset-alert-path',
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
  await expect(regionalMap).toHaveAttribute("data-map-camera-moving", "false");
  expect(await regionalGlow.evaluate((element) => getComputedStyle(element).filter)).toBe("none");
  expect(Number(await regionalGlow.evaluate((element) => getComputedStyle(element).opacity))).toBe(0);
  expect(await regionalPlannedPath.evaluate((element) => getComputedStyle(element).transitionDuration)).toBe("0s");
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
  expect(Number(await regionalGlow.evaluate((element) => getComputedStyle(element).opacity))).toBeGreaterThan(0);
  await expect(regionalAuthoredMap).toHaveCSS("shape-rendering", "geometricprecision");
  await expect(regionalAuthoredTrack).toHaveCSS("shape-rendering", "geometricprecision");

  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const regionalZoomPaint = await regionalMap.evaluate((root) => {
    const zoomGlow = root.querySelector<SVGElement>(
      '[data-system-map=regional] .overlay-segment-group[data-map-impact-id="regional-demo-delay"] .asset-alert-path-glow:not(.interactive-glow)',
    );
    const zoomPlannedPath = root.querySelector<SVGElement>(
      '[data-system-map=regional] .overlay-segment-group[data-map-impact-id="regional-demo-planned"] > .asset-alert-path',
    );
    if (!zoomGlow || !zoomPlannedPath) throw new Error("Missing regional zoom overlays");
    return {
      zoomActive: root.dataset.mapZoomActive,
      cameraMoving: root.dataset.mapCameraMoving,
      glowFilter: getComputedStyle(zoomGlow).filter,
      glowOpacity: getComputedStyle(zoomGlow).opacity,
      plannedTransitionDuration: getComputedStyle(zoomPlannedPath).transitionDuration,
    };
  });
  expect(regionalZoomPaint).toMatchObject({
    zoomActive: "true",
    cameraMoving: "false",
    glowFilter: "none",
    glowOpacity: "0",
    plannedTransitionDuration: "0s",
  });
  await expect(regionalMap).toHaveAttribute("data-map-zoom-active", "false");
  expect(Number(await regionalGlow.evaluate((element) => getComputedStyle(element).opacity))).toBeGreaterThan(0);

  const regionalRecenterPaint = await page.getByRole("button", { name: "Center map view" }).evaluate(async (button) => {
    const root = document.querySelector<HTMLElement>("[data-system-map=regional]");
    const stage = root?.querySelector<HTMLElement>("[data-system-map=regional] .map-stage");
    // The toolbar renders through the shared rail, outside the map root.
    const zoomIn = document.querySelector<HTMLButtonElement>('.map-control-rail button[aria-label="Zoom in"]');
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
      cameraMoving: root?.closest<HTMLElement>(".system-map")?.dataset.mapCameraMoving,
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
  expect(Number(await regionalGlow.evaluate((element) => getComputedStyle(element).opacity))).toBeGreaterThan(0);
  await expect(regionalMap).toHaveAttribute("data-map-camera-moving", "false");
});

test("disruption rails stay static across TTC and regional maps", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "desktop ambient overlay pulse verification");
  await setStubMode(request, "map-authoritative-overlap");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
  await page.waitForTimeout(900);

  const ttcPulse = await page.locator('#ttc-dynamic-segment-layer').evaluate((root) => {
    const planned = root.querySelector<SVGPathElement>(
      '.overlay-segment-group[data-map-impact-id="stub-active-closure-child-line-1"] .asset-alert-path.suspension-candy',
    );
    const plannedPreview = root.querySelector<SVGPathElement>(".asset-alert-path.planned-preview");
    const rsz = root.querySelector<SVGPathElement>(
      '[data-map-impact-kind="reduced-speed-zone"] .asset-alert-path.delay-candy',
    );
    const closureGroup = root.querySelector<SVGGElement>(
      '.overlay-segment-group[data-map-impact-id="stub-active-closure-child-line-1"]',
    );
    if (!planned || !plannedPreview || !rsz || !closureGroup) {
      throw new Error("Missing overlapping TTC current closure, closure preview, and RSZ rails");
    }
    return {
      animationCount: [planned, plannedPreview, rsz]
        .reduce((count, element) => count + element.getAnimations().length, 0),
      plannedWidth: getComputedStyle(planned).strokeWidth,
      plannedPreviewWidth: getComputedStyle(plannedPreview).strokeWidth,
      rszWidth: getComputedStyle(rsz).strokeWidth,
      // Glyph lanes sit inside the tube, unclipped.
      closureMasks: closureGroup.querySelectorAll("mask, [mask]").length,
    };
  });
  expect(ttcPulse.animationCount).toBe(0);
  expect(ttcPulse.plannedWidth).toBe(ttcPulse.rszWidth);
  expect(ttcPulse.plannedPreviewWidth).toBe(ttcPulse.rszWidth);
  expect(ttcPulse.closureMasks).toBe(0);
  // TTC rails are a tube 8 units past each edge of the authored 80-unit line.
  expect(ttcPulse.plannedWidth).toBe("96px");

  const releaseNotesDismiss = page.getByRole("button", { name: "Close introduction" });
  if (await releaseNotesDismiss.isVisible()) {
    await releaseNotesDismiss.click();
    await expect(page.locator(".opening-disclaimer-backdrop")).toBeHidden();
  }

  await setStubMode(request, "regional-live");
  await page.getByRole("group", { name: "Select transit network" })
    .getByRole("button", { name: "GO/UP", exact: true })
    .click();
  await waitForNetworkTransition(page, "regional");

  const regionalRails = await page.locator("[data-system-map=regional]").evaluate((root) => {
    const delay = root.querySelector<SVGPathElement>(
      '[data-system-map=regional] .overlay-segment-group[data-map-impact-id="regional-demo-delay"] > .asset-alert-path',
    );
    const planned = root.querySelector<SVGPathElement>(
      '[data-system-map=regional] .overlay-segment-group[data-map-impact-id="regional-demo-planned"] > .asset-alert-path',
    );
    if (!delay || !planned) throw new Error("Missing overlapping regional delay and planned-closure rails");
    return {
      delayAnimation: getComputedStyle(delay).animationName,
      delayWidth: getComputedStyle(delay).strokeWidth,
      plannedAnimation: getComputedStyle(planned).animationName,
      plannedWidth: getComputedStyle(planned).strokeWidth,
    };
  });
  expect(regionalRails.delayAnimation).toBe("none");
  expect(regionalRails.plannedAnimation).toBe("none");
  expect(regionalRails.delayWidth).toBe(regionalRails.plannedWidth);
  expect(regionalRails.plannedWidth).toBe("196px");
});

test("paints current delays above planned closures on both maps", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "desktop SVG painter-order verification");
  await setStubMode(request, "map-authoritative-overlap");
  await page.goto("/");
  await expect(page.getByTitle("Center map view")).toBeVisible();

  const ttcOverlays = page.locator('#ttc-dynamic-segment-layer');
  await expect(ttcOverlays.locator('.overlay-segment-group[data-map-impact-id="stub-upcoming-closure-line-1"]'))
    .toHaveCount(1);
  await expect(ttcOverlays.locator('.overlay-segment-group[data-map-impact-id="stub-delay-line-1-overlap"]'))
    .toHaveCount(1);
  const ttcDelayPaintsAfterPlanned = await ttcOverlays
    .evaluate((root) => {
      const planned = root.querySelector(
        '.overlay-segment-group[data-map-impact-id="stub-upcoming-closure-line-1"]',
      );
      const delay = root.querySelector('.overlay-segment-group[data-map-impact-id="stub-delay-line-1-overlap"]');
      if (!planned || !delay) return false;
      return Boolean(planned.compareDocumentPosition(delay) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
  expect(ttcDelayPaintsAfterPlanned).toBe(true);

  await setStubMode(request, "regional-live");
  await page.getByRole("group", { name: "Select transit network" })
    .getByRole("button", { name: "GO/UP", exact: true })
    .click();

  const regionalMap = page.locator("[data-system-map=regional]");
  await expect(regionalMap.locator(
    '.overlay-segment-group[data-map-impact-id="regional-demo-planned"]',
  )).toHaveCount(1);
  await expect(regionalMap.locator(
    '.overlay-segment-group[data-map-impact-id="regional-demo-delay"]',
  )).toHaveCount(1);
  const regionalDelayPaintsAfterPlanned = await regionalMap.evaluate((root) => {
    const planned = root.querySelector(
      '[data-system-map=regional] .overlay-segment-group[data-map-impact-id="regional-demo-planned"]',
    );
    const delay = root.querySelector(
      '[data-system-map=regional] .overlay-segment-group[data-map-impact-id="regional-demo-delay"]',
    );
    if (!planned || !delay) return false;
    return Boolean(planned.compareDocumentPosition(delay) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(regionalDelayPaintsAfterPlanned).toBe(true);
});

test("mobile View on Map from a delay submenu centers the affected section", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "mobile-only submenu camera behavior");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.locator('[data-system-map=ttc] .map-stage[data-raster-map-ready="true"]')).toBeVisible();
  await openServiceCategory(page, isMobile, /^Delays/);
  await page.locator('.alert-card').filter({ hasText: 'Sheppard-Yonge' })
    .getByRole('button', { name: /^View .* on map$/ }).click();
  await expect(page.locator('[data-mobile-impact-inspector]')).toBeVisible();
  await page.waitForTimeout(700);
  const geometry = await page.locator('[data-system-map=ttc] .system-map-viewport').evaluate((viewport) => {
    const target = viewport.querySelector('[data-selected-impact-emphasis]');
    if (!target) throw new Error('Missing selected impact');
    // Phones frame the selection in the map left visible between the top
    // controls and the inspector sheet.
    const frame = viewport.getBoundingClientRect();
    const sheet = document.querySelector("[data-mobile-impact-inspector]")?.getBoundingClientRect();
    const visibleBottom = sheet ? Math.min(frame.bottom, sheet.top) : frame.bottom;
    const topControls = [...document.querySelectorAll(".mobile-app-topbar, .mobile-app-chip-scroll")]
      .map((element) => element.getBoundingClientRect().bottom);
    const visibleTop = Math.max(frame.top, ...topControls);
    const impact = target.getBoundingClientRect();
    return {
      dx: Math.abs((impact.left + impact.right - frame.left - frame.right) / 2),
      dy: Math.abs((impact.top + impact.bottom - visibleTop - visibleBottom) / 2),
      width: impact.width,
      frameWidth: frame.width,
    };
  });
  expect(geometry.dx).toBeLessThan(5);
  expect(geometry.dy).toBeLessThan(5);
  // Keep the selected section readable; cached overview insets reduced it to ~14px.
  expect(geometry.width).toBeGreaterThan(geometry.frameWidth * 0.3);
});

test("mobile closing impact details preserves the focused map camera", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "mobile-only impact camera behavior");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  const mapLayer = page.locator("[data-system-map=ttc] .map-stage").first();
  const defaultTransform = await mapLayer.evaluate((element) => element.style.transform);

  await page.getByRole("button", { name: "delay: Sheppard-Yonge to Don Mills" }).dispatchEvent("click");
  const inspector = page.locator("[data-mobile-impact-inspector]");
  await expect(inspector).toBeVisible();
  await expect
    .poll(async () => mapLayer.evaluate((element) => element.style.transform))
    .not.toBe(defaultTransform);

  await expect(page.locator("[data-system-map=ttc]"))
    .toHaveAttribute("data-map-camera-moving", "false");

  const focusedTransform = await mapLayer.evaluate((element) => element.style.transform);

  await inspector.getByRole("button", { name: "Unfocus impact" }).click();
  await expect(inspector).toHaveCount(0);
  await page.waitForTimeout(500);

  const parseTransform = (t: string) => {
    const match = t.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([-\d.]+)\)/);
    return match ? { x: Number(match[1]), y: Number(match[2]), scale: Number(match[3]) } : null;
  };
  const parsedFocused = parseTransform(focusedTransform);
  expect(parsedFocused).not.toBeNull();

  await expect
    .poll(async () => {
      const current = await mapLayer.evaluate((element) => element.style.transform);
      const parsed = parseTransform(current);
      return parsed ? { scale: Math.round(parsed.scale * 1000) / 1000, x: Math.round(parsed.x) } : null;
    })
    .toEqual({
      scale: Math.round(parsedFocused!.scale * 1000) / 1000,
      x: Math.round(parsedFocused!.x),
    });
  await expect
    .poll(async () => mapLayer.evaluate((element) => element.style.transform))
    .not.toBe(defaultTransform);
});

test("desktop closing station details preserves the focused map camera", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "desktop-only station camera behavior");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  const mapLayer = page.locator("[data-system-map=ttc] .map-stage").first();
  const defaultTransform = await mapLayer.evaluate((element) => element.style.transform);

  await page.getByRole("button", { name: "Stub Station station details" }).press("Enter");
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

  const mapLayer = page.locator("[data-system-map=ttc] .map-stage").first();
  const defaultTransform = await mapLayer.evaluate((element) => element.style.transform);

  await page.getByRole("button", { name: "delay: Sheppard-Yonge to Don Mills" }).click();
  const sidebar = page.locator("#desktop-sidebar-container");
  await expect(sidebar.getByRole("heading", { name: "Delays" })).toBeVisible();
  await expect
    .poll(async () => mapLayer.evaluate((element) => element.style.transform))
    .not.toBe(defaultTransform);

  const focusedTransform = await mapLayer.evaluate((element) => element.style.transform);

  await sidebar.getByRole("button", { name: "Back", exact: true }).click();
  await expect(sidebar.getByRole("heading", { name: "Delays" })).toHaveCount(0);
  await page.waitForTimeout(500);

  await expect
    .poll(async () => mapLayer.evaluate((element) => element.style.transform))
    .toBe(focusedTransform);
});

test("mobile rotated map mode keeps station and impact selections in the rotated HUD", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "mobile-only rotated map smoke");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" }).first()).toBeVisible();

  await page.getByRole("button", { name: "Rotate map" }).click();
  const shell = page.locator(".linewatch-shell");
  await expect(shell).toHaveClass(/mobile-map-rotated/);
  await expect(page.getByRole("navigation", { name: "Primary mobile navigation" })).toHaveCount(0);
  await expect(page.locator(".mobile-status-peek")).toHaveCount(0);
  await expect(page.getByRole("switch", { name: /Toggle estimated train markers/ })).toHaveCount(0);

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
  const rotatedStageMatrix = await page.locator("[data-system-map=ttc] .map-stage").evaluate((element) => {
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

  const rotatedMapLayer = page.locator("[data-system-map=ttc] .map-stage").first();
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

  await page.getByRole("button", { name: "Stub Station station details" }).press("Enter");

  const stationPanel = page.getByRole("complementary", { name: "Stub Station station details" });
  await expect(stationPanel).toBeVisible();

  if (isMobile) {
    await expect(page.locator(".linewatch-shell.mobile-map-inspector-station")).toBeVisible();
    await expect(page.locator(".mobile-train-toggle")).toBeHidden();
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
  expect(lineDetailWidths.cardWidth).toBeLessThanOrEqual(lineDetailWidths.innerWidth + 2);
  expect(lineDetailWidths.cardWidth).toBeGreaterThan(lineDetailWidths.innerWidth - 40);
  await expect(stationPanel.getByAltText("Wheelchair accessible", { exact: true })).toBeVisible();
  await expect(stationPanel.getByAltText("Elevator available, outage reported", { exact: true })).toBeVisible();
  await expect(page.locator('[data-facility-warning="elevator"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "Train Arrivals" })).toBeVisible();
  await expect(page.getByText("TTC scheduled service")).toBeVisible();
  await expect(page.getByText("Schedule May Be Disrupted")).toBeVisible();
  const arrivalsSection = page.locator('[data-arrivals-disrupted="true"]');
  await expect(arrivalsSection).toBeVisible();
  const jumpLink = stationPanel.getByRole("button", { name: /^Schedule may be disrupted:/ });
  await expect(jumpLink).toBeVisible();
  const impactsSection = stationPanel.locator('[data-station-section="station-impacts"]');
  await impactsSection.evaluate((element: HTMLDetailsElement) => { element.open = false; });
  await jumpLink.click();
  await expect(impactsSection).toHaveAttribute("open", "");
  await expect(impactsSection.locator(".station-impact-card-highlight-soft").first()).toBeAttached();
  await expect.poll(async () => impactsSection.evaluate((card) => {
    const scroller = card.closest<HTMLElement>(".station-detail-scroll")!;
    const offset = card.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    const atEnd = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop < 2;
    return offset >= 0 && (Math.abs(offset - 8) < 2 || atEnd);
  })).toBe(true);

  await expect(arrivalsSection.locator('[data-arrival-group="line-1:Northbound to Finch"]')).toBeVisible();
  await expect(arrivalsSection.locator('[data-arrival-group="line-1:Southbound to Union"]')).toBeVisible();
  await expect(arrivalsSection.locator('[data-arrival-due="true"]')).toBeVisible();
  await expect(arrivalsSection.getByText("Northbound", { exact: true })).toBeVisible();
  await expect(arrivalsSection.getByText("To Finch", { exact: true })).toBeVisible();
  await expect(arrivalsSection.getByText("Southbound", { exact: true })).toBeVisible();
  await expect(arrivalsSection.getByText("To Union", { exact: true })).toBeVisible();
  await expect(arrivalsSection.getByText("Due")).toBeVisible();
  await expect(arrivalsSection.getByText("3 min", { exact: true })).toBeVisible();
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
  await expect(activeClosureImpact.getByText("Planned Advisory", { exact: true })).toHaveCount(0);
  await activeClosureImpact.getByRole("button", { name: "Open Active Closure details" }).click();
  if (isMobile) {
    const inspector = page.locator('[data-mobile-impact-inspector]');
    await expect(inspector.getByRole("heading", { name: "Suspension", exact: true })).toBeVisible();
    await inspector.getByRole("button", { name: "View in List" }).click();
  }
  await expect(page.getByRole("heading", { name: "Suspensions" })).toBeVisible();
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

  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Reduced Speed Zones" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
  // The category itself opens unfiltered: the line filter belonged to the legend visit.
  await openDesktopDestination(page, "reduced-speed-zones");
  await expect(page.locator('select[aria-label="Filter Reduced Speed Zones by line"]')).toHaveValue("all");
});

test("desktop line names open the all-types submenu with keyboard and pointer", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "desktop-only legend interaction");
  await setStubMode(request, "seeded");
  await page.goto("/");
  const legend = page.locator(".desktop-map-legend");
  const affectedLine = legend.getByRole("button", { name: /View all service impacts for Line 1 Yonge-University:/ });
  await expect(affectedLine).toHaveClass(/service-tone-affected/);
  await expect(affectedLine.locator(".desktop-legend-status-chip")).toBeVisible();
  await affectedLine.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: /Yonge-University/ })).toBeVisible();
  await expect(page.getByRole("group", { name: /Filter .*Yonge-University impacts by alert type/ })).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Yonge-University/ })).toHaveCount(0);
  const regularLine = legend.getByRole("button", { name: /View all service impacts for Line 6 Finch West:/ });
  await expect(regularLine).toHaveClass(/service-tone-good/);
  await regularLine.click();
  await expect(page.getByRole("heading", { name: /Finch West/ })).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("group", { name: "Select transit network" })
    .getByRole("button", { name: "GO/UP", exact: true }).click();
  await waitForNetworkTransition(page, "regional");
  await legend.getByRole("button", { name: /View all service impacts for Barrie Line:/ }).click();
  await expect(page.getByRole("heading", { name: /Barrie/ })).toBeVisible();
});

test("TTC notices filter exact routes and compose service and stop search", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await page.context().route("**/api/surface-notices*", route => route.fulfill({ headers: { "Access-Control-Allow-Origin": "*" }, json: {
    generatedAt: new Date().toISOString(), fresh: true, source: "TTC test notices",
    categories: [{ category: "notice", label: "Notice", count: 2 }],
    notices: ["9", "90"].map((id, index) => ({ id, category: "notice", routeType: index ? "Streetcar" : "Bus",
      routeIds: [id], title: `Route ${id} stop change`, description: "Use temporary stop", stopIds: ["123"],
      stops: [{ stopId: "123", stopName: "Union" }], updatedAt: new Date().toISOString(), source: "TTC test notices" })),
  } }));
  await page.goto("/");
  if (isMobile) {
    await page.getByRole("button", { name: "Status", exact: true }).click();
    await page.getByRole("button", { name: /Streetcar & Bus Notices/ }).click();
  } else {
    await openDesktopDestination(page, "surface-notices");
  }
  await page.getByRole("button", { name: "Filter notices by route or line" }).click();
  await page.getByRole("menuitemradio", { name: /^Route 9 1$/ }).click();
  await expect(page.getByText("Route 9 stop change", { exact: true })).toBeVisible();
  await expect(page.getByText("Route 90 stop change", { exact: true })).toHaveCount(0);
  await page.getByPlaceholder("Search route, stop, or notice").fill("Union 123");
  await expect(page.getByText("Route 9 stop change", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Filter notices by service" }).click();
  await expect(page.getByRole("menuitemradio", { name: /^Streetcar/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Reset filters" }).click();
  await page.getByRole("button", { name: "Filter notices by service" }).click();
  await page.getByRole("menuitemradio", { name: /^Streetcar/ }).click();
  await page.getByRole("button", { name: "Filter notices by route or line" }).click();
  await expect(page.getByRole("menuitemradio", { name: /^Route 9 1$/ })).toHaveCount(0);
  await page.getByRole("menuitemradio", { name: /^Route 90 1$/ }).click();
  await expect(page.getByText("Route 90 stop change", { exact: true })).toBeVisible();
  await page.getByPlaceholder("Search route, stop, or notice").fill("missing stop");
  await expect(page.getByText(/No active .*notices found/)).toBeVisible();
  await page.getByRole("button", { name: "Filter notices by route or line" }).click();
  await expect(page.getByRole("menuitemradio", { name: /^Route 90 0$/ })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Reset filters" }).click();
  await expect(page.locator(".surface-notice-route-group")).toHaveCount(2);
  if (isMobile) {
    // The mobile sheet's Close stays on screen; desktop panels close from the rail.
    const closeBox = await page.getByRole("button", { name: "Close", exact: true }).boundingBox();
    expect(closeBox!.x + closeBox!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
});

test("regional line menus show impacts before notices in one filterable list", async ({ page, request, isMobile }) => {
  await setStubMode(request, "regional-live");
  await page.context().route(url => url.pathname === "/api/dashboard" && url.searchParams.get("network") === "regional", async route => {
    const response = await route.fetch();
    const data = await response.json();
    data.delays.push({ ...data.delays[0], id: "test-barrie-delay", lineId: "regional-br", title: "Barrie test delay" });
    await route.fulfill({ response, json: data });
  });
  await page.goto("/");
  const selector = isMobile ? page.locator(".mobile-network-selector-slot") : page;
  await selector.getByRole("group", { name: "Select transit network" }).getByRole("button", { name: "GO/UP", exact: true }).click();
  await waitForNetworkTransition(page, "regional");
  if (isMobile) await page.getByRole("button", { name: "Transit line legend" }).click();
  await page.getByRole("button", { name: /View all service impacts for Barrie(?: Line)?:/ }).filter({ visible: true }).click();
  const panel = page.locator(".line-impacts-panel");
  await expect(panel.getByText("Barrie station construction notice", { exact: true })).toBeVisible();
  await expect(panel.getByText("Barrie test delay", { exact: true })).toBeVisible();
  await expect(panel.getByRole("group", { name: "Line content" })).toHaveCount(0);
  expect(await panel.evaluate(element => Boolean(element.querySelector(".embedded-impact-panel")!
    .compareDocumentPosition(element.querySelector(".line-notice-section")!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await panel.getByRole("button", { name: /Service Notices/ }).click();
  await expect(panel.getByText("Barrie test delay", { exact: true })).toHaveCount(0);
  await expect(panel.getByText("Barrie station construction notice", { exact: true })).toBeVisible();
  await panel.getByRole("searchbox").fill("unmatched station");
  await expect(panel.getByText("No items match these filters", { exact: true })).toBeVisible();
  await panel.getByRole("searchbox").fill("");
  await panel.getByRole("button", { name: /^All/ }).click();
  await page.screenshot({ path: `/tmp/combined-line-${isMobile ? "mobile" : "desktop"}.png` });
});

test("mobile map legend summarizes line impacts and opens the all-types line view", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "mobile-only legend interaction");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  const legendToggle = page.getByRole("button", { name: "Transit line legend" });
  await expect(legendToggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".mobile-legend-route-badge.service-tone-affected").first()).toBeVisible();
  await expect(page.locator(".mobile-legend-route-badge.service-tone-good").first()).toBeVisible();
  await expect.poll(async () => {
    const [legendBox, trainBox] = await Promise.all([
      page.locator(".mobile-legend-pill").boundingBox(),
      page.locator(".mobile-train-toggle").boundingBox(),
    ]);
    return legendBox && trainBox ? Math.round(trainBox.y - (legendBox.y + legendBox.height)) : null;
  }).toBeGreaterThanOrEqual(7);
  await legendToggle.click();

  // The expanded legend lists lines directly; it no longer has a "Service by line" heading.
  await expect.poll(async () => {
    const [legendBox, themeBox] = await Promise.all([
      page.locator(".mobile-legend-pill").boundingBox(),
      page.getByLabel("Dashboard shortcuts").getByRole("button", { name: /theme/i }).boundingBox(),
    ]);
    // The legend opens below the top button row, clear of the theme button.
    return legendBox && themeBox ? Math.round(legendBox.y - (themeBox.y + themeBox.height)) : null;
  }).toBeGreaterThanOrEqual(0);
  const lineButton = page.getByRole("button", { name: /View all service impacts for Yonge-University:/ });
  await expect(lineButton).toBeVisible();
  await expect(lineButton).toHaveClass(/service-tone-affected/);
  await expect(lineButton.locator(".mobile-legend-line-status > strong.service-tone-affected")).toBeVisible();
  await lineButton.click();

  await expect(page.getByRole("heading", { name: /Yonge-University/ })).toBeVisible();
  await expect(page.getByRole("group", { name: /Filter .*Yonge-University impacts by alert type/ })).toBeVisible();
  await expect(page.getByText("Service by line", { exact: true })).toHaveCount(0);
});

test("Line Status opens an all-types line submenu on desktop and mobile", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  if (isMobile) {
    await page.setViewportSize({ width: 390, height: 600 });
  }
  await page.goto("/");
  // Mobile opens the line from the Status sheet and restores its scroll on Back;
  // desktop opens it from the map legend, which does not scroll.
  const originScroll = isMobile ? page.locator(".mobile-status-content-scroll") : null;
  const lineStatusButton = isMobile
    ? page.getByRole("button", { name: /View all service impacts for .*Yonge-University/ })
    : page.locator(".desktop-map-legend").getByRole("button", { name: /View all service impacts for Line 1 Yonge-University:/ });
  let enteredScrollTop = 0;
  if (originScroll) {
    await page.getByRole("button", { name: "Status", exact: true }).click();
    await originScroll.evaluate((element) => {
      element.scrollTop = Math.min(40, element.scrollHeight - element.clientHeight);
    });
    enteredScrollTop = await originScroll.evaluate((element) => element.scrollTop);
    expect(enteredScrollTop).toBeGreaterThan(0);
    await lineStatusButton.evaluate((element: HTMLButtonElement) => element.click());
  } else {
    await lineStatusButton.click();
  }
  await expect(page.getByRole("heading", { name: /Yonge-University/ })).toBeVisible();
  const typeFilters = page.getByRole("group", { name: /Filter .*Yonge-University impacts by alert type/ });
  await expect(typeFilters).toBeVisible();
  await expect(page.locator('select[aria-label^="Sort "][aria-label$="Yonge-University impacts"]')).toHaveValue("updated");
  await expect(page.getByRole("searchbox", { name: /Search .*Yonge-University impacts/ })).toBeVisible();
  await expect(typeFilters.getByRole("button", { name: /Reduced Speed Zones/ })).toBeVisible();
  if (!isMobile) {
    // The sidebar may wrap the filter chips, but none may run past its edge.
    expect(await typeFilters.evaluate((group) => {
      const right = group.getBoundingClientRect().right;
      return [...group.querySelectorAll("button")].every((button) => button.getBoundingClientRect().right <= right + 1);
    })).toBe(true);
  }
  await expect(page.locator(".line-impact-total-badge")).toContainText(/\d+ Service Impacts/);
  const linePanel = page.locator(".line-impacts-panel");
  await linePanel.getByRole("button", { name: "List view", exact: true }).click();
  await expect(linePanel.getByRole("button", { name: "List view", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(linePanel.locator(".alert-stack.is-list-view").first()).toBeVisible();
  await linePanel.getByRole("button", { name: "Card view", exact: true }).click();
  await expect(linePanel.locator(".alert-stack.is-list-view")).toHaveCount(0);
  await typeFilters.getByRole("button", { name: /Reduced Speed Zones/ }).click();
  await expect(page.locator(".line-impact-panel-stack .rsz-card-border").first()).toBeVisible();
  await expect(page.locator(".line-impact-panel-stack .embedded-impact-panel > .panel-heading")).toBeHidden();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  if (originScroll) {
    await expect.poll(async () => originScroll.evaluate((element) => Math.round(element.scrollTop)))
      .toBe(Math.round(enteredScrollTop));
  }
});

test("regional corridor status opens the same all-types submenu", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "regional network selection is covered on desktop");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await page.getByRole("group", { name: "Select transit network" })
    .getByRole("button", { name: "GO/UP", exact: true }).click();
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
  await waitForNetworkTransition(page, "regional");
  // Seeded mode has no GO/UP source, so the sidebar marks its status unknown.
  await expect(page.locator(".desktop-status-header-row")).toContainText(/Unknown/i);
  await page.locator(".desktop-map-legend").getByRole("button", { name: /View all service impacts for Barrie Line:/ }).click();
  await expect(page.getByRole("heading", { name: /Barrie/ })).toBeVisible();
  await expect(page.getByRole("group", { name: /Filter .*Barrie impacts by alert type/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Reduced Speed Zones/ })).toHaveCount(0);
});

test("mobile More restores its scroll position after submenu back navigation", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "mobile-only More sheet behavior");
  await setStubMode(request, "seeded");
  await page.setViewportSize({ width: 375, height: 568 });
  await openDashboardMenu(page, isMobile);

  const moreScroll = page.locator(".mobile-more-content-scroll");
  const historyButton = page.getByLabel("More LineWatchTO options").getByRole("button", { name: "Alert History", exact: true });
  await historyButton.scrollIntoViewIfNeeded();
  const enteredScrollTop = await moreScroll.evaluate((element) => element.scrollTop);
  expect(enteredScrollTop).toBeGreaterThan(0);
  await historyButton.click();
  await expect(page.getByRole("heading", { name: "Alert History", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect.poll(async () => moreScroll.evaluate((element) => Math.round(element.scrollTop)))
    .toBe(Math.round(enteredScrollTop));
});

test("alert history renders one stable card per incident occurrence with its full lifecycle", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "desktop incident history behavior is sufficient here");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await page.locator('[data-dest="alert-history"]').click();

  await expect(page.getByRole("heading", { name: "Alert History", exact: true })).toBeVisible();
  await expect(page.locator(".alert-history-item")).toHaveCount(2);

  await page.getByRole("button", { name: "Alert type", exact: true }).click();
  const allTypes = page.locator(".alert-history-line-filter-option").filter({ hasText: "All Types" });
  await expect(allTypes.locator(".filter-option-count")).toHaveText("2");
  await expect(allTypes).not.toContainText("(");
  const counts = page.locator(".alert-history-line-filter-options .filter-option-count");
  await expect(counts.first()).toBeVisible();
  const rightEdges = await counts.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().right));
  expect(Math.max(...rightEdges) - Math.min(...rightEdges)).toBeLessThan(2);
  await page.getByRole("button", { name: "Alert type", exact: true }).click();

  const clearedIncident = page.locator(".alert-history-item").filter({ hasText: "Track issue at Warden" });
  await expect(clearedIncident).toHaveCount(1);
  await expect(clearedIncident.locator(".alert-history-status-label")).toHaveText("Cleared");
  await expect(clearedIncident.locator(".alert-history-lifecycle-event")).toHaveCount(3);
  await expect(clearedIncident.getByText("Alert Opened", { exact: true })).toBeVisible();
  await expect(clearedIncident.getByText("Alert Updated", { exact: true })).toBeVisible();
  await expect(clearedIncident.getByText("Service Restored", { exact: true })).toBeVisible();

  const activeIncident = page.locator(".alert-history-item").filter({ hasText: "Reduced speed zone near Rosedale" });
  await expect(activeIncident.locator(".alert-history-status-label")).toHaveText("Updated");
  await page.getByRole("button", { name: /^Active/ }).click();
  await expect(page.locator(".alert-history-item")).toHaveCount(1);
  await expect(activeIncident).toBeVisible();
  await expect(page.getByRole("button", { name: "Alert type", exact: true }).locator(".filter-option-count")).toHaveText("1");
  await page.getByRole("button", { name: /^Cleared/ }).click();
  await expect(page.locator(".alert-history-item")).toHaveCount(1);
  await expect(clearedIncident).toBeVisible();
});

test("retains the last dashboard snapshot while browser requests reconnect", async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await page.addInitScript(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register = async () => {
        throw new Error("Service worker disabled for dashboard request interception");
      };
    }
  });
  let dashboardUnavailable = false;
  await page.route("**/api/dashboard*", async (route) => {
    if (dashboardUnavailable) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "temporary brownout" }) });
      return;
    }
    const response = await request.get(`${stubUrl}/api/dashboard?network=ttc`);
    await route.fulfill({ response });
  });
  await page.goto("/");

  const retainedOverlay = page.locator('.overlay-segment-group[data-map-impact-id="stub-alert-line-1"]');
  await expect(retainedOverlay).toBeAttached();

  dashboardUnavailable = true;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));

  // Mobile shows the notice over the map; desktop shows it in the sidebar's status view.
  await expect(page.locator(".dashboard-availability-notice, .desktop-status-notice-wrapper").first())
    .toContainText(/Reconnecting.*Saved/);
  await expect(retainedOverlay).toBeAttached();

  dashboardUnavailable = false;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByText(/Reconnecting.*Saved/)).toHaveCount(0, { timeout: 8_000 });
  await expect(retainedOverlay).toBeAttached();
});

test("renders fixture fallback when the dashboard API is unavailable", async ({ page, request, isMobile }) => {
  await setStubMode(request, "unavailable");
  await openDashboardMenu(page, isMobile);

  if (!isMobile) {
    await expect(
      page.locator(".mobile-service-sheet-recessed-badge").filter({ hasText: /Unknown/i })
    ).toBeVisible();
  }
  await expect(page.getByText("Live status", { exact: true })).toHaveCount(0);
});

test("shows an active planned closure in both current and scheduled views", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");

  if (isMobile) {
    await page.getByRole("button", { name: "Status", exact: true }).click();
    await page.locator(".mobile-status-actions").getByRole("button", { name: /Suspension/ }).click();
  } else {
    await page.locator('[data-dest="alerts"]').click();
  }
  await expect(page.getByRole("heading", { name: "Suspensions" })).toBeVisible();
  const activeClosureChildCard = page.locator('[data-impact-card-id="stub-active-closure-child-line-1"]');
  await expect(activeClosureChildCard).toBeVisible();
  await expect(activeClosureChildCard.locator(".impact-card-badges").getByRole("button", { name: "View related planned advisory details" })).toBeVisible();
  await expect(activeClosureChildCard.getByRole("button", { name: "View related planned advisory details" })).toBeVisible();

  await activeClosureChildCard.locator(".impact-card-map-btn").click();
  if (isMobile) {
    const inspector = page.locator('[data-mobile-impact-inspector]');
    await expect(inspector).toBeVisible();
    await inspector.getByRole("button", { name: "View in List" }).click();
  }
  await expect(page.locator('[data-impact-card-id="stub-active-closure-child-line-1"]')).toHaveClass(/highlight-active-card/);

  await activeClosureChildCard.getByRole("button", { name: "View related planned advisory details" }).click();
  await expect(page.getByRole("heading", { name: "Planned Advisories" })).toBeVisible();
  // An in-card badge swaps the card in place, so the target is selected without a glow.
  await expect(page.locator('[data-impact-card-id="stub-closure-line-1"]')).toHaveClass(/is-active/);

  if (isMobile) {
    await page.getByRole("button", { name: "Status", exact: true }).click();
    await page.locator(".mobile-status-actions").getByRole("button", { name: /Planned Advisories/ }).click();
  } else {
    await page.locator('[data-dest="closures"]').click();
  }
  await expect(page.getByRole("heading", { name: "Planned Advisories" })).toBeVisible();
  const plannedClosuresPanel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Planned Advisories" }),
  });
  const activeClosureCard = plannedClosuresPanel.locator('[data-impact-card-id="stub-closure-line-1"]');
  await expect(activeClosureCard).toBeVisible();
  await expect(activeClosureCard.getByText("Active Now", { exact: true })).toBeVisible();
  await expect(activeClosureCard.getByText("Advisory Hours", { exact: true })).toBeVisible();
  await expect(activeClosureCard.getByText("11:59 PM – 3:30 AM", { exact: true })).toBeVisible();
  await expect(activeClosureCard.getByText("Advisory Dates", { exact: true })).toBeVisible();
  await expect(activeClosureCard.getByText("Mon, Jul 20 – Wed, Jul 22", { exact: true })).toBeVisible();
  await expect(activeClosureCard.getByText("Current Window", { exact: true })).toBeVisible();
  const currentWindowValue = activeClosureCard.locator(".planned-closure-metadata dd").nth(2);
  await expect(currentWindowValue).toContainText("Wed, Jul 22");
  await expect(currentWindowValue).toContainText("11:59 PM");
  await expect(currentWindowValue).toContainText("Thu 3:30 AM");
  await expect.poll(async () => activeClosureCard.locator(".planned-closure-schedule dd").evaluateAll((values) =>
    values.every((value) => value.scrollWidth <= value.clientWidth),
  )).toBe(true);
  const upcomingClosureCard = plannedClosuresPanel.locator('[data-impact-card-id="stub-upcoming-closure-line-1"]');
  await expect(upcomingClosureCard).toBeVisible();
  await expect(upcomingClosureCard.getByText("Overlapping Impacts")).toBeVisible();
  await expect(upcomingClosureCard.getByText("Suspension", { exact: true })).toHaveCount(2);
  await expect(upcomingClosureCard.getByText("Active Closure", { exact: true })).toHaveCount(0);
});

for (const sameIdProjection of [false, true]) {
  test(`links active alerts back to planned closures with red card edges (${sameIdProjection ? "canonical" : "linked child"})`, async ({ page, request, isMobile }, testInfo) => {
    await setStubMode(request, "seeded");
    await page.setViewportSize({ width: isMobile ? 360 : 1440, height: isMobile ? 800 : 1000 });
    const activeAlertId = sameIdProjection ? "stub-closure-line-1" : "stub-active-closure-child-line-1";
    if (sameIdProjection) {
      await page.route("**/api/dashboard?network=ttc", async (route) => {
        const response = await route.fetch();
        const dashboard = await response.json();
        dashboard.activeAlerts = dashboard.activeAlerts.map((alert: { id: string; relatedPlannedClosureId?: string }) =>
          alert.id === "stub-active-closure-child-line-1"
            ? { ...alert, id: activeAlertId, relatedPlannedClosureId: undefined, shuttle: true }
            : alert,
        );
        await route.fulfill({ response, json: dashboard });
      });
    }
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Center map view" }).first()).toBeVisible();
    if (isMobile) {
      await page.getByRole("button", { name: "Status", exact: true }).click();
      await page.locator(".mobile-status-actions").getByRole("button", { name: /Planned Advisor/ }).click();
    } else {
      await page.getByRole("navigation", { name: "Desktop primary navigation" }).getByRole("button", { name: /^Planned Advisories/ }).click();
    }
    const closureCard = page.locator('[data-impact-card-id="stub-closure-line-1"]');
    await expect(closureCard).toBeVisible();
    await closureCard.getByRole("button", { name: "View current impact", exact: true }).click();
    if (isMobile) {
      const inspector = page.locator('[data-mobile-impact-inspector]');
      await expect(inspector.getByRole("button", { name: "View related planned advisory details" })).toBeVisible();
      await inspector.getByRole("button", { name: "View in List" }).click();
    }
    await expect(page.getByRole("heading", { name: "Suspensions" })).toBeVisible();
    const alertCard = page.locator(`[data-impact-card-id="${activeAlertId}"]`);
    for (const card of await page.locator(".alert-card").all()) {
      await expect(card).toHaveCSS("border-left-color", "rgba(239, 68, 68, 0.85)");
    }
    await expect(alertCard.locator(".impact-card-badges").getByRole("button", { name: "View related planned advisory details" })).toBeVisible();
    await alertCard.screenshot({ path: testInfo.outputPath("active-alert-card.png") });
    // The planned-advisory badge swaps the list in place on every device.
    await alertCard.getByRole("button", { name: "View related planned advisory details" }).click();
    await expect(page.getByRole("heading", { name: "Planned Advisories" })).toBeVisible();
    await expect(closureCard.getByText("Current Window", { exact: true })).toBeVisible();
    await closureCard.getByRole("button", { name: "View current impact", exact: true }).click();
    if (isMobile) {
      // The current impact opens in the map inspector on phones.
      await page.locator('[data-mobile-impact-inspector]').getByRole("button", { name: "View in List" }).click();
    }
    await page.getByRole("button", { name: "List view", exact: true }).click();
    await expect(alertCard).toHaveCSS("border-left-color", "rgba(239, 68, 68, 0.85)");
    await alertCard.getByText("Details", { exact: true }).click();
    await alertCard.getByRole("button", { name: "View related planned advisory details" }).click();
    await expect(page.getByRole("heading", { name: "Planned Advisories" })).toBeVisible();
  });
}

test("shows a compact map hint when multiple alert types overlap", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  if (isMobile) await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  if (isMobile) {
    await page.getByRole("button", { name: "Transit line legend" }).click();
    await expect(page.getByRole("button", { name: "Transit line legend" })).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".mobile-status-peek")).toContainText(/Current Impacts?/);
    // Portrait phones reach My Stations from the Saved tab; the map shortcut is landscape-only.
    await expect(page.getByRole("navigation", { name: "Primary mobile navigation" }).getByRole("button", { name: "Saved" })).toBeVisible();
  }

  const overlapMarker = page.locator('[data-overlap-segment-id="stub-line-1-segment"]');
  await expect(overlapMarker).toBeVisible();
  await expect(overlapMarker).toHaveAttribute("data-overlap-collision-avoided", "true");
  await expect(overlapMarker.locator('[data-overlap-kind="suspension"]')).toBeVisible();
  await expect(overlapMarker.locator('[data-overlap-kind="planned-closure"]')).toBeVisible();

  if (!isMobile) {
    await overlapMarker.hover();
    await expect.poll(() => page.locator("[data-map-hover-owner]").count()).toBeGreaterThan(0);
  }
  const overlapMarkerBox = await overlapMarker.boundingBox();

  await overlapMarker.dispatchEvent("click");
  await expect.poll(() => page.locator("[data-map-hover-owner]").count()).toBeGreaterThan(0);
  const overlapChooser = page.locator("[data-overlap-chooser]");
  await expect.poll(async () => overlapChooser.evaluate((element) =>
    element.getAnimations().some((animation) => animation.playState === "running"),
  ), { timeout: 500 }).toBe(true);
  await expect(overlapChooser).toBeVisible();
  if (isMobile) {
    await expect(page.getByRole("button", { name: "Transit line legend" })).toBeVisible();
    await expect(page.locator(".mobile-status-peek")).toBeVisible();
    // Portrait phones reach My Stations from the Saved tab; the map shortcut is landscape-only.
    await expect(page.getByRole("navigation", { name: "Primary mobile navigation" }).getByRole("button", { name: "Saved" })).toBeVisible();
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
    // The open legend is a keep-out, so the chooser may narrow beside it; its
    // choices still fit (checked above).
    expect(chooserWidthAtDefaultZoom).toBeGreaterThanOrEqual(220);
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
    const viewport = page.locator("[data-system-map=ttc] .system-map-viewport");
    const viewportBox = await viewport.boundingBox();
    expect(viewportBox).not.toBeNull();
    if (viewportBox) {
      await page.mouse.move(viewportBox.x + viewportBox.width * 0.72, viewportBox.y + viewportBox.height * 0.72);
      await page.mouse.down();
      await page.mouse.move(viewportBox.x + viewportBox.width * 0.64, viewportBox.y + viewportBox.height * 0.64, { steps: 4 });
      // Hold still before releasing: a release while moving glides on.
      await page.waitForTimeout(120);
      await page.mouse.up();
      await expect(overlapChooser).toBeVisible();
    }
  }
  if (!isMobile) {
    // The compact desktop toolbar hides the zoom slider; zoom with the buttons.
    for (let step = 0; step < 3; step++) {
      await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    }
    await expect(overlapChooser).toBeVisible();
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
  await expect(overlapChooser.getByText("Suspension", { exact: true })).toHaveCount(2);
  await expect(overlapChooser.getByText("Active Closure", { exact: true })).toHaveCount(0);
  await expect(overlapChooser.getByText("Planned Advisory", { exact: true })).toBeVisible();
  await expect(overlapChooser.getByRole("button", { name: /Line 1: Stub Station to Stub Terminal , both directions Northbound & Southbound$/ })).toHaveCount(3);
  await expect(overlapChooser.locator('[data-overlap-choice-kind="planned-closure"] .overlap-chooser-choice-date'))
    .toHaveText("Thu, Jul 23 – Fri, Jul 24, Nightly 11:00 PM – 2:00 AM");
  await expect(overlapChooser.locator(".overlap-chooser-choice-action")).toHaveCount(0);
  await expect(overlapChooser.locator('[data-overlap-choice-kind="planned-closure"]').first()).toHaveCSS("border-left-width", "2px");
  if (!isMobile) {
    await overlapChooser.locator('[data-overlap-choice-id="stub-alert-line-1"]').hover();
    const foregroundImpact = page.locator('.map-impact-hover-foreground[data-map-hover-owner="chooser:suspension:stub-alert-line-1"]').first();
    await expect(foregroundImpact).toBeVisible();
    const stationImpactHover = page.locator('.station-impact-hover-priority[data-map-hover-impact-id="stub-alert-line-1"][data-map-impact-hovered="true"]');
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
  await expect(page.getByRole("heading", { name: "Suspensions" })).toBeVisible();
  await expect(page.locator('[data-impact-card-id="stub-alert-line-1"]')).toHaveClass(/highlight-active-card/);
});

test("opens the overlap chooser after completed and cancelled map gestures", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  if (isMobile) await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/");

  const overlapMarker = page.locator('[data-overlap-segment-id="stub-line-1-segment"]');
  const overlapChooser = page.locator("[data-overlap-chooser]");
  const viewport = page.locator("[data-system-map=ttc] .system-map-viewport");
  await expect(overlapMarker).toBeVisible();
  await expect(viewport).toBeVisible();

  const viewportBox = await viewport.boundingBox();
  expect(viewportBox).not.toBeNull();
  const dragStart = {
    x: viewportBox!.x + viewportBox!.width * 0.76,
    y: viewportBox!.y + viewportBox!.height * 0.72,
  };
  const pointerType = isMobile ? "touch" : "mouse";

  for (const finishEvent of ["pointerup", "pointercancel"] as const) {
    const mapPointerId = finishEvent === "pointerup" ? 61 : 62;
    await viewport.dispatchEvent("pointerdown", {
      pointerId: mapPointerId,
      pointerType,
      button: 0,
      buttons: 1,
      isPrimary: true,
      clientX: dragStart.x,
      clientY: dragStart.y,
    });
    await viewport.dispatchEvent("pointermove", {
      pointerId: mapPointerId,
      pointerType,
      button: 0,
      buttons: 1,
      isPrimary: true,
      clientX: dragStart.x - 48,
      clientY: dragStart.y - 32,
    });
    await viewport.dispatchEvent(finishEvent, {
      pointerId: mapPointerId,
      pointerType,
      button: 0,
      buttons: 0,
      isPrimary: true,
      clientX: dragStart.x - 48,
      clientY: dragStart.y - 32,
    });

    const badgePointerId = mapPointerId + 10;
    await overlapMarker.dispatchEvent("pointerdown", {
      pointerId: badgePointerId,
      pointerType,
      button: 0,
      buttons: 1,
      isPrimary: true,
    });
    await overlapMarker.dispatchEvent("pointerup", {
      pointerId: badgePointerId,
      pointerType,
      button: 0,
      buttons: 0,
      isPrimary: true,
    });
    await overlapMarker.dispatchEvent("click");

    await expect(overlapChooser).toBeVisible();
    await expect(overlapChooser.getByText("Choose Alert", { exact: true })).toBeVisible();
    await overlapChooser.getByRole("button", { name: "Close alert chooser" }).click();
    await expect(overlapChooser).toHaveCount(0);
  }
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
  await waitForNetworkTransition(page, "regional");
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

  // One target over both dots.
  const spadinaTarget = page.locator('[data-station-id="spadina"]');
  await expect(spadinaTarget).toHaveCount(1);
  await expect(spadinaTarget.locator("circle")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Spadina station details" }),
  ).toHaveCount(1);
  await expect(page.locator('[data-station-hover-id="spadina"] [data-station-anchor-id]')).toHaveCount(2);

  await spadinaTarget.dispatchEvent("click");
  const selectionDots = page.locator('[data-station-selection-foreground="spadina"] [data-station-anchor-id]');
  await expect(selectionDots).toHaveCount(2);
  await expect(selectionDots.nth(0)).toBeVisible();
  await expect(selectionDots.nth(1)).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Spadina station details" }),
  ).toBeVisible();

  if (isMobile) {
    await page.getByRole("button", { name: "Close station details" }).click();
    const hoverIndicator = page.locator('[data-station-hover-id="spadina"]');
    await expect(hoverIndicator).not.toHaveClass(/active/);
    await expect(hoverIndicator.locator("circle").nth(0)).toHaveCSS("fill", "rgba(0, 0, 0, 0)");
    await expect(hoverIndicator.locator("circle").nth(1)).toHaveCSS("fill", "rgba(0, 0, 0, 0)");
  }
});

test("station names share hover and selection behavior with station dots", async ({ page, request, isMobile }) => {
  await setStubMode(request, "unavailable");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  await expect(page.locator("[data-station-label-id]")).toHaveCount(109);
  await expect(page.locator("[data-station-id]")).toHaveCount(109);
  // GO/UP also has a Kipling; these are TTC's.
  const labelTarget = page.locator('[data-system-map=ttc] .map-stage [data-station-label-id="kipling"]');
  await expect(labelTarget).toHaveCount(1);

  if (!isMobile) {
    // Kipling sits under the docked sidebar; collapsing it leaves the camera alone.
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect(page.locator("#desktop-sidebar-container")).toHaveClass(/desktop-sidebar-container--collapsed/);
    // The lifted name is a raster copy over the map, masked by its authored
    // label; the authored labels themselves never change.
    const authoredLabel = page.locator('[data-station-label-for="kipling"]');
    await expect.poll(async () => authoredLabel.evaluate((element) => getComputedStyle(element).fontSize))
      .not.toBe("");
    const authoredFontSize = await authoredLabel.evaluate((element) => getComputedStyle(element).fontSize);
    const hoverCopy = page.locator("[data-system-map=ttc] .map-stage .raster-station-label-text-hover");
    // The label sits in an animated map layer, so skip the stability wait.
    await labelTarget.hover({ force: true });
    await expect(hoverCopy).toHaveAttribute("data-hover-active", "true");
    await expect(hoverCopy.locator("use")).toHaveAttribute("href", "#station-label-kipling");
    await page.mouse.down();
    await expect(hoverCopy).toBeVisible();
    await expect(hoverCopy).toHaveCSS("transform", /matrix\(0\.985, 0, 0, 0\.985, 0, 0\)/);
    await page.mouse.up();
    await labelTarget.hover({ force: true });

    await expect(hoverCopy).toHaveCSS("transition-duration", "0.12s, 0.12s");
    await expect(authoredLabel).toHaveCSS("font-size", authoredFontSize);
    await expect(authoredLabel).not.toHaveClass(/station-label-hovered/);
    await expect(page.locator('[data-system-map=ttc] .map-stage [data-station-hover-id="kipling"]')).not.toHaveClass(/active/);
    await expect(labelTarget).toHaveCSS("outline-style", "none");

    const angledLabel = page.locator('[data-station-label-for="islington"]');
    const angledLabelTarget = page.locator('[data-system-map=ttc] .map-stage [data-station-label-id="islington"]');
    const authoredAngledTransform = await angledLabel.getAttribute("transform");
    await angledLabelTarget.hover();
    await expect(hoverCopy.locator("use")).toHaveAttribute("href", "#station-label-islington");
    await expect(angledLabel).toHaveAttribute("transform", authoredAngledTransform ?? "");
    await page.locator('[data-system-map=ttc] .map-stage [data-station-label-id="royal-york"]').hover();
    await expect(hoverCopy.locator("use")).toHaveAttribute("href", "#station-label-royal-york");
  }

  // Kipling starts off screen on phones, so dispatch the tap there.
  if (isMobile) await labelTarget.dispatchEvent("click");
  else await labelTarget.click({ force: true });
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

  await expect(page.getByRole("heading", { name: "Suspensions" })).toBeVisible();
  const activeAlertCard = page.locator('[data-impact-card-id="stub-alert-line-1"]');
  await expect(activeAlertCard).toBeVisible();
  await expect(activeAlertCard.getByText("Overlapping Impacts", { exact: true })).toBeVisible();
  await expect(activeAlertCard.getByRole("button", { name: /^View Delay at / })).toBeVisible();
  await expect(activeAlertCard.getByRole("button", { name: /^View Reduced Speed Zone at / })).toBeVisible();

  await openServiceCategory(page, isMobile, /Delay/);
  const delaysPanel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Delays" }),
  });
  const delayCard = delaysPanel.locator('[data-impact-card-id="stub-delay-line-1-overlap"]');
  await expect(delayCard).toBeVisible();
  await expect(delayCard.getByText("Overlapping Impacts", { exact: true })).toBeVisible();
  await expect(delayCard.getByRole("button", { name: /^View Suspension at / })).toHaveCount(2);

  await openServiceCategory(page, isMobile, /Suspension/);
  const boundaryActiveCard = page.locator('[data-impact-card-id="stub-alert-st-george-boundary"]');
  await expect(boundaryActiveCard).toBeVisible();
  await expect(boundaryActiveCard.getByText("Overlapping Impacts", { exact: true })).toBeVisible();
  await expect(boundaryActiveCard.getByRole("button", { name: /^View Planned Advisory at / })).toBeVisible();

  await openServiceCategory(page, isMobile, /Planned Advisor/);
  const closuresPanel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Planned Advisories" }),
  });
  const boundaryClosureCard = closuresPanel.locator('[data-impact-card-id="stub-upcoming-closure-st-george-boundary"]');
  await expect(boundaryClosureCard).toBeVisible();
  await expect(boundaryClosureCard.getByText("Overlapping Impacts", { exact: true })).toBeVisible();
  await expect(boundaryClosureCard.getByRole("button", { name: /^View Suspension at / })).toBeVisible();
});

test("production capability keeps TTC source status sanitized", async ({ page, request, isMobile }) => {
  await setStubMode(request, "diagnostics-disabled");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" }).first()).toBeVisible();

  if (isMobile) {
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("button", { name: "Toggle Source Status" }).click();
  } else {
    await openDesktopDestination(page, "source-status");
  }
  await expect(page.getByText("TTC Source Status").last()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dashboard Feed" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "30-day feed availability" })).toBeVisible();
  await expect(page.getByText("99.72%", { exact: true })).toBeVisible();
  await expect(page.getByText("alerts.ttc.ca", { exact: true })).toBeVisible();
  await expect(page.getByText("TTC Live Alerts", { exact: true })).toBeVisible();
  await expect(page.getByText("/api/alerts/live-alerts", { exact: true })).toBeVisible();
  await expect(page.locator('code[title="https://alerts.ttc.ca/api/alerts/live-alerts"]')).toBeVisible();
  await expect(page.getByText("LineWatchTO processing failures are excluded", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Processing Summary" })).toBeVisible();
  await expect(page.getByText("Rider Summaries")).toBeVisible();
  await expect(page.getByText("12", { exact: true })).toBeVisible();
  await expect(page.getByText("original source records are not publicly exposed", { exact: false })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Source records" })).toHaveCount(0);
  await expect(page.getByText("Raw JSON Payload")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Copy JSON" })).toHaveCount(0);
});

test("site guide uses the borderless container treatment", async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  await page.getByRole("button", { name: "Open site guide" }).click();

  const guide = page.getByRole("dialog", { name: "LineWatchTO site guide" });
  await expect(guide).toBeVisible();
  await expect.poll(() => guide.evaluate((element) => {
    const style = getComputedStyle(element);
    return [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth];
  })).toEqual(["0px", "0px", "0px", "0px"]);
});

test("opens TTC retained records when non-production diagnostics are enabled", async ({ page, request, context, isMobile }) => {
  await setStubMode(request, "seeded");
  await context.grantPermissions(["clipboard-write"], { origin: appUrl });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  if (isMobile) {
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("button", { name: "Toggle Source Status" }).click();
  } else {
    await openDesktopDestination(page, "source-status");
  }
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
  await expect(page.getByRole("button", { name: "Center map view" }).first()).toBeVisible();

  await page.getByRole("group", { name: "Select transit network" })
    .getByRole("button", { name: "GO/UP", exact: true })
    .click();
  await expect(page.getByRole("region", { name: "Interactive GO and UP map" })).toBeVisible();

  if (isMobile) {
    await page.getByRole("button", { name: "More", exact: true }).click();
    await expect(page.getByText("GO / UP Source Status")).toBeVisible();
    await page.getByRole("button", { name: "Toggle Source Status" }).click();
  } else {
    await openDesktopDestination(page, "source-status");
  }
  await expect(page.getByText("GO / UP Source Status").last()).toBeVisible();
  await expect(page.getByRole("heading", { name: "30-day feed availability" })).toBeVisible();
  await expect(page.getByText("99.91%", { exact: true })).toBeVisible();
  await expect(page.getByText("api.openmetrolinx.com/OpenDataAPI/", { exact: true })).toBeVisible();
  await expect(page.getByText("GO Service Alerts", { exact: true })).toBeVisible();
  await expect(page.getByText("/api/V1/ServiceUpdate/ServiceAlert/All", { exact: true })).toBeVisible();
  await expect(page.getByText("UP Express Alerts", { exact: true })).toBeVisible();
  await expect(page.getByText("/api/V1/UP/Gtfs/Feed/Alerts", { exact: true })).toBeVisible();
  await expect(page.getByText("Supplemental collections and LineWatchTO processing failures are excluded", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Collection Coverage" })).toBeVisible();
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
    await openDesktopDestination(page, "status");
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
    await page.getByRole("searchbox", { name: "Station Search" }).click();
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
  await expect(page.locator('[data-station-search-panel][data-open="true"]')).not.toBeVisible();
});

test("global station search switches maps for a station on the other network", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  if (isMobile) {
    await page.getByRole("searchbox", { name: "Station Search" }).click();
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
  // The network switch is tucked away while station details are open.
  await expect(page.locator(".linewatch-shell")).toHaveAttribute("data-network", "regional");
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
  await expect(page.locator(".mobile-legend-pill")).not.toHaveClass(/mobile-legend-pill--regional/);
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
  await waitForNetworkTransition(page, "regional");
  await expect(page.getByRole("region", { name: "Interactive GO and UP map" })).toBeVisible();
  await expect(mobileLegend).toBeVisible();
  await expect(page.locator(".mobile-legend-pill")).toHaveClass(/mobile-legend-pill--regional/);
  // No station is selected, so no selection marker is drawn.
  await expect(page.locator(".station-selection-flash[data-map-selected-station-id]")).toHaveCount(0);

  await page.getByRole("button", { name: "Rotate map" }).click();
  const shell = page.locator(".linewatch-shell");
  const regionalViewport = page.locator("[data-system-map=regional] .system-map-viewport");
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
  expect(dimensions.clientHeight).toBeGreaterThan(dimensions.clientWidth);
  expect(dimensions.visualHeight).toBeGreaterThan(dimensions.visualWidth);
  const rotatedStageMatrix = await page.locator("[data-system-map=regional] .map-stage").evaluate((element) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
    return { a: matrix.a, b: matrix.b };
  });
  expect(Math.abs(rotatedStageMatrix.a)).toBeLessThan(0.0001);
  expect(Math.abs(rotatedStageMatrix.b)).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Center map" }).click();
  await page.getByRole("button", { name: "Exit rotated map" }).click();
  await expect(shell).not.toHaveClass(/mobile-map-rotated/);
  await expect(regionalViewport).toHaveAttribute("data-map-viewport-orientation", "standard");
});

test("global search opens a condensed alert result in its detailed card and mobile map inspector", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");

  await page.getByRole("searchbox", { name: "Station Search" }).click();

  const searchbox = page.getByRole("searchbox", { name: "Station Search" });
  await expect(searchbox).toHaveAttribute("placeholder", "Search all stations and alerts...");
  const searchPanel = page.locator("[data-station-search-panel]");
  await expect(searchPanel).toBeVisible();
  if (!isMobile) {
    const [activeAlertsBox, plannedClosuresBox, reducedSpeedZonesBox] = await Promise.all([
      page.getByRole("button", { name: "Suspensions", exact: true }).boundingBox(),
      page.getByRole("button", { name: "Planned Advisories", exact: true }).boundingBox(),
      page.getByRole("button", { name: "Reduced Speed Zones", exact: true }).boundingBox(),
    ]);
    expect(activeAlertsBox).not.toBeNull();
    expect(plannedClosuresBox).not.toBeNull();
    expect(reducedSpeedZonesBox).not.toBeNull();
    expect(Math.abs(plannedClosuresBox!.y - activeAlertsBox!.y)).toBeLessThanOrEqual(1);
    // Reduced Speed Zones follows in reading order: later on the row, or wrapped below.
    expect(reducedSpeedZonesBox!.y > activeAlertsBox!.y + 1
      || reducedSpeedZonesBox!.x >= plannedClosuresBox!.x + plannedClosuresBox!.width).toBe(true);

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
    // The search result already focuses this delay on the map (highlight checked
    // above); its card button steps back to the search results and says so.
    await expect(delayCard.getByRole("button", { name: /^Back to Map: / })).toHaveCount(0);
    await delayCard.getByRole("button", { name: /^Back to Search Results: / }).click();
    await expect(page.locator(".linewatch-shell")).toHaveAttribute("data-active-view", "search");
  }
});

test("shows seamless continuation gradients on constrained desktop and mobile lists", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  // Desktop stays above the 520px landscape-phone breakpoint.
  await page.setViewportSize(isMobile
    ? { width: 390, height: 480 }
    : { width: 1100, height: 540 });
  await openDashboardMenu(page, isMobile);
  // Mobile checks the More sheet; desktop checks a sidebar impact list.
  if (!isMobile) await openDesktopDestination(page, "alerts");

  const list = isMobile
    ? page.locator(".mobile-more-content-scroll")
    : page.locator(".alert-stack");
  await expect(list).toHaveAttribute("data-scroll-more-below", "");
  expect(await list.evaluate((element) => getComputedStyle(element).maskImage))
    .toContain("linear-gradient");

  await list.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(list).not.toHaveAttribute("data-scroll-more-below", "");
});

test("alert category panels filter by line and sort without changing dashboard data", async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await page.goto("/?panel=delays");

  const toolbar = page.locator(".impact-list-toolbar");
  await page.getByRole("button", { name: "Filter delays by line" }).click();
  await page.getByRole("listbox").getByRole("option", { name: "Line 4 Sheppard" }).click();
  const lineFilterTrigger = page.getByRole("button", { name: "Filter delays by line" });
  await expect(lineFilterTrigger).toContainText("Sheppard");
  await expect(lineFilterTrigger.locator("img")).toHaveAttribute("src", /line-4-legend\.svg/);
  await expect(page.locator('[data-impact-card-id="stub-delay-line-4"]')).toBeVisible();
  await expect(page.locator('[data-impact-card-id="stub-delay-st-george-curve"]')).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: /1 of 2/ })).toBeAttached();

  const sortTrigger = page.getByRole("button", { name: "Sort delays" });
  await sortTrigger.click();
  const sortOptions = page.getByRole("listbox");
  await expect(sortOptions).toBeVisible();
  const sortTriggerBox = await sortTrigger.boundingBox();
  const sortOptionsBox = await sortOptions.boundingBox();
  expect(sortTriggerBox).not.toBeNull();
  expect(sortOptionsBox).not.toBeNull();
  if (sortTriggerBox && sortOptionsBox) {
    expect(Math.abs(
      sortOptionsBox.x + sortOptionsBox.width - (sortTriggerBox.x + sortTriggerBox.width),
    )).toBeLessThanOrEqual(3);
  }
  await sortOptions.getByRole("option", { name: "Line", exact: true }).click();
  await expect(sortTrigger).toContainText("Line");
  await expect(page.locator('[data-impact-card-id="stub-delay-line-4"]')).toBeVisible();
  await page.getByRole("searchbox", { name: "Search delays" }).fill("Sheppard");
  await lineFilterTrigger.click();
  await expect(page.getByRole("listbox").getByRole("option", { name: "Line 1 Yonge-University" })).toHaveCount(0);
  await expect(page.getByRole("listbox").getByRole("option", { name: "Line 4 Sheppard" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("searchbox", { name: "Search delays" }).fill("no matching incident");
  await lineFilterTrigger.click();
  await expect(page.getByRole("listbox").getByRole("option", { name: "Line 4 Sheppard" })).toBeVisible();
  await page.keyboard.press("Escape");
  await toolbar.getByRole("button", { name: "Reset filters", exact: true }).click();
  await expect(page.locator('[data-impact-card-id="stub-delay-st-george-curve"]')).toBeVisible();
});

test("station search browses fallback station lists by line", async ({ page, request, isMobile }) => {
  await setStubMode(request, "unavailable");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  if (isMobile) {
    await page.getByRole("searchbox", { name: "Station Search" }).click();
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
  await expect(rail).toHaveCSS("border-radius", "12px");

  // Click a station to trigger focus zoom animation
  await page.getByRole("button", { name: "Stub Station station details" }).click();
  await page.waitForTimeout(100); // let it start animating

  // Locate the map wrapper
  const mapElement = page.locator("[data-system-map=ttc] .map-stage").first();

  // Get initial transform style
  const initialTransform = await mapElement.evaluate((el) => el.style.transform);

  // Drag the map slightly
  const viewport = page.locator("[data-system-map=ttc] .system-map-viewport").first();
  const dragBox = await viewport.boundingBox();
  expect(dragBox).not.toBeNull();

  // Start right of the docked sidebar, which sits over the map's left side.
  const startX = dragBox!.x + dragBox!.width * 0.75;
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
  const mapElement = mapSurface.locator("[data-system-map=ttc] .map-stage");
  const viewport = mapSurface.locator(".system-map-viewport").first();
  const viewportBox = await viewport.boundingBox();
  expect(viewportBox).not.toBeNull();

  await expect(mapSurface.locator("[data-system-map=ttc] .map-stage .map-authored-svg")).toHaveCount(1);
  await expect(mapSurface.locator("[data-system-map=regional]")).toHaveCount(0);
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

test("keyboard searches and selects a station", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "desktop-only search keyboard accessibility");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  await page.getByRole("searchbox", { name: "Station Search" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("searchbox", { name: "Station Search" })).toBeFocused();

  await page.keyboard.type("Stub");
  // Matching alerts are listed first; step down to the station result.
  const stationResult = page.getByRole("button", { name: /^Stub Station TTC station search result/ });
  for (let step = 0; step < 15 && !(await stationResult.evaluate((element) => element === document.activeElement)); step++) {
    await page.keyboard.press("ArrowDown");
  }
  await expect(stationResult).toBeFocused();
  await page.keyboard.press("Enter");

  // Focus moves to the details that replace the closed search panel.
  const details = page.getByRole("complementary", { name: "Stub Station station details" });
  await expect(details).toBeVisible();
  await expect(details).toBeFocused();
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
    await signInDesktopDemoAccount(page);
    await openDesktopDestination(page, "commutes");
  }

  await expect(page.getByText("Demo account").filter({ visible: true })).toBeVisible();
  const commuteCard = page.locator('[data-commute-card-id="commute_demo_finch_union"]');
  await expect(commuteCard).toBeVisible();
  if (isMobile) {
    const originalViewport = page.viewportSize()!;
    for (const width of [320, 375, 390]) {
      await page.setViewportSize({ width, height: originalViewport.height });
      // However the actions lay out, every button stays inside the card.
      const actionsFit = await commuteCard.evaluate((card) => {
        const bounds = card.getBoundingClientRect();
        return [...card.querySelectorAll(".commute-route-actions button")].every((button) => {
          const action = button.getBoundingClientRect();
          return action.left >= bounds.left && action.right <= bounds.right;
        });
      });
      expect(actionsFit).toBe(true);
    }
    await page.setViewportSize(originalViewport);
  }

  await expect(commuteCard.getByText("Stub Station", { exact: false }).first()).toBeVisible();
  await expect(commuteCard.getByText("Union", { exact: false }).first()).toBeVisible();
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
  const unreliableMetadataSizes = await unreliableMetadata.evaluate((element) => ({
    label: Number.parseFloat(getComputedStyle(element.querySelector("strong")!).fontSize),
    value: Number.parseFloat(getComputedStyle(element.querySelector("span")!).fontSize),
  }));
  expect(unreliableMetadataSizes.label).toBeGreaterThanOrEqual(16);
  expect(unreliableMetadataSizes.value).toBe(unreliableMetadataSizes.label);
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
  await expect(page.getByRole("switch", { name: "Track return route" })).toBeChecked();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(commuteCard.getByText("Stub Station", { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Alerts" })).toBeVisible();
  await page.getByRole("button", { name: "Edit Alerts" }).click();
  await expect(page.locator(".saved-commute-notification-checks > label")).toHaveCount(5);
  const eventTypeVisualOrder = await page.locator(".saved-commute-notification-checks > label")
    .evaluateAll((labels) => labels
      .sort((left, right) => Number.parseInt(getComputedStyle(left).order) - Number.parseInt(getComputedStyle(right).order))
      .map((label) => label.textContent?.trim().replace(/\s+/g, " ")));
  // A container query moves Reduced Speed Zones up once the list is at least 34rem wide.
  const eventTypesWide = await page.locator(".saved-commute-event-types").first()
    .evaluate((element) => element.getBoundingClientRect().width >= 34 * 16);
  expect(eventTypeVisualOrder).toEqual(eventTypesWide
    ? ["Suspensions", "Delays", "Reduced Speed Zones", "Planned Advisories", "Service Restored"]
    : ["Suspensions", "Delays", "Planned Advisories", "Service Restored", "Reduced Speed Zones"]);
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
  await expect(impactDisclosure.getByText(/Line 1: Stub Station to Stub Terminal/).first()).toBeHidden();
  await impactDisclosure.locator("summary").click();
  await expect(impactDisclosure).toHaveAttribute("open", "");
  await expect(impactDisclosure.getByText("Suspension", { exact: true })).toBeVisible();
  await expect(impactDisclosure.getByText("Active Closure", { exact: true })).toBeVisible();
  await expect(impactDisclosure.getByText(/Line 1: Stub Station to Stub Terminal/).first()).toBeVisible();

  const commuteHeaderMetrics = await page.locator(".commute-card").first().evaluate((card) => {
    const header = card.querySelector<HTMLElement>(".saved-commute-card-header");
    const badge = card.querySelector<HTMLElement>(".saved-commute-current-impact-badge");
    if (!header || !badge) throw new Error("Missing saved commute card header elements");
    const badgeBounds = badge.getBoundingClientRect();
    return {
      alignItems: getComputedStyle(header).alignItems,
      badgeFontSize: Number.parseFloat(getComputedStyle(badge).fontSize),
      badgeHeight: badgeBounds.height,
    };
  });
  expect(commuteHeaderMetrics.alignItems).toBe("flex-start");
  expect(commuteHeaderMetrics.badgeFontSize).toBeGreaterThanOrEqual(isMobile ? 10.5 : 11.5);
  expect(commuteHeaderMetrics.badgeHeight).toBeGreaterThanOrEqual(28);

  await page.getByRole("button", { name: /View Suspension on the map for Morning commute/ }).click();
  await expect(page.locator("[data-commute-path-preview]")).toBeVisible();
  if (isMobile) {
    await expect(page.getByRole("complementary", { name: "Selected map impact details" })).toBeVisible();
    await expect(page.getByText("Seeded smoke alert for browser verification.", { exact: true })).toBeVisible();
  } else {
    await expect(page.getByRole("heading", { name: "Suspensions" })).toBeVisible();
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
  await expect(page.locator("[data-system-map=ttc]")).toHaveAttribute(
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
    await page.getByRole("button", { name: "+ Add Commute" }).first().click();
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

  await page.getByRole("button", { name: /View 5 stops/i }).click();
  await expect(page.getByRole("list", { name: "Stops for Morning commute" })).toBeVisible();
  const stopsList = page.getByRole("list", { name: "Stops for Morning commute" });
  await expect(stopsList.getByText("Stub Station", { exact: true })).toBeVisible();
  await expect(stopsList.getByText("Union", { exact: true })).toBeVisible();
  await expect(stopsList.locator("li").first()).toHaveAttribute("data-outgoing-line", "line-1");
  await expect(stopsList.locator("li").first()).not.toHaveAttribute("data-incoming-line");
  const firstLink = await stopsList.locator("li").first().evaluate(element => getComputedStyle(element, "::after").backgroundColor);
  expect(firstLink).toBe("rgb(248, 195, 0)");
  await stopsList.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `/tmp/linewatch-commute-spine-${isMobile ? "mobile" : "desktop"}.png` });


  const viewPathButton = page.getByRole("button", { name: /^View on map for Morning commute$/ });
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
  await viewPathButton.click();
  await expect(page.locator("[data-commute-path-preview]")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Viewing" })).toBeVisible();
  // Phones label the preview's back button with the commute list it returns to.
  await page.getByRole("button", { name: /^Back( to My Commutes)?$/ }).first().click({ force: true });
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
    await signInDesktopDemoAccount(page);
    await openDesktopDestination(page, "commutes");
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
    await expect(inspector).toContainText("Suspension");
    await expect(inspector).toContainText("Seeded active planned closure for browser verification.");
  } else {
    await expect(page.getByRole("heading", { name: "Suspensions" })).toBeVisible();
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
    await signInDesktopDemoAccount(page);
    await openDesktopDestination(page, "commutes");
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
    await signInDesktopDemoAccount(page);
    await openDesktopDestination(page, "commutes");
  }

  const commutePanel = page.locator(".commute-panel");
  await commutePanel.getByRole("button", { name: "+ Add Commute" }).click();
  await commutePanel.getByRole("button", { name: "Customize Commute Notifications" }).click();
  await expect(commutePanel.getByText("Reduced Speed Zones", { exact: true })).toBeVisible();
  await commutePanel.getByRole("button", { name: "GO & UP", exact: true }).click();
  await expect(commutePanel.getByText("Reduced Speed Zones", { exact: true })).toHaveCount(0);
  await expect(commutePanel.getByText("Suspensions", { exact: true })).toBeVisible();
  await expect(commutePanel.getByText("Delays", { exact: true })).toBeVisible();
  await expect(commutePanel.getByText("Planned Advisories", { exact: true })).toBeVisible();
  await expect(commutePanel.getByText("Service Restored", { exact: true })).toBeVisible();
});

test("saved commute View on Map transitions cleanly across network modes and pans to overlay", async ({ page, request, isMobile }) => {
  // Start on GO/UP, which needs a live GO/UP source for commute impacts to load.
  await setStubMode(request, "regional-live");
  const networkSelector = page.getByRole("group", { name: "Select transit network" });
  if (isMobile) {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
    await networkSelector.getByRole("button", { name: "GO/UP", exact: true }).click();
    await expect(page.locator("[data-system-map=regional] .map-stage")).toBeVisible();
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("button", { name: "Demo Account" }).click();
    await expect(page.getByRole("heading", { name: "My Commutes" })).toBeVisible();
  } else {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
    await networkSelector.getByRole("button", { name: "GO/UP", exact: true }).click();
    await expect(page.locator("[data-system-map=regional] .map-stage")).toBeVisible();
    await openDashboardMenu(page, isMobile);
    await signInDesktopDemoAccount(page);
    await openDesktopDestination(page, "commutes");
  }

  // Find TTC morning commute and click View on Map for the suspension impact
  const impactDisclosure = page.locator(".saved-commute-impact-disclosure").first();
  await impactDisclosure.locator("summary").click();
  const viewImpactBtn = page.getByRole("button", { name: /View Suspension on the map for Morning commute/ });
  await expect(viewImpactBtn).toBeVisible();
  await viewImpactBtn.click();

  // Verify transition to TTC network
  await expect(page.locator("[data-system-map=ttc] .map-stage")).toBeVisible();
  await expect(page.locator("[data-commute-path-preview]")).toBeVisible();
  const selectedImpactOverlay = page.locator('[data-selected-commute-impact-overlay="stub-alert-line-1"]');
  await expect(selectedImpactOverlay).toBeAttached();
  await expect(selectedImpactOverlay.locator(".suspension-candy")).toBeVisible();

  // Verify camera animated and zoomed in on the disruption
  await expect(page.locator("[data-system-map=ttc]")).toHaveAttribute(
    "data-map-camera-moving",
    "false",
    { timeout: 3_000 },
  );
  const mapTransform = await page.locator("[data-system-map=ttc] .map-stage").evaluate((el) => {
    return el.style.transform;
  });
  expect(mapTransform).toContain("scale(");
  expect(mapTransform).not.toBe("translate(0px, 0px) scale(1)");
});

test.describe("GO/UP commute preview", () => {
  // The service worker would answer the commutes request before the route.
  test.use({ serviceWorkers: "block" });

  test("draws a GO/UP commute with the shared route, endpoint dots and flashes", async ({ page, request, isMobile }) => {
    test.skip(isMobile, "desktop sign-in path");
    await setStubMode(request, "regional-live");
    // The demo account has only TTC commutes; add a Union to Long Branch one.
    const stationIds = ["union", "exhibition", "mimico", "long-branch"];
    const segmentIds = stationIds.slice(1).map((stationId, index) => `segment-lw-${stationIds[index]}-${stationId}`);
    await page.route("**/api/account/commutes", async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      const response = await route.fetch();
      const body = await response.json();
      const [template] = body.commutes ?? [];
      if (template) {
        const path = {
          ...template.outboundLeg.path,
          stationIds,
          segmentIds,
          segmentHops: segmentIds.map((segmentId, index) => ({
            segmentId, lineId: "regional-lw", fromStationId: stationIds[index], toStationId: stationIds[index + 1],
          })),
          lineIds: ["regional-lw"],
          transferStationIds: [],
          weightSource: "regional-topology-estimate",
        };
        const impact = { ...template.outboundLeg.impact, status: "clear", severity: "none", matchedImpacts: [] };
        body.commutes.push({
          ...template,
          id: "commute_regional_union_long_branch",
          label: "Lakeshore commute",
          networkId: "regional",
          originStationId: "union",
          originStationName: "Union",
          destinationStationId: "long-branch",
          destinationStationName: "Long Branch",
          routeLabel: "Union -> Long Branch",
          watchReturnTrip: false,
          outboundLeg: {
            ...template.outboundLeg,
            routeLabel: "Union -> Long Branch",
            fromStationId: "union",
            fromStationName: "Union",
            toStationId: "long-branch",
            toStationName: "Long Branch",
            path,
            impact,
          },
          returnLeg: undefined,
          path,
          impact,
        });
      }
      await route.fulfill({ response, json: body });
    });

    await page.goto("/");
    await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
    await page.getByRole("group", { name: "Select transit network" })
      .getByRole("button", { name: "GO/UP", exact: true })
      .click();
    await waitForNetworkTransition(page, "regional");
    await openDashboardMenu(page, isMobile);
    await signInDesktopDemoAccount(page);
    await openDesktopDestination(page, "commutes");

    await page.getByRole("button", { name: "View on map for Lakeshore commute" }).click();
    const preview = page.locator('[data-system-map=regional] [data-commute-path-preview]');
    await expect(preview).toBeAttached();
    // One route path through the commute's segments, under station artwork.
    const routeD = await preview.locator(".commute-path-preview-path").getAttribute("d");
    expect(routeD?.match(/M/g)?.length ?? 0).toBeGreaterThanOrEqual(segmentIds.length);
    await expect(preview.locator(".commute-path-preview-endpoint")).toHaveCount(2);
    // Green flashes above the artwork; Union's takes its pill shape.
    await expect(page.locator('[data-system-map=regional] .station-commute-green-flash--pill[data-commute-path-endpoint="origin"]')).toHaveCount(1);
    await expect(page.locator('[data-system-map=regional] circle.station-commute-green-flash[data-commute-path-endpoint="destination"]')).toHaveCount(1);
  });
});

test("signed-in riders save, browse, remove, undo, and reload My Stations", async ({ page, request, isMobile }) => {
  await installDismissedTransientUi(page);
  await setStubMode(request, "seeded");
  if (isMobile) {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("button", { name: "Demo Account" }).click();
  } else {
    await page.goto("/");
    await page.locator('[data-dest="more"]').click();
    await page.getByRole("button", { name: "Demo Account" }).click();
  }

  await expect(page.getByRole("heading", { name: "My Commutes" })).toBeVisible();
  if (isMobile) {
    await page.getByRole("button", { name: "Close", exact: true }).first().click();
  } else {
    await page.locator('[data-dest="status"]').click();
  }
  await expect(page.getByRole("heading", { name: "My Commutes" })).toHaveCount(0);
  if (isMobile) {
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("button", { name: "My Stations", exact: true }).click();
    await expect(page.getByRole("region", { name: "My Stations" })).toBeVisible();
    await page.getByRole("button", { name: "Close My Stations" }).click();
    await expect(page.getByRole("region", { name: "My Stations" })).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Stub Station station details" }).dispatchEvent("click");
  await expect(page.getByRole("button", { name: "Save Stub Station to My Stations" })).toBeVisible();
  await page.getByRole("button", { name: "Save Stub Station to My Stations" }).click();
  await expect(page.getByRole("button", { name: "Remove Stub Station from My Stations" })).toBeVisible();
  const saveNotice = page.getByRole("status").filter({ hasText: "Stub Station added to" });
  await expect(saveNotice).toBeVisible();
  await saveNotice.getByRole("button", { name: "My Stations" }).click();

  const panel = page.getByRole("region", { name: "My Stations" });
  await expect(panel).toBeVisible();
  const savedLineOptions = panel.getByLabel("Filter stations by line", { exact: true }).filter({ has: page.locator("option") });
  await expect(savedLineOptions.locator("option[value='regional-br']")).toHaveCount(0);
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
  await expect(savedLineOptions.locator("option[value='line-1']")).toHaveCount(1);
  await panel.getByRole("searchbox", { name: "Search all stations" }).fill("missing station");
  await expect(savedLineOptions.locator("option[value='line-1']")).toHaveCount(0);
  await panel.getByRole("button", { name: "Reset filters", exact: true }).click();
  await expect(savedLineOptions.locator("option[value='line-1']")).toHaveCount(1);
  await doneButton.click();
  await expect(panel.locator(".my-stations-row-heading strong", { hasText: "Stub Station" })).toBeVisible();
  await expect(panel.getByText("Active Disruptions", { exact: true })).toBeVisible();
  await panel.getByText("Active Disruptions", { exact: true }).click();
  await expect(panel.getByText("1 Active Closure", { exact: true })).toBeVisible();
  const viewAlertDetails = panel.getByRole("button", { name: "View Stub Station alert details" }).first();
  await expect(viewAlertDetails).toContainText("View Details");
  await viewAlertDetails.click();
  if (isMobile) {
    await expect(page.getByRole("complementary", { name: "Selected map impact details" })).toBeVisible();
    await page.getByRole("button", { name: "Back to My Stations", exact: true }).click();
  } else {
    await expect(page.getByRole("heading", { name: "Suspensions" })).toBeVisible();
    await page.getByRole("button", { name: "Back", exact: true }).click();
  }
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
    await page.locator('[data-dest="stations"]').click();
  }
  await expect(page.locator(".my-stations-row-heading strong", { hasText: "Stub Station" })).toBeVisible();
});

test("My Stations shows regional disruptions, accessibility outages, and arrivals", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "regional My Stations integration is covered on desktop");
  await setStubMode(request, "regional-live");
  await page.goto("/");

  await openDashboardMenu(page, isMobile);
  await signInDesktopDemoAccount(page);
  await openDesktopDestination(page, "status");
  await page.getByRole("group", { name: "Select transit network" })
    .getByRole("button", { name: "GO/UP", exact: true })
    .click();
  await waitForNetworkTransition(page, "regional");

  await page.locator('.station-hit-target[data-station-id="pickering"]').press("Enter");
  const stationPanel = page.getByRole("complementary", { name: "Pickering regional station details" });
  await expect(stationPanel.getByText("6 Min Late", { exact: true })).toBeVisible();
  await expect(stationPanel.getByText("Coaches: 12", { exact: true })).toBeVisible();
  await stationPanel.getByRole("button", { name: "Save Pickering to My Stations" }).click();
  const saveNotice = page.getByRole("status").filter({ hasText: "Pickering added to" });
  await saveNotice.getByRole("button", { name: "My Stations" }).click();

  const panel = page.getByRole("region", { name: "My Stations" });
  const pickeringRow = panel.locator(".saved-station-rich-row", { hasText: "Pickering" });
  await expect(pickeringRow.getByText("Active Disruptions", { exact: true })).toBeVisible();
  await expect(pickeringRow.getByText("Metrolinx GO Next Service", { exact: true })).toBeVisible();
  await expect(pickeringRow.getByText("7 min", { exact: true })).toBeVisible();
  await expect(pickeringRow.getByText("6 Min Late", { exact: true })).toBeVisible();
  await expect(pickeringRow.getByText("Coaches: 12", { exact: true })).toBeVisible();
  // Tiles mix platforms, so each names its own.
  await expect(pickeringRow.locator("[data-regional-arrival-platform]")).toHaveText("Platform 11");
  await pickeringRow.getByText("Active Disruptions", { exact: true }).click();
  await expect(pickeringRow.getByText(/Delay/).first()).toBeVisible();

  await panel.getByRole("button", { name: "Add Station", exact: true }).click();
  await panel.getByPlaceholder("Search all stations...").fill("Eglinton");
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
    await openDesktopDestination(page, "sign-in");
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
  await confirmDialog.getByLabel("New Password").fill("new correct horse 2");
  await confirmDialog.getByLabel("Confirm Password").fill("new correct horse 2");
  await confirmDialog.getByRole("button", { name: "Reset Password" }).click();
  await expect(confirmDialog).toHaveCount(0);

  if (isMobile) {
    await page.getByRole("button", { name: "More", exact: true }).click();
  } else {
    await openDesktopDestination(page, "more");
  }
  await expect(page.getByText("Rider").filter({ visible: true }).first()).toBeVisible();
});

test("opens emailed password reset links directly", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await page.goto("/reset-password?token=smoke-reset-token");

  const confirmDialog = page.getByRole("dialog", { name: "Choose a new LineWatchTO password" });
  await expect(confirmDialog).toBeVisible();
  await expect(confirmDialog.getByText("Enter a new password to finish recovery.")).toBeVisible();
  await expect(confirmDialog.getByLabel("Reset Token")).toHaveCount(0);
  await confirmDialog.getByLabel("New Password").fill("new correct horse 2");
  await confirmDialog.getByLabel("Confirm Password").fill("new correct horse 2");
  await confirmDialog.getByRole("button", { name: "Reset Password" }).click();
  await expect(confirmDialog).toHaveCount(0);
  await expect(page).toHaveURL("/");

  if (isMobile) {
    await page.getByRole("button", { name: "More", exact: true }).click();
  } else {
    await openDesktopDestination(page, "more");
  }
  await expect(page.getByText("Rider").filter({ visible: true }).first()).toBeVisible();
});

test("shows official TTC performance metrics from backend", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  if (isMobile) {
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByLabel("More LineWatchTO options").getByRole("button", { name: "Reliability Analytics" }).click();
  } else {
    await openDesktopDestination(page, "more");
    await page.locator(".desktop-more-panel").getByRole("button", { name: "Reliability Analytics" }).click();
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
    multiImpactLineRow.locator(".mobile-line-status-summary").boundingBox(),
    multiImpactLineRow.locator(".mobile-line-status-number").boundingBox(),
  ]);
  expect(lineRowBox).not.toBeNull();
  expect(lineBadgeBox).not.toBeNull();
  const lineRowCenter = lineRowBox!.y + lineRowBox!.height / 2;
  const lineBadgeCenter = lineBadgeBox!.y + lineBadgeBox!.height / 2;
  expect(Math.abs(lineBadgeCenter - lineRowCenter)).toBeLessThanOrEqual(1);
  await page.locator(".mobile-status-actions").getByRole("button", { name: /Delay/ }).click();
  await expect(page.getByRole("heading", { name: "Delays" })).toBeVisible();

  await page.getByRole("searchbox", { name: "Station Search" }).click();
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
  // The panel runs down to the navigation bar and scrolls (with a fade) above it.
  const searchNavGap = mobileNavigationBox!.y - (searchPanelBox!.y + searchPanelBox!.height);
  expect(searchNavGap).toBeGreaterThanOrEqual(0);
  expect(searchNavGap).toBeLessThanOrEqual(16);
  // Focus the input. The navigation hides only once the on-screen keyboard opens
  // (html[data-visual-keyboard="open"]), which headless Chromium never reports.
  await page.getByRole("searchbox", { name: "Station Search" }).click();
  await expect(page.getByRole("searchbox", { name: "Station Search" })).toBeFocused();

  await page.getByRole("button", { name: "Close search" }).click();
  await expect(page.getByRole("navigation", { name: "Primary mobile navigation" })).toBeVisible();
  await page.getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByRole("heading", { name: "More" })).toBeVisible();
  await expect(page.getByRole("switch", { name: /High Contrast Mode/ })).toBeVisible();
});

test("mobile Close uses the same sheet exit animation as Back", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "mobile-only sheet motion");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  await page.getByRole("button", { name: "Status", exact: true }).click();
  const closingSheet = page.locator('[data-floating-panel="mobile-panel"]');
  await page.getByRole("button", { name: "Close status" }).click();
  await expect(closingSheet).toHaveAttribute("data-closing", "true");
  const closeAnimation = await closingSheet.evaluate((element) => {
    const style = getComputedStyle(element);
    return [style.animationName, style.animationDuration, style.animationTimingFunction];
  });
  await expect(closingSheet).toHaveCount(0);

  await page.locator(".mobile-status-peek-count-badge.delays").click();
  const backSheet = page.locator('[data-floating-panel="mobile-panel"]');
  await expect(page.getByRole("heading", { name: "Delays" })).toBeVisible();
  await backSheet.getByRole("button", { name: "Back", exact: true }).click();
  await expect(backSheet).toHaveAttribute("data-going-back", "true");
  const backAnimation = await backSheet.evaluate((element) => {
    const style = getComputedStyle(element);
    return [style.animationName, style.animationDuration, style.animationTimingFunction];
  });

  expect(closeAnimation).toEqual(backAnimation);
  expect(closeAnimation[0]).toBe("mobile-sheet-slide-down-exit");
});

test("mobile browser Back restores the path that launched View on Map", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "mobile-only browser history behavior");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  await page.getByRole("button", { name: "Status", exact: true }).click();
  await expect(page.getByRole("heading", { name: "System Status" })).toBeVisible();
  await page.locator(".mobile-status-actions").getByRole("button", { name: /Delay/ }).click();
  await expect(page.getByRole("heading", { name: "Delays" })).toBeVisible();

  await page.getByRole("button", { name: /^View .* on map$/ }).first().click();
  await expect(page.locator("[data-mobile-impact-inspector]")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Delays" })).toHaveCount(0);

  await page.goBack();
  await expect(page.locator("[data-mobile-impact-inspector]")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Delays" })).toBeVisible();

  await page.goBack();
  await expect(page.getByRole("heading", { name: "System Status" })).toBeVisible();

  // Bottom-navigation tabs are top-level and add no history entry.
  await page.getByRole("navigation", { name: "Primary mobile navigation" }).getByRole("button", { name: "Map" }).click();
  await expect(page.getByRole("heading", { name: "System Status" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
});

test("map impact shortcuts return directly to the map", async ({ page, request, isMobile }) => {
  // Desktop's map chips gave way to rail shortcuts, which are top-level
  // destinations (see desktop-profiles-and-collapse.spec.ts).
  test.skip(!isMobile, "mobile map shortcuts only");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  const openMapDelayShortcut = async () => {
    await page.locator(".mobile-status-peek-count-badge.delays").click();
    await expect(page.getByRole("heading", { name: "Delays" })).toBeVisible();
  };

  const expectMapOrigin = async () => {
    await expect(page.getByRole("heading", { name: "Delays" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
    await expect(page.locator(".mobile-status-peek")).toBeVisible();
    await expect(page.getByRole("heading", { name: "System Status" })).toHaveCount(0);
  };

  await openMapDelayShortcut();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expectMapOrigin();

  await openMapDelayShortcut();
  await page.goBack();
  await expectMapOrigin();

  {
    await page.getByRole("button", { name: "Status", exact: true }).click();
    await expect(page.getByRole("heading", { name: "System Status" })).toBeVisible();
    const mobileSheet = page.locator('[data-floating-panel="mobile-panel"]');
    await mobileSheet.evaluate((element) => { element.setAttribute("data-smoke-stable-sheet", "true"); });
    await page.locator(".mobile-status-actions").getByRole("button", { name: /Delay/ }).click();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page.getByRole("heading", { name: "System Status" })).toBeVisible();
    await expect(page.locator('[data-floating-panel="mobile-panel"][data-smoke-stable-sheet="true"]')).toBeVisible();
  }
});

test("desktop browser Back unfocuses an impact before leaving its submenu", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "desktop-only browser history behavior");
  await setStubMode(request, "seeded");
  await openDashboardMenu(page, isMobile);
  await openServiceCategory(page, isMobile, /Delay/);

  const showOnMap = page.getByRole("button", { name: /^View .* on map$/ }).first();
  await showOnMap.click();
  await expect(page.getByRole("heading", { name: "Delays" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Back to Map:/ }).first()).toBeVisible();

  // Rail destinations act like tabs and add no history entry; focusing an
  // impact does, so browser Back only unfocuses it.
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Delays" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^View .* on map$/ }).first()).toBeVisible();
});

test("submenu Back reverses the path used to open account features", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await openDashboardMenu(page, isMobile);

  if (!isMobile) {
    // My Commutes and My Stations are rail destinations on desktop; only
    // features opened from More have a Back path to reverse.
    await openDesktopDestination(page, "more");
    await page.locator(".desktop-more-panel").getByRole("button", { name: "Notifications" }).click();
    await expect(page.getByRole("heading", { name: "Notifications", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page.locator(".desktop-more-panel")).toBeVisible();
    return;
  }

  const openFeature = async (name: "My Commutes" | "My Stations" | "Notifications") => {
    const mobileName = name === "Notifications" ? /^Notifications/ : name;
    await page.getByRole("button", { name: mobileName, exact: name !== "Notifications" }).click();
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page.getByRole("heading", { name: "More", exact: true })).toBeVisible();
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
  await expect(page.getByText(/Push for This Browser|This Device|Enable on This Device/)).toBeVisible();
  await expect(page.getByText(/Account notifications are on|This device is receiving notifications|Push not configured/).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Line & Corridor Subscriptions" })).toBeVisible();
  const subscriptionNetwork = page.getByRole("group", { name: "Notification subscription network" });
  await expect(subscriptionNetwork.getByRole("button", { name: "GO & UP", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/Corridor alerts use fresh, supported GO\/UP service disruptions/)).toBeVisible();
  await expect(page.getByLabel("Subscribe to LW Lakeshore West")).toBeAttached();
  await subscriptionNetwork.getByRole("button", { name: "TTC", exact: true }).click();
  await expect(subscriptionNetwork.getByRole("button", { name: "TTC", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "Planned Advisory Follow-ups" })).toBeVisible();
  const smartFollowUp = page.getByRole("radio", { name: /^Smart/ });
  await expect(smartFollowUp).toBeChecked();
  const announcementsOnly = page.getByRole("radio", { name: /^Announcements Only/ });
  await announcementsOnly.check();
  await expect(announcementsOnly).toBeChecked();
  await expect(page.getByText("Event Starts/Changes")).toHaveCount(0);

  const line1Switch = page.getByLabel("Subscribe to Line 1 Yonge-University");
  await expect(line1Switch).toBeAttached();
  await line1Switch.click();
  await expect(line1Switch).toBeChecked();

  await expect(page.getByLabel("Line subscription Suspensions")).toBeAttached();
  await expect(page.getByLabel("Line subscription Planned Advisories")).toBeAttached();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "/tmp/linewatch-category-notification-settings-mobile.png" });

  const rszSwitch = page.getByLabel("Line subscription Reduced Speed Zones");
  await expect(rszSwitch).toBeAttached();
  await expect(rszSwitch).toBeChecked();
  await rszSwitch.click();
  await expect(rszSwitch).not.toBeChecked();

  await page.getByRole("button", { name: "Back", exact: true }).click();
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

  await estimatedTrainToggle(page).click();

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

test("mobile train toggle changes its label and blue foreground without changing its surface", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "mobile train control");
  await installDismissedTransientUi(page);
  await setStubMode(request, "seeded");
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/");

  const toggle = page.locator(".mobile-train-toggle");
  await expect(toggle).toContainText(/View\s*Trains/);
  const before = await toggle.evaluate((button) => {
    const style = getComputedStyle(button);
    const bounds = button.getBoundingClientRect();
    return { background: style.backgroundColor, backgroundImage: style.backgroundImage, shadow: style.boxShadow, width: bounds.width, height: bounds.height };
  });

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(toggle).toContainText(/Viewing\s*Trains/);
  const after = await toggle.evaluate((button) => {
    const style = getComputedStyle(button);
    const bounds = button.getBoundingClientRect();
    const iconColor = getComputedStyle(button.querySelector("svg")!).color;
    const labelColor = getComputedStyle(button.querySelector("span")!).color;
    return { background: style.backgroundColor, backgroundImage: style.backgroundImage, shadow: style.boxShadow, width: bounds.width, height: bounds.height, iconColor, labelColor };
  });
  expect(after).toMatchObject(before);
  expect(after.iconColor).toBe(after.labelColor);
  expect(after.iconColor).toMatch(/^rgb\((37, 99, 235|147, 197, 253)\)$/);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(toggle).toContainText(/View\s*Trains/);
});

test("shows train-marker connection progress until markers return on desktop and mobile", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  const disconnectResponse = await request.post(`${stubUrl}/__test/train-marker-disconnect`);
  expect(disconnectResponse.ok()).toBeTruthy();
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  const toggle = estimatedTrainToggle(page);
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


test.describe("regional history source details", () => {
  // Keep the dedicated response fixture independent of service-worker fetches.
  test.use({ serviceWorkers: "block" });

  test("regional history exposes source narrative and changed snapshots on desktop and mobile", async ({ page, request, isMobile }, testInfo) => {
    await setStubMode(request, "seeded");
    const openedAt = new Date(Date.now() - 120000).toISOString();
    const updatedAt = new Date(Date.now() - 60000).toISOString();
    const event = { id: 1, state: "opened", label: "Alert opened", happenedAt: openedAt,
      title: "Barrie - Equipment Issue", description: "There is an equipment issue south of Rutherford GO. Repair personnel are working on the problem.",
      location: "Union to Allandale Waterfront", displayDirection: null, cause: "Unknown Cause", source: "Metrolinx Open API" };
    const updated = { ...event, id: 2, state: "updated", label: "Alert updated", happenedAt: updatedAt,
      description: "There is an equipment issue south of Rutherford GO. Modifications and cancellations are possible." };
    await page.route(url => url.pathname === "/api/alert-history", route => route.fulfill({ json: {
      generatedAt: new Date().toISOString(), period: "today", since: new Date(Date.now() - 86400000).toISOString(), until: new Date(Date.now() + 60000).toISOString(),
      incidents: [{ ...updated, incidentId: "regional-history-test", alertId: "regional-history-test", sourceId: "TEST-BARRIE",
        lineId: "regional-br", lineNumber: "BR", lineName: "Barrie", eventType: "delay", status: "active", latestState: "updated",
        latestEventAt: updatedAt, firstSeenAt: openedAt, lastUpdatedAt: updatedAt, clearedAt: null, durationMinutes: null, events: [updated, event] }],
    } }));
    await page.goto("/");
    const networkSelector = isMobile ? page.locator(".mobile-network-selector-slot") : page;
    await networkSelector.getByRole("group", { name: "Select transit network" })
      .getByRole("button", { name: "GO/UP", exact: true }).click();
    await waitForNetworkTransition(page, "regional");
    if (isMobile) {
      await page.getByRole("button", { name: "More", exact: true }).click();
      await page.getByLabel("More LineWatchTO options").getByRole("button", { name: "Alert History", exact: true }).click();
    } else {
      await openDesktopDestination(page, "alert-history");
    }
    const card = page.locator(".alert-history-item");
    await expect(card).toHaveCount(1);
    const historySearch = page.getByRole("searchbox", { name: "Search alert history" });
    await historySearch.fill("missing source narrative");
    await expect(card).toHaveCount(0);
    await page.getByRole("button", { name: "Transit line", exact: true }).click();
    await expect(page.locator(".alert-history-line-filter-options").getByRole("button", { name: /Barrie/ })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Reset filters", exact: true }).click();
    await expect(card).toHaveCount(1);
    await page.getByRole("button", { name: "Transit line", exact: true }).click();
    await expect(page.locator(".alert-history-line-filter-options").getByRole("button", { name: /Barrie/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(card.locator(".alert-history-content > .alert-history-description")).toHaveText(updated.description);
    await expect(card.getByText("Source Category", { exact: true })).toBeVisible();
    await expect(card.getByText("Unknown Cause", { exact: true })).toHaveCount(0);
    await expect(card.getByText("Affected Stations", { exact: true }).first()).toBeVisible();
    const snapshots = card.locator(".alert-history-snapshot");
    await snapshots.first().locator("summary").click();
    await expect(snapshots.first().locator("summary")).toHaveText("Source details · Changed: Description");
    await snapshots.nth(1).locator("summary").click();
    await expect(snapshots.nth(1).getByText(event.description, { exact: true })).toBeVisible();
    expect(await card.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await card.screenshot({ path: testInfo.outputPath("regional-history.png") });
  });
});

test("reset stays beside search without moving filter selectors", async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await page.goto("/?panel=delays");

  const searchInput = page.getByRole("searchbox", { name: "Search delays" });
  const lineFilterTrigger = page.getByRole("button", { name: "Filter delays by line" });
  const sortTrigger = page.getByRole("button", { name: "Sort delays" });

  await expect(searchInput).toBeVisible();
  await expect(lineFilterTrigger).toBeVisible();
  await expect(sortTrigger).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset filters", exact: true })).toHaveCount(0);

  const initialLineBox = await lineFilterTrigger.boundingBox();
  const initialSortBox = await sortTrigger.boundingBox();
  const initialSearchBox = await searchInput.boundingBox();
  expect(initialLineBox).not.toBeNull();
  expect(initialSortBox).not.toBeNull();
  expect(initialSearchBox).not.toBeNull();

  await searchInput.fill("Sheppard");
  const resetButton = page.getByRole("button", { name: "Reset filters", exact: true });
  await expect(resetButton).toBeVisible();

  const activeResetBox = await resetButton.boundingBox();
  const activeSearchBox = await searchInput.boundingBox();
  const activeLineBox = await lineFilterTrigger.boundingBox();
  const activeSortBox = await sortTrigger.boundingBox();

  expect(activeResetBox).not.toBeNull();
  expect(activeSearchBox).not.toBeNull();
  expect(activeLineBox).not.toBeNull();
  expect(activeSortBox).not.toBeNull();

  expect(activeResetBox!.x).toBeGreaterThanOrEqual(activeSearchBox!.x + activeSearchBox!.width - 1);
  expect(activeSearchBox!.width).toBeLessThan(initialSearchBox!.width);
  expect(Math.abs(activeLineBox!.x - initialLineBox!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(activeLineBox!.width - initialLineBox!.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(activeSortBox!.x - initialSortBox!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(activeSortBox!.width - initialSortBox!.width)).toBeLessThanOrEqual(1);

  await resetButton.click();
  await expect(searchInput).toHaveValue("");
  await expect(resetButton).toHaveCount(0);
  await expect(page.locator('[data-impact-card-id="stub-delay-st-george-curve"]')).toBeVisible();
  await expect(page.locator('[data-impact-card-id="stub-delay-line-4"]')).toBeVisible();
});
