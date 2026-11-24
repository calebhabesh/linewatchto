import { expect, test, type Page } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";

type Frame = { diagram: number; geographic: number; layers: number };
declare global { interface Window { __mapViewFrames?: Frame[] } }

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
});
