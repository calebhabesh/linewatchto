import { expect, test } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";

test("regional station-list header uses green network tint", async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await installDismissedTransientUi(page);
  await page.goto("/");
  await page.getByRole("searchbox", { name: "Station Search" }).click();
  await page.locator(".station-search-line-trigger").filter({ hasText: "Barrie" }).click();
  const header = page.locator(".station-search-stations-column-header.regional");
  await expect(header).toBeVisible();
  await expect(header).toHaveCSS("background-color", "rgb(19, 38, 32)");
  await page.screenshot({ path: "/tmp/linewatch-regional-search-header.png" });
});

test("mobile add station transitions return to saved-only line options", async ({ page, request, isMobile }) => {
  test.skip(!isMobile);
  await setStubMode(request, "seeded");
  await installDismissedTransientUi(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("button", { name: "Demo Account" }).click();
  await expect(page.getByRole("heading", { name: "My Commutes" })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "My Commutes" })).toBeHidden();
  await page.getByRole("navigation", { name: "Primary mobile navigation" }).getByRole("button", { name: "Saved", exact: true }).click();
  await page.getByRole("navigation", { name: "Saved sections" }).getByRole("button", { name: /My Stations/ }).click();
  const panel = page.getByRole("region", { name: "My Stations" });
  await panel.getByRole("button", { name: "Add Station", exact: true }).click();
  await expect(panel.locator(".my-stations-body")).toHaveCSS("animation-name", "panel-container-forward");
  await panel.getByRole("button", { name: "Done adding stations" }).click();
  await expect(panel.locator(".my-stations-body")).toHaveCSS("animation-name", "panel-container-back");
  await page.screenshot({ path: "/tmp/linewatch-station-add-return.png" });
});

test("desktop shortcuts use slate surfaces and retain accent colors", async ({ page, request, isMobile }) => {
  test.skip(isMobile);
  await setStubMode(request, "seeded");
  await installDismissedTransientUi(page);
  await page.goto("/");
  const buttons = page.locator(".desktop-quick-action-btn");
  await expect(buttons.first()).toBeVisible();
  await expect(buttons.first()).toHaveCSS("border-radius", "9999px");
  await expect(buttons.first()).toHaveCSS("background-color", "rgba(10, 12, 16, 0.98)");
  await expect(page.locator(".desktop-quick-action-btn--commutes")).toHaveCSS("color", "rgb(52, 211, 153)");
  await expect(page.locator(".desktop-quick-action-btn--stations")).toHaveCSS("color", "rgb(56, 189, 248)");
  await page.screenshot({ path: "/tmp/linewatch-slate-shortcuts.png" });
});

test("service section badges align with their heading row", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await installDismissedTransientUi(page);
  await page.goto("/");
  if (isMobile) await page.getByRole("button", { name: "Expand service sheet" }).click();
  const headings = page.locator(".current-service h3").filter({ has: page.locator(".current-service-active-count") });
  await expect(headings.first()).toBeVisible();
  for (const heading of await headings.all()) {
    await expect(heading).toHaveCSS("align-items", "center");
    const difference = await heading.evaluate(element => {
      const row = element.getBoundingClientRect();
      const badge = element.querySelector(".current-service-active-count")!.getBoundingClientRect();
      return Math.abs(row.y + row.height / 2 - badge.y - badge.height / 2);
    });
    expect(difference).toBeLessThan(1);
  }
});
