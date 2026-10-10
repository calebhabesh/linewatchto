import { test, expect } from '@playwright/test';
import { installDismissedTransientUi, setStubMode } from './test-support';

for (const network of ['ttc', 'regional'] as const) {
  for (const interruption of ['blur', 'hidden', 'pagehide', 'lost capture', 'released mouse'] as const) {
    test(`${network} camera ignores interrupted pointers after ${interruption}`, async ({ page, request, isMobile }) => {
      test.skip(isMobile && interruption === 'released mouse', 'Button-state recovery is specific to a mouse.');
      if (!isMobile) await page.setViewportSize({ width: 2048, height: 1164 });
      await setStubMode(request, 'seeded');
      await installDismissedTransientUi(page);
      await page.addInitScript(value => localStorage.setItem('linewatch-default-network-v1', value), network);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/');
      const stage = page.locator(`.${network}-map-stage`);
      await expect(stage).toHaveAttribute('data-raster-map-ready', 'true');
      await page.getByRole('button', { name: 'Center map view', exact: true }).click();
      const viewport = stage.locator('..');
      const pointer = { pointerId: 82, pointerType: isMobile ? 'touch' : 'mouse', isPrimary: true, button: 0, buttons: 1 };
      await viewport.dispatchEvent('pointerdown', { ...pointer, clientX: 200, clientY: 250 });
      await viewport.dispatchEvent('pointermove', { ...pointer, clientX: 230, clientY: 270 });
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const before = await stage.evaluate(element => element.style.transform);
      await viewport.evaluate((element, interruption) => {
        if (interruption === 'hidden') {
          Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
          document.dispatchEvent(new Event('visibilitychange'));
        } else if (interruption === 'blur') {
          window.dispatchEvent(new Event('blur'));
        } else if (interruption === 'pagehide') {
          window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
        } else if (interruption === 'lost capture') {
          element.dispatchEvent(new PointerEvent('lostpointercapture', { bubbles: true, pointerId: 82 }));
        } else {
          element.dispatchEvent(new PointerEvent('pointermove', {
            bubbles: true, pointerId: 82, pointerType: 'mouse', buttons: 0, clientX: 320, clientY: 390,
          }));
        }
      }, interruption);
      await expect(page.locator(network === 'ttc' ? '[data-map-pan-zoom-viewport]' : '.regional-map'))
        .toHaveAttribute('data-map-gesture-active', 'false');
      // The release occurs outside this page. Late movement must not continue
      // the old drag, either while hidden or when the pointer returns.
      await viewport.dispatchEvent('pointermove', { ...pointer, clientX: 320, clientY: 390 });
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      expect(await stage.evaluate(element => element.style.transform)).toBe(before);
      await page.evaluate(() => {
        delete (document as unknown as Record<string, unknown>).visibilityState;
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('focus'));
      });
      await viewport.dispatchEvent('pointermove', { ...pointer, buttons: 0, clientX: 350, clientY: 420 });
      await expect.poll(() => stage.evaluate(element => element.style.transform)).toBe(before);
      await expect(page.locator(network === 'ttc' ? '[data-map-pan-zoom-viewport]' : '.regional-map'))
        .toHaveAttribute('data-map-gesture-active', 'false');
      // A new gesture should still work after the interrupted one is discarded.
      await viewport.dispatchEvent('pointerdown', { ...pointer, clientX: 200, clientY: 250 });
      await viewport.dispatchEvent('pointermove', { ...pointer, clientX: 250, clientY: 280 });
      await viewport.dispatchEvent('pointerup', { ...pointer, buttons: 0, clientX: 250, clientY: 280 });
      await expect.poll(() => stage.evaluate(element => element.style.transform)).not.toBe(before);
    });
  }
}

for (const network of ['ttc', 'regional'] as const) {
  for (const gesture of ['drag', 'pinch'] as const) {
    test(`${network} discards a queued ${gesture} frame when the page becomes hidden`, async ({ page, request, isMobile }) => {
      if (!isMobile) await page.setViewportSize({ width: 2048, height: 1164 });
      await setStubMode(request, 'seeded');
      await installDismissedTransientUi(page);
      await page.addInitScript(value => localStorage.setItem('linewatch-default-network-v1', value), network);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/');
      const stage = page.locator(`.${network}-map-stage`);
      await expect(stage).toHaveAttribute('data-raster-map-ready', 'true');
      await page.getByRole('button', { name: 'Center map view', exact: true }).click();
      const before = await stage.evaluate(element => element.style.transform);
      await stage.locator('..').evaluate((viewport, gesture) => {
        const pointer = { bubbles: true, pointerId: 82, pointerType: 'touch', button: 0, buttons: 1, clientX: 200, clientY: 250 };
        viewport.dispatchEvent(new PointerEvent('pointerdown', pointer));
        if (gesture === 'pinch') {
          viewport.dispatchEvent(new PointerEvent('pointerdown', { ...pointer, pointerId: 83, clientX: 250 }));
        }
        viewport.dispatchEvent(new PointerEvent('pointermove', { ...pointer, clientX: 120, clientY: 180 }));
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
      }, gesture);
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      expect(await stage.evaluate(element => element.style.transform)).toBe(before);
      await page.evaluate(() => {
        delete (document as unknown as Record<string, unknown>).visibilityState;
        document.dispatchEvent(new Event('visibilitychange'));
      });
      // Neither finger can resume its old drag or pinch after returning.
      for (const pointerId of [82, 83]) {
        await stage.locator('..').dispatchEvent('pointermove', {
          pointerId, pointerType: 'touch', buttons: 1, clientX: 300, clientY: 400,
        });
      }
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      expect(await stage.evaluate(element => element.style.transform)).toBe(before);
    });
  }
}

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
      // A resumed feed can change alerts while the rider leaves the camera idle.
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await setStubMode(request, 'regional-live');
      const refresh = page.waitForResponse(response => response.url().includes(`/api/dashboard?network=${network}`));
      await page.evaluate(() => {
        delete (document as unknown as Record<string, unknown>).visibilityState;
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await refresh;
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      expect(await stage.evaluate(el => el.style.transform)).toBe(before);
    });
  }
}
