import { expect, test } from "@playwright/test";

const WELCOME_SEEN_STORAGE_KEY = "linewatch-welcome-seen-v1";
const DISCLAIMER_ACK_STORAGE_KEY = "linewatch-unofficial-notice-ack-v1";
const RELEASE_NOTES_SEEN_STORAGE_KEY = "linewatch-seen-release-notes-version";

test("new visitors start on Welcome and can open What's New", async ({ page, isMobile }) => {
  await page.setViewportSize(isMobile ? { width: 360, height: 800 } : { width: 1440, height: 900 });
  await page.goto("/");

  const dialog = page.getByRole("dialog", { name: "Welcome to LineWatchTO" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("tab", { name: "Welcome" })).toHaveAttribute("aria-selected", "true");
  const carousel = dialog.locator(".opening-welcome-carousel:visible");
  const image = carousel.locator(".opening-welcome-slide-item--active .opening-welcome-image-frame");
  const progress = carousel.getByRole("group", { name: "Choose an introduction slide" });
  await expect(progress).toBeVisible();
  const imageBox = await image.boundingBox();
  const progressBox = await progress.boundingBox();
  expect(imageBox && progressBox && progressBox.y > imageBox.y + imageBox.height).toBeTruthy();
  await expect(carousel.locator(".opening-welcome-dots")).toHaveCount(0);
  await expect(dialog).toHaveCSS("background-color", /^rgb\(/);

  await carousel.getByRole("button", { name: "Next" }).click();
  await expect(carousel.locator('.opening-welcome-slide-item--active[data-slide-index="1"]')).toBeVisible();
  await expect.poll(async () => {
    const caption = await carousel.locator(".opening-welcome-slide-item--active .opening-welcome-slide-heading").boundingBox();
    const indicator = await progress.boundingBox();
    return caption && indicator ? indicator.y - (caption.y + caption.height) : Infinity;
  }).toBeLessThan(48);

  await dialog.getByRole("tab", { name: "What's New" }).click();
  const releaseDialog = page.getByRole("dialog", { name: "What's new in LineWatchTO v1.1.0" });
  await expect(releaseDialog.getByRole("heading", { name: "A new way to explore" })).toBeVisible();
  await expect(releaseDialog.getByText("Current", { exact: true })).toBeVisible();
  await expect(releaseDialog.getByText("September 19, 2026")).toBeVisible();
  await expect(releaseDialog.getByText("June 24, 2026")).toBeVisible();
  await expect(releaseDialog.getByRole("button", { name: "Back to welcome" })).toHaveCount(0);
  await releaseDialog.getByRole("tab", { name: "Welcome" }).click();
  await expect(dialog).toBeVisible();
  await expect(page.locator(".release-notes-notice")).toHaveCount(0);
});

test("returning visitors land on an unseen featured release once", async ({ page }) => {
  await page.addInitScript(({ welcomeKey, acknowledgementKey, releaseKey }) => {
    window.localStorage.setItem(welcomeKey, "true");
    window.localStorage.setItem(acknowledgementKey, "true");
    window.localStorage.removeItem(releaseKey);
  }, {
    welcomeKey: WELCOME_SEEN_STORAGE_KEY,
    acknowledgementKey: DISCLAIMER_ACK_STORAGE_KEY,
    releaseKey: RELEASE_NOTES_SEEN_STORAGE_KEY,
  });

  await page.goto("/");

  const dialog = page.getByRole("dialog", { name: "What's new in LineWatchTO v1.1.0" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("tab", { name: "What's New" })).toHaveAttribute("aria-selected", "true");
  await dialog.getByRole("button", { name: "Close introduction" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), RELEASE_NOTES_SEEN_STORAGE_KEY)).toBe("1.1.0");
});
