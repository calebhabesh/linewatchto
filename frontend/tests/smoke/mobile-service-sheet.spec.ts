import { expect, test } from "@playwright/test";
import { installDismissedTransientUi } from "./test-support";

test("service sheet expands by tap, keyboard and drag without moving the map", async ({ page, isMobile, request }) => {
  test.skip(!isMobile);
  await request.post("http://127.0.0.1:4174/__test/mode", { data: { mode: "seeded" } });
  await installDismissedTransientUi(page);
  await page.goto("/?previewTime=2026-08-14T16:00:00.000Z");
  const sheet = page.locator(".mobile-service-sheet");
  const nav = page.getByRole("navigation", { name: "Primary mobile navigation" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute("data-expanded", "false");
  const navBox = (await nav.boundingBox())!;
  expect(Math.abs(navBox.y + navBox.height - page.viewportSize()!.height)).toBeLessThan(2);
  await expect(page.locator(".ttc-map-stage")).toHaveAttribute("data-raster-map-ready", "true");
  await page.waitForTimeout(500);
  const overviewHeight = await sheet.locator(".mobile-service-sheet-minimum").evaluate(node => node.getBoundingClientRect().height);
  expect(navBox.y - (await sheet.boundingBox())!.y).toBeCloseTo(overviewHeight, 0);
  await expect(page.locator("#mobile-service-sheet-details")).toHaveAttribute("inert");
  await page.screenshot({ path: "/tmp/linewatch-console-peek.png" });
  const camera = page.locator(".ttc-map-stage");
  const before = await camera.getAttribute("style");
  await page.getByRole("button", { name: "Expand service sheet" }).click();
  await expect(sheet).toHaveAttribute("data-snap", "halfway");
  for (const selector of [".mobile-app-shortcuts", ".mobile-app-chip-scroll .site-guide-trigger", ".mobile-map-network-switch", ".mobile-train-toggle", ".mobile-map-controls-group"]) {
    await expect(page.locator(selector)).toBeVisible();
    expect(await page.locator(selector).evaluate(node => getComputedStyle(node).display)).not.toBe("none");
  }
  expect(await page.locator(".mobile-app-topbar").evaluate(node => Number(getComputedStyle(node).zIndex)))
    .toBeLessThan(await sheet.evaluate(node => Number(getComputedStyle(node).zIndex)));
  await expect(page.locator("#mobile-service-sheet-details")).not.toHaveAttribute("inert");
  await page.waitForTimeout(300);
  expect(await camera.getAttribute("style")).toBe(before);
  expect((navBox.y - (await sheet.boundingBox())!.y) / page.viewportSize()!.height).toBeCloseTo(.65, 2);
  await page.screenshot({ path: "/tmp/linewatch-console-expanded.png" });
  const handle = page.locator(".mobile-service-sheet-handle");
  await handle.focus();
  await page.keyboard.press("ArrowDown");
  await expect(sheet).toHaveAttribute("data-expanded", "false");
  await page.waitForTimeout(300);
  const box = (await page.getByRole("button", { name: "Expand service sheet" }).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const layoutHeight = await sheet.evaluate(node => (node as HTMLElement).offsetHeight);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 330, { steps: 12 });
  await expect(sheet).toHaveAttribute("data-dragging", "true");
  expect(await sheet.evaluate(node => (node as HTMLElement).offsetHeight)).toBe(layoutHeight);
  const details = page.locator("#mobile-service-sheet-details");
  await expect(details).not.toHaveAttribute("inert");
  expect(await details.evaluate(node => node.clientHeight)).toBeGreaterThan(300);
  const text = details.getByRole("heading", { name: /Subway & Light Rail/ });
  await expect(text).toBeInViewport();
  await page.screenshot({ path: "/tmp/linewatch-sheet-mid-drag.png" });
  await page.mouse.up();
  await expect(sheet).toHaveAttribute("data-snap", "halfway");
  await handle.press("End");
  await expect(sheet).toHaveAttribute("data-snap", "expanded");
  await page.reload();
  await expect(sheet).toHaveAttribute("data-snap", "expanded");
  await expect.poll(async () => (await sheet.boundingBox())!.y).toBeLessThan(10);
  await page.screenshot({ path: "/tmp/linewatch-console-full.png" });
  await page.getByRole("button", { name: "Stub Station station details" }).dispatchEvent("click");
  await expect(page.locator(".station-detail-panel")).toBeVisible();
  await page.getByRole("button", { name: "Close station details" }).click();
  await expect(sheet).toHaveAttribute("data-snap", "expanded");
  await page.locator(".mobile-service-sheet-handle").press("Home");
  await expect(sheet).toHaveAttribute("data-snap", "overview");
  await page.locator(".mobile-service-sheet-handle").press("ArrowDown");
  await expect(sheet).toHaveAttribute("data-snap", "overview");
  await expect(page.locator("#mobile-service-sheet-details")).toHaveAttribute("inert");
  await page.locator(".mobile-service-sheet-handle").press("ArrowUp");
  await page.locator(".mobile-map-network-switch").getByRole("button", { name: "GO/UP", exact: true }).dispatchEvent("click");
  await expect(page.locator(".linewatch-shell")).toHaveAttribute("data-network", "regional");
  await expect(sheet).toHaveAttribute("data-snap", "halfway");
});

for (const preference of ["system", "app"] as const) {
  test(`station sheet remains draggable with ${preference} reduced motion`, async ({ page, request, isMobile }) => {
    test.skip(!isMobile);
    await installDismissedTransientUi(page);
    await request.post("http://127.0.0.1:4174/__test/mode", { data: { mode: "seeded" } });
    if (preference === "system") await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    if (preference === "app") await page.locator(".linewatch-shell").evaluate(el => el.classList.add("motion-paused"));
    await page.getByRole("button", { name: "Stub Station station details" }).dispatchEvent("click");
    const panel = page.locator(".station-detail-panel");
    await expect(panel).toBeVisible();
    const before = (await panel.boundingBox())!;
    expect(before.y).toBeGreaterThan(page.viewportSize()!.height * .2);
    const handle = page.getByRole("slider", { name: "Adjust station panel height" });
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y - 120, { steps: 10 });
    await page.mouse.up();
    await expect.poll(async () => (await panel.boundingBox())!.y).toBeLessThan(before.y - 60);
    await handle.press("Home");
    await expect.poll(async () => Math.abs((await panel.boundingBox())!.y - before.y)).toBeLessThan(3);
  });
}

test("mobile constellation does not redraw continuously", async ({ page, isMobile }) => {
  test.skip(!isMobile);
  await installDismissedTransientUi(page);
  await page.addInitScript(() => {
    const original = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (this.canvas.classList.contains("constellation-background-canvas")) {
        this.canvas.dataset.testDraws = String(Number(this.canvas.dataset.testDraws ?? 0) + 1);
      }
      return original.apply(this, args);
    };
  });
  await page.goto("/");
  const canvas = page.locator(".constellation-background-canvas");
  await expect(canvas).toBeAttached();
  await expect(canvas).toHaveAttribute("data-test-draws", /[1-9]/);
  await page.waitForTimeout(300);
  const draws = await canvas.getAttribute("data-test-draws");
  await page.waitForTimeout(500);
  expect(await canvas.getAttribute("data-test-draws")).toBe(draws);
});

