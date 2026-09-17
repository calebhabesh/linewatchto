import { expect, test } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";

test("desktop search opens on click, preserves focus-only navigation, and aligns line lists", async ({ page, request }) => {
  await installDismissedTransientUi(page);
  await setStubMode(request, "seeded");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const input = page.getByRole("searchbox", { name: "Station Search" });
  await input.focus();
  await expect(page.locator("#station-search-panel")).not.toBeVisible();
  await input.click();
  await expect(page.getByRole("toolbar", { name: "Filter stations by amenities" })).toBeVisible();
  await expect(input).toBeFocused();
  const searchBox = (await page.locator(".desktop-sidebar-search-input").boundingBox())!;
  const returnBtn = (await page.locator(".station-search-return").boundingBox())!;
  const amenityText = (await page.locator(".station-search-amenity-header span").first().boundingBox())!;
  const spaceAbove = returnBtn.y - (searchBox.y + searchBox.height);
  const spaceBelow = amenityText.y - (returnBtn.y + returnBtn.height);
  console.log("SPACING:", { spaceAbove, spaceBelow });
  expect(Math.abs(spaceAbove - spaceBelow)).toBeLessThanOrEqual(2);
  await page.getByRole("button", { name: "Back to Status", exact: true }).click();
  await expect(page.locator("#station-search-panel")).not.toBeVisible();
  await page.locator('[data-dest="more"]').click();
  await input.click();
  await expect(page.getByRole("button", { name: "Back to More", exact: true })).toBeVisible();
  await page.locator(".station-search-line-trigger").first().click();
  const back = page.getByRole("button", { name: "Back to Lines", exact: true });
  await expect(back).toBeVisible();
  const header = page.locator(".station-search-stations-column-header");
  const list = page.locator(".station-search-stations-list");
  await expect.poll(async () => {
    const [b, h, l] = await Promise.all([back.boundingBox(), header.boundingBox(), list.boundingBox()]);
    return b && h && l ? Math.max(Math.abs(b.x - h.x), Math.abs(b.x - l.x), Math.abs(b.width - h.width), Math.abs(b.width - l.width)) : 999;
  }).toBeLessThan(1);
  await expect(back).toHaveCSS("margin-top", "12px");
  await expect(back).toHaveCSS("margin-bottom", "12px");
  await page.screenshot({ path: "/tmp/search-list-aligned.png" });
  await back.click();
  await page.getByRole("button", { name: "Back to More", exact: true }).click();
  await expect(page.locator("#station-search-panel")).not.toBeVisible();

  await page.locator('[data-dest="commutes"]').click();
  await input.click();
  await expect(page.getByRole("button", { name: "Back to My Commutes", exact: true })).toBeVisible();
  const commuteIcon = page.locator(".station-search-return .station-search-return-icon--commutes");
  await expect(commuteIcon).toBeVisible();
  await page.screenshot({ path: "/tmp/commutes-search-return.png" });
  await page.getByRole("button", { name: "Back to My Commutes", exact: true }).click();
  await expect(page.locator("#station-search-panel")).not.toBeVisible();

  // Test navigating via rail to another destination while search is open
  await input.click();
  await expect(page.getByRole("button", { name: "Back to My Commutes", exact: true })).toBeVisible();
  await page.locator('[data-dest="stations"]').click();
  await input.click();
  await expect(page.getByRole("button", { name: "Back to My Stations", exact: true })).toBeVisible();
  const stationsIcon = page.locator(".station-search-return .station-search-return-icon--stations");
  await expect(stationsIcon).toBeVisible();
  await page.getByRole("button", { name: "Back to My Stations", exact: true }).click();
  await expect(page.locator("#station-search-panel")).not.toBeVisible();
});


