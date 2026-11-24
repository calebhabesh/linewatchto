import { expect, test, type Locator } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";

test.beforeEach(async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await installDismissedTransientUi(page);
});

/** Clicks, then reports after two frames whether the panel is gone and what it animates. */
async function clickAndLook(button: Locator, panelSelector: string) {
  return button.evaluate(async (element, selector) => {
    (element as HTMLElement).click();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const panel = document.querySelector(selector);
    return { open: panel !== null, animation: panel ? getComputedStyle(panel).animationName : null };
  }, panelSelector);
}

test("a station panel in the desktop sidebar closes as soon as X is pressed", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop sidebar");
  await page.goto("/");
  await page.getByRole("button", { name: "Stub Station station details" }).press("Enter");
  const panel = page.locator(".desktop-sidebar-container .station-detail-panel");
  await expect(panel).toBeVisible();
  const result = await clickAndLook(panel.getByRole("button", { name: "Close station details" }), ".station-detail-panel");
  expect(result.open).toBe(false);
});

test("a phone impact sheet slides away, or closes at once with Reduce Animations", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone sheet");
  await page.setViewportSize({ width: 360, height: 780 });
  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    await page.emulateMedia({ reducedMotion });
    await page.goto("/");
    await page.getByRole("button", { name: "Expand service sheet" }).click();
    await page.getByRole("region", { name: "Current Service", exact: true }).locator('[data-impact-kind="delay"]').first().click();
    const inspector = page.locator("[data-mobile-impact-inspector]");
    await expect(inspector).toBeVisible();
    const result = await clickAndLook(inspector.getByRole("button", { name: "Close Details", exact: true }), "[data-mobile-impact-inspector]");
    if (reducedMotion === "reduce") expect(result.open).toBe(false);
    else expect(result).toEqual({ open: true, animation: "mobile-sheet-slide-down-exit" });
    await expect(inspector).toHaveCount(0);
  }
});
