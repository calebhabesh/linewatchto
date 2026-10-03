import { expect, test, type Page } from "@playwright/test";
import { installDismissedTransientUi, setStubMode, waitForNetworkTransition } from "./test-support";

// Route gates must see the original asset/API requests instead of worker fetches.
test.use({ serviceWorkers: "block" });

async function pinch(page: Page, center: { x: number; y: number }) {
  const session = await page.context().newCDPSession(page);
  const points = (radius: number) => [
    { x: center.x, y: center.y - radius, id: 1 },
    { x: center.x, y: center.y + radius, id: 2 },
  ];
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points(20) });
  for (let radius = 25; radius <= 90; radius += 5) {
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: points(radius) });
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await session.detach();
}

test("first GO/UP switch checks destination service before showing its legend", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "mobile switch regression");
  await installDismissedTransientUi(page);
  await setStubMode(request, "regional-live");
  const networksAtRequest: (string | null)[] = [];
  await page.route("**/api/dashboard?network=regional", async route => {
    networksAtRequest.push(await page.locator(".linewatch-shell").getAttribute("data-network"));
    await route.continue();
  });
  await page.goto("/");
  await expect(page.locator(".ttc-map-stage")).toHaveAttribute("data-raster-map-ready", "true");
  const observation = await page.evaluateHandle(() => {
    const result = { sawUnknown: false };
    const observer = new MutationObserver(() => {
      if (document.querySelector(".mobile-legend-pill--regional .service-tone-unknown")) result.sawUnknown = true;
    });
    observer.observe(document.querySelector(".linewatch-shell")!, { attributes: true, childList: true, subtree: true });
    return { observer, result };
  });
  await page.locator(".mobile-map-network-switch").getByRole("button", { name: "GO/UP", exact: true }).tap();
  await waitForNetworkTransition(page, "regional");
  expect(networksAtRequest).toEqual(["ttc"]);
  expect(await observation.evaluate(({ observer, result }) => {
    observer.disconnect();
    return result.sawUnknown;
  })).toBe(false);
  await observation.dispose();
});

test("pinching mobile map chrome keeps the app viewport at its original scale", async ({ page, request, isMobile, browserName }) => {
  test.skip(!isMobile || browserName !== "chromium", "native touch injection requires mobile Chromium");
  await installDismissedTransientUi(page);
  await setStubMode(request, "regional-live");
  await page.goto("/");
  await expect(page.locator(".ttc-map-stage")).toHaveAttribute("data-raster-map-ready", "true");
  const legend = await page.locator(".mobile-legend-pill").boundingBox();
  expect(legend).not.toBeNull();
  await pinch(page, { x: legend!.x + legend!.width / 2, y: legend!.y + legend!.height / 2 });
  expect(await page.evaluate(() => window.visualViewport!.scale)).toBe(1);
});

test("a slow GO/UP source switches with unknown status and remains usable", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "mobile touch regression");
  await installDismissedTransientUi(page);
  await setStubMode(request, "regional-live");
  let releaseStatus!: () => void;
  const statusGate = new Promise<void>(resolve => { releaseStatus = resolve; });
  await page.route("**/api/dashboard?network=regional", async route => {
    await statusGate;
    await route.continue();
  });
  await page.goto("/");
  await expect(page.locator(".ttc-map-stage")).toHaveAttribute("data-raster-map-ready", "true");
  await page.locator(".mobile-map-network-switch").getByRole("button", { name: "GO/UP", exact: true }).tap();
  await waitForNetworkTransition(page, "regional");
  await expect(page.locator(".mobile-legend-pill--regional .mobile-legend-compact-row.service-tone-unknown")).toHaveCount(8);
  await expect(page.getByRole("button", { name: "Transit line legend", exact: true })).toHaveAttribute("title", /current status unknown/);
  await page.locator(".mobile-legend-pill").getByRole("button", { name: "Transit line legend", exact: true }).tap();
  await expect(page.locator(".mobile-legend-line-list").getByRole("button").first()).toHaveAccessibleName(/current status unknown/);
  releaseStatus();
  await expect(page.locator(".mobile-legend-pill--regional .service-tone-unknown")).toHaveCount(0);
});

