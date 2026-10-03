import { expect, test } from "@playwright/test";
import { installDismissedTransientUi, setStubMode, waitForNetworkTransition } from "./test-support";

test.use({ serviceWorkers: "block" });

for (const touchDelay of [0, 200]) {
  test(`native launch pan stays responsive with ${touchDelay}ms before touch`, async ({ page, request, isMobile, browserName }) => {
    test.skip(!isMobile || browserName !== "chromium", "native Android Chromium input regression");
    await installDismissedTransientUi(page);
    await setStubMode(request, "regional-live");
    const session = await page.context().newCDPSession(page);
    await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.exposeFunction("__launchNativePan", async (point: { x: number; y: number }) => {
      await new Promise(resolve => setTimeout(resolve, touchDelay));
      await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...point, id: 1 }], timestamp: Date.now() / 1000 });
      for (let offset = 10; offset <= 60; offset += 10) {
        await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: point.x + offset, y: point.y, id: 1 }], timestamp: Date.now() / 1000 });
        await new Promise(resolve => setTimeout(resolve, 16));
      }
      await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [], timestamp: Date.now() / 1000 });
    });
    await page.addInitScript(() => {
      const deliveries: number[] = [];
      for (const type of ["pointerdown", "pointermove", "pointerup"]) document.addEventListener(type, event => {
        if ((event as PointerEvent).pointerType === "touch") deliveries.push(performance.now() - event.timeStamp);
      }, true);
      const result = new Promise(resolve => {
        const observer = new MutationObserver(() => {
          if (!document.querySelector(".ttc-map-entrance-reveal--ready")) return;
          const viewport = document.querySelector<HTMLElement>("[data-network-map-layer='ttc'] [data-map-pan-zoom-viewport]")!;
          const stage = viewport.querySelector<HTMLElement>(".ttc-map-stage")!;
          const rect = viewport.getBoundingClientRect();
          const point = { x: rect.left + rect.width * 0.6, y: rect.top + rect.height * 0.4 };
          observer.disconnect();
          const initial = new DOMMatrixReadOnly(stage.style.transform);
          void (window as unknown as { __launchNativePan: (point: { x: number; y: number }) => Promise<void> }).__launchNativePan(point).then(() => {
            requestAnimationFrame(() => resolve({ movement: new DOMMatrixReadOnly(stage.style.transform).e - initial.e, deliveries }));
          });
        });
        observer.observe(document, { subtree: true, attributes: true, childList: true, attributeFilter: ["class"] });
      });
      Object.assign(window, { __launchNativePanResult: result });
    });
    await page.goto("/");
    const result = await page.evaluate(() => (window as unknown as {
      __launchNativePanResult: Promise<{ movement: number; deliveries: number[] }>;
    }).__launchNativePanResult);
    expect(result.movement).toBeCloseTo(60, 0);
    expect(result.deliveries.length).toBeGreaterThan(2);
    expect(Math.max(...result.deliveries)).toBeLessThan(150);
    await session.detach();
  });
}

test("a TTC pan starting on an impact ring reaches the map gesture handler", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "mobile map gesture regression");
  await installDismissedTransientUi(page);
  await setStubMode(request, "regional-live");
  await page.goto("/");
  await expect(page.locator(".ttc-map-stage")).toHaveAttribute("data-raster-map-ready", "true");
  const ring = page.locator(".station-impact-ring[role='button']").first();
  await expect(ring).toBeAttached();
  const movement = await ring.evaluate(async target => {
    const viewport = target.closest("[data-map-pan-zoom-viewport]")!;
    const stage = viewport.querySelector<HTMLElement>(".ttc-map-stage")!;
    const initial = new DOMMatrixReadOnly(stage.style.transform);
    for (const [type, offset] of [["pointerdown", 0], ["pointermove", 60], ["pointerup", 60]] as const) {
      target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: "touch", pointerId: 45,
        clientX: 200 + offset, clientY: 320 }));
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    }
    return new DOMMatrixReadOnly(stage.style.transform).e - initial.e;
  });
  expect(movement).toBeCloseTo(60, 0);
  await expect(page.locator(".station-impact-ring.selected")).toHaveCount(0);
  await ring.dispatchEvent("pointerdown", { pointerType: "touch", pointerId: 46, clientX: 260, clientY: 320 });
  await ring.dispatchEvent("pointerup", { pointerType: "touch", pointerId: 46, clientX: 260, clientY: 320 });
  await expect(ring).toHaveClass(/selected/);
  await expect(page.locator("[data-map-pan-zoom-viewport]")).toHaveAttribute("data-map-gesture-active", "false");
});

