import { expect, test } from "@playwright/test";
import { installDismissedTransientUi, setStubMode, waitForNetworkTransition } from "./test-support";

test.use({ serviceWorkers: "block" });

test("network verification stays quiet but a failed request still shows a connection notice", async ({ page, request, isMobile }) => {
  await setStubMode(request, "regional-live");
  await installDismissedTransientUi(page);
  if (isMobile) await page.setViewportSize({ width: 360, height: 740 });
  else await page.setViewportSize({ width: 1440, height: 900 });

  let releaseRequest!: () => void;
  const pending = new Promise<void>((resolve) => { releaseRequest = resolve; });
  let requestStarted!: () => void;
  const started = new Promise<void>((resolve) => { requestStarted = resolve; });
  await page.route("**/api/dashboard?network=regional", async (route) => {
    requestStarted();
    await pending;
    await route.fulfill({ status: 503, body: "Unavailable" });
  });

  await page.goto("/");
  await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem("linewatch-dashboard-snapshot-v1:ttc")))).toBe(true);
  const notices = page.locator(".mobile-service-sheet-notice-row--connection, .dashboard-availability-notice");
  await page.getByRole("group", { name: "Select transit network" }).getByRole("button", { name: "GO/UP", exact: true }).click();
  await started;
  await waitForNetworkTransition(page, "regional");
  await expect(notices).toHaveCount(0);

  // No timer-based grace period: a real failure during the switch must appear.
  releaseRequest();
  await expect(notices.filter({ hasText: "Reconnecting" }).first()).toBeVisible();

  await page.unroute("**/api/dashboard?network=regional");
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(notices).toHaveCount(0);
  await page.getByRole("group", { name: "Select transit network" }).getByRole("button", { name: "TTC", exact: true }).click();
  await waitForNetworkTransition(page, "ttc");
  await expect(notices).toHaveCount(0);
});
