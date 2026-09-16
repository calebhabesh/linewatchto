import { expect, test } from '@playwright/test';
import { installDismissedTransientUi, setStubMode, waitForNetworkTransition } from './test-support';

test.beforeEach(async ({ page, request }) => {
  await setStubMode(request, 'regional-live');
  await installDismissedTransientUi(page);
});

test('saved dashboard reopens offline and recovers on reconnect', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem('linewatch-dashboard-snapshot-v1:ttc')))).toBe(true);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(async () => Boolean(await caches.match('/offline')))).toBe(true);
  await expect(page.locator('.ttc-map-stage')).toHaveAttribute('data-raster-map-ready', 'true');
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('linewatch-dashboard-snapshot-v1:ttc')!).savedAt);
  await context.setOffline(true);
  await expect(page.locator('.dashboard-availability-notice')).toContainText('Offline');
  await page.reload();
  await expect(page.locator('.linewatch-shell')).toBeVisible();
  await expect(page.locator('.dashboard-availability-notice')).toContainText('Saved');
  await expect(page.locator('.ttc-map-stage')).toHaveAttribute('data-raster-map-ready', 'true');
  if (!test.info().project.name.startsWith("mobile")) {
    await expect(page.locator(".mobile-service-sheet-recessed-badge")).toHaveText(/Cached/i);
  }
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('linewatch-dashboard-snapshot-v1:ttc')!).savedAt)).toBe(before);
  await expect(page.locator('.estimated-train-marker')).toHaveCount(0);
  await expect(page.locator('.service-tone-good')).toHaveCount(0);
  await expect(page.locator('.ttc-map-stage')).toHaveCSS('opacity', '1');
  await page.getByRole('button', {name:'Center map view'}).first().click();
  await expect.poll(() => page.locator('img').evaluateAll((images: HTMLImageElement[]) => images.filter(image => {
    if (!image.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    const rect = image.getBoundingClientRect();
    let left = Math.max(0, rect.left), right = Math.min(innerWidth, rect.right);
    let top = Math.max(0, rect.top), bottom = Math.min(innerHeight, rect.bottom);
    for (let parent = image.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent), box = parent.getBoundingClientRect();
      if (style.overflowX !== 'visible') { left = Math.max(left, box.left); right = Math.min(right, box.right); }
      if (style.overflowY !== 'visible') { top = Math.max(top, box.top); bottom = Math.min(bottom, box.bottom); }
    }
    return right > left && bottom > top && (!image.complete || image.naturalWidth === 0);
  }).map(image => image.src))).toEqual([]);
  if (page.viewportSize()!.width < 768) {
    const notice = page.locator('.mobile-service-sheet-notice-row[data-snapshot="true"]');
    await expect.poll(() => notice.evaluate(element => { const text = element.querySelector('.mobile-service-sheet-notice-message')!.getBoundingClientRect(); const box = element.getBoundingClientRect(); return text.top >= box.top && text.bottom <= box.bottom; })).toBe(true);
  }
  await page.screenshot({path: `/tmp/linewatch-offline-${page.viewportSize()!.width}.png`});
  await context.setOffline(false);
  await expect(page.locator('.dashboard-availability-notice')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('backend outage on reload prefers a saved real snapshot to fixtures', async ({ page, request }) => {
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem('linewatch-dashboard-snapshot-v1:ttc')))).toBe(true);
  await setStubMode(request, 'unavailable');
  await page.reload();
  await expect(page.locator('.dashboard-availability-notice')).toContainText('Saved');
  await expect(page.locator('.dashboard-availability-notice')).toContainText('Service may have changed');
  await setStubMode(request, 'regional-live');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('.dashboard-availability-notice')).toHaveCount(0);
});

test('offline shell without a snapshot shows an unknown state and usable map', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(async () => Boolean(await caches.match('/offline')))).toBe(true);
  await context.setOffline(true);
  await page.evaluate(() => { localStorage.removeItem('linewatch-dashboard-snapshot-v1:ttc'); localStorage.removeItem('linewatch-dashboard-snapshot-v1:regional'); });
  await page.reload();
  await expect(page.locator('.dashboard-availability-notice')).toContainText('No saved dashboard');
  await expect(page.locator('.ttc-map-stage')).toHaveAttribute('data-raster-map-ready', 'true');
  await expect(page.locator('.asset-alert-path')).toHaveCount(0);
  await page.getByRole('group', {name: 'Select transit network'}).getByRole('button', {name:'GO/UP', exact:true}).click();
  await waitForNetworkTransition(page, 'regional');
  await expect(page.locator('.regional-map-stage')).toHaveAttribute('data-raster-map-ready','true');
  await expect(page.locator('.dashboard-availability-notice')).toContainText('No saved dashboard');
});

 test('both networks retain independent snapshots through offline switching', async ({page, context}) => {
   await page.goto('/');
   const selector = page.getByRole('group', {name: 'Select transit network'});
   await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem('linewatch-dashboard-snapshot-v1:ttc')))).toBe(true);
   await selector.getByRole('button', {name:'GO/UP',exact:true}).click();
   await waitForNetworkTransition(page,'regional');
   await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem('linewatch-dashboard-snapshot-v1:regional')))).toBe(true);
   await page.evaluate(async () => { await navigator.serviceWorker.ready; });
   await expect.poll(() => page.evaluate(async () => Boolean(await caches.match('/offline')))).toBe(true);
   await context.setOffline(true);
   await page.reload();
   await expect(page.locator('.dashboard-availability-notice')).toContainText('Saved');
   await selector.getByRole('button', {name:'GO/UP',exact:true}).click();
   await waitForNetworkTransition(page,'regional');
   await expect(page.locator('.regional-map-stage')).toHaveAttribute('data-raster-map-ready','true');
   await expect(page.locator('.dashboard-availability-notice')).toContainText('Saved');
   await selector.getByRole('button', {name:'TTC',exact:true}).click();
   await waitForNetworkTransition(page,'ttc');
   await expect(page.locator('.ttc-map-stage')).toHaveAttribute('data-raster-map-ready','true');
 });
