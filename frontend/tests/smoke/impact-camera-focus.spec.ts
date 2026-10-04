import { expect, test, type Page } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";

test.beforeEach(async ({ page, request, isMobile }) => {
  await page.setViewportSize(isMobile ? { width: 360, height: 780 } : { width: 1440, height: 900 });
  await installDismissedTransientUi(page);
  await setStubMode(request, "seeded");
});

async function expectTrackFocused(page: Page, id: string) {
  const viewport = page.locator("[data-map-pan-zoom-viewport]");
  await expect(page.locator(`[data-map-highlight-id="${id}"]`).first()).toBeAttached();
  await expect(viewport).toHaveAttribute("data-map-camera-moving", "false");
  const track = page.locator(`[data-map-impact-id="${id}"] > .asset-alert-path`).first();
  await expect.poll(async () => {
    const [trackBox, viewBox] = await Promise.all([track.boundingBox(), viewport.boundingBox()]);
    if (!trackBox || !viewBox) return false;
    const { panel, inspector } = await page.evaluate(() => {
      const visibleBox = (selector: string) => {
        const element = document.querySelector(selector);
        if (!element || element.getClientRects().length === 0) return null;
        return element.getBoundingClientRect().toJSON();
      };
      return {
        panel: visibleBox("#desktop-sidebar-container"),
        inspector: visibleBox(".mobile-impact-inspector"),
      };
    });
    const left = panel ? Math.max(viewBox.x, panel.x + panel.width) : viewBox.x;
    const bottom = inspector ? Math.min(viewBox.y + viewBox.height, inspector.y) : viewBox.y + viewBox.height;
    const x = (trackBox.x + trackBox.width / 2 - left) / (viewBox.x + viewBox.width - left);
    const y = (trackBox.y + trackBox.height / 2 - viewBox.y) / (bottom - viewBox.y);
    return x > 0.2 && x < 0.8 && y > 0.15 && y < 0.85;
  }, { message: `The selected ${id} track should land centrally in the unobscured map` }).toBe(true);
}

const corridors = [
  { label: "reduced-speed-zone: King to Union", id: "reduced-speed-zone-stub-union-curve" },
  { label: "reduced-speed-zone: Eglinton to Davisville", id: "reduced-speed-zone-stub-zone-south-source" },
  { label: "delay: Spadina to St George", id: "stub-delay-st-george-curve" },
  { label: "delay: Sheppard-Yonge to Don Mills", id: "stub-delay-line-4" },
  { label: "suspension: Stub Station to Stub Terminal", id: "stub-alert-line-1" },
  { label: "suspension: Stub Station to Stub Terminal", id: "stub-active-closure-child-line-1" },
];

for (const corridor of corridors) {
  test(`selecting ${corridor.label} (${corridor.id}) centers its affected track`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await expect(page.locator(".ttc-map-stage")).toHaveAttribute("data-raster-map-ready", "true");
    await page.getByRole("button", { name: corridor.label, exact: true })
      .and(page.locator(`[data-overlay-interaction-target*="${corridor.id}:"]`)).press("Enter");
    await expectTrackFocused(page, corridor.id);
  });
}

test("a planned advisory Map button centers its preview track", async ({ page }) => {
  await page.goto("/?panel=closures");
  await expect(page.locator(".ttc-map-stage")).toHaveAttribute("data-raster-map-ready", "true");
  const id = "stub-upcoming-closure-line-1";
  await page.locator(`[data-impact-card-id="${id}"] .impact-card-map-btn`).click();
  await expectTrackFocused(page, id);
});

test("reduced-motion speed zone focus stays correct when selecting another corridor", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".ttc-map-stage")).toHaveAttribute("data-raster-map-ready", "true");
  for (const corridor of [corridors[0], corridors[1], corridors[0]]) {
    await page.getByRole("button", { name: corridor.label, exact: true }).press("Enter");
    await expectTrackFocused(page, corridor.id);
  }
});

