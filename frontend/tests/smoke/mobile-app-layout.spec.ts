import { expect, test } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";

test.beforeEach(async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await installDismissedTransientUi(page);
});

test("mobile search, service shortcuts and Saved share the app shell", async ({ page, isMobile }) => {
  test.skip(!isMobile);
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Primary mobile navigation" });
  await expect(nav.getByRole("button")).toHaveCount(4);
  const search = page.getByRole("searchbox", { name: "Station Search" });
  await expect(search).toBeVisible();
  await expect(page.locator(".ttc-map-stage")).toHaveAttribute("data-raster-map-ready", "true");
  await page.waitForTimeout(700);
  await page.screenshot({ path: "/tmp/linewatch-app-map.png", scale: "css" });
  await search.click();
  await expect(page.locator(".station-search-panel")).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: "/tmp/linewatch-app-search-empty.png", scale: "css" });
  await search.fill("Stub");
  await expect(page.locator(".station-search-panel")).toBeVisible();
  await page.waitForTimeout(300);
  const inputBox = (await search.boundingBox())!;
  const panelBox = (await page.locator(".station-search-panel").boundingBox())!;
  const contentBox = (await page.locator(".station-search-amenity-toolbar").boundingBox())!;
  expect(panelBox.y).toBeLessThanOrEqual(inputBox.y);
  expect(contentBox.y).toBeGreaterThan(inputBox.y + inputBox.height);
  await page.screenshot({ path: "/tmp/linewatch-app-search-filled.png", scale: "css" });
  await page.getByRole("button", { name: "Close search", exact: true }).click();
  await nav.getByRole("button", { name: "Saved", exact: true }).click();
  const saved = page.getByRole("navigation", { name: "Saved sections" });
  await expect(saved.getByRole("button", { name: "My Stations" })).toHaveAttribute("aria-current", "page");
  const panel = page.locator(".floating-panel-scroll");
  const navBox = (await nav.boundingBox())!;
  await expect.poll(async () => (await panel.boundingBox())!.x).toBe(0);
  expect((await panel.boundingBox())!.width).toBe(page.viewportSize()!.width);
  await expect.poll(async () => {
    const box = (await panel.boundingBox())!;
    return Math.abs(box.y + box.height - navBox.y);
  }).toBeLessThan(2);
  await saved.getByRole("button", { name: "My Commutes" }).click();
  await expect(saved.getByRole("button", { name: "My Commutes" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("button", { name: "Saved", exact: true })).toHaveAttribute("aria-current", "page");
  await page.screenshot({ path: "/tmp/linewatch-app-saved.png" });
  await nav.getByRole("button", { name: "Map", exact: true }).click();
  await page.getByRole("navigation", { name: "Dashboard shortcuts" }).getByRole("button", { name: "Alert History", exact: true }).click();
  await expect(page.locator(".mobile-view-content-wrapper")).toHaveAttribute("data-active-view", "alert-history");
  await expect(nav.getByRole("button", { name: "More", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".mobile-app-info")).toHaveCount(0);
  await page.screenshot({ path: "/tmp/linewatch-app-delays.png" });
});

test("mobile network switch exposes regional shortcuts without overflow", async ({ page, isMobile }) => {
  test.skip(!isMobile);
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/");
  await page.locator(".mobile-map-network-switch").getByRole("button", { name: "GO/UP", exact: true }).click();
  await expect(page.locator(".linewatch-shell")).toHaveAttribute("data-network", "regional");
  const shortcuts = page.getByRole("navigation", { name: "Dashboard shortcuts" });
  await expect(shortcuts.getByRole("button", { name: "Service Notices", exact: true })).toBeAttached();
  await expect(shortcuts.getByRole("button", { name: "TTC Announcements", exact: true })).toHaveCount(0);
  await shortcuts.getByRole("button", { name: "Service Notices", exact: true }).click();
  await expect(page.locator(".mobile-view-content-wrapper")).toHaveAttribute("data-active-view", "surface-notices");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  await page.screenshot({ path: "/tmp/linewatch-app-regional.png" });
});


test("search clears station inspection and fits above the visual keyboard", async ({ page, isMobile }) => {
  test.skip(!isMobile);
  await page.goto("/");
  await page.getByRole("button", { name: "Stub Station station details" }).dispatchEvent("click");
  await expect(page.locator(".station-detail-panel")).toBeVisible();
  const search = page.getByRole("searchbox", { name: "Station Search" });
  await search.fill("Stub");
  await expect(page.locator(".station-detail-panel")).toHaveCount(0);
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, "height", { configurable: true, get: () => 420 });
    window.visualViewport?.dispatchEvent(new Event("resize"));
  });
  await expect(page.getByRole("navigation", { name: "Primary mobile navigation" })).toBeHidden();
  await expect(search).toBeVisible();
  await expect.poll(async () => {
    const panel = (await page.locator(".station-search-panel").boundingBox())!;
    return panel.y + panel.height;
  }).toBeLessThanOrEqual(421);
  await page.getByRole("button", { name: "Stub Station TTC station search result" }).click();
  await expect(page.locator(".station-detail-panel")).toBeVisible();
  await expect(search).not.toBeFocused();
});

test("Saved remembers the last section across navigation and reloads", async ({ page, isMobile }) => {
  test.skip(!isMobile);
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Primary mobile navigation" });
  const saved = page.getByRole("navigation", { name: "Saved sections" });
  await nav.getByRole("button", { name: "Saved", exact: true }).click();
  await expect(saved.getByRole("button", { name: "My Stations" })).toHaveAttribute("aria-current", "page");

  for (const section of ["My Commutes", "My Stations"]) {
    await saved.getByRole("button", { name: section }).click();
    await nav.getByRole("button", { name: "Map", exact: true }).click();
    await nav.getByRole("button", { name: "Saved", exact: true }).click();
    await expect(saved.getByRole("button", { name: section })).toHaveAttribute("aria-current", "page");
    await page.reload();
    await nav.getByRole("button", { name: "Saved", exact: true }).click();
    await expect(saved.getByRole("button", { name: section })).toHaveAttribute("aria-current", "page");
  }
});

test("mobile search dismisses with a sleek slide out and fade out animation", async ({ page, isMobile }) => {
  test.skip(!isMobile);
  await page.goto("/");
  const search = page.getByRole("searchbox", { name: "Station Search" });
  await search.click();
  const searchPanel = page.locator(".station-search-panel");
  await expect(searchPanel).toBeVisible();
  await expect(searchPanel).toHaveAttribute("data-open", "true");

  const closeBtn = page.getByRole("button", { name: "Close search", exact: true });
  await expect(closeBtn).toBeVisible();

  // Click close and immediately verify closing animation state
  await closeBtn.click();
  await expect(searchPanel).toHaveAttribute("data-closing", "true");
  await expect(searchPanel).toHaveClass(/station-search-panel-closing/);

  // Once exit completes (~220ms), verify panel is closed and shortcuts are restored
  await expect(page.locator(".station-search-panel.open")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Dashboard shortcuts" })).toBeVisible();
  await expect(search).toHaveValue("");
  await expect(search).not.toBeFocused();
});
