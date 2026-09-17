import { expect, test } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";

test.beforeEach(async ({ page }) => {
  await installDismissedTransientUi(page);
});

test("desktop More restores secondary destinations and opens the site guide", async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  await page.getByRole("button", { name: "More", exact: true }).click();
  const morePanel = page.getByLabel("Settings and more options");
  await expect(morePanel).toBeVisible();
  await expect(morePanel.getByRole("button", { name: "Notifications", exact: true })).toBeVisible();
  await expect(morePanel.getByRole("link", { name: "Transit Guides", exact: true })).toHaveAttribute("href", "/explore");

  await morePanel.getByRole("button", { name: "Site Guide", exact: true }).click();
  const guide = page.getByRole("dialog", { name: "LineWatchTO site guide" });
  await expect(guide).toBeVisible();
  await guide.getByRole("button", { name: "Close site guide" }).click();
  await expect(guide).toHaveCount(0);

  await morePanel.getByRole("button", { name: "Notifications", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Notifications", exact: true })).toBeVisible();
});
