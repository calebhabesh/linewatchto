import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import type { NetworkId } from "../../src/app/dashboard-contract";
import { installDismissedTransientUi, setStubMode } from "./test-support";

/*
 * System Map parity suite (plan 09 phase 4): every case runs on every map and
 * expects the same behaviour. A case that passes on one map and fails on the
 * other is a parity bug, not a per-map expectation. Cases find their targets
 * on screen (whatever the map draws there) and check shared outcomes: overlay
 * attributes from components/map-overlays, the shared chooser, the station
 * details panel and the camera's stage transform.
 */

const MAPS = ["ttc", "regional"] as const;

const viewportSelector = (network: NetworkId) =>
  network === "ttc" ? "[data-map-pan-zoom-viewport]" : ".regional-map-viewport";
const stageSelector = (network: NetworkId) => `.${network}-map-stage`;

type Point = { x: number; y: number };

async function openMap(page: Page, network: NetworkId, { reducedMotion = false } = {}) {
  await installDismissedTransientUi(page);
  if (reducedMotion) await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript((network) => {
    localStorage.setItem("linewatch-default-network-v1", network);
    localStorage.setItem("linewatch-map-view-v1", "diagram");
  }, network);
  await page.goto("/");
  await expect(page.locator(".linewatch-shell")).toHaveAttribute("data-network", network);
  await expect(page.locator(stageSelector(network))).toHaveAttribute("data-raster-map-ready", "true");
  await page.getByRole("button", { name: "Center map view", exact: true }).click();
  await settle(page);
}

/** Waits for any camera motion or gesture to end. */
async function settle(page: Page) {
  await expect.poll(() => page.evaluate(() =>
    document.querySelector('[data-map-gesture-active="true"], [data-map-camera-moving="true"]') === null,
  ), { timeout: 4_000 }).toBe(true);
  await page.waitForTimeout(250);
}

/** The stage's committed camera: scale and translation. */
function camera(page: Page, network: NetworkId) {
  return page.locator(stageSelector(network)).evaluate((stage) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(stage).transform);
    return { scale: matrix.a, x: matrix.e, y: matrix.f };
  });
}

/** Where a screen point falls across the stage's box, as fractions: fixed by a zoom about that point. */
function stageFractionAt(page: Page, network: NetworkId, point: Point) {
  return page.locator(stageSelector(network)).evaluate((stage, point) => {
    const box = stage.getBoundingClientRect();
    return { x: (point.x - box.left) / box.width, y: (point.y - box.top) / box.height, width: box.width, height: box.height };
  }, point);
}

const SKIP_TARGETS = "button, a, input, [role='button'], [data-map-impact-kind], [data-station-id], [data-station-label-id], .overlap-indicator, .map-segment-hit-target, [data-overlay-interaction-target]";

/** A point on open map, clear of targets and controls, with room around it. */
function blankPoint(page: Page, network: NetworkId): Promise<Point> {
  return page.evaluate(({ selector, skip }) => {
    const viewport = document.querySelector(selector)!;
    const box = viewport.getBoundingClientRect();
    for (const y of [0.5, 0.35, 0.65, 0.25, 0.75]) {
      for (const x of [0.6, 0.7, 0.5, 0.8, 0.4]) {
        const point = { x: box.left + box.width * x, y: box.top + box.height * y };
        const hit = document.elementFromPoint(point.x, point.y);
        if (hit && viewport.contains(hit) && !hit.closest(skip)) return point;
      }
    }
    throw new Error("no open map point");
  }, { selector: viewportSelector(network), skip: SKIP_TARGETS });
}

/**
 * A visible point on a line alert whose target is on top there. `horizontal`
 * keeps sideways drags on it; `clearOfStations` keeps a tap's touch
 * adjustment from snapping to a nearby station target.
 */
