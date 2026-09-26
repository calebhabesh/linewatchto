import { expect, test } from "@playwright/test";
import { installDismissedTransientUi, setStubMode, waitForNetworkTransition } from "./test-support";

test.use({ serviceWorkers: "block" });

test("network verification and retries stay quiet, then exhausted retries show a connection notice", async ({ page, request, isMobile }) => {
  await setStubMode(request, "regional-live");
  await installDismissedTransientUi(page);
  if (isMobile) await page.setViewportSize({ width: 360, height: 740 });
  else await page.setViewportSize({ width: 1440, height: 900 });

  let releaseRetry!: () => void;
  const retryPending = new Promise<void>((resolve) => { releaseRetry = resolve; });
  let retryStarted!: () => void;
  const retrying = new Promise<void>((resolve) => { retryStarted = resolve; });
  let attempts = 0;
  let releaseRequest!: () => void;
  const pending = new Promise<void>((resolve) => { releaseRequest = resolve; });
  let requestStarted!: () => void;
  const started = new Promise<void>((resolve) => { requestStarted = resolve; });
  await page.route("**/api/dashboard?network=regional", async (route) => {
    attempts += 1;
    if (attempts === 1) {
      requestStarted();
      await pending;
    } else {
      retryStarted();
      await retryPending;
    }
    await route.fulfill({ status: 503, body: "Unavailable" });
  });

  await page.goto("/");
  await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem("linewatch-dashboard-snapshot-v1:ttc")))).toBe(true);
  const notices = page.locator(".mobile-service-sheet-notice-row--connection, .dashboard-availability-notice");
  await page.getByRole("group", { name: "Select transit network" }).getByRole("button", { name: "GO/UP", exact: true }).click();
  await started;
  await waitForNetworkTransition(page, "regional");
  await expect(notices).toHaveCount(0);
  const badge = page.locator(isMobile ? ".mobile-service-sheet-recessed-badge" : ".desktop-status-header-row .mobile-service-sheet-recessed-badge").first();
  await expect(badge).toContainText(/^(CACHED|UNKNOWN)$/);
  await expect(badge).not.toContainText("Updated");
  if (isMobile) {
    const heading = page.locator(".mobile-service-sheet-heading strong");
    await expect.poll(async () => {
      const title = await heading.boundingBox();
      const pill = await badge.boundingBox();
      return title && pill ? pill.x - (title.x + title.width) : 0;
    }).toBeGreaterThanOrEqual(8);
  }

  // A temporary failure may recover through the existing retry policy.
  releaseRequest();
  await retrying;
  await expect(notices).toHaveCount(0);
  await expect(badge).toContainText(/^(CACHED|UNKNOWN)$/);
  releaseRetry();
  await expect(notices.filter({ hasText: "Reconnecting" }).first()).toBeVisible();

  await page.unroute("**/api/dashboard?network=regional");
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(notices).toHaveCount(0);
  await expect(badge).toHaveText("LIVE");
  if (isMobile) {
    const indicator = (await badge.boundingBox())!;
    const handle = (await page.locator(".mobile-service-sheet .station-sheet-drag-pill").boundingBox())!;
    expect(Math.abs(indicator.x + indicator.width / 2 - handle.x - handle.width / 2)).toBeLessThanOrEqual(1);
  }
  await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem("linewatch-dashboard-snapshot-v1:regional")))).toBe(true);
  await page.getByRole("group", { name: "Select transit network" }).getByRole("button", { name: "TTC", exact: true }).click();
  await waitForNetworkTransition(page, "ttc");
  await expect(notices).toHaveCount(0);
  await expect(badge).toHaveText("LIVE");
  await page.getByRole("group", { name: "Select transit network" }).getByRole("button", { name: "GO/UP", exact: true }).click();
  await waitForNetworkTransition(page, "regional");
  await expect(badge).toHaveText("LIVE");
});
