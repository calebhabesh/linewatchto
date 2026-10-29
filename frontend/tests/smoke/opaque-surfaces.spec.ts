import { expect, test, type Locator } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";

// Reading surfaces sit over the busy map, so they must be solid in every theme:
// an opaque background colour and no see-through blur.
async function expectOpaque(surface: Locator) {
  await expect(surface).toBeVisible();
  const style = await surface.evaluate((element) => {
    const computed = getComputedStyle(element);
    return { color: computed.backgroundColor, blur: computed.backdropFilter };
  });
  expect(style.color).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
  expect(style.blur).toBe("none");
}

for (const theme of ["light", "dark", "high-contrast"]) {
  test(`reading surfaces stay opaque in ${theme}`, async ({ page, request, isMobile }) => {
    await installDismissedTransientUi(page);
    await setStubMode(request, "seeded");
    await page.goto("/");
    const shell = page.locator(".linewatch-shell").first();
    await shell.evaluate((element, mode) => {
      element.classList.toggle("dark", mode !== "light");
      element.classList.toggle("high-contrast", mode === "high-contrast");
    }, theme);

    if (isMobile) {
      const sheet = page.locator(".mobile-service-sheet");
      await expectOpaque(sheet);
      await page.getByRole("button", { name: "Expand service sheet" }).click();
      await expect(sheet).toHaveAttribute("data-snap", "halfway");
      await expectOpaque(sheet);
      await sheet.getByRole("button", { name: /Suspensions/ }).first().click();
      await expect(page.getByRole("heading", { name: "Suspensions", exact: true })).toBeVisible();
      await expectOpaque(page.locator('.floating-panel-shell[data-floating-panel="mobile-panel"] .floating-panel-scroll'));
    } else {
      const sidebar = page.locator("#desktop-sidebar-container");
      await expectOpaque(sidebar);
      await expectOpaque(page.locator(".desktop-nav-rail"));
      await page.locator('[data-dest="alerts"]').click();
      await expect(page.getByRole("heading", { name: "Suspensions", exact: true })).toBeVisible();
      await expect(sidebar).toHaveCSS("width", "560px");
      await expectOpaque(sidebar);
    }
  });
}
