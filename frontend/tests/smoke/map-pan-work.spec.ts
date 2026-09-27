import { expect, test } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";

test("map camera transforms do not remeasure unrelated sheet scrolling", async ({ page, request, isMobile }) => {
  test.skip(!isMobile);
  await installDismissedTransientUi(page);
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.locator(".ttc-map-stage")).toHaveAttribute("data-raster-map-ready", "true");
  await page.waitForTimeout(500);
  const reads = await page.evaluate(async () => {
    const sheet = document.querySelector(".mobile-service-sheet-details")!;
    const stage = document.querySelector<HTMLElement>(".ttc-map-stage")!;
    const original = Object.getOwnPropertyDescriptor(Element.prototype, "clientHeight")!;
    let count = 0;
    Object.defineProperty(sheet, "clientHeight", { configurable: true, get() { count++; return original.get!.call(this); } });
    const saved = stage.style.transform;
    try {
      for (let i = 0; i < 20; i++) {
        stage.style.transform = `${saved} translateX(${i}px)`;
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      }
      return count;
    } finally {
      stage.style.transform = saved;
      Reflect.deleteProperty(sheet, "clientHeight");
    }
  });
  console.log("sheet height reads during 20 camera transforms", reads);
  expect(reads).toBe(0);
});

test("both map compasses use explicit theme fills without image filters", async ({ page, request, isMobile }) => {
  test.skip(!isMobile);
  await installDismissedTransientUi(page);
  await setStubMode(request, "regional-live");
  for (const theme of ["dark", "light"]) {
    await page.addInitScript(theme => localStorage.setItem("linewatch-theme-v1", theme), theme);
    await page.goto("/");
    for (const network of ["ttc", "regional"]) {
      if (network === "regional") {
        await page.locator(".mobile-map-network-switch").getByRole("button", { name: "GO/UP", exact: true }).click();
      }
      const compass = page.locator('[aria-label="Cardinal North Compass"]');
      await expect(compass.locator("path").first()).toHaveCSS("fill", theme === "dark" ? "rgb(255, 255, 255)" : "rgb(0, 0, 0)");
      await expect(compass.locator("svg")).toHaveCSS("filter", "none");
      await expect(compass.locator("image")).toHaveCount(0);
    }
  }
});
