import { test, expect } from '@playwright/test';
import { installDismissedTransientUi, setStubMode } from './test-support';
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
  await page.waitForTimeout(250);
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
