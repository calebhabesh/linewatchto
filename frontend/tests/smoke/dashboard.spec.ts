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
  await expect(page.getByText("Ingestion Health (Poll: Stub API poll)", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Stub Station station details" })).toBeVisible();
  await expect(page.getByText(/Backend offline \(Fixture mode\)/)).toHaveCount(0);
});

test("renders fixture fallback when the dashboard API is unavailable", async ({ page, request }) => {
  await setStubMode(request, "unavailable");
  await openDashboardMenu(page);

  await expect(
    page.getByText("Ingestion Health (Poll: Backend offline (Fixture mode))", { exact: true })
  ).toBeVisible();
  await expect(page.getByTestId("menu-dashboard-data-mode")).toHaveText("Demo status");
  await expect(page.getByText("Live status", { exact: true })).toHaveCount(0);
});
