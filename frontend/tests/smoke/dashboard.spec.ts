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

test("renders the seeded dashboard API payload", async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await openDashboardMenu(page);

  await expect(page.getByText("Stub API Yonge-University", { exact: true })).toBeVisible();
  await expect(page.getByText("Last Polled: Just Now", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Stub Station station details" })).toBeVisible();
  await expect(page.getByText(/Backend offline \(Fixture mode\)/)).toHaveCount(0);

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
    page.getByText("Last Polled: fixture mode", { exact: true })
  ).toBeVisible();
  await expect(page.getByTestId("menu-dashboard-data-mode")).toHaveText("Demo status");
  await expect(page.getByText("Live status", { exact: true })).toHaveCount(0);
});