for (const network of ["ttc", "regional"] as const) {
  test(`${network} accepts the first pan as soon as its map becomes visible`, async ({ page, request, isMobile, browserName }) => {
    test.skip(!isMobile || browserName !== "chromium", "CPU throttling requires mobile Chromium");
    test.slow();
    await installDismissedTransientUi(page);
    await setStubMode(request, "regional-live");
    const session = await page.context().newCDPSession(page);
    await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.addInitScript(network => {
      localStorage.setItem("linewatch-default-network-v1", network);
      const firstPan = new Promise(resolve => {
        const observer = new MutationObserver(() => {
          const layer = document.querySelector(`[data-network-map-layer='${network}']:not([data-preparing])`);
          const stage = layer?.querySelector<HTMLElement>(".ttc-map-stage, .regional-map-stage");
          const viewport = stage?.closest<HTMLElement>("[data-map-pan-zoom-viewport], .regional-map-viewport");
          if (!stage || !viewport || stage.style.visibility !== "visible") return;
          if (network === "ttc" && !document.querySelector(".ttc-map-entrance-reveal--ready")) return;
          observer.disconnect();
          const initial = new DOMMatrixReadOnly(stage.style.transform);
          const pointer = (type: string, offset: number) => viewport.dispatchEvent(new PointerEvent(type, {
            bubbles: true, pointerType: "touch", pointerId: 145, clientX: 220 + offset, clientY: 340,
          }));
          pointer("pointerdown", 0);
          pointer("pointermove", 60);
          void (async () => {
            await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
            const firstTransform = stage.style.transform;
            const deltaX = new DOMMatrixReadOnly(firstTransform).e - initial.e;
            const activeWhileHeld = (viewport.closest<HTMLElement>(".regional-map") ?? viewport).dataset.mapGestureActive;
            const transforms = new Set<string>();
            for (let frame = 0; frame < 40; frame++) {
              await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
              transforms.add(stage.style.transform);
            }
            const inactiveLayersWhileHeld = document.querySelectorAll(`[data-network-map-layer]:not([data-network-map-layer='${network}'])`).length;
            pointer("pointerup", 60);
            resolve({ deltaX, activeWhileHeld, firstTransform, transforms: [...transforms], inactiveLayersWhileHeld });
          })();
        });
        observer.observe(document, { subtree: true, childList: true, attributes: true });
      });
      Object.assign(window, { __firstVisibleMapPan: firstPan });
    }, network);
    await page.goto("/");
    const result = await page.evaluate(() => (window as unknown as {
      __firstVisibleMapPan: Promise<{ deltaX: number; activeWhileHeld: string; firstTransform: string; transforms: string[]; inactiveLayersWhileHeld: number }>;
    }).__firstVisibleMapPan);
    expect(result.deltaX).toBeCloseTo(60, 0);
    expect(result.activeWhileHeld).toBe("true");
    expect(result.transforms).toEqual([result.firstTransform]);
    // Mounting the inactive map during this first held gesture
    // caused launch-time input stalls even though the final camera was correct.
    expect(result.inactiveLayersWhileHeld).toBe(0);
    await session.detach();
  });

  for (const gesture of ["pan", "pinch"] as const) {
    test(`${network} touch ${gesture} on an overlap badge moves the map, then a tap opens its chooser`, async ({ page, request, isMobile, browserName }) => {
      test.skip(!isMobile || browserName !== "chromium", "native touch injection requires mobile Chromium");
      await installDismissedTransientUi(page);
      await setStubMode(request, "regional-live");
      await page.goto("/");
      if (network === "regional") {
        await page.locator(".mobile-map-network-switch").getByRole("button", { name: "GO/UP", exact: true }).tap();
        await waitForNetworkTransition(page, network);
      }
      const layer = page.locator(`[data-network-map-layer='${network}']`);
      await expect(layer).toHaveAttribute("data-map-ready", "true");
      const badge = layer.locator(".overlap-indicator[role='button']").first();
      const stage = layer.locator(".ttc-map-stage, .regional-map-stage");
      const before = await stage.evaluate(stage => (stage as HTMLElement).style.transform);
      const box = await badge.boundingBox();
      expect(box).not.toBeNull();
      const center = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
      const direction = center.x > page.viewportSize()!.width / 2 ? -1 : 1;
      const points = (offset: number) => gesture === "pan"
        ? [{ x: center.x + offset * direction, y: center.y, id: 1 }]
        : [{ x: center.x - offset * direction, y: center.y, id: 1 },
          { x: center.x + (40 + offset) * direction, y: center.y, id: 2 }];
      const session = await page.context().newCDPSession(page);
      await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...center, id: 1 }] });
      if (gesture === "pinch") await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points(0) });
      for (let offset = 10; offset <= 60; offset += 10) {
        await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: points(offset) });
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
      }
      await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await session.detach();
      const after = await stage.evaluate(stage => (stage as HTMLElement).style.transform);
      const movement = await page.evaluate(({ before, after }) => {
        const initial = new DOMMatrixReadOnly(before);
        const final = new DOMMatrixReadOnly(after);
        return { x: final.e - initial.e, scaleRatio: final.a / initial.a };
      }, { before, after });
      if (gesture === "pan") expect(movement.x).toBeCloseTo(60 * direction, 0);
      else expect(movement.scaleRatio).toBeGreaterThan(2);
      await expect(page.locator("[data-overlap-chooser]")).toHaveCount(0);
      // A browser-generated click at the end of a drag must not become a tap.
      await badge.dispatchEvent("click", { detail: 1 });
      await expect(page.locator("[data-overlap-chooser]")).toHaveCount(0);
      await badge.tap();
      await expect(page.locator("[data-overlap-chooser]")).toBeVisible();
    });
  }
}