function alertPoint(page: Page, network: NetworkId, { horizontal = false, clearOfStations = false } = {}) {
  return page.evaluate(({ selector, horizontal, clearOfStations }) => {
    const viewport = document.querySelector(selector)!;
    const box = viewport.getBoundingClientRect();
    const stationBoxes = [...viewport.querySelectorAll(".station-hit-target")]
      .map((target) => target.getBoundingClientRect());
    const nearStation = (point: { x: number; y: number }) => stationBoxes.some((rect) =>
      point.x > rect.left - 24 && point.x < rect.right + 24 && point.y > rect.top - 24 && point.y < rect.bottom + 24);
    for (const path of document.querySelectorAll<SVGPathElement>(`${selector} .map-segment-hit-target`)) {
      const length = path.getTotalLength();
      const at = (fraction: number) => path.getPointAtLength(length * fraction).matrixTransform(path.getScreenCTM()!);
      for (let step = 4; step <= 36; step += 1) {
        const point = at(step / 40);
        if (horizontal) {
          const before = at((step - 4) / 40);
          const after = at((step + 4) / 40);
          if (Math.abs(after.y - before.y) > Math.abs(after.x - before.x) * 0.2) continue;
        }
        const mx = Math.min(200, box.width * 0.15), my = Math.min(150, box.height * 0.15);
        if (point.x < box.left + mx || point.x > box.right - mx || point.y < box.top + my || point.y > box.bottom - my) continue;
        if (clearOfStations && nearStation(point)) continue;
        if (document.elementFromPoint(point.x, point.y) === path) {
          return { x: point.x, y: point.y, id: path.dataset.mapImpactId!, kind: path.dataset.mapImpactKind! };
        }
      }
    }
    throw new Error("no visible line alert");
  }, { selector: viewportSelector(network), horizontal, clearOfStations });
}

/**
 * A visible station target on top at its centre, away from the viewport's
 * edges, with its name. `named` takes only a station whose name is drawn on
 * the map (it has a name target).
 */
function stationPoint(page: Page, network: NetworkId, { named = false } = {}) {
  return page.evaluate(({ selector, named }) => {
    const viewport = document.querySelector(selector)!;
    const box = viewport.getBoundingClientRect();
    const targets = viewport.querySelectorAll<SVGGraphicsElement>(".station-hit-target");
    for (const target of targets) {
      const rect = target.getBoundingClientRect();
      const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      const mx = Math.min(300, box.width * 0.15), my = Math.min(200, box.height * 0.15);
      if (point.x < box.left + mx || point.x > box.right - mx || point.y < box.top + my || point.y > box.bottom - my) continue;
      const hit = document.elementFromPoint(point.x, point.y);
      if (hit !== target && !target.contains(hit)) continue;
      const id = target.dataset.stationId ?? "";
      if (named && !viewport.querySelector(`[data-station-label-id="${CSS.escape(id)}"]`)) continue;
      const name = (target.getAttribute("aria-label") ?? "").replace(/ station details$/, "");
      return { ...point, name };
    }
    throw new Error("no visible station target");
  }, { selector: viewportSelector(network), named });
}

/** A visible overlap badge on top at its centre. */
function badgePoint(page: Page, network: NetworkId) {
  return page.evaluate((selector) => {
    for (const badge of document.querySelectorAll<SVGGraphicsElement>(`${selector} .overlap-indicator`)) {
      const rect = badge.getBoundingClientRect();
      const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      const hit = document.elementFromPoint(point.x, point.y);
      if (hit?.closest(".overlap-indicator") === badge) return { ...point, label: badge.getAttribute("aria-label") ?? "" };
    }
    throw new Error("no visible overlap badge");
  }, viewportSelector(network));
}

/**
 * Drags left and releases while still moving. The last move and the release
 * go out together over CDP: Playwright's mouse steps can arrive 70 ms apart,
 * and a release that late after the last move is a stop, not a fling.
 */
