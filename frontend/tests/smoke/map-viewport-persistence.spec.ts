import { test, expect } from '@playwright/test';
import { installDismissedTransientUi, setStubMode } from './test-support';

for (const network of ['ttc', 'regional'] as const) {
  test(`desktop ${network} opens at the fitted camera even with a saved session viewport`, async ({ page, request, isMobile }) => {
    test.skip(isMobile);
    await page.setViewportSize({ width: 2048, height: 1164 });
    await setStubMode(request, 'seeded');
    await installDismissedTransientUi(page);
    await page.addInitScript((selectedNetwork) => {
      localStorage.setItem('linewatch-seen-release-notes-version', '1.3.0');
      localStorage.setItem('linewatch-default-network-v1', selectedNetwork);
      sessionStorage.setItem(`linewatch-map-viewport-v1:${selectedNetwork}`, JSON.stringify({
        version: 1, centerX: 2500, centerY: 1100, zoom: 2.3,
      }));
    }, network);
    await page.goto('/');
    await expect(page.locator('.linewatch-shell')).toHaveAttribute('data-network', network);
    const stage = page.locator(network === 'ttc' ? '[data-system-map=ttc] .map-stage' : '[data-system-map=regional] .map-stage');
    await expect(stage).toHaveAttribute('data-raster-map-ready', 'true');
    await expect(stage).toBeVisible();
    const opening = await stage.evaluate((element) => getComputedStyle(element).transform);
    await page.getByRole('button', { name: 'Center map view', exact: true }).click();
    const fitted = await stage.evaluate((element) => getComputedStyle(element).transform);
    expect(opening).toBe(fitted);
  });
}

for (const network of ['ttc', 'regional']) {
 test(`${network} mobile camera survives reload and Center clears the saved view`, async ({page,request,isMobile})=>{
  test.skip(!isMobile);
  await setStubMode(request,'seeded');await installDismissedTransientUi(page);
  await page.addInitScript((network)=>{ if(network==='regional') localStorage.setItem('linewatch-default-network-v1','regional'); },network);
  await page.goto('/');
  if(network==='regional') {
   await page.locator('.mobile-map-network-switch').getByRole('button',{name:'GO/UP',exact:true}).click();
   await expect(page.locator('.linewatch-shell')).toHaveAttribute('data-network','regional');
  }
  await page.waitForTimeout(1200);
  await page.getByRole('button',{name:'Zoom in',exact:true}).click();
  const key=`linewatch-map-viewport-v1:${network}`;
  await expect.poll(()=>page.evaluate(key=>localStorage.getItem(key),key)).not.toBeNull();
  await page.mouse.move(190, 310);
  await page.mouse.down();
  await page.mouse.move(240, 350, { steps: 8 });
  await page.mouse.up();
  // A release while moving glides on; the viewport is saved once the camera settles.
  await expect.poll(()=>page.evaluate(()=>document.querySelector('[data-map-gesture-active="true"]')!==null)).toBe(false);
  await page.waitForTimeout(400);
  const before=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),key);
  await page.reload();
  if(network==='regional' && await page.locator('.linewatch-shell').getAttribute('data-network')!=='regional') {
   await page.locator('.mobile-map-network-switch').getByRole('button',{name:'GO/UP',exact:true}).click();
  }
  await page.waitForTimeout(1400);
  // A second zoom is relative to the restored camera, rather than the default fit.
  await page.getByRole('button',{name:'Zoom in',exact:true}).click();
  await expect.poll(async()=>{const value=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),key);return value?.zoom ?? 0;}).toBeCloseTo(before.zoom*1.25,1);
  const after = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), key);
  // Camera transforms snap to device pixels; allow a few SVG units at phone fit scale.
  expect(Math.abs(after.centerX - before.centerX)).toBeLessThan(4);
  expect(Math.abs(after.centerY - before.centerY)).toBeLessThan(4);
  await page.getByRole('button',{name:'Center map view',exact:true}).click();
  await expect.poll(()=>page.evaluate(key=>localStorage.getItem(key),key)).toBeNull();
 });
}

test('desktop camera stays where a cleared selection framed it when the map resizes', async ({ page, request, isMobile }) => {
  test.skip(isMobile);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await setStubMode(request, 'seeded');
  await installDismissedTransientUi(page);
  await page.addInitScript(() => localStorage.setItem('linewatch-seen-release-notes-version', '1.3.0'));
  await page.goto('/');
  const stage = page.locator('[data-system-map=ttc] .map-stage');
  await expect(stage).toHaveAttribute('data-raster-map-ready', 'true');
  const scaleOf = () => stage.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a);
  const fitted = await scaleOf();

  await page.locator('.desktop-status-rail-section')
    .getByRole('button', { name: /Sheppard-Yonge to Don Mills/i }).first().click();
  await expect.poll(scaleOf).toBeGreaterThan(fitted * 1.2);
  await page.waitForTimeout(1200);
  const framed = await scaleOf();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-impact-card-id="stub-delay-line-4"]')).not.toHaveClass(/selected/);
  await page.waitForTimeout(400);
  expect(await scaleOf()).toBeCloseTo(framed, 4);

  // The selection's framing was not the rider's gesture, but it is where they
  // were left; a resize once refit it and snapped back to the whole map.
  await page.setViewportSize({ width: 1600, height: 960 });
  await page.waitForTimeout(800);
  expect(await scaleOf()).toBeCloseTo(framed, 4);
});