for (const { gesture, cpuRate } of [
  { gesture: "pan", cpuRate: 1 },
  { gesture: "pinch", cpuRate: 1 },
  { gesture: "pan", cpuRate: 4 },
  { gesture: "pinch", cpuRate: 4 },
] as const) {
  test(`GO/UP accepts a ${gesture} immediately after switching at ${cpuRate}x CPU slowdown`, async ({ page, request, isMobile, browserName }) => {
    test.skip(!isMobile || browserName !== "chromium", "native touch injection requires mobile Chromium");
    const cpuSession = await page.context().newCDPSession(page);
    if (cpuRate > 1) {
      test.slow();
      await cpuSession.send("Emulation.setCPUThrottlingRate", { rate: cpuRate });
    }
    await installDismissedTransientUi(page);
    await setStubMode(request, "regional-live");
    // Keep the first switch cold even if the idle artwork preloader runs.
    await page.route("**/regional-rail-map.svg*", async route => {
      await expect(page.locator(".linewatch-shell")).toHaveAttribute("data-network-switch-target", "regional", { timeout: 15_000 });
      await route.continue();
    });
    await page.goto("/");
    await expect(page.locator(".ttc-map-stage")).toHaveAttribute("data-raster-map-ready", "true", { timeout: 15_000 });
    const entering = page.evaluate(() => new Promise<{ x: number; y: number; transform: string; mapReady: string | null; rasterReady: string | null }>(resolve => {
      const surface = document.querySelector(".network-map-transition-surface")!;
      const observer = new MutationObserver(() => {
        if (surface.getAttribute("data-map-surface-transition") !== "entering") return;
        observer.disconnect();
        const viewport = surface.querySelector(".regional-map-viewport")!;
        const stage = viewport.querySelector<HTMLElement>(".regional-map-stage")!;
        const rect = viewport.getBoundingClientRect();
        resolve({ x: rect.left + rect.width * 0.6, y: rect.top + rect.height * 0.55, transform: stage.style.transform,
          mapReady: viewport.closest(".network-diagram-layer")!.getAttribute("data-map-ready"),
          rasterReady: stage.getAttribute("data-raster-map-ready") });
      });
      observer.observe(surface, { attributes: true, attributeFilter: ["data-map-surface-transition"] });
    }));
    await page.locator(".mobile-map-network-switch").getByRole("button", { name: "GO/UP", exact: true }).tap();
    const start = await entering;
    expect(start.mapReady).toBe("true");
    expect(start.rasterReady).toBe("true");
    if (gesture === "pinch") {
      await pinch(page, start);
    } else {
      const session = await page.context().newCDPSession(page);
      await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: start.x, y: start.y, id: 1 }] });
      for (let offset = 10; offset <= 60; offset += 10) {
        await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: start.x + offset, y: start.y, id: 1 }] });
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
      }
      await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await session.detach();
    }
    const afterGesture = await page.locator(".regional-map-stage").evaluate(stage => (stage as HTMLElement).style.transform);
    const movement = await page.evaluate(({ before, after }) => {
      const initial = new DOMMatrixReadOnly(before);
      const final = new DOMMatrixReadOnly(after);
      return { deltaX: final.e - initial.e, scaleRatio: final.a / initial.a };
    }, { before: start.transform, after: afterGesture });
    if (gesture === "pan") expect(movement.deltaX).toBeCloseTo(60, 0);
    else expect(movement.scaleRatio).toBeGreaterThan(2);
    expect(await page.evaluate(() => window.visualViewport!.scale)).toBe(1);
    await waitForNetworkTransition(page, "regional");
    // Observe the subsequent frames to catch a deferred entrance/refit replacing the gesture.
    const transforms = await page.locator(".regional-map-stage").evaluate(async stage => {
      const samples: string[] = [];
      for (let frame = 0; frame < 40; frame++) {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        samples.push((stage as HTMLElement).style.transform);
      }
      return [...new Set(samples)];
    });
    expect(transforms).toEqual([afterGesture]);
    await cpuSession.detach();
  });
}
