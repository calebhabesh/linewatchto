import { expect, test } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";

test.beforeEach(async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await installDismissedTransientUi(page);
});

for (const back of ["card", "browser", "header"] as const) {
  test(`mobile ${back} Back from View in List restores the selected split view`, async ({ page, isMobile }) => {
    test.skip(!isMobile, "mobile split inspector");
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/");
    await page.getByRole("button", { name: "delay: Sheppard-Yonge to Don Mills", exact: true }).dispatchEvent("click");
    const inspector = page.locator("[data-mobile-impact-inspector]");
    await expect(inspector).toContainText("Sheppard-Yonge");
    await inspector.getByRole("button", { name: "Show more map" }).click();
    await inspector.getByRole("button", { name: "View in List" }).click();
    const card = page.locator('[data-impact-card-id="stub-delay-line-4"]');
    await expect(card).toHaveClass(/is-active/);
    for (const theme of ["dark", "light"]) {
      const arrowStrokes = await card.locator(".impact-card-back-icon path").evaluateAll(paths => paths.map(path => getComputedStyle(path).stroke));
      const buttonColor = await card.locator(".impact-card-map-btn").evaluate(button => getComputedStyle(button).color);
      expect(arrowStrokes.length).toBeGreaterThan(0);
      expect(arrowStrokes.every(stroke => stroke === buttonColor)).toBeTruthy();
      if (theme === "dark") await page.getByRole("button", { name: "Switch to light theme" }).click();
    }
    if (back === "card") await card.getByRole("button", { name: /^Back to map:/ }).click();
    else if (back === "header") await page.getByRole("button", { name: "Back", exact: true }).click();
    else await page.goBack();
    await expect(inspector).toContainText("Sheppard-Yonge");
    await expect(inspector.getByRole("button", { name: "Show more details" })).toBeVisible();
    await expect(page.locator('[data-map-highlight-id="stub-delay-line-4"]')).toBeAttached();
    await expect(page.getByRole("heading", { name: "Delays", exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  });
}

test("Current Service detail keeps Map neutral and Back returns to its origin", async ({ page, isMobile }) => {
  if (!isMobile) await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  if (isMobile) await page.getByRole("button", { name: "Expand service sheet" }).click();
  const service = isMobile
    ? page.getByRole("region", { name: "Current Service", exact: true })
    : page.locator(".desktop-status-overview");
  await service.locator('[data-impact-kind="delay"]').first().click();
  const card = page.locator(".alert-card.is-active").first();
  await expect(card).toBeVisible();
  const map = card.locator(".impact-card-map-btn");
  await expect(map).toHaveText("Map");
  await expect(map).not.toHaveClass(/is-active/);
  await expect(map).not.toHaveAttribute("aria-pressed");
  const background = await map.evaluate(el => getComputedStyle(el).backgroundColor);
  expect(background).not.toBe("rgb(29, 78, 216)");
  expect(background).not.toBe("rgb(37, 99, 235)");
  await page.screenshot({ path: `/tmp/linewatch-impact-map-button-${isMobile ? "mobile" : "desktop"}.png` });
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(service).toBeVisible();
  await expect(page.locator("[data-mobile-impact-inspector]")).toHaveCount(0);
});

test("mobile overlapping map details group Back and Close and restore the prior alert", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "mobile inspector header");
  await setStubMode(request, "map-authoritative-overlap");
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/");
  await page.getByRole("button", { name: "delay: Stub Station to Stub Terminal", exact: true }).dispatchEvent("click");
  const inspector = page.locator("[data-mobile-impact-inspector]");
  await expect(inspector.getByRole("heading", { name: "Delay", exact: true })).toBeVisible();
  await inspector.locator(".overlap-impact-ref").first().click();
  const controls = inspector.getByRole("group", { name: "Impact navigation" });
  const back = controls.getByRole("button", { name: "Back to previous impact" });
  const close = controls.getByRole("button", { name: "Unfocus impact" });
  await expect(back).toBeVisible();
  await expect(close).toBeVisible();
  const backBox = await back.boundingBox();
  const closeBox = await close.boundingBox();
  const titleBox = await inspector.locator(".mobile-impact-inspector-title-row").boundingBox();
  expect(backBox && closeBox && titleBox).toBeTruthy();
  expect(closeBox!.x - backBox!.x - backBox!.width).toBeCloseTo(8, 0);
  expect(backBox!.y).toBeCloseTo(closeBox!.y, 0);
  expect(titleBox!.x + titleBox!.width).toBeLessThanOrEqual(backBox!.x);
  await page.screenshot({ path: "/tmp/linewatch-impact-grouped-controls.png" });
  await back.click();
  await expect(inspector.getByRole("heading", { name: "Delay", exact: true })).toBeVisible();
  await expect(page.locator('[data-map-highlight-id="stub-delay-line-1-overlap"]')).toBeAttached();
  await expect(controls.getByRole("button", { name: "Back to previous impact" })).toHaveCount(0);
});

test("overlapping detail Back restores the previous alert", async ({ page, request, isMobile }) => {
  await setStubMode(request, "map-authoritative-overlap");
  if (!isMobile) await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  if (isMobile) await page.getByRole("button", { name: "Expand service sheet" }).click();
  const service = isMobile
    ? page.getByRole("region", { name: "Current Service", exact: true })
    : page.locator(".desktop-status-overview");
  await service.locator('[data-impact-kind="delay"]').filter({ hasText: "Stub Station" }).first().click();
  const original = page.locator(".alert-card.is-active").first();
  const originalId = await original.getAttribute("data-impact-card-id");
  await original.locator(".overlap-impact-ref").first().click();
  await expect(page.locator("[data-impact-card-id].is-active").first()).not.toHaveAttribute("data-impact-card-id", originalId!);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.locator(`[data-impact-card-id="${originalId}"]`)).toHaveClass(/is-active/);
  await expect(page.locator(`[data-impact-card-id="${originalId}"] .impact-card-map-btn`)).toHaveText("Map");
});

for (const view of ["cards", "list"] as const) {
  test(`desktop ${view} Map action becomes Back and clears impact focus`, async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop card focus behavior");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(view => localStorage.setItem("linewatch-impact-list-view-v1", view), view);
    await page.goto("/?panel=closures");
    const id = "stub-upcoming-closure-line-1";
    const card = page.locator(`[data-impact-card-id="${id}"]`);
    const mapAction = view === "cards" ? card.locator(".impact-card-map-btn") : card;
    await expect(mapAction).toContainText("Map");
    await mapAction.click();
    await expect(mapAction).toContainText("Back");
    await expect(page.locator(`[data-map-highlight-id="${id}"]`).first()).toBeAttached();
    await expect(card).toHaveClass(/is-active/);
    const camera = page.locator(".ttc-map-stage");
    await expect(page.locator("[data-map-pan-zoom-viewport]")).toHaveAttribute("data-map-camera-moving", "false");
    const focusedCamera = await camera.getAttribute("style");
    await mapAction.click();
    await expect(mapAction).toContainText("Map");
    await expect(card).not.toHaveClass(/is-active/);
    await expect(page.locator('[data-map-highlight-id]')).toHaveCount(0);
    await expect(page.locator('[data-selected-impact-emphasis]')).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Planned Advisories", exact: true })).toBeVisible();
    await expect(camera).toHaveAttribute("style", focusedCamera!);
    await mapAction.click();
    await expect(mapAction).toContainText("Back");
    await expect(page.locator(`[data-map-highlight-id="${id}"]`).first()).toBeAttached();
  });
}
