import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const stubUrl = "http://127.0.0.1:4174";

async function setStubMode(request: APIRequestContext, mode: "seeded" | "unavailable") {
  const response = await request.post(`${stubUrl}/__test/mode`, {
    data: { mode },
  });
  expect(response.ok()).toBeTruthy();
}

async function openDashboardMenu(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
  await page.getByRole("button", { name: "Toggle menu" }).click();
}

async function clickSvgRingStroke(page: Page, name: RegExp) {
  const ring = page.getByRole("button", { name });
  await expect(ring).toBeVisible();
  const box = await ring.boundingBox();
  expect(box).not.toBeNull();
  const handle = await ring.elementHandle();
  expect(handle).not.toBeNull();

  const center = {
    x: box!.x + box!.width / 2,
    y: box!.y + box!.height / 2,
  };
  const candidates = Array.from({ length: 72 }, (_, index) => index * 5)
    .flatMap((degrees) => {
      const radians = degrees * Math.PI / 180;
      return [0.72, 0.84, 0.96].map((scale) => ({
        x: center.x + Math.cos(radians) * box!.width * scale / 2,
        y: center.y + Math.sin(radians) * box!.height * scale / 2,
      }));
    });

  for (const point of candidates) {
    const hitsRing = await handle!.evaluate((target, candidate) => {
      return document.elementFromPoint(candidate.x, candidate.y) === target;
    }, point);
    if (hitsRing) {
      await page.mouse.click(point.x, point.y);
      return;
    }
  }

  throw new Error(`Could not find a clickable point on station impact ring ${name}`);
}

test("renders the seeded dashboard API payload", async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await openDashboardMenu(page);

  await expect(page.getByText("Stub API Yonge-University", { exact: true })).toBeVisible();
  await expect(page.getByText("Stub API Sheppard", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Stub Station station details" })).toBeVisible();
  await expect(page.getByText(/Backend offline \(Fixture mode\)/)).toHaveCount(0);

  await page.getByRole("button", { name: /^Delays/ }).click();
  await expect(page.getByRole("heading", { name: "Delays" })).toBeVisible();
  const menuDelayCard = page.getByRole("article").filter({
    hasText: "Delay between Sheppard-Yonge and Don Mills",
  });
  await expect(menuDelayCard).toBeVisible();
  await expect(menuDelayCard.getByText("Started", { exact: true })).toBeVisible();
  await expect(menuDelayCard.getByText("Updated", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Toggle menu" }).click();
  await page.getByRole("button", { name: /Reduced Speed Zones/ }).click();
  await expect(page.getByRole("heading", { name: "Reduced Speed Zones" })).toBeVisible();
  await expect(page.getByText("Southbound", { exact: true })).toBeVisible();
  await expect(page.getByText("Eglinton", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Davisville", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Track issue")).toBeVisible();
  await expect(page.getByText("Mid-June")).toBeVisible();

  await page.locator('.alert-card').filter({ hasText: 'Eglinton' }).getByRole("button", { name: "Highlight on Map" }).click();
  await expect(page.locator('[data-map-highlight-id="reduced-speed-zone-stub-zone-south-source"]')).toBeVisible();
});

test("map overlays open the corresponding submenu cards", async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  await page.getByRole("button", { name: "delay: Sheppard-Yonge to Don Mills" }).click();
  await expect(page.getByRole("heading", { name: "Delays" })).toBeVisible();
  const delayCard = page.locator('[data-impact-card-id="stub-delay-line-4"]');
  await expect(delayCard).toBeVisible();
  await expect(delayCard).toHaveClass(/highlight-active-card/);

  await page.getByRole("button", { name: "Toggle menu" }).click();
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await clickSvgRingStroke(page, /Stub API signal problem: Stub Station/);
  await expect(page.getByRole("heading", { name: "Active Alerts" })).toBeVisible();
  const activeAlertCard = page.locator('[data-impact-card-id="stub-alert-line-1"]');
  await expect(activeAlertCard).toBeVisible();
  await expect(activeAlertCard).toHaveClass(/highlight-active-card/);
});

test("station detail shows accessibility facilities and active outage warning", async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  await page.getByRole("button", { name: "Stub Station station details" }).click();

  await expect(page.getByRole("complementary", { name: "Stub Station station details" })).toBeVisible();
  await expect(page.getByAltText("Wheelchair accessible", { exact: true })).toBeVisible();
  await expect(page.getByAltText("Elevator available, outage reported", { exact: true })).toBeVisible();
  await expect(page.locator('[data-facility-warning="elevator"]')).toBeVisible();
  await expect(page.getByText("Demo estimates", { exact: true })).toBeVisible();
});

test("LineLegend clicks open view but do not highlight any card", async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
  await page.getByTitle(/View reduced speed zone/i).click();
  await expect(page.getByRole("heading", { name: "Reduced Speed Zones" })).toBeVisible();
  await expect(page.locator(".highlight-active-card")).toHaveCount(0);
  await expect(page.locator(".alert-card").first()).not.toHaveClass(/!bg-amber-950|highlight-active-card/);
});

test("renders fixture fallback when the dashboard API is unavailable", async ({ page, request }) => {
  await setStubMode(request, "unavailable");
  await openDashboardMenu(page);

  await expect(
    page.getByText("Last Polled: fixture mode", { exact: true }).first()
  ).toBeVisible();
  await expect(page.getByText("Live status", { exact: true })).toHaveCount(0);
});