test("mobile rotated speed zone selection keeps its affected track in view", async ({ page, isMobile }) => {
  test.skip(!isMobile, "rotated phone map");
  await page.goto("/?previewTime=2026-08-14T16:00:00.000Z");
  await expect(page.locator(".ttc-map-stage")).toHaveAttribute("data-raster-map-ready", "true");
  await page.getByRole("button", { name: /^Rotate map$/i }).click();
  await expect(page.locator(".linewatch-shell")).toHaveClass(/mobile-map-rotated/);
  for (const corridor of corridors.slice(0, 2)) {
    await page.getByRole("button", { name: corridor.label, exact: true }).press("Enter");
    await expectTrackFocused(page, corridor.id);
  }
});

test("saved commute preview leaves room around its route", async ({ page, isMobile }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" }).first()).toBeVisible();
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("button", { name: "Demo Account", exact: true }).click();
  const card = page.locator('[data-commute-card-id="commute_demo_finch_union"]');
  await expect(card).toBeVisible();
  await card.locator(".commute-route-map-button").click();
  const route = page.locator(".commute-path-preview-path");
  await expect(route).toBeVisible();
  await expect(page.locator("[data-map-pan-zoom-viewport]")).toHaveAttribute("data-map-camera-moving", "false");
  await expect.poll(async () => {
    const bounds = await route.boundingBox();
    const viewport = await page.locator("[data-map-pan-zoom-viewport]").boundingBox();
    if (!bounds || !viewport) return Infinity;
    return Math.max(bounds.width / viewport.width, bounds.height / viewport.height);
  }, { message: "The route should leave visible context around its longest dimension" }).toBeLessThan(0.8);
  await expect(page.locator(".commute-path-preview-chip strong")).toContainText(" → ");
  const arrow = page.locator(".commute-path-preview-chip .commute-route-direction-arrow");
  await expect(arrow).toHaveAttribute("stroke-width", "3");
  if (!isMobile) {
    const banner = page.locator(".commute-path-preview-chip");
    await expect.poll(async () => {
      const bannerBox = (await banner.boundingBox())!;
      const sidebar = (await page.locator("#desktop-sidebar-container").boundingBox())!;
      const viewport = (await page.locator("[data-map-pan-zoom-viewport]").boundingBox())!;
      return Math.abs(bannerBox.x + bannerBox.width / 2 - (sidebar.x + sidebar.width + viewport.x + viewport.width) / 2);
    }).toBeLessThan(2);
    await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
    await expect.poll(async () => {
      const bannerBox = (await banner.boundingBox())!;
      const viewport = (await page.locator("[data-map-pan-zoom-viewport]").boundingBox())!;
      return Math.abs(bannerBox.x + bannerBox.width / 2 - viewport.x - viewport.width / 2);
    }).toBeLessThan(2);
    await page.getByRole("button", { name: "Expand sidebar", exact: true }).click();
  }
  const routeBounds = (await route.boundingBox())!;
  const bannerBounds = (await page.locator(".commute-path-preview-chip").boundingBox())!;
  expect(routeBounds.y + routeBounds.height).toBeLessThan(bannerBounds.y - 8);
  await page.screenshot({ path: `/tmp/linewatch-commute-preview-${isMobile ? "mobile" : "desktop"}.png` });
});

test("card map icon paints the red pin over the blue map", async ({ page, isMobile }) => {
  await page.goto("/?panel=closures");
  const button = page.locator(".impact-card-map-btn--labeled").first();
  await expect(button).toBeVisible();
  await expect(button.locator(".impact-card-map-btn__label")).toHaveText("View");
  const icon = button.locator(".map-pinned-icon");
  expect(await icon.evaluate((svg) => {
    const base = svg.querySelector(".map-pinned-base")!;
    const pin = svg.querySelector(".map-pinned-pin")!;
    return Boolean(base.compareDocumentPosition(pin) & Node.DOCUMENT_POSITION_FOLLOWING)
      && getComputedStyle(base).stroke !== getComputedStyle(pin).stroke;
  })).toBe(true);
  await button.screenshot({ path: `/tmp/linewatch-view-button-${isMobile ? "mobile" : "desktop"}.png` });
});
