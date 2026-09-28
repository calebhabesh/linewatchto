import { test, expect } from '@playwright/test';
import { installDismissedTransientUi, setStubMode } from './test-support';

for (const network of ['ttc', 'regional'] as const) {
  for (const explored of [false, true]) {
    test(`${network} ${explored ? 'explored' : 'fitted'} camera survives background layout changes`, async ({ page, request, isMobile }) => {
      if (!isMobile) await page.setViewportSize({ width: 2048, height: 1164 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await setStubMode(request, 'seeded');
      await installDismissedTransientUi(page);
      await page.addInitScript(value => localStorage.setItem('linewatch-default-network-v1', value), network);
      await page.goto('/');
      const stage = page.locator(`.${network}-map-stage`);
      await expect(stage).toHaveAttribute('data-raster-map-ready', 'true');
      await expect(stage).toBeVisible();
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await page.getByRole('button', { name: 'Center map view', exact: true }).click();
      if (explored) {
        await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
        await page.mouse.move(isMobile ? 190 : 1100, 310);
        await page.mouse.down();
        await page.mouse.move(isMobile ? 240 : 1150, 350, { steps: 8 });
        await page.mouse.up();
      }
      // Flush layout effects before recording the settled camera.
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const before = await stage.evaluate(el => el.style.transform);
      expect(before).not.toBe('');
      for (let cycle = 0; cycle < 3; cycle++) {
        const hidden = await stage.evaluate(async el => {
          const viewport = el.parentElement!;
          // Simulate a background browser reporting a collapsed layout. Keeping
          // the real CSS size unchanged means no resize is required on resume.
          Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
          document.dispatchEvent(new Event('visibilitychange'));
          Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 40 });
          Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 40 });
          window.dispatchEvent(new Event('resize'));
          await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          const hiddenTransform = el.style.transform;
          delete (viewport as unknown as Record<string, unknown>).clientWidth;
          delete (viewport as unknown as Record<string, unknown>).clientHeight;
          delete (document as unknown as Record<string, unknown>).visibilityState;
          document.dispatchEvent(new Event('visibilitychange'));
          await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          return hiddenTransform;
        });
        expect(hidden).toBe(before);
        await expect.poll(() => stage.evaluate(el => el.style.transform)).toBe(before);
      }
    });
  }
}
