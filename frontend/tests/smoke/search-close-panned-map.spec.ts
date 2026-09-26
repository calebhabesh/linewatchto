import { expect, test } from '@playwright/test';
import { installDismissedTransientUi } from './test-support';

for (const network of ['ttc', 'regional'] as const) {
  test(`${network}: map does not move when opening and closing search after user pan`, async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile search test');
    await installDismissedTransientUi(page);
    await page.goto('/?previewTime=2026-08-14T16:00:00.000Z');
    if (network === 'regional') {
      await page.locator('.mobile-map-network-switch').getByRole('button', { name: 'GO/UP', exact: true }).click();
    }
    await expect(page.locator(`.${network}-map-stage[data-raster-map-ready="true"]`)).toBeVisible();
    await expect(page.locator('.network-map-transition-surface')).not.toHaveAttribute('data-map-surface-transition');

    const stage = page.locator(`.${network}-map-stage`);
    await page.waitForTimeout(500);

    // Pan the map slightly
    const viewport = page.locator(network === 'ttc' ? '[data-map-pan-zoom-viewport]' : '.regional-map-viewport');
    await viewport.dispatchEvent('pointerdown', { clientX: 200, clientY: 300, pointerId: 1, isPrimary: true, button: 0 });
    await viewport.dispatchEvent('pointermove', { clientX: 250, clientY: 350, pointerId: 1, isPrimary: true, button: 0 });
    await viewport.dispatchEvent('pointerup', { clientX: 250, clientY: 350, pointerId: 1, isPrimary: true, button: 0 });
    await page.waitForTimeout(300);

    const initialTransform = await stage.evaluate((el) => getComputedStyle(el).transform);

    // Touch the search bar
    const searchInput = page.getByRole('searchbox', { name: 'Station Search', exact: true });
    await searchInput.click();

    // Verify search is open
    await expect(page.locator('#station-search-panel')).toBeVisible();

    // Simulate virtual keyboard opening
    await page.evaluate(() => {
      Object.defineProperty(window.visualViewport!, 'height', { configurable: true, value: 450 });
      window.visualViewport!.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(100);

    // Simulate virtual keyboard closing
    await page.evaluate(() => {
      Reflect.deleteProperty(window.visualViewport!, 'height');
      window.visualViewport!.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(100);

    // Close search without picking anything
    const closeBtn = page.getByRole('button', { name: 'Close search', exact: true });
    await closeBtn.click();

    await expect(page.locator('.linewatch-shell')).toHaveAttribute('data-active-view', 'map');
    await expect(page.locator('#station-search-panel')).toHaveAttribute('data-open', 'false');

    await page.waitForTimeout(1000);

    const finalTransform = await stage.evaluate((el) => getComputedStyle(el).transform);

    expect(finalTransform).toBe(initialTransform);
  });
}
