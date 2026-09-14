import { expect, test } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";

test.beforeEach(async ({ page, isMobile }) => {
  test.skip(isMobile, "Current Service tests cover desktop layout; mobile is tested in mobile-service-sheet.spec.ts");
  await installDismissedTransientUi(page);
});

test("Current Service appears above the retained badges and opens its exact disruption", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  const panel = page.getByRole("region", { name: "Current Service", exact: true });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Current Service", exact: true })).toBeVisible();
  await expect(panel).not.toContainText("Reduced speed zone");
  await expect(panel.locator(".station-sheet-drag-pill")).toHaveCount(0);
  await expect(panel.locator(".current-service-impact strong").first()).toContainText(/^(Delay|Planned Closure|Active Alert)/);
  const expandBtn = panel.getByRole("button", { name: /Expand current service sheet/ });
  await expect(expandBtn).toBeVisible();
  await expandBtn.click();
  await expect(panel).toHaveAttribute("data-expanded", "true");
  await panel.getByRole("button", { name: /Collapse current service sheet/ }).click();
  await expect(panel).toHaveAttribute("data-expanded", "false");
  const badges = page.locator(isMobile ? ".mobile-status-peek-counts" : ".desktop-status-chip-row");
  await expect(badges).toBeVisible();
  const panelBox = await panel.boundingBox();
  const badgeBox = await badges.boundingBox();
  expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(badgeBox!.y + 22);

  await panel.getByRole("button", { name: /Sheppard-Yonge to Don Mills/ }).click();
  await expect(page.getByRole("heading", { name: "Delays", exact: true })).toBeVisible();
  await expect(page.locator('[data-impact-card-id="stub-delay-line-4"]')).toHaveClass(/highlight-active-card/);
});

test("unavailable data cannot read as clear service", async ({ page, request }) => {
  await setStubMode(request, "unavailable");
  await page.goto("/");
  const panel = page.getByRole("region", { name: "Current Service", exact: true });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Current status unavailable");
  await expect(panel).not.toContainText("No active alerts/delays");
  await expect(panel.locator(".current-service-impact")).toHaveCount(0);
});

test("regional readout has corridor identities and separate service notices", async ({ page, request }) => {
  await setStubMode(request, "regional-live");
  await page.goto("/");
  await page.getByRole("button", { name: "GO/UP", exact: true }).click();
  const panel = page.getByRole("region", { name: "Current Service", exact: true });
  await expect(panel).toContainText(/GO & UP rail/i);
  await expect(panel).toContainText(/Service Notices/i);
  await expect(panel).not.toContainText(/Streetcar \/ Bus Alerts/i);
});

test("readout does not change the map viewport or camera", async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  const panel = page.getByRole("region", { name: "Current Service", exact: true });
  await expect(panel).toBeVisible();
  await expect(page.locator(".ttc-map-stage")).toHaveAttribute("data-raster-map-ready", "true");
  await page.getByRole("button", { name: "Center map view" }).first().click();
  const viewport = page.locator("[data-map-pan-zoom-viewport]");
  const before = await viewport.boundingBox();
  const camera = await page.locator(".ttc-map-stage").evaluate((node) => node.style.transform);
  await panel.evaluate((node) => { node.style.display = "none"; });
  await page.waitForTimeout(200);
  expect(await viewport.boundingBox()).toEqual(before);
  expect(await page.locator(".ttc-map-stage").evaluate((node) => node.style.transform)).toBe(camera);
});

test("current service content stays hidden during map transition and animates in upon completion", async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  const panel = page.getByRole("region", { name: "Current Service", exact: true });
  await expect(panel).toBeVisible();
  const columns = panel.locator(".current-service-columns");
  await expect(columns).toBeVisible();
  await expect(columns).toHaveCSS("opacity", "1");

  // Track opacity samples during the transition
  const transitionOpacitiesPromise = page.evaluate(() => new Promise<number[]>((resolve) => {
    const root = document.documentElement;
    const samples: number[] = [];
    const check = () => {
      const col = document.querySelector(".current-service-columns");
      if (col) {
        samples.push(Number.parseFloat(getComputedStyle(col).opacity));
      }
      if (root.dataset.networkTransitionDirection) {
        // Sample during slide
        requestAnimationFrame(check);
      } else if (samples.length > 0 && samples.some((o) => o === 0)) {
        // Transition finished and had transition samples
        resolve(samples);
      } else {
        requestAnimationFrame(check);
      }
    };
    const observer = new MutationObserver(() => {
      if (root.dataset.networkTransitionPhase === "fade-out" || root.dataset.networkTransitionDirection) {
        observer.disconnect();
        requestAnimationFrame(check);
      }
    });
    observer.observe(root, { attributes: true });
  }));

  await page.getByRole("button", { name: "GO/UP", exact: true }).click();
  const opacities = await transitionOpacitiesPromise;

  // Verify that during the transition phase, opacity dropped to 0
  expect(opacities.some((o) => o === 0)).toBe(true);

  // After transition, it settles at opacity 1
  await expect(columns).toHaveCSS("opacity", "1");
  await expect(panel).toContainText(/GO & UP rail/i);
});


test("desktop service sheet restores clicked and dragged positions after reload", async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  const panel = page.getByRole("region", { name: "Current Service", exact: true });
  await panel.getByRole("button", { name: /Expand current service sheet/ }).click();
  await page.reload();
  await expect(panel).toHaveAttribute("data-expanded", "true");
  await panel.getByRole("button", { name: /Collapse current service sheet/ }).click();
  await page.reload();
  await expect(panel).toHaveAttribute("data-expanded", "false");
  const handle = panel.locator(".current-service-handle");
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 10, { steps: 6 });
  await page.mouse.up();
  const height = await panel.evaluate(node => (node as HTMLElement).style.getPropertyValue("--custom-sheet-height"));
  expect(parseFloat(height)).toBeCloseTo(126, 0);
  await page.reload();
  await expect(panel).toHaveAttribute("data-expanded", "true");
  await expect.poll(() => panel.evaluate(node => (node as HTMLElement).style.getPropertyValue("--custom-sheet-height"))).toBe(height);
});

 test("desktop sheet reveals its restored geometry without a height transition", async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await page.addInitScript(() => localStorage.setItem("linewatch-desktop-service-sheet-position-v1",
    JSON.stringify({ expanded: true, height: 350 })));
  await page.goto("/");
  const panel = page.getByRole("region", { name: "Current Service", exact: true });
  await expect(panel).toHaveAttribute("data-position-ready", "true");
  const list = panel.locator(".current-service-list").first();
  await expect.poll(() => list.evaluate(node => node.clientHeight)).toBe(350);
  await page.waitForTimeout(300);
  expect(await list.evaluate(node => node.clientHeight)).toBe(350);
});
