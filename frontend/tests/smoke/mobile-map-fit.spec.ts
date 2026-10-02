import { expect, test } from "@playwright/test";
import { installDismissedTransientUi } from "./test-support";

const stubUrl = process.env.LINEWATCH_SMOKE_STUB_URL ?? "http://127.0.0.1:4174";
const openMapPreviewUrl = "/?previewTime=2026-08-14T16:00:00.000Z";

for (const network of ["ttc", "regional"] as const) {
  test(`rotated ${network} map fits compact and changing phone viewports`, async ({ page, request, isMobile }, testInfo) => {
    test.skip(!isMobile, "phone viewport regression");
    test.slow();
    await request.post(`${stubUrl}/__test/mode`, { data: { mode: "seeded" } });
    await page.setViewportSize({ width: 393, height: 556 });
    await installDismissedTransientUi(page);
    await page.goto(openMapPreviewUrl);
    if (network === "regional") {
      const switcher = page.locator(".mobile-map-network-switch");
      await expect(switcher).toBeVisible({ timeout: 15_000 });
      await switcher.getByRole("button", { name: "GO/UP", exact: true }).click();
    }
    await expect(page.locator(".linewatch-shell")).toHaveAttribute("data-network", network, { timeout: 15_000 });
    await expect(page.locator("html")).not.toHaveAttribute("data-network-transition-direction", { timeout: 15_000 });
    await expect(page.locator(network === "ttc" ? ".ttc-map-stage" : ".regional-map-stage")).toBeVisible({ timeout: 15_000 });
    const shell = page.locator(".linewatch-shell");
    const viewport = page.locator(network === "ttc" ? "[data-map-pan-zoom-viewport]" : ".regional-map-viewport");
    await page.getByRole("button", { name: "Rotate map" }).click();

    for (const size of [
      { width: 393, height: 556 },
      { width: 393, height: 700 },
      { width: 320, height: 568 },
      { width: 430, height: 932 },
      { width: 393, height: 556 },
    ]) {
      await page.setViewportSize(size);
      await expect(shell).toHaveClass(/mobile-map-rotated/);
      for (const element of [shell, shell.locator(":scope > main"), viewport, page.locator(".rotated-map-ui-surface")]) {
        await expect.poll(async () => {
          const box = await element.boundingBox();
          return box && Object.fromEntries(Object.entries(box).map(([key, value]) => [key, Math.round(value)]));
        }, { message: `${element}: ${size.width}×${size.height}` }).toEqual({ x: 0, y: 0, ...size });
      }
      for (const name of ["Center map", "Exit rotated map"]) {
        const button = page.getByRole("button", { name, exact: true });
        const box = await button.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(size.width + 1);
        expect(box!.y + box!.height).toBeLessThanOrEqual(size.height + 1);
        await button.click({ trial: true });
      }
      await page.getByRole("button", { name: "Center map", exact: true }).click();
    }

    // Simulate asymmetric notch/home-indicator insets in physical screen axes.
    await shell.evaluate((element) => {
      for (const [edge, value] of Object.entries({ top: 47, right: 11, bottom: 34, left: 7 })) {
        (element as HTMLElement).style.setProperty(`--mobile-safe-${edge}`, `${value}px`);
      }
    });
    for (const name of ["Center map", "Exit rotated map"]) {
      const box = await page.getByRole("button", { name, exact: true }).boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(7);
      expect(box!.y).toBeGreaterThanOrEqual(47);
      expect(box!.x + box!.width).toBeLessThanOrEqual(393 - 11);
      expect(box!.y + box!.height).toBeLessThanOrEqual(556 - 34);
    }

    // A real visualViewport event during a gesture must wait for release,
    // then apply a legitimate browser-toolbar resize to camera and HUD alike.
    await viewport.evaluate((element) => {
      element.setAttribute("data-map-gesture-active", "true");
      Object.defineProperty(window.visualViewport!, "height", { configurable: true, value: 456 });
      window.visualViewport!.dispatchEvent(new Event("resize"));
    });
    await page.waitForTimeout(200); // Exercise the deferred viewport retry.
    await expect(shell).toHaveCSS("height", "556px");
    await viewport.evaluate((element) => {
      element.setAttribute("data-map-gesture-active", "false");
      window.dispatchEvent(new PointerEvent("pointerup"));
    });
    await expect(shell).toHaveCSS("height", "456px");
    await expect.poll(async () => Math.round((await page.locator(".rotated-map-ui-surface").boundingBox())!.height)).toBe(456);
    await page.evaluate(() => {
      Reflect.deleteProperty(window.visualViewport!, "height");
      window.visualViewport!.dispatchEvent(new Event("resize"));
    });
    await expect(shell).toHaveCSS("height", "556px");
    await testInfo.attach("rotated-map-393x556", {
      body: await page.screenshot(),
      contentType: "image/png",
    });

  });

  test(`rotated ${network} map preserves the app frame during browser page zoom`, async ({ page, request, isMobile }) => {
    test.skip(!isMobile, "phone viewport regression");
    test.slow();
    await request.post(`${stubUrl}/__test/mode`, { data: { mode: "seeded" } });
    await page.setViewportSize({ width: 393, height: 556 });
    await installDismissedTransientUi(page);
    await page.goto(openMapPreviewUrl);
    if (network === "regional") {
      const switcher = page.locator(".mobile-map-network-switch");
      await expect(switcher).toBeVisible({ timeout: 15_000 });
      await switcher.getByRole("button", { name: "GO/UP", exact: true }).click();
    }
    await expect(page.locator(".linewatch-shell")).toHaveAttribute("data-network", network, { timeout: 15_000 });
    await expect(page.locator("html")).not.toHaveAttribute("data-network-transition-direction", { timeout: 15_000 });
    await expect(page.locator(network === "ttc" ? ".ttc-map-stage" : ".regional-map-stage")).toBeVisible({ timeout: 15_000 });
    const shell = page.locator(".linewatch-shell");
    await page.getByRole("button", { name: "Rotate map" }).click();

    // Browser page zoom must not shrink the app frame a second time, including
    // when the rider enters rotated mode with the page already zoomed.
    await page.evaluate(() => {
      for (const [key, value] of Object.entries({ scale: 2, width: 196.5, height: 278 })) {
        Object.defineProperty(window.visualViewport!, key, { configurable: true, value });
      }
      window.visualViewport!.dispatchEvent(new Event("resize"));
    });
    await expect(shell).toHaveCSS("width", "393px");
    await expect(shell).toHaveCSS("height", "556px");
    await page.getByRole("button", { name: "Exit rotated map", exact: true }).click();
    await page.getByRole("button", { name: "Rotate Map", exact: true }).click();
    await expect(shell).toHaveCSS("width", "393px");
    await expect(shell).toHaveCSS("height", "556px");
    await page.evaluate(() => {
      for (const key of ["scale", "width", "height"]) Reflect.deleteProperty(window.visualViewport!, key);
      window.visualViewport!.dispatchEvent(new Event("resize"));
    });

  });

  test(`rotated ${network} map returns to portrait after physical rotation`, async ({ page, request, isMobile }) => {
    test.skip(!isMobile, "phone viewport regression");
    test.slow();
    await request.post(`${stubUrl}/__test/mode`, { data: { mode: "seeded" } });
    await page.setViewportSize({ width: 393, height: 556 });
    await installDismissedTransientUi(page);
    await page.goto(openMapPreviewUrl);
    if (network === "regional") {
      const switcher = page.locator(".mobile-map-network-switch");
      await expect(switcher).toBeVisible({ timeout: 15_000 });
      await switcher.getByRole("button", { name: "GO/UP", exact: true }).click();
    }
    await expect(page.locator(".linewatch-shell")).toHaveAttribute("data-network", network, { timeout: 15_000 });
    await expect(page.locator("html")).not.toHaveAttribute("data-network-transition-direction", { timeout: 15_000 });
    await expect(page.locator(network === "ttc" ? ".ttc-map-stage" : ".regional-map-stage")).toBeVisible({ timeout: 15_000 });
    const shell = page.locator(".linewatch-shell");
    await page.getByRole("button", { name: "Rotate map" }).click();

    // Physical rotation must remove the software quarter-turn, even though
    // both orientations still match the mobile layout query.
    await page.setViewportSize({ width: 852, height: 393 });
    await expect(shell).not.toHaveClass(/mobile-map-rotated/);
    await expect(page.getByRole("button", { name: "Rotate Map", exact: true })).toBeHidden();
    await expect(page.getByRole("navigation", { name: "Primary mobile navigation" })).toBeVisible();
    await expect(page.locator(".network-diagram-layer:not([data-preparing]) [data-map-viewport-orientation]")).toHaveAttribute("data-map-viewport-orientation", "standard");
    await page.setViewportSize({ width: 393, height: 556 });
    await page.getByRole("button", { name: "Rotate Map", exact: true }).click();
    await page.getByRole("button", { name: "Exit rotated map", exact: true }).click();
    await expect(shell).not.toHaveClass(/mobile-map-rotated/);
  });

}
