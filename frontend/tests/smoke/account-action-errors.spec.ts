import { expect, test, type Page } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";

test.beforeEach(async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await installDismissedTransientUi(page);
});

// Desktop uses the sidebar More panel; phones use the More sheet.
async function openMore(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByRole("button", { name: "More", exact: true }).click();
  else await page.locator('.desktop-nav-rail [data-dest="more"]').click();
  return page.locator(isMobile ? ".mobile-more-content-scroll" : ".desktop-more-panel");
}

test("a failed demo sign-in tells the rider in More", async ({ page, isMobile }) => {
  await page.route("**/api/auth/demo", (route) => route.fulfill({ status: 503, body: "{}" }));
  await page.goto("/");
  const more = await openMore(page, isMobile);
  await more.getByRole("button", { name: "Demo Account" }).click();
  await expect(more.getByRole("alert")).toHaveText("The demo account is unavailable right now. Try again later.");
  await expect(more.getByRole("button", { name: "Demo Account" })).toBeEnabled();
});

test("an unconfirmed sign-out tells the rider in More", async ({ page, isMobile }) => {
  await page.goto("/");
  let more = await openMore(page, isMobile);
  await more.getByRole("button", { name: "Demo Account" }).click();
  // Demo sign-in opens My Commutes; return to More to sign out.
  await expect(page.getByRole("heading", { name: "My Commutes" }).first()).toBeVisible();
  more = await openMore(page, isMobile);
  await page.route("**/api/auth/logout", (route) => route.fulfill({ status: 503, body: "{}" }));
  await more.getByRole("button", { name: "Sign Out" }).click();
  await expect(more.getByRole("alert")).toHaveText(
    "Signed out on this device, but the server didn't confirm it. Reload to check your account.",
  );
  await expect(more.getByRole("button", { name: "Demo Account" })).toBeVisible();
});
