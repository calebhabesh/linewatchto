import { test, expect } from "@playwright/test";
import { installDismissedTransientUi, setStubMode, waitForNetworkTransition } from "./test-support";

for (const network of ["ttc", "regional"] as const) {
  test(`${network} station title can drag sheet above search and close still works`, async ({ page, request, isMobile }) => {
    test.skip(!isMobile);
    await installDismissedTransientUi(page);
    await setStubMode(request, network === "ttc" ? "seeded" : "regional-live");
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/");
    if (network === "regional") {
      await page.locator(".mobile-map-network-switch").getByRole("button", { name: "GO/UP", exact: true }).click();
      await waitForNetworkTransition(page, "regional");
      await expect(page.locator('[data-network-map-layer="regional"]')).toHaveAttribute("data-map-ready", "true");
      await page.locator('.regional-map [role="button"][aria-label$="station details"]').first().dispatchEvent("click");
    } else {
      await page.getByRole("button", { name: "Stub Station station details", exact: true }).dispatchEvent("click");
    }
    const sheet = page.locator(".station-detail-panel");
    const handle = sheet.getByRole("slider");
    await expect(handle).toBeVisible();
    await expect.poll(() => sheet.evaluate(el => el.getAnimations().length)).toBe(0);
    expect((await handle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const title = (await sheet.locator("h2").first().boundingBox())!;
    await page.mouse.move(title.x + 10, title.y + 10);
    await page.mouse.down();
    await page.mouse.move(title.x + 10, 0, { steps: 20 });
    await page.mouse.up();
    await expect.poll(async () => (await sheet.boundingBox())!.y).toBeLessThan(100);
    await handle.press("End");
    await expect.poll(async () => (await sheet.boundingBox())!.y).toBeLessThan(2);
    expect(await sheet.evaluate(el => {
      const header = el.querySelector(".station-detail-header")!.getBoundingClientRect();
      return el.contains(document.elementFromPoint(header.left + 10, header.top + 10));
    })).toBe(true);
    await handle.press("Home");
    await expect.poll(async () => (await sheet.boundingBox())!.y).toBeGreaterThan(390);
    await sheet.getByRole("button", { name: "Close station details" }).click();
    await expect(sheet).toHaveCount(0);
  });
}

test("TTC station labels activate on click without opening during pointerup", async ({ page, request, isMobile }) => {
  test.skip(!isMobile);
  await installDismissedTransientUi(page);
  await setStubMode(request, "unavailable");
  await page.goto("/");
  const label = page.locator(".station-label-hit-target").first();
  await expect(label).toBeAttached();
  for (let attempt = 0; attempt < 3; attempt++) {
    await label.dispatchEvent("pointerup", { pointerType: "touch", button: 0 });
    await expect(page.locator(".station-detail-panel")).toHaveCount(0);
    await label.dispatchEvent("click", { detail: 1 });
    const sheet = page.locator(".station-detail-panel");
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: "Close station details" }).click();
    await expect(sheet).toHaveCount(0);
  }
});
