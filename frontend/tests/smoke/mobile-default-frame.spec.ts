import { expect, test } from '@playwright/test';

for (const network of ['ttc', 'regional'] as const) {
  test(`${network} opening is centered above the default service sheet`, async ({ page, isMobile }, testInfo) => {
    test.skip(!isMobile, 'mobile framing');
    await page.addInitScript(() => {
      localStorage.setItem('linewatch-welcome-seen-v1', 'true');
      localStorage.setItem('linewatch-unofficial-notice-ack-v1', 'true');
      localStorage.setItem('linewatch-pwa-install-dismissed-at-v1', String(Date.now()));
    });
    await page.goto('/?previewTime=2026-08-14T16:00:00.000Z');
    if (network === 'regional') await page.locator('.mobile-map-network-switch').getByRole('button', { name: 'GO/UP', exact: true }).click();
    await expect(page.locator(`.${network}-map-stage[data-raster-map-ready="true"]`)).toBeVisible();
    await expect(page.locator(".network-map-transition-surface")).not.toHaveAttribute("data-map-surface-transition");
    await expect.poll(() => page.locator(`.${network}-map-stage svg #station-union`).first().evaluate(el => {
      const rect = el.getBoundingClientRect();
      return Math.abs((rect.left + rect.right) / 2 - innerWidth / 2);
    })).toBeLessThan(2);
    await expect.poll(() => page.evaluate((mode) => {
      const stage = document.querySelector<HTMLElement>(`.${mode}-map-stage`)!;
      const viewport = document.querySelector<HTMLElement>(mode === 'ttc' ? '[data-map-pan-zoom-viewport]' : '.regional-map-viewport')!;
      const matrix = new DOMMatrix(getComputedStyle(stage).transform);
      const centerY = mode === 'ttc' ? (120 + 3840) / 2 * (4500 / 8250) : 110.78 + 2395.26 / 2;
      const actual = viewport.getBoundingClientRect().top + matrix.f + centerY * matrix.d;
      const chips = document.querySelector('.mobile-app-chip-scroll')!.getBoundingClientRect();
      const sheet = document.querySelector<HTMLElement>('.mobile-service-sheet')!;
      const minimum = sheet.querySelector('.mobile-service-sheet-minimum')!.getBoundingClientRect().height;
      const bottom = innerHeight - parseFloat(getComputedStyle(sheet).bottom) - minimum;
      return Math.abs(actual - (chips.bottom + bottom) / 2);
    }, network)).toBeLessThan(2);
    if (network === 'ttc') {
      const stage = page.locator('.ttc-map-stage');
      const openingScale = await stage.evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a);
      // The opening should enlarge stations beyond whole-network fit.
      expect(openingScale * (7925 - 65) * (4500 / 8250)).toBeGreaterThan(page.viewportSize()!.width * 1.4);
      await page.getByRole('button', { name: 'Zoom out', exact: true }).filter({ visible: true }).click();
      await expect.poll(() => stage.evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a)).toBeLessThan(openingScale);
      await page.getByRole('button', { name: 'Center map view', exact: true }).filter({ visible: true }).click();
      await expect.poll(() => stage.evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a)).toBeCloseTo(openingScale, 3);
    }
    await testInfo.attach(`${network}-default-frame`, { body: await page.screenshot({ path: `/tmp/linewatch-${network}-default-frame.png` }), contentType: 'image/png' });
  });
}
