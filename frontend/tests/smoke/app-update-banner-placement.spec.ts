import { expect, test, type Page } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";

// On phones the update banner sits just above the pull-up service sheet and
// follows it; with no room above the sheet it covers the alert-type grid,
// never the search bar (AppUpdateBanner.tsx, app-update-banner-placement.ts).
async function layout(page: Page) {
  return page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return box.height > 0 ? { top: box.top, bottom: box.bottom } : null;
    };
    const banner = document.querySelector<HTMLElement>(".app-update-banner")!;
    const notice = rect(".mobile-status-peek > .current-service");
    const sheet = rect(".mobile-status-peek")!;
    return {
      placement: banner.dataset.placement ?? null,
      banner: rect(".app-update-banner")!,
      sheetTop: Math.min(sheet.top, notice?.top ?? Number.POSITIVE_INFINITY),
      gridTop: rect(".mobile-status-peek-grid")?.top ?? null,
      topbarBottom: rect(".mobile-app-topbar")?.bottom ?? 0,
      expanded: document.querySelector(".mobile-status-peek")?.getAttribute("data-snap") === "expanded",
    };
  });
}

function expectPlaced(current: Awaited<ReturnType<typeof layout>>) {
  expect(current.placement).not.toBeNull();
  // Never over the search bar and shortcuts (the expanded sheet covers them).
  if (current.topbarBottom < current.sheetTop) expect(current.banner.top).toBeGreaterThanOrEqual(current.topbarBottom);
  if (current.placement === "above-sheet") {
    expect(current.banner.bottom).toBeLessThanOrEqual(current.sheetTop);
    expect(current.sheetTop - current.banner.bottom).toBeLessThan(20);
  } else {
    // No room above the sheet: from the alert-type grid down.
    expect(current.banner.top).toBeGreaterThanOrEqual(Math.min(current.gridTop ?? current.sheetTop, current.sheetTop) - 1);
  }
}

test("the update banner sits above the service sheet and follows it", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "The service sheet is the phone layout");
  await setStubMode(request, "seeded");
  await installDismissedTransientUi(page);
  await page.addInitScript(() => localStorage.setItem("linewatch-mobile-service-sheet-snap-v1", "overview"));
  await page.route("**/version.json?*", route => route.fulfill({ json: {
    appVersion: "9.9.0", buildLabel: "prod-test",
    releaseNote: { version: "9.9.0", title: "A test update", summary: "Placement check for the update banner.", sections: [] },
  } }));
  await page.goto("/");
  await expect(page.locator(".network-diagram-layer[data-network-map-layer=\"ttc\"] [data-system-map=ttc] .map-stage")).toHaveAttribute("data-raster-map-ready", "true");
  await expect(page.locator(".app-update-banner")).toBeVisible();

  const handle = page.locator(".mobile-service-sheet-handle");
  for (const snap of ["overview", "halfway", "expanded"]) {
    await expect(page.locator(".mobile-status-peek")).toHaveAttribute("data-snap", snap);
    await expect.poll(async () => { const current = await layout(page); expectPlaced(current); return true; }).toBe(true);
    const current = await layout(page);
    if (snap === "overview") expect(current.placement).toBe("above-sheet");
    if (snap === "expanded") {
      // Over the alert-type grid.
      expect(current.placement).toBe("over-sheet");
      expect(Math.abs(current.banner.top - current.gridTop!)).toBeLessThanOrEqual(1);
    }
    if (snap !== "expanded") await handle.click();
  }

  // Back to the overview, then drag the sheet up: the banner keeps to its edge mid-drag.
  await page.getByRole("button", { name: "Collapse service sheet" }).click();
  await expect(page.locator(".mobile-status-peek")).toHaveAttribute("data-snap", "overview");
  await page.waitForTimeout(300);
  const box = (await page.getByRole("button", { name: "Expand service sheet" }).boundingBox())!;
  const x = box.x + box.width / 2;
  await page.mouse.move(x, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, box.y - 90, { steps: 8 });
  await expect(page.locator(".mobile-status-peek")).toHaveAttribute("data-dragging", "true");
  await expect.poll(async () => {
    const current = await layout(page);
    return current.placement === "above-sheet" && Math.abs(current.sheetTop - current.banner.bottom - 10) <= 2;
  }).toBe(true);
  await page.mouse.up();

  // Dismissed with Later, it is gone.
  await page.getByRole("button", { name: "Later" }).click();
  await expect(page.locator(".app-update-banner")).toHaveCount(0);
});