async function fling(page: Page, from: Point, steps = 10, stepPx = 30) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: "mousePressed" | "mouseMoved" | "mouseReleased", x: number) =>
    cdp.send("Input.dispatchMouseEvent", {
      type, x, y: from.y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1,
    });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: from.x, y: from.y, button: "none" });
  await send("mousePressed", from.x);
  for (let i = 1; i < steps; i += 1) await send("mouseMoved", from.x - i * stepPx);
  const last = from.x - steps * stepPx;
  await Promise.all([send("mouseMoved", last), send("mouseReleased", last)]);
  await cdp.detach();
}

/** One wheel event at a point; `ctrlKey` is how browsers report a trackpad pinch. */
async function wheelAt(page: Page, point: Point, deltaY: number, ctrlKey = false) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseWheel", x: point.x, y: point.y, deltaX: 0, deltaY, modifiers: ctrlKey ? 2 : 0,
  });
  await cdp.detach();
}

const gestureActive = (page: Page) =>
  page.evaluate(() => document.querySelector('[data-map-gesture-active="true"]') !== null);

/**
 * The smoke stub's TTC stations are fixtures, none of them drawn on the
 * authored map. This adds the authored stations, at their prepared dots, so
 * TTC has station names to hover as GO/UP does.
 */
async function withAuthoredTtcStations(page: Page) {
  const geometry = JSON.parse(readFileSync(new URL("../../src/app/map-geometry/ttc.json", import.meta.url), "utf8")) as {
    labels: { stationId: string; name: string }[];
    stations: { id: string; anchors: { x: number; y: number }[] }[];
  };
  const dots = new Map(geometry.stations.map((station) => [station.id, station.anchors[0]]));
  const authored = geometry.labels.flatMap(({ stationId, name }) => {
    const dot = dots.get(`station-${stationId}`);
    return dot ? [{ id: stationId, name, x: dot.x, y: dot.y }] : [];
  });
  await page.route("**/api/stations", async (route) => {
    const data = await (await route.fetch()).json();
    const [template] = data.stations;
    data.stations = [
      ...data.stations,
      ...authored.map(({ id, name, x, y }) => ({
        ...template, id, name, mapX: x, mapY: y, interchange: false,
        hasActiveImpact: false, accessStatus: "available", accessOutageCounts: { elevator: 0, escalator: 0 },
      })),
    ];
    await route.fulfill({ json: data });
  });
}

