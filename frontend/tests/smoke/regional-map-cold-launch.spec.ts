import { expect, test } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";

test("GO/UP default map retains overlay interactions after a cold asset load and reload", async ({ page, request, isMobile }) => {
  await installDismissedTransientUi(page);
  await setStubMode(request, "regional-live");
  await page.addInitScript(() => localStorage.setItem("linewatch-default-network-v1", "regional"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  // Make the SVG arrive after the other initialization effects have settled.
  await page.route("**/regional-rail-map.svg*", async (route) => {
    await expect(page.locator(".regional-map-stage")).toHaveAttribute("data-map-label-font-ready", "true");
    await expect(page.locator(".regional-map-stage")).toHaveAttribute("data-raster-map-ready", "true");
    await route.continue();
  });
  for (let load = 0; load < 2; load++) {
    if (load === 0) await page.goto("/");
    else await page.reload();
    const stationId = isMobile ? "pearson-airport" : "bloomington";
    const station = page.locator(`.regional-station-hit-target[data-regional-station-id="${stationId}"]`);
    await expect(station).toBeAttached();
    if (isMobile) {
      await station.tap({ force: true });
      await expect(page.locator('.regional-station-selected-indicator[data-regional-station-selection-id="pearson-airport"]')).toHaveAttribute("data-regional-station-selected", "true");
    } else {
      await station.hover({ force: true });
      await expect(page.locator(".raster-station-label-text-hover")).toHaveAttribute("data-hover-active", "true");
    }
  }
});

test("GO/UP overlap badges stay clear of authored transit lines", async ({ page, request }) => {
  await installDismissedTransientUi(page);
  await setStubMode(request, "regional-live");
  await page.addInitScript(() => localStorage.setItem("linewatch-default-network-v1", "regional"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".regional-map-stage")).toHaveAttribute("data-raster-map-ready", "true");
  await expect(page.locator(".regional-map-stage .overlap-indicator").first()).toBeAttached();
  const collisions = await page.locator(".regional-map-stage").evaluate((stage) => {
    const badges = [...stage.querySelectorAll<SVGGraphicsElement>(".overlap-indicator")];
    const paths = [...stage.querySelectorAll<SVGPathElement>('#regional-lines-layer path[id^="regional-route-"]')];
    if (paths.length === 0) throw new Error("Missing authored transit lines");
    return badges.flatMap((badge) => {
      const box = badge.getBoundingClientRect();
      return paths.flatMap((path) => {
        const matrix = path.getScreenCTM();
        if (!matrix) throw new Error("Missing route geometry");
        const radius = 112 * Math.hypot(matrix.a, matrix.b);
        const length = path.getTotalLength();
        const samples = Math.ceil(length / 32);
        for (let index = 0; index <= samples; index++) {
          const point = path.getPointAtLength(length * index / samples).matrixTransform(matrix);
          if (point.x + radius > box.left && point.x - radius < box.right
            && point.y + radius > box.top && point.y - radius < box.bottom) {
            return [{ badge: badge.getAttribute("aria-label"), line: path.id }];
          }
        }
        return [];
      });
    });
  });
  expect(collisions).toEqual([]);
});
