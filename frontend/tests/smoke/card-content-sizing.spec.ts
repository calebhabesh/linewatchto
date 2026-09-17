import { expect, test } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";

test.beforeEach(async ({ page }) => {
  await installDismissedTransientUi(page);
});

test("a single regional impact card stays sized to its content", async ({ page, request }) => {
  await setStubMode(request, "regional-live");
  await page.goto("/?network=regional&panel=alerts");

  await expect(page.getByRole("heading", { name: "Active Alerts", exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Filter active alerts by line" })
    .selectOption({ label: "Kitchener Line" });
  const cards = page.locator(".alert-stack > .alert-card");
  await expect(cards).toHaveCount(1);

  const trailingSpace = await cards.first().evaluate((card) => {
    const lastContent = card.lastElementChild;
    if (!(lastContent instanceof HTMLElement)) return Number.POSITIVE_INFINITY;
    return card.getBoundingClientRect().bottom - lastContent.getBoundingClientRect().bottom;
  });

  expect(trailingSpace).toBeLessThan(40);
});
