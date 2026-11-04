import { test, expect, type Page } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";

// Plan 15, L2: the phone's Layers button and sheet.
test.use({ serviceWorkers: "block" });

const button = (page: Page) => page.locator(".mobile-layers-toggle");
const sheet = (page: Page) => page.locator("[data-map-layers-sheet]");

async function openSheet(page: Page) {
  await button(page).click();
  await expect(sheet(page)).toBeVisible();
  // Measure at rest, not partway through the entrance.
  await sheet(page).evaluate((el) => Promise.all(el.getAnimations().map((animation) => animation.finished)));
}

async function openMap(page: Page, network: "ttc" | "regional", view = "geographic") {
  await page.addInitScript(({ network, view }) => {
    localStorage.setItem("linewatch-default-network-v1", network);
    localStorage.setItem("linewatch-map-view-v1", view);
  }, { network, view });
  await page.goto("/");
  if (view === "geographic") {
    const geoMap = page.locator(".geographic-network-map");
    await expect(geoMap).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
    await expect(geoMap).toHaveAttribute("data-network", network);
  }
}

test.describe("Phone Layers sheet", () => {
  test.beforeEach(async ({ page, request, isMobile }) => {
    test.skip(!isMobile, "Phones only");
    await setStubMode(request, "seeded");
    await installDismissedTransientUi(page);
  });

  test("lists the TTC switches, applies and remembers them, and marks the button", async ({ page }) => {
    await openMap(page, "ttc");
    await expect(button(page)).toContainText("Layers");
    await expect(button(page)).not.toHaveAttribute("data-customized", "true");
    await expect(sheet(page)).toHaveCount(0);
    const closedBox = await button(page).boundingBox();

    await openSheet(page);
    await expect(sheet(page).getByRole("heading", { name: "Map Layers" })).toBeVisible();
    await expect(sheet(page).locator(".map-layer-switch-label")).toHaveText(["Train Markers", "Streetcars", "Buses", "Live GPS"]);
    await expect(button(page)).toHaveAttribute("aria-expanded", "true");

    // The map stays in view above a sheet sized to its rows.
    const viewport = page.viewportSize()!;
    const sheetBox = (await sheet(page).boundingBox())!;
    expect(sheetBox.y).toBeGreaterThan(viewport.height * 0.4);
    expect(sheetBox.y + sheetBox.height).toBeCloseTo(viewport.height, 0);
    for (const row of await sheet(page).locator(".map-layer-switch").all()) {
      expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }

    const geoMap = page.locator(".geographic-network-map");
    const buses = sheet(page).getByRole("switch", { name: "Show TTC bus routes and stops" });
    await buses.click();
    await expect(buses).toBeChecked();
    await expect(geoMap).toHaveAttribute("data-buses", "on");
    await expect(sheet(page), "switches apply without closing the sheet").toBeVisible();

    const streetcars = sheet(page).getByRole("switch", { name: "Show TTC streetcar routes and stops" });
    await streetcars.click();
    await expect(streetcars).not.toBeChecked();
    const live = sheet(page).getByRole("switch", { name: "Show live streetcar and bus GPS positions" });
    await live.click();
    await expect(live).not.toBeChecked();
    const trains = sheet(page).getByRole("switch", { name: /Toggle estimated train markers/ });
    await trains.click();
    await expect(trains).toBeChecked();

    expect(await page.evaluate(() => [
      localStorage.getItem("linewatch-map-view-buses-v1"),
      localStorage.getItem("linewatch-map-view-streetcars-v1"),
      localStorage.getItem("linewatch-map-view-streetcar-positions-v1"),
      localStorage.getItem("linewatch-estimated-trains-enabled-v1"),
    ])).toEqual(["on", "off", "off", "true"]);

    await page.keyboard.press("Escape");
    await expect(sheet(page)).toHaveCount(0);
    await expect(button(page)).toHaveAttribute("data-customized", "true");
    expect(await button(page).boundingBox(), "the dot does not resize the button").toEqual(closedBox);

    await page.reload();
    await expect(geoMap).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
    await expect(geoMap).toHaveAttribute("data-buses", "on");
    await expect(button(page)).toHaveAttribute("data-customized", "true");
    await button(page).click();
    await expect(buses).toBeChecked();
    await expect(streetcars).not.toBeChecked();
    await expect(live).not.toBeChecked();

    // Back to the defaults, the dot goes.
    await buses.click();
    await streetcars.click();
    await live.click();
    await trains.click();
    await expect(button(page)).not.toHaveAttribute("data-customized", "true");
  });

  test("lists the GO/UP switches, and only those", async ({ page }) => {
    await openMap(page, "regional");
    await button(page).click();
    await expect(sheet(page).locator(".map-layer-switch-label")).toHaveText(["Train Markers", "GO Buses", "Live GPS"]);
    await expect(sheet(page).locator(".map-layer-switch-status").last()).toHaveText("With GO Buses");
    const goBuses = sheet(page).getByRole("switch", { name: "Show GO bus routes and stops" });
    await goBuses.click();
    await expect(page.locator(".geographic-network-map")).toHaveAttribute("data-go-buses", "on");
    await expect(sheet(page).locator(".map-layer-switch-status").last()).toHaveText("GO Buses");
    expect(await page.evaluate(() => localStorage.getItem("linewatch-map-view-buses-v1"))).toBeNull();
  });

  test("closes by Escape, scrim, close button and drag, returning focus each time", async ({ page }) => {
    await openMap(page, "ttc");
    const closers: Array<[string, () => Promise<void>]> = [
      ["Escape", () => page.keyboard.press("Escape")],
      ["scrim", () => page.locator("[data-map-layers-sheet-scrim]").click({ position: { x: 20, y: 80 } })],
      ["close button", () => sheet(page).getByRole("button", { name: "Close map layers" }).click()],
      ["drag handle", async () => {
        const box = (await sheet(page).locator("[data-mobile-sheet-drag-handle]").boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2, box.y + 120, { steps: 6 });
        await page.mouse.up();
      }],
    ];
    for (const [name, close] of closers) {
      await button(page).click();
      await expect(sheet(page), name).toBeVisible();
      await expect(sheet(page), `${name}: focus moves in`).toBeFocused();
      await close();
      await expect(sheet(page), name).toHaveCount(0);
      await expect(button(page), `${name}: focus returns`).toBeFocused();
    }
  });

  test("a short drag settles back, and Tab stays inside the sheet", async ({ page }) => {
    await openMap(page, "ttc");
    await openSheet(page);
    await expect(sheet(page)).toBeFocused();
    const resting = (await sheet(page).boundingBox())!;
    const box = (await sheet(page).locator("[data-mobile-sheet-drag-handle]").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(400);
    await page.mouse.move(box.x + box.width / 2, box.y + 24, { steps: 4 });
    await page.waitForTimeout(100);
    await page.mouse.up();
    await expect(sheet(page)).toBeVisible();
    await expect.poll(async () => (await sheet(page).boundingBox())!.y).toBeCloseTo(resting.y, 0);

    for (let press = 0; press < 7; press += 1) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => Boolean(document.activeElement?.closest("[data-map-layers-sheet]"))), `Tab ${press}`).toBe(true);
    }
  });

  test("covers the bottom nav and fits at 360 and 767 px", async ({ page }) => {
    await openMap(page, "ttc");
    for (const width of [360, 767]) {
      await page.setViewportSize({ width, height: 700 });
      await openSheet(page);
      const result = await page.evaluate(() => {
        const nav = document.querySelector(".mobile-bottom-nav")?.getBoundingClientRect();
        const hit = nav && document.elementFromPoint(nav.x + nav.width / 2, nav.y + nav.height / 2);
        return {
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          navCovered: Boolean(hit?.closest("[data-map-layers-sheet]")),
        };
      });
      expect(result, `${width}px`).toEqual({ overflow: 0, navCovered: true });
      await page.keyboard.press("Escape");
      await expect(sheet(page)).toHaveCount(0);
    }
  });

  test("is not offered while a stop sheet is open", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("linewatch-map-view-v1", "geographic"));
    await page.goto("/?stop=2034");
    await expect(page.locator('[data-surface-stop-panel="2034"]')).toBeVisible({ timeout: 20_000 });
    await expect(button(page)).toBeHidden();
  });

  test("is not offered on a System Map", async ({ page }) => {
    await openMap(page, "ttc", "diagram");
    await expect(page.locator(".mobile-train-toggle:not(.mobile-layers-toggle)")).toBeVisible({ timeout: 20_000 });
    await expect(button(page)).toHaveCount(0);
  });
});

test("the desktop Map View has no Layers button or sheet", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "Desktop only");
  await setStubMode(request, "seeded");
  await installDismissedTransientUi(page);
  await openMap(page, "ttc");
  await expect(page.locator("#map-view-layers-row")).toBeVisible();
  await expect(button(page)).toBeHidden();
  await expect(sheet(page)).toHaveCount(0);
});
