import { expect, test } from '@playwright/test';
import { installDismissedTransientUi } from './test-support';

for (const network of ['ttc', 'regional'] as const) {
  test(`${network}: map does not move when opening and closing search`, async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile search test');
    await installDismissedTransientUi(page);
    await page.goto('/?previewTime=2026-08-14T16:00:00.000Z');
    if (network === 'regional') {
      await page.locator('.mobile-map-network-switch').getByRole('button', { name: 'GO/UP', exact: true }).click();
    }
    await expect(page.locator(`.${network}-map-stage[data-raster-map-ready="true"]`)).toBeVisible();
    await expect(page.locator('.network-map-transition-surface')).not.toHaveAttribute('data-map-surface-transition');

    const stage = page.locator(`.${network}-map-stage`);
    
    // Wait for camera to settle
    await page.waitForTimeout(500);

    const initialTransform = await stage.evaluate((el) => getComputedStyle(el).transform);

    // Touch the search bar
    const searchInput = page.getByRole('searchbox', { name: 'Station Search', exact: true });
    await searchInput.click();

    // Verify search is open
    await expect(page.locator('#station-search-panel')).toBeVisible();

    // Start recording stage transform every frame to ensure zero intermediate shift
    await stage.evaluate((el) => {
      type WindowWithRecorder = Window & typeof globalThis & {
        __stageTransforms?: string[];
        __stopRecording?: () => void;
      };
      const win = window as WindowWithRecorder;
      win.__stageTransforms = [];
      const record = () => {
        win.__stageTransforms?.push(getComputedStyle(el).transform);
      };
      const interval = setInterval(record, 16);
      win.__stopRecording = () => clearInterval(interval);
    });

    // Close search without picking anything
    const closeBtn = page.getByRole('button', { name: 'Close search', exact: true });
    await closeBtn.click();

    // Verify search is closed
    await expect(page.locator('.linewatch-shell')).toHaveAttribute('data-active-view', 'map');
    await expect(page.locator('#station-search-panel')).toHaveAttribute('data-open', 'false');

    // Wait for any closing animations or refits to settle
    await page.waitForTimeout(1000);

    const recordedTransforms = await stage.evaluate(() => {
      type WindowWithRecorder = Window & typeof globalThis & {
        __stageTransforms?: string[];
        __stopRecording?: () => void;
      };
      const win = window as WindowWithRecorder;
      win.__stopRecording?.();
      return win.__stageTransforms ?? [];
    });
    const nonMatching = recordedTransforms.filter((t) => t !== initialTransform);
    expect(nonMatching).toEqual([]);

    const finalTransform = await stage.evaluate((el) => getComputedStyle(el).transform);
    expect(finalTransform).toBe(initialTransform);
  });
}