/** The station details panel; GO/UP's names itself a regional station. */
const stationDetails = (page: Page, name: string) =>
  page.getByRole("complementary", { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( regional)? station details$`) });

/**
 * Gives the demo account a commute on the map's network and returns its label.
 * The account's own commute is on TTC; GO/UP gets Union to Long Branch.
 */
async function withMapCommute(page: Page, network: NetworkId) {
  if (network === "ttc") return "Morning commute";
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
      const leg = {
        ...template.outboundLeg,
        routeLabel: "Union -> Long Branch",
        fromStationId: "union",
        fromStationName: "Union",
        toStationId: "long-branch",
        toStationName: "Long Branch",
        path,
        impact,
      };
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
        outboundLeg: leg,
        returnLeg: undefined,
        path,
        impact,
      });
    }
    await route.fulfill({ response, json: body });
  });
  return "Lakeshore commute";
}

const selectedEmphasis = (page: Page, id?: string) =>
  page.locator(id ? `[data-selected-impact-emphasis="${id}"]` : "[data-selected-impact-emphasis]");

for (const network of MAPS) {
  test.describe(`${network} System Map parity`, () => {
    test.beforeEach(async ({ request }) => {
      await setStubMode(request, "regional-live");
    });

    test.describe("pointer", () => {
      test.skip(({ isMobile }) => isMobile, "mouse hover and wheel");
      test.use({ viewport: { width: 2048, height: 1164 } });

      test("hovering a line alert lights its hover copy; leaving ends it", async ({ page }) => {
        await openMap(page, network);
        const alert = await alertPoint(page, network);
        await page.mouse.move(alert.x, alert.y);
        const hovered = page.locator(`[data-map-hover-impact-id="${alert.id}"][data-map-impact-hovered="true"]`);
        await expect(hovered.first()).toBeAttached();
        const blank = await blankPoint(page, network);
        await page.mouse.move(blank.x, blank.y);
        await expect(page.locator('[data-map-impact-hovered="true"]')).toHaveCount(0);
      });

      test("pressing a line alert selects it; pressing open map clears it", async ({ page }) => {
        await openMap(page, network);
        const alert = await alertPoint(page, network);
        await page.mouse.click(alert.x, alert.y);
        await expect(selectedEmphasis(page, alert.id).first()).toBeAttached();
        await settle(page);
        const blank = await blankPoint(page, network);
        await page.mouse.click(blank.x, blank.y);
        await expect(selectedEmphasis(page)).toHaveCount(0);
      });

      test("a pressed line alert shows no hover outline once the cursor leaves it", async ({ page }) => {
        await openMap(page, network);
        const alert = await alertPoint(page, network);
        await page.mouse.click(alert.x, alert.y);
        await expect(selectedEmphasis(page, alert.id).first()).toBeAttached();
        // The press focused the alert's target; that focus is not a hover,
        // so leaving the alert ends its outline while the selection flashes.
        await settle(page);
        const blank = await blankPoint(page, network);
        await page.mouse.move(blank.x, blank.y, { steps: 6 });
        await expect(page.locator('[data-map-impact-hovered="true"]')).toHaveCount(0);
      });

      test("hovering a station rings it; pressing it opens its details", async ({ page }) => {
        await openMap(page, network);
        const station = await stationPoint(page, network);
        await page.mouse.move(station.x, station.y);
        await expect(page.locator(`${stageSelector(network)} .station-hover-indicator.active`).first()).toBeAttached();
        await page.mouse.click(station.x, station.y);
        await expect(stationDetails(page, station.name)).toBeVisible();
        await expect(page.locator(`${stageSelector(network)} .station-hover-indicator.active`)).toHaveCount(0);
      });


      test("pressing an overlap badge opens the chooser; a choice selects its alert; Escape closes it", async ({ page }) => {
        await openMap(page, network);
        const badge = await badgePoint(page, network);
        await page.mouse.click(badge.x, badge.y);
        const chooser = page.getByRole("dialog", { name: /^Choose Alert on / });
        await expect(chooser).toBeVisible();
        const choices = chooser.locator(".overlap-chooser-choice");
        expect(await choices.count()).toBeGreaterThan(1);
        await page.keyboard.press("Escape");
        await expect(chooser).toHaveCount(0);

        // Focus returns to the badge, which pans it clear of the map's controls if they cover it.
        await settle(page);
        const again = await badgePoint(page, network);
        await page.mouse.click(again.x, again.y);
        await expect(chooser).toBeVisible();
        await chooser.locator(".overlap-chooser-choice").first().click();
        await expect(chooser).toHaveCount(0);
        await expect(selectedEmphasis(page).first()).toBeAttached();
      });

      test("a wheel notch zooms 1.1 times about the pointer, and a notch back undoes it", async ({ page }) => {
        await openMap(page, network);
        const point = await blankPoint(page, network);
        const before = await camera(page, network);
        const anchor = await stageFractionAt(page, network, point);
        await wheelAt(page, point, -100);
        await settle(page);
        const zoomed = await camera(page, network);
        expect(zoomed.scale / before.scale).toBeCloseTo(1.1, 2);
        // The map point under the pointer stays under it (within 1.5 screen px).
        const anchorAfter = await stageFractionAt(page, network, point);
        expect(Math.abs(anchorAfter.x - anchor.x) * anchorAfter.width).toBeLessThan(1.5);
        expect(Math.abs(anchorAfter.y - anchor.y) * anchorAfter.height).toBeLessThan(1.5);
        await wheelAt(page, point, 100);
        await settle(page);
        const back = await camera(page, network);
        expect(back.scale / before.scale).toBeCloseTo(1, 3);
        expect(Math.abs(back.x - before.x)).toBeLessThan(1.5);
        expect(Math.abs(back.y - before.y)).toBeLessThan(1.5);
      });

      test("a trackpad pinch zooms the map, not the page", async ({ page }) => {
        await openMap(page, network);
        const point = await blankPoint(page, network);
        const before = await camera(page, network);
        await wheelAt(page, point, -40, true);
        await settle(page);
        const after = await camera(page, network);
        expect(after.scale / before.scale).toBeGreaterThan(1.05);
        expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
      });

      test("a slow drag pans by the drag distance and does not glide", async ({ page }) => {
        await openMap(page, network);
        const from = await blankPoint(page, network);
        const before = await camera(page, network);
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(from.x - 120, from.y - 60, { steps: 8 });
        await page.waitForTimeout(200);
        await page.mouse.up();
        await settle(page);
        const after = await camera(page, network);
        expect(after.x - before.x).toBeCloseTo(-120, 0);
        expect(after.y - before.y).toBeCloseTo(-60, 0);
        await expect(selectedEmphasis(page)).toHaveCount(0);
      });

      test("a drag released while moving glides on, then ends the gesture", async ({ page }) => {
        await openMap(page, network);
        await fling(page, await blankPoint(page, network));
        const released = await camera(page, network);
        expect(await gestureActive(page)).toBe(true);
        await expect.poll(() => gestureActive(page), { timeout: 4_000 }).toBe(false);
        const settled = await camera(page, network);
        expect(released.x - settled.x).toBeGreaterThan(40);
        await page.waitForTimeout(200);
        // The final commit may round to a device pixel; nothing keeps moving.
        expect(Math.abs((await camera(page, network)).x - settled.x)).toBeLessThanOrEqual(1);
      });

      test("a press during a glide stops it and selects nothing", async ({ page }) => {
        await openMap(page, network);
        await fling(page, await blankPoint(page, network));
        expect(await gestureActive(page)).toBe(true);
        const target = await alertPoint(page, network, { horizontal: true });
        await page.mouse.click(target.x, target.y);
        const stopped = await camera(page, network);
        await page.waitForTimeout(300);
        expect(Math.abs((await camera(page, network)).x - stopped.x)).toBeLessThan(0.5);
        expect(await gestureActive(page)).toBe(false);
        await expect(selectedEmphasis(page)).toHaveCount(0);

        // The same press with the map at rest selects the alert.
        const atRest = await alertPoint(page, network, { horizontal: true });
        await page.mouse.click(atRest.x, atRest.y);
        await expect(selectedEmphasis(page, atRest.id).first()).toBeAttached();
      });

      test("with reduced motion, a released drag stops where it is released", async ({ page }) => {
        await openMap(page, network, { reducedMotion: true });
        await fling(page, await blankPoint(page, network));
        const released = await camera(page, network);
        await settle(page);
        expect(Math.abs((await camera(page, network)).x - released.x)).toBeLessThan(0.5);
      });
    });

    test.describe("station names", () => {
      test.skip(({ isMobile }) => isMobile, "mouse hover");
      // The service worker would answer the station requests before the route.
      test.use({ serviceWorkers: "block", viewport: { width: 2048, height: 1164 } });

        test("hovering a station lifts its name", async ({ page }) => {
          if (network === "ttc") await withAuthoredTtcStations(page);
          await openMap(page, network);
          await expect(page.locator(".station-label-hit-target").first()).toBeAttached();
          const station = await stationPoint(page, network, { named: true });
          await page.mouse.move(station.x, station.y);
          await expect(page.locator(`${stageSelector(network)} .raster-station-label-text-hover`)).toHaveAttribute("data-hover-active", "true");
        });
    });

    test.describe("keyboard", () => {
      test.skip(({ isMobile }) => isMobile, "desktop keyboard");

      test("a station target takes focus, and Enter opens its details", async ({ page }) => {
        await openMap(page, network);
        const station = await stationPoint(page, network);
        const target = page.locator(`${stageSelector(network)} [aria-label="${station.name} station details"]`).first();
        await target.focus();
        await expect(target).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(stationDetails(page, station.name)).toBeVisible();
      });

      test("keyboard focus on a line alert lights its hover copy", async ({ page }) => {
        await openMap(page, network);
        const alert = await alertPoint(page, network);
        // A key press first, so the focus that follows is keyboard focus.
        await page.keyboard.press("Shift");
        await page.locator(`${stageSelector(network)} .map-segment-hit-target[data-map-impact-id="${alert.id}"]`).first().focus();
        await expect(page.locator(`[data-map-hover-impact-id="${alert.id}"][data-map-impact-hovered="true"]`).first()).toBeAttached();
      });

      test("an overlap badge opens its chooser with Enter, and Escape returns focus to it", async ({ page }) => {
        await openMap(page, network);
        const badge = await badgePoint(page, network);
        const indicator = page.locator(`${stageSelector(network)} .overlap-indicator[aria-label="${badge.label}"]`).first();
        await indicator.focus();
        await page.keyboard.press("Enter");
        const chooser = page.getByRole("dialog", { name: /^Choose Alert on / });
        await expect(chooser).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(chooser).toHaveCount(0);
        await expect(page.locator(`${stageSelector(network)} .overlap-indicator:focus`)).toHaveCount(1);
      });
    });

    test.describe("commute preview", () => {
      test.skip(({ isMobile }) => isMobile, "desktop sign-in path");
      // The service worker would answer the commutes request before the route.
      test.use({ serviceWorkers: "block", viewport: { width: 2048, height: 1164 } });

      test("viewing a commute on the map draws its route, endpoint dots and flashes", async ({ page }) => {
        const commute = await withMapCommute(page, network);
        await openMap(page, network);
        await page.locator('.desktop-nav-rail [data-dest="more"]').click();
        await page.locator(".desktop-more-panel").getByRole("button", { name: "Demo Account" }).click();
        await expect(page.locator('.desktop-nav-rail [data-dest="sign-in"]')).toHaveAttribute("aria-label", "Account, Signed in");
        await page.locator('.desktop-nav-rail [data-dest="commutes"]').click();
        await page.getByRole("button", { name: `View on map for ${commute}` }).click();

        const layer = page.locator(`[data-network-map-layer="${network}"]`);
        const preview = layer.locator("[data-commute-path-preview]");
        await expect(preview).toBeAttached();
        await expect(preview.locator(".commute-path-preview-path")).toHaveAttribute("d", /M/);
        await expect(preview.locator(".commute-path-preview-endpoint")).toHaveCount(2);
        await expect(layer.locator('.station-commute-green-flash[data-commute-path-endpoint="origin"]')).toHaveCount(1);
        await expect(layer.locator('.station-commute-green-flash[data-commute-path-endpoint="destination"]')).toHaveCount(1);
        await page.getByRole("button", { name: /^Back( to My Commutes)?$/ }).first().click();
        await expect(preview).toHaveCount(0);
      });
    });

    test.describe("touch", () => {
      test.skip(({ isMobile }) => !isMobile, "phone taps");

      test("tapping a line alert selects it", async ({ page }) => {
        await openMap(page, network);
        const alert = await alertPoint(page, network, { clearOfStations: true });
        await page.touchscreen.tap(alert.x, alert.y);
        await expect(selectedEmphasis(page, alert.id).first()).toBeAttached();
      });

      test("tapping a station opens its details", async ({ page }) => {
        await openMap(page, network);
        const station = await stationPoint(page, network);
        await page.touchscreen.tap(station.x, station.y);
        await expect(stationDetails(page, station.name)).toBeVisible();
      });

      test("tapping an overlap badge opens the chooser", async ({ page }) => {
        await openMap(page, network);
        const badge = await badgePoint(page, network);
        await page.touchscreen.tap(badge.x, badge.y);
        await expect(page.getByRole("dialog", { name: /^Choose Alert on / })).toBeVisible();
      });
    });
  });
}
