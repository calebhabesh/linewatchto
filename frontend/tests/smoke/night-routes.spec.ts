import { test, expect } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";

// Plan 13, S10: the TTC night network draws with Bus Routes on. The camera sits on the
// 322 Coxwell night bus where no daytime line runs within 400 m.
const NIGHT_LINE = { lng: -79.30388, lat: 43.67701 };

test.use({ serviceWorkers: "block" });

test.describe("TTC night routes on the Map View", () => {
  test.beforeEach(async ({ page, request, isMobile }) => {
    test.skip(!isMobile, "The saved Map View camera is restored on phones");
    await setStubMode(request, "seeded");
    await installDismissedTransientUi(page);
  });

  async function open(page: import("@playwright/test").Page, buses: "on" | "off") {
    const assets: string[] = [];
    page.on("request", (request) => {
      if (/ttc-surface-/.test(request.url())) assets.push(new URL(request.url()).pathname.split("/").pop() ?? "");
    });
    await page.addInitScript(({ point, buses }) => {
      localStorage.setItem("linewatch-map-view-v1", "geographic");
      localStorage.setItem("linewatch-map-view-buses-v1", buses);
      localStorage.setItem("linewatch-geographic-map-viewport-v1:ttc", JSON.stringify({
        version: 2, lng: point.lng, lat: point.lat, zoom: 16, savedAt: Date.now(),
      }));
    }, { point: NIGHT_LINE, buses });
    await page.goto("/");
    await expect(page.locator(".geographic-network-map")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
    return () => assets;
  }

  test("night lines load with Bus Routes and open a Night Routes card that claims no live service", async ({ page }) => {
    const assets = await open(page, "on");
    const card = page.locator("[data-night-card]");
    const canvas = page.locator(".geographic-network-map canvas");
    await expect.poll(async () => {
      const box = await canvas.boundingBox();
      if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      return card.isVisible();
    }, { timeout: 20_000, intervals: [1_000] }).toBe(true);
    await expect(card).toContainText("Night Route");
    await expect(card.locator('[data-streetcar-route="322"]')).toBeVisible();
    await expect(card).toContainText("Coxwell");
    await expect(card).toContainText("Weekday night schedule, Nov 1 – Dec 19. Not live service.");
    await expect(card.getByRole("button", { name: /Stop Departures/ })).toHaveCount(0);
    expect(assets()).toContain("ttc-surface-night.json");
  });

  test("a route on the card opens its panel, and phone Back closes the panel to the map", async ({ page }) => {
    await open(page, "on");
    const card = page.locator("[data-night-card]");
    const canvas = page.locator(".geographic-network-map canvas");
    await expect.poll(async () => {
      const box = await canvas.boundingBox();
      if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      return card.isVisible();
    }, { timeout: 20_000, intervals: [1_000] }).toBe(true);

    await card.getByRole("button", { name: /^Open route 322 / }).click();
    const panel = page.locator("[data-surface-route-panel='ttc:322']");
    await expect(panel).toBeVisible();
    await expect(card).toHaveCount(0);

    await page.goBack();
    await expect(panel).toHaveCount(0);
    await expect(page.locator(".geographic-network-map")).toHaveAttribute("data-status", "ready");
  });

  test("nothing of the night network loads while Bus Routes is off", async ({ page }) => {
    const assets = await open(page, "off");
    await page.waitForTimeout(2_000);
    expect(assets()).not.toContain("ttc-surface-night.json");
    const box = await page.locator(".geographic-network-map canvas").boundingBox();
    if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator("[data-night-card]")).toHaveCount(0);
  });
});
