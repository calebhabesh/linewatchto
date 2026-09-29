import { expect, test, type Locator } from "@playwright/test";
import { setStubMode } from "./test-support";

async function expectOpaque(surface: Locator) {
  await expect(surface).toBeVisible();
  const color = await surface.evaluate(element => getComputedStyle(element).backgroundColor);
  expect(color).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
}

for (const theme of ["light", "dark", "high-contrast"]) {
  test(`reading surfaces stay opaque in ${theme}`, async ({ page, request, isMobile }) => {
    await setStubMode(request, "seeded");
    await page.addInitScript(() => {
      localStorage.setItem("linewatch-welcome-seen-v1", "true");
      localStorage.setItem("linewatch-unofficial-notice-ack-v1", "true");
      localStorage.setItem("linewatch-pwa-install-dismissed-at-v1", String(Date.now()));
    });
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
      await expectOpaque(sheet);
      await page.screenshot({ path: `/tmp/linewatch-sheet-${theme}.png` });
    } else {
      const service = page.getByRole("region", { name: "Current Service", exact: true });
      const expectServiceOpaque = async () => {
        const style = await service.evaluate(element => {
          const surface = getComputedStyle(element, "::before");
          return { color: surface.backgroundColor, image: surface.backgroundImage, mask: surface.maskImage, blur: surface.backdropFilter };
        });
        expect(style.color).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
        expect(style.image).toBe("none");
        if (theme === "high-contrast") expect(style.mask).toBe("none");
        else expect(style.mask).toContain("linear-gradient");
        expect(style.blur).toBe("none");
        await expectOpaque(service.locator(".current-service-handle-container"));
      };
      await expectServiceOpaque();
      await service.getByRole("button", { name: "Expand current service sheet" }).click();
      await expect(service).toHaveAttribute("data-expanded", "true");
      await expectServiceOpaque();
      await page.screenshot({ path: `/tmp/linewatch-desktop-sheet-${theme}.png` });
      await service.getByRole("button", { name: "Collapse current service sheet" }).click();
      await page.getByRole("button", { name: "Toggle menu" }).click();
      await expectOpaque(page.locator("#linewatch-main-menu"));
      await page.screenshot({ path: `/tmp/linewatch-menu-${theme}.png` });
      await page.getByRole("menuitem", { name: /Suspensions/i }).click();
      await expectOpaque(page.locator(".floating-panel-scroll"));
      await page.screenshot({ path: `/tmp/linewatch-submenu-${theme}.png` });
    }
  });
}