test("sheet dragging pauses decorative loops and resumes them after settling", async ({ page, isMobile }) => {
  test.skip(!isMobile);
  await installDismissedTransientUi(page);
  await page.goto("/");
  await expect(page.locator(".mobile-service-sheet")).toBeVisible();
  await page.locator(".mobile-bottom-nav").evaluate(element => {
    const effect = element.animate([{ opacity: .99 }, { opacity: 1 }], { duration: 1000, iterations: Infinity });
    effect.id = "test-decoration";
  });
  const state = () => page.evaluate(() => document.getAnimations().find(animation => animation.id === "test-decoration")?.playState);
  const handle = (await page.getByRole("button", { name: "Expand service sheet" }).boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 10);
  await page.mouse.down();
  await expect.poll(state).toBe("paused");
  await page.mouse.move(handle.x + handle.width / 2, handle.y - 200, { steps: 8 });
  await page.mouse.up();
  await expect.poll(state).toBe("running");
});

for (const saved of ["overview", "halfway", "expanded", "invalid", null]) {
  test(`service sheet restores ${saved ?? "missing"} preference without startup motion`, async ({ page, isMobile }) => {
    test.skip(!isMobile);
    await installDismissedTransientUi(page);
    await page.addInitScript(saved => {
      if (saved !== null) localStorage.setItem("linewatch-mobile-service-sheet-snap-v1", saved);
      const samples: { snap: string | undefined; transitioning: boolean }[] = [];
      Object.assign(window, { sheetStartupSamples: samples });
      const sample = () => {
        const sheet = document.querySelector<HTMLElement>(".mobile-service-sheet");
        if (sheet && getComputedStyle(sheet).visibility === "visible") {
          samples.push({
            snap: sheet.dataset.snap,
            transitioning: sheet.getAnimations().some(animation =>
              animation instanceof CSSTransition && animation.transitionProperty === "transform"),
          });
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }, saved);
    await page.goto("/");
    const sheet = page.locator(".mobile-service-sheet");
    const expected = saved === "halfway" || saved === "expanded" ? saved : "overview";
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute("data-snap", expected);
    await page.waitForTimeout(350);
    const samples = await page.evaluate(() =>
      (window as unknown as { sheetStartupSamples: { snap: string; transitioning: boolean }[] }).sheetStartupSamples);
    expect(samples.length).toBeGreaterThan(0);
    expect(samples.every(sample => sample.snap === expected && !sample.transitioning)).toBe(true);
    await sheet.locator(".mobile-service-sheet-handle").press(expected === "expanded" ? "Home" : "End");
    await expect(sheet).toHaveAttribute("data-snap", expected === "expanded" ? "overview" : "expanded");
    expect(await sheet.evaluate(node => getComputedStyle(node).transitionDuration)).not.toBe("0s");
  });
}

test("service sheet enters with slide-up animation when returning to map view", async ({ page, isMobile }) => {
  test.skip(!isMobile);
  await installDismissedTransientUi(page);
  await page.goto("/");
  const sheet = page.locator(".mobile-service-sheet");
  await expect(sheet).toBeVisible();

  // Navigate to Status view
  await page.locator('.mobile-bottom-nav-item[data-nav-key="status"]').click();
  await sheet.waitFor({ state: "detached" });

  // Return to Map view
  await page.locator('.mobile-bottom-nav-item[data-nav-key="map"]').click();
  await sheet.waitFor({ state: "attached" });
  await expect(sheet).toHaveAttribute("data-entering", "true");

  const runningAnimation = await sheet.evaluate(el =>
    el.getAnimations().some(a => a instanceof CSSAnimation && a.animationName === "mobile-service-sheet-enter" && a.playState === "running")
  );
  expect(runningAnimation).toBe(true);

  // After animation settles, data-entering is cleared
  await expect(sheet).not.toHaveAttribute("data-entering", "true");
});

test("mobile menus extend vertically to right below the shortcut pill entries", async ({ page, request, isMobile }) => {
  test.skip(!isMobile);
  await request.post("http://127.0.0.1:4174/__test/mode", { data: { mode: "seeded" } });
  await installDismissedTransientUi(page);
  await page.goto("/?previewTime=2026-08-14T16:00:00.000Z");

  const shortcuts = page.locator(".mobile-app-shortcuts");
  const shortcutsBox = (await shortcuts.boundingBox())!;

  // Test 1: "More" menu expands to right below the shortcuts
  const moreBtn = page.locator('.mobile-bottom-nav-item[data-nav-key="more"]');
  await moreBtn.click();
  const panel = page.locator(".floating-panel-shell");
  await expect(panel).toBeVisible();

  const morePanelBox = (await panel.boundingBox())!;
  const moreGap = morePanelBox.y - (shortcutsBox.y + shortcutsBox.height);
  expect(moreGap).toBeGreaterThanOrEqual(6);
  expect(moreGap).toBeLessThanOrEqual(12);

  // Test 2: Submenu (e.g. Delays) also expands to right below the shortcuts
  const statusBtn = page.locator('.mobile-bottom-nav-item[data-nav-key="status"]');
  await statusBtn.click();
  await page.locator(".mobile-status-sheet .mobile-status-btn-delays").click();
  await expect(panel.getByRole("heading", { name: "Delays" })).toBeVisible();

  const submenuPanelBox = (await panel.boundingBox())!;
  const submenuGap = submenuPanelBox.y - (shortcutsBox.y + shortcutsBox.height);
  expect(submenuGap).toBeGreaterThanOrEqual(6);
  expect(submenuGap).toBeLessThanOrEqual(12);
});

for (const [state, time] of [
  ["cached", "2026-08-14T16:00:00.000Z"],
  ["closing", "2026-08-15T05:45:00.000Z"],
  ["closed", "2026-08-15T08:00:00.000Z"],
]) {
  test(`overview reserves room for ${state} notice without resizing badges`, async ({ page, context, request, isMobile }) => {
    test.skip(!isMobile);
    await request.post("http://127.0.0.1:4174/__test/mode", { data: { mode: "seeded" } });
    await installDismissedTransientUi(page);
    await page.goto("/?previewTime=2026-08-14T16:00:00.000Z");
    const sheet = page.locator(".mobile-service-sheet");
    const badge = sheet.locator(".mobile-status-peek-count-badge").first();
    const controls = page.locator(".mobile-map-controls-group");
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(350);
    const initialBadge = (await badge.boundingBox())!;
    const gridLocator = sheet.locator(".mobile-status-peek-grid");
    const initialRowGap = await gridLocator.evaluate(el => getComputedStyle(el).rowGap);
    expect(initialRowGap).toBe("10px");
    const initialSheet = (await sheet.boundingBox())!;
    const initialControls = (await controls.boundingBox())!;
    const controlGap = initialSheet.y - initialControls.y - initialControls.height;
    if (state === "cached") {
      await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem("linewatch-dashboard-snapshot-v1:ttc")))).toBe(true);
      await context.setOffline(true);
    } else {
      await page.goto(`/?previewTime=${time}`);
      if (state === "closed") await page.getByRole("button", { name: "Peek at Map", exact: true }).click();
    }
    const notice = sheet.locator(".mobile-service-sheet-notice-row");
    await expect(notice).toBeVisible();
    await page.waitForTimeout(400);
    const box = (await sheet.boundingBox())!;
    const noticeBox = (await notice.boundingBox())!;
    const heading = (await sheet.locator(".mobile-service-sheet-heading").boundingBox())!;
    const grid = (await sheet.locator(".mobile-status-peek-grid").boundingBox())!;
    const nav = (await page.locator(".mobile-bottom-nav").boundingBox())!;
    const badgeBox = (await badge.boundingBox())!;
    const controlsBox = (await controls.boundingBox())!;
    expect(await gridLocator.evaluate(el => getComputedStyle(el).rowGap)).toBe(initialRowGap);
    expect(badgeBox.height).toBeCloseTo(initialBadge.height, 0);
    expect(badgeBox.width).toBeCloseTo(initialBadge.width, 0);
    expect(initialSheet.y - box.y).toBeCloseTo(noticeBox.height + 15, 0);
    expect(noticeBox.y - heading.y - heading.height).toBeCloseTo(15, 0);
    expect(grid.y - noticeBox.y - noticeBox.height).toBeCloseTo(15, 0);
    expect(grid.y + grid.height).toBeLessThan(nav.y);
    expect(box.y - controlsBox.y - controlsBox.height).toBeCloseTo(controlGap, 0);
    await page.screenshot({ path: `/tmp/linewatch-sheet-${state}.png` });
  });
}
