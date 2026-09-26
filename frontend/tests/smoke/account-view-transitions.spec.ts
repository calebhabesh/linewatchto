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

test("desktop navigation rail items are visible and accessible", async ({ page, request, isMobile }) => {
  test.skip(isMobile);
  await setStubMode(request, "seeded");
  await installDismissedTransientUi(page);
  await page.goto("/");
  const rail = page.locator(".desktop-nav-rail");
  await expect(rail).toBeVisible();
  const commutes = page.locator('.desktop-rail-item[data-dest="commutes"]');
  const stations = page.locator('.desktop-rail-item[data-dest="stations"]');
  await expect(commutes).toBeVisible();
  await expect(stations).toBeVisible();
  await expect(commutes).toHaveAttribute("data-dest", "commutes");
  await expect(stations).toHaveAttribute("data-dest", "stations");
  await page.screenshot({ path: "/tmp/linewatch-desktop-nav-rail.png" });
});

test("service section badges align with their heading row", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await installDismissedTransientUi(page);
  await page.goto("/");
  if (isMobile) {
    await page.getByRole("button", { name: "Expand service sheet" }).click();
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
  } else {
    const headers = page.locator(".desktop-status-section-header").filter({ has: page.locator(".current-service-active-count") });
    await expect(headers.first()).toBeVisible();
    for (const header of await headers.all()) {
      await expect(header).toHaveCSS("align-items", "center");
      const difference = await header.evaluate(element => {
        const row = element.getBoundingClientRect();
        const badge = element.querySelector(".current-service-active-count")!.getBoundingClientRect();
        return Math.abs(row.y + row.height / 2 - badge.y - badge.height / 2);
      });
      expect(difference).toBeLessThan(1);
    }
  }
});

test("unauthenticated My Stations view scrolls to reveal Sign In and Create Account actions", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await installDismissedTransientUi(page);
  await page.route("**/api/auth/me**", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ authenticated: false, user: null }),
    });
  });
  await page.goto("/");
  if (isMobile) {
    await page.getByRole("navigation", { name: "Primary mobile navigation" }).getByRole("button", { name: "Saved", exact: true }).click();
  } else {
    await page.locator('.desktop-rail-item[data-dest="stations"]').click();
  }

  const list = page.locator(".my-stations-list");
  await expect(list).toBeVisible();

  const actionRow = page.locator(".account-action-row");
  const signInBtn = actionRow.getByRole("button", { name: "Sign In", exact: true });
  const createAccountBtn = actionRow.getByRole("button", { name: "Create Account", exact: true });

  await createAccountBtn.scrollIntoViewIfNeeded();
  await expect(signInBtn).toBeVisible();
  await expect(createAccountBtn).toBeVisible();
});

