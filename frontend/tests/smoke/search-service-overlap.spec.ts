import { expect, test } from '@playwright/test';

test('desktop search hides current service only when their bounds overlap', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop floating panels');
  await page.setViewportSize({ width: 1920, height: 1292 });
  await page.addInitScript(() => {
    localStorage.setItem('linewatch-welcome-seen-v1', 'true');
    localStorage.setItem('linewatch-unofficial-notice-ack-v1', 'true');
  });
  await page.goto('/?previewTime=2026-08-14T16:00:00.000Z');
  const service = page.locator('.desktop-status-chip-row-container .current-service');
  await expect(service).toBeVisible();
  await page.getByRole('searchbox', { name: 'Station Search', exact: true }).click();
  await expect(page.locator('#station-search-panel')).toBeVisible();
  await expect(service).toBeVisible();
  await page.setViewportSize({ width: 1920, height: 700 });
  await expect(service).toBeHidden();
  await page.setViewportSize({ width: 1920, height: 1292 });
  await expect(service).toBeVisible();
  await page.getByRole('searchbox', { name: 'Station Search', exact: true }).press('Escape');
  await expect(service).toBeVisible();
});
