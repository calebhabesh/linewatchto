import { expect, test, type Page } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";

type Frame = { diagram: number; geographic: number; layers: number };
/** One frame of a switch: how far the Map View shows, each map's camera, and the System Map selection's running animations. */
type SwitchFrame = {
  geographic: number;
  mapView: { lng: number; lat: number; zoom: number } | null;
  systemMap: string | null;
  animations: string[];
  switching: boolean;
};
declare global { interface Window { __mapViewFrames?: Frame[]; __mapSwitchFrames?: SwitchFrame[] } }

const previewUrl = "/?previewTime=2026-08-14T16:00:00.000Z";
const toggle = (page: Page) => page.locator(".map-view-toggle-btn:visible").first();
const layers = (page: Page) => page.locator("[data-map-view-layer]");
const layer = (page: Page, view: "diagram" | "geographic") => page.locator(`[data-map-view-layer=${view}]`);

/** A switch has finished: the one layer left is this view's. */
async function settled(page: Page, view: "diagram" | "geographic") {
  await expect(layers(page)).toHaveCount(1);
  await expect(layer(page, view)).not.toHaveAttribute("data-map-view-handoff");
}

/** Records, per frame, how visible each map's drawn artwork is (0 when absent, held out of sight or not yet drawn). */
async function recordFrames(page: Page) {
  await page.evaluate(() => {
    window.__mapViewFrames = [];
    const opacityOf = (element: Element | null | undefined) => {
      let opacity = element ? 1 : 0;
      for (let node = element; node && node !== document.body; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
      return opacity;
    };
    const sample = () => {
      const diagram = document.querySelector("[data-map-view-layer=diagram]");
      const geographic = document.querySelector("[data-map-view-layer=geographic]");
      window.__mapViewFrames!.push({
        diagram: opacityOf(diagram?.querySelector("[data-map-ready=true]:not([data-preparing]) .map-stage[data-raster-map-ready=true]")),
        geographic: opacityOf(geographic?.querySelector(".geographic-network-map[data-status=ready] canvas")),
        layers: document.querySelectorAll("[data-map-view-layer]").length,
      });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

test.describe("System Map and Map View switch", () => {
  test.use({ serviceWorkers: "block" });

  test.beforeEach(async ({ page, request, isMobile }) => {
    await setStubMode(request, "seeded");
    await installDismissedTransientUi(page);
    await page.setViewportSize(isMobile ? { width: 360, height: 780 } : { width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.addInitScript(() => localStorage.setItem("linewatch-map-view-v1", "diagram"));
    // A fixture basemap, served late enough that the Map View takes a while to draw.
    await page.route("https://tiles.openfreemap.org/styles/*", async route => {
      await new Promise(resolve => setTimeout(resolve, 400));
      await route.fulfill({ json: {
        version: 8, sources: {}, glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
        layers: [{ id: "fixture-base", type: "background", paint: { "background-color": "#e5edf0" } }],
      } });
    });
    await page.route("https://tiles.openfreemap.org/fonts/**", route => route.fulfill({ body: Buffer.alloc(0), contentType: "application/x-protobuf" }));
    await page.goto(previewUrl);
    await expect(layer(page, "diagram").locator("[data-network-map-layer=ttc]")).toHaveAttribute("data-map-ready", "true");
  });

  test("a drawn map stays on screen throughout, in both directions", async ({ page }) => {
    await recordFrames(page);
    for (const view of ["geographic", "diagram"] as const) {
      await page.evaluate(() => { window.__mapViewFrames!.length = 0; });
      await toggle(page).click();
      await expect(layers(page)).toHaveCount(2);
      await settled(page, view);
      const frames = await page.evaluate(() => window.__mapViewFrames!.slice());
      // Either one map is fully drawn, or the Map View is part-faded over a fully drawn System Map.
      expect(frames.filter(frame => Math.max(frame.diagram, frame.geographic) < 0.99)).toEqual([]);
      expect(frames.some(frame => frame.diagram > 0.99 && frame.geographic > 0.05 && frame.geographic < 0.95)).toBe(true);
    }
  });

  test("the view being prepared or replaced takes no input, and only one toolbar shows", async ({ page, isMobile }) => {
    await toggle(page).click();
    await expect(layer(page, "geographic")).toHaveAttribute("data-map-view-handoff", "entering");
    for (const view of ["diagram", "geographic"] as const) await expect(layer(page, view)).toHaveAttribute("inert", "");
    if (!isMobile) await expect(page.locator(".desktop-map-control-rail:visible")).toHaveCount(1);
    await settled(page, "geographic");
    await expect(layer(page, "geographic")).not.toHaveAttribute("inert");
    if (!isMobile) {
      await expect(page.locator(".desktop-map-control-rail:visible")).toHaveCount(1);
      await expect(page.locator(".map-view-layers-row .map-layer-switch").first()).toBeVisible();
    }
  });

  test("switching back before the Map View has drawn keeps the same System Map", async ({ page, isMobile }) => {
    test.skip(!isMobile, "the desktop toolbar is out of use during a switch");
    const stage = await page.locator("[data-network-map-layer=ttc] .map-stage").elementHandle();
    await toggle(page).click();
    await expect(layer(page, "geographic")).toHaveAttribute("data-map-view-handoff", "entering");
    await toggle(page).click();
    await settled(page, "diagram");
    await expect(layer(page, "diagram")).not.toHaveAttribute("inert");
    expect(await stage!.evaluate(element => element.isConnected)).toBe(true);
  });

  test("a network switch during a view switch ends on the Map View of the new network", async ({ page, isMobile }) => {
    await toggle(page).click();
    await expect(layer(page, "geographic")).toHaveAttribute("data-map-view-handoff", "entering");
    // The desktop sidebar and the phone both keep a network switch outside the map layers.
    await page.locator(isMobile ? ".mobile-map-network-switch .network-btn-regional" : ".desktop-sidebar-container .network-btn-regional").first().click();
    await expect(page.locator(".linewatch-shell")).toHaveAttribute("data-network", "regional");
    await settled(page, "geographic");
    await expect(page.locator(".geographic-network-map")).toHaveAttribute("data-network", "regional");
    await expect(page.locator(".geographic-network-map")).toHaveAttribute("data-status", "ready");
  });

  test("a stored Map View opens on its own, without a System Map behind it", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("linewatch-map-view-v1", "geographic"));
    await page.reload();
    await expect(layer(page, "geographic")).toHaveCount(1);
    await expect(layers(page)).toHaveCount(1);
    await expect(layer(page, "geographic")).not.toHaveAttribute("data-map-view-handoff");
    await expect(page.locator(".geographic-network-map")).toHaveAttribute("data-status", "ready");
  });

  test("with reduced motion the maps swap without a fade", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await recordFrames(page);
    await toggle(page).click();
    await settled(page, "geographic");
    const frames = await page.evaluate(() => window.__mapViewFrames!.slice());
    expect(frames.filter(frame => Math.max(frame.diagram, frame.geographic) < 0.99)).toEqual([]);
    expect(frames.some(frame => frame.geographic > 0.05 && frame.geographic < 0.95)).toBe(false);
  });

  test("a Map View that never draws is shown after the wait, not held back for good", async ({ page }) => {
    await page.route("https://tiles.openfreemap.org/styles/*", () => undefined);
    await toggle(page).click();
    await settled(page, "geographic");
    await expect(toggle(page)).toBeEnabled();
  });

  test.describe("with a selection open", () => {
    // Phones hide the toggle while something is selected.
    test.beforeEach(({ isMobile }) => test.skip(isMobile, "desktop toolbar"));

    const alertId = "stub-delay-line-4";
    const otherAlertId = "stub-delay-st-george-curve";
    const viewAlert = (page: Page, id: string) => page.locator(`[data-impact-card-id="${id}"] .impact-card-map-btn`);
    /** Opens the Delays list with two delays that both maps draw, and selects the first. */
    const selectAlert = async (page: Page) => {
      await page.route("**/api/dashboard?network=ttc*", async (route) => {
        const response = await route.fetch();
        const body = await response.json();
        const segments = new Map(body.map.segments.map((segment: { id: string }) => [segment.id, segment]));
        Object.assign(segments.get("line-4-sheppard-yonge-don-mills")!, { id: "line-1-tmu-college", lineId: "line-1" });
        Object.assign(segments.get("stub-line-1-spadina-st-george")!, { id: "line-1-spadina-st-george" });
        await route.fulfill({ response, json: body });
      });
      await page.goto(`${previewUrl}&panel=delays`);
      await expect(layer(page, "diagram").locator("[data-network-map-layer=ttc]")).toHaveAttribute("data-map-ready", "true");
      await viewAlert(page, alertId).click();
      await expect(page.locator(`[data-map-highlight-id="${alertId}"]`).first()).toBeAttached();
      await systemMapAtRest(page, "ttc");
    };

    async function systemMapAtRest(page: Page, network: "ttc" | "regional") {
      await page.waitForTimeout(150); // the flight has begun
      await expect(page.locator(`[data-system-map=${network}]`)).toHaveAttribute("data-map-camera-moving", "false");
    }

    /** Records both maps' cameras, every frame. */
    async function recordSwitch(page: Page) {
      await page.evaluate(() => {
        const first = !window.__mapSwitchFrames;
        window.__mapSwitchFrames = [];
        if (!first) return;
        const sample = () => {
          const system = document.querySelector("[data-network-map-layer]:not([data-preparing]) .system-map");
          const stage = system?.querySelector(".map-stage");
          const canvas = document.querySelector(".geographic-network-map[data-status=ready] canvas");
          const layers = [...document.querySelectorAll("[data-map-view-layer]")];
          let geographic = canvas ? 1 : 0;
          for (let node: Element | null = canvas; node && node !== document.body; node = node.parentElement) {
            geographic *= Number(getComputedStyle(node).opacity);
          }
          const camera = canvas ? window.__linewatchGeographicMapLifecycle?.getCamera() ?? null : null;
          window.__mapSwitchFrames!.push({
            geographic,
            mapView: camera ? { lng: camera.lng, lat: camera.lat, zoom: camera.zoom } : null,
            systemMap: stage && stage.getAttribute("data-raster-map-ready") === "true" ? getComputedStyle(stage).transform : null,
            animations: [...(system?.querySelectorAll(".map-selection-attention") ?? [])]
              .flatMap((element) => element.getAnimations())
              .filter((animation) => animation.playState === "running")
              .map((animation) => (animation as CSSAnimation).animationName ?? ""),
            switching: layers.length > 1,
          });
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
    }

    /** Toggles, and returns every frame from the press until well after the switch (a flight would be under way). */
    async function switchView(page: Page, view: "diagram" | "geographic") {
      await recordSwitch(page);
      await toggle(page).click();
      await expect(layer(page, view)).toHaveCount(1);
      await settled(page, view);
      await page.waitForTimeout(900);
      return page.evaluate(() => window.__mapSwitchFrames!.slice());
    }

    /** How far the Map View's camera moves over these frames, in degrees and zoom levels. */
    function mapViewTravel(frames: SwitchFrame[]) {
      const cameras = frames.filter((frame) => frame.geographic > 0.02 && frame.mapView).map((frame) => frame.mapView!);
      expect(cameras.length).toBeGreaterThan(10);
      const span = (values: number[]) => Math.max(...values) - Math.min(...values);
      return Math.max(span(cameras.map((c) => c.lng)), span(cameras.map((c) => c.lat)), span(cameras.map((c) => c.zoom)) / 100);
    }

    /** The Map View came up already framed on the selection, and stayed there. */
    function expectMapViewInPlace(frames: SwitchFrame[], minZoom: number) {
      expect(mapViewTravel(frames)).toBeLessThan(0.0002);
      expect(frames.at(-1)!.mapView!.zoom).toBeGreaterThan(minZoom);
    }

    /** The System Map came up already framed on the selection, and stayed there. */
    function expectSystemMapInPlace(frames: SwitchFrame[]) {
      // The Map View is opaque until it starts to fade, and gone at once with
      // reduced motion, so earlier frames are out of sight.
      const revealed = frames.findIndex((frame) => frame.geographic < 0.98 && frame.systemMap);
      expect(revealed).toBeGreaterThan(0);
      const transforms = frames.slice(revealed).map((frame) => frame.systemMap);
      expect(transforms.length).toBeGreaterThan(10);
      const cameras = transforms.map((transform) => transform!.match(/-?[\d.]+/g)!.map(Number));
      const last = cameras.at(-1)!;
      for (const camera of cameras) {
        expect(Math.abs(camera[0] - last[0])).toBeLessThan(0.001);
        expect(Math.hypot(camera[4] - last[4], camera[5] - last[5])).toBeLessThan(1);
      }
    }

    test("an alert stays framed as the maps change, in both directions", async ({ page }) => {
      await selectAlert(page);
      const framed = await page.locator("[data-system-map=ttc] .map-stage").evaluate((stage) => getComputedStyle(stage).transform);

      const toMapView = await switchView(page, "geographic");
      expectMapViewInPlace(toMapView, 13);
      const bounds = await page.evaluate((id) => window.__linewatchGeographicMapLifecycle!.getProjectedSelectionBounds(`delay:${id}`), alertId);
      expect(bounds).not.toBeNull();
      const sidebar = (await page.locator("#desktop-sidebar-container").boundingBox())!;
      expect(bounds!.left).toBeGreaterThan(sidebar.x + sidebar.width);
      expect(bounds!.right).toBeLessThan(1440);
      expect(bounds!.top).toBeGreaterThan(60);
      expect(bounds!.bottom).toBeLessThan(900);

      const back = await switchView(page, "diagram");
      expectSystemMapInPlace(back);
      const reframed = await page.locator("[data-system-map=ttc] .map-stage").evaluate((stage) => getComputedStyle(stage).transform);
      const numbers = (transform: string) => transform.match(/-?[\d.]+/g)!.map(Number);
      numbers(reframed).forEach((value, index) => expect(Math.abs(value - numbers(framed)[index])).toBeLessThan(2));
    });

    test("the selection pulses on without the fast flash, in both directions", async ({ page }) => {
      await selectAlert(page);
      await switchView(page, "geographic");
      const frames = await switchView(page, "diagram");
      const animations = new Set(frames.flatMap((frame) => frame.animations));
      expect([...animations]).toEqual(["map-selection-path-breathe"]);
      // A selection made here still flashes.
      await viewAlert(page, otherAlertId).click();
      await expect.poll(() => page.locator(`[data-system-map=ttc] .map-selection-attention`).evaluateAll((elements) => elements
        .flatMap((element) => element.getAnimations()).some((animation) => (
          (animation as CSSAnimation).animationName === "map-selection-path-intro" && animation.playState === "running"
        )))).toBe(true);
    });

    for (const view of ["diagram", "geographic"] as const) {
      test(`viewing an alert that is already framed flashes at once (${view})`, async ({ page }) => {
        await selectAlert(page);
        if (view === "geographic") await switchView(page, "geographic");
        const button = viewAlert(page, alertId);
        // Back keeps the camera; View then has nothing to move.
        await button.click();
        await expect(button).toContainText("View");
        await page.waitForTimeout(600);
        const { waited, moved } = await button.evaluate((element, id) => new Promise<{ waited: number; moved: boolean }>((resolve) => {
          const started = performance.now();
          let moved = false;
          const check = () => {
            moved ||= Boolean(window.__linewatchGeographicMapLifecycle?.isMoving())
              || document.querySelector<HTMLElement>("[data-system-map=ttc]")?.dataset.mapCameraMoving === "true";
            // The card glows on the flash's clock (selection-intro-sync.ts).
            const glow = [...document.querySelectorAll(`[data-impact-card-id="${id}"]`)]
              .flatMap((card) => card.getAnimations({ subtree: true }))
              .find((animation) => (animation as CSSAnimation).animationName === "selection-card-glow");
            const waited = performance.now() - started;
            if (glow || waited > 3000) resolve({ waited, moved });
            else requestAnimationFrame(check);
          };
          (element as HTMLElement).click();
          requestAnimationFrame(check);
        }), alertId);
        expect(moved).toBe(false);
        expect(waited).toBeLessThan(400);
      });
    }

    test("a station stays framed as the maps change, in both directions", async ({ page }) => {
      await page.goto(`${previewUrl}&network=ttc&station=finch`);
      await expect(page.locator(".station-detail-panel")).toBeVisible();
      await expect(page.locator("[data-system-map=ttc] [data-map-selected-station-id=finch]")).toBeAttached();
      await systemMapAtRest(page, "ttc");
      expectMapViewInPlace(await switchView(page, "geographic"), 13);
      expectSystemMapInPlace(await switchView(page, "diagram"));
    });

    test("a commute preview stays framed as the maps change, in both directions", async ({ page }) => {
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByRole("button", { name: "Demo Account", exact: true }).click();
      await page.locator('[data-commute-card-id="commute_demo_finch_union"] .commute-route-map-button').click();
      await expect(page.locator(".commute-path-preview-path")).toBeVisible();
      await systemMapAtRest(page, "ttc");
      expectMapViewInPlace(await switchView(page, "geographic"), 10.5);
      expectSystemMapInPlace(await switchView(page, "diagram"));
    });

    test("a GO/UP alert stays framed as the maps change, in both directions", async ({ page, request }) => {
      await setStubMode(request, "regional-live");
      await page.locator(".desktop-sidebar-container .network-btn-regional").first().click();
      await expect(page.locator(".linewatch-shell")).toHaveAttribute("data-network", "regional");
      await expect(page.locator(".network-map-transition-surface")).not.toHaveAttribute("data-map-surface-transition");
      await page.locator("[data-system-map=regional] [data-overlay-interaction-target]").first().press("Enter");
      await systemMapAtRest(page, "regional");
      const frames = await switchView(page, "geographic");
      expect(mapViewTravel(frames)).toBeLessThan(0.0002);
      expect(await page.evaluate(() => window.__linewatchGeographicMapLifecycle!.events.some((event) => event.type === "focus"))).toBe(true);
      expectSystemMapInPlace(await switchView(page, "diagram"));
    });

    test("a surface stop left open comes back framed on the Map View", async ({ page }) => {
      await page.goto(`${previewUrl}&stop=465`);
      await settled(page, "geographic");
      await expect(page.locator("[data-surface-stop-panel]")).toBeVisible();
      await expect.poll(() => page.evaluate(() => window.__linewatchGeographicMapLifecycle?.getCamera()?.zoom ?? 0)).toBeGreaterThan(15);
      await expect.poll(() => page.evaluate(() => window.__linewatchGeographicMapLifecycle!.isMoving())).toBe(false);
      await switchView(page, "diagram");
      await expect(page.locator("[data-surface-stop-panel]")).toBeVisible();
      expectMapViewInPlace(await switchView(page, "geographic"), 15);
    });

    test("an alert chosen while the Map View is being prepared is flown to", async ({ page }) => {
      await selectAlert(page);
      await recordSwitch(page);
      await toggle(page).click();
      await expect(layer(page, "geographic")).toHaveAttribute("data-map-view-handoff", "entering");
      await viewAlert(page, otherAlertId).click();
      await settled(page, "geographic");
      await expect.poll(() => page.evaluate(() => window.__linewatchGeographicMapLifecycle!.events
        .filter((event) => event.type === "focus").map((event) => event.detail).at(-1))).toContain(otherAlertId);
      // In steps: a flight, not a jump.
      await expect.poll(() => page.evaluate(() => window.__linewatchGeographicMapLifecycle!.isMoving())).toBe(false);
      const steps = await page.evaluate(() => new Set(window.__mapSwitchFrames!.flatMap((frame) => frame.mapView?.lng.toFixed(5) ?? [])).size);
      expect(steps).toBeGreaterThan(5);
    });

    test("with reduced motion an alert is framed without a flight or a fade", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await selectAlert(page);
      expectMapViewInPlace(await switchView(page, "geographic"), 13);
      expectSystemMapInPlace(await switchView(page, "diagram"));
    });
  });
});
