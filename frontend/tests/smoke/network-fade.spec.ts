import { expect, test, type Page } from '@playwright/test';
import { installDismissedTransientUi, setStubMode } from './test-support';

type MapFadeSample = { target: string; duration: number; started: number; network: string | undefined; keyframes: Keyframe[] };
declare global { interface Window {
  __linewatchMapFadeProbe?: MapFadeSample[];
  __linewatchPauseMapFadeIn?: boolean;
  __linewatchTogglePaints?: { requested: string; displayed: string | undefined; delay: number }[];
  __linewatchPhysicalToggleTap?: (x: number, y: number) => Promise<void>;
  __linewatchPhysicalToggleHover?: (x: number, y: number) => Promise<void>;
  __linewatchToggleHoverStarted?: number;
  __linewatchMapPointerMove?: (x: number, y: number) => Promise<void>;
} }

const previewUrl = '/?previewTime=2026-08-14T16:00:00.000Z';
const activeDiagram = (page: Page, network: string) => page.locator(`.network-diagram-layer[data-network-map-layer="${network}"]:not([data-preparing])`);
const networkButton = (page: Page, mobile: boolean, network: string) => page.locator(mobile
  ? `.mobile-map-network-switch .network-btn-${network}`
  : `.desktop-map-control-network-group .network-btn-${network}:visible, .network-diagram-layer:not([data-preparing]) .map-control-rail .network-btn-${network}:visible`).first();

async function settled(page: Page, network: string) {
  await expect(page.locator('.linewatch-shell')).toHaveAttribute('data-network', network);
  await expect(page.locator('.network-map-transition-surface')).not.toHaveAttribute('data-map-surface-transition');
  await expect(page.locator('.linewatch-shell')).not.toHaveAttribute('data-network-switch-target');
}

async function prepareBothDiagrams(page: Page, mobile: boolean) {
  // Check both sources and prepare both diagrams before measuring subsequent
  // swaps. Cold status/source behavior has its own switch regression coverage.
  await expect(activeDiagram(page, 'ttc')).toHaveAttribute('data-map-ready', 'true');
  await networkButton(page, mobile, 'regional').click();
  await settled(page, 'regional');
  await networkButton(page, mobile, 'ttc').click();
  await settled(page, 'ttc');
  await page.evaluate(() => {
    window.__linewatchMapFadeProbe = [];
    window.__linewatchTogglePaints = [];
  });
  await expect(page.locator('.network-diagram-layer[data-map-ready="true"]')).toHaveCount(2);
}

test.describe('network artwork fades', () => {
  test.use({ serviceWorkers: 'block' });
  test.beforeEach(async ({ page, request, isMobile }) => {
    await setStubMode(request, 'seeded');
    await installDismissedTransientUi(page);
    await page.setViewportSize(isMobile ? { width: 360, height: 780 } : { width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.addInitScript(() => {
      localStorage.setItem('linewatch-map-view-v1', 'diagram');
      window.__linewatchMapFadeProbe = [];
      window.__linewatchTogglePaints = [];
      document.addEventListener('pointerover', event => {
        const button = event.target instanceof Element ? event.target.closest('.network-selector-btn') : null;
        if (button && !(event.relatedTarget instanceof Node && button.contains(event.relatedTarget))) {
          window.__linewatchToggleHoverStarted = performance.now();
        }
      }, true);
      document.addEventListener('click', event => {
        const button = event.target instanceof Element ? event.target.closest('.network-selector-btn') : null;
        if (!button) return;
        const requested = button.classList.contains('network-btn-regional') ? 'regional' : 'ttc';
        const selector = button.closest<HTMLElement>('.network-selector')!;
        const started = performance.now();
        requestAnimationFrame(() => window.__linewatchTogglePaints!.push({ requested,
          displayed: selector.dataset.network, delay: performance.now() - started }));
      }, true);
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (keyframes, options) {
        if (this.closest('.network-map-transition-surface') && Array.isArray(keyframes)
          && keyframes.some(frame => frame.opacity !== undefined)) {
          window.__linewatchMapFadeProbe!.push({ target: this.classList.contains('ttc-map-stage') || this.classList.contains('regional-map-stage') ? 'artwork' : 'other',
            duration: typeof options === 'number' ? options : Number(options?.duration),
            started: performance.now(),
            network: this.closest<HTMLElement>('[data-network-map-layer]')?.dataset.networkMapLayer,
            keyframes });
        }
        const animation = animate.call(this, keyframes, options);
        if (window.__linewatchPauseMapFadeIn && Array.isArray(keyframes) && keyframes[0]?.opacity === 0
          && this.matches('.ttc-map-stage, .regional-map-stage')) animation.pause();
        return animation;
      };
    });
  });

  test('both directions fade only artwork with equal timing and keep the selector moving independently', async ({ page, isMobile }) => {
    await page.goto(previewUrl);
    await expect(page.locator('.ttc-map-stage')).toHaveAttribute('data-raster-map-ready', 'true');
    await prepareBothDiagrams(page, isMobile);
    if (!isMobile) {
      await expect(page.locator('.map-control-rail .network-selector')).toHaveCount(1);
      await expect(page.locator('.map-control-rail .network-selector')).toHaveAttribute('data-network', 'ttc');
    }
    const ttcStations = await page.locator('.ttc-map-stage .station-hit-target').count();
    expect(ttcStations).toBeGreaterThan(0);
    const taps: number[] = [];
    for (const network of ['regional', 'ttc', 'regional', 'ttc']) {
      taps.push(await page.evaluate(() => performance.now()));
      await networkButton(page, isMobile, network).click();
      await expect(page.locator('.network-selector:visible').first()).toHaveAttribute('data-network', network);
      await expect(page.locator('.network-switch-notice')).toHaveCount(0);
      expect(await page.locator('.network-selector:visible').first().locator('.network-selector-glider').evaluate(element =>
        element.getAnimations().some(animation => animation.effect instanceof KeyframeEffect
          && Number(animation.effect.getComputedTiming().duration) > 0
          && animation.effect.getKeyframes().some(frame => frame.transform !== undefined)),
      )).toBe(true);
      await settled(page, network);
      await expect(activeDiagram(page, network)).toBeVisible();
      const other = activeDiagram(page, network === 'ttc' ? 'regional' : 'ttc');
      await expect(other).toHaveCount(0);
      await expect(page.locator('.ttc-map-stage .station-hit-target')).toHaveCount(ttcStations);
      const stableUi = await page.locator('.map-control-rail:visible, .network-map-legend:visible, .mobile-bottom-nav:visible').evaluateAll(elements => elements.every(element => {
        for (let current: Element | null = element; current; current = current.parentElement) {
          if (Number(getComputedStyle(current).opacity) !== 1) return false;
        }
        return true;
      }));
      expect(stableUi).toBe(true);
    }
    const fades = await page.evaluate(() => window.__linewatchMapFadeProbe ?? []);
    const togglePaints = await page.evaluate(() => window.__linewatchTogglePaints ?? []);
    console.log('Map switching timing', { mapSwapMs: fades.filter((_, index) => index % 2 === 1)
      .map((fade, index) => Math.round(fade.started - fades[index * 2].started)), togglePaintMs: togglePaints.map(paint => Math.round(paint.delay)) });
    expect(fades).toHaveLength(8);
    expect(fades.every(fade => fade.target === 'artwork')).toBe(true);
    expect(fades.map(fade => fade.duration)).toEqual([100, 150, 100, 150, 100, 150, 100, 150]);
    for (let index = 0; index < fades.length; index += 2) {
      expect(fades[index].started - taps[index / 2]).toBeLessThan(250);
      // Allow headless rendering variance while catching the previous delayed handoff.
      expect(fades[index + 1].started - fades[index].started).toBeLessThan(250);
    }
    expect(fades.every(fade => fade.keyframes.every(frame => frame.transform === undefined))).toBe(true);
    expect(togglePaints).toHaveLength(4);
    expect(togglePaints.every(paint => paint.requested === paint.displayed && paint.delay < 100)).toBe(true);
  });

  test('the selector can reverse a switch during either fade and the latest choice wins', async ({ page, isMobile }) => {
    await page.goto(previewUrl);
    await prepareBothDiagrams(page, isMobile);
    for (const phase of ['leaving', 'entering']) {
      await networkButton(page, isMobile, 'regional').click();
      await expect(page.locator('.network-map-transition-surface')).toHaveAttribute('data-map-surface-transition', phase);
      await networkButton(page, isMobile, 'ttc').click();
      await settled(page, 'ttc');
      await expect(page.locator('.network-selector:visible').first()).toHaveAttribute('data-network', 'ttc');
      await expect(activeDiagram(page, 'ttc')).toBeVisible();
      expect(await page.locator('.ttc-map-stage').evaluate(stage => getComputedStyle(stage).opacity)).toBe('1');
    }
  });

  test('an immediate return switch responds without a cooldown', async ({ page, isMobile }) => {
    await page.goto(previewUrl);
    await prepareBothDiagrams(page, isMobile);
    const taps = await page.evaluate(async mobile => {
      const shell = document.querySelector<HTMLElement>('.linewatch-shell')!;
      const surface = document.querySelector<HTMLElement>('.network-map-transition-surface')!;
      const taps: { network: string; started: number; handlerMs: number }[] = [];
      let pending = 'ttc';
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Immediate return switching stalled')), 10000);
        const tick = () => {
          if (shell.dataset.network === pending && !shell.dataset.networkSwitchTarget && !surface.dataset.mapSurfaceTransition) {
            if (taps.length === 8) { clearTimeout(timeout); resolve(); return; }
            pending = pending === 'ttc' ? 'regional' : 'ttc';
            const selectors = mobile ? '.mobile-map-network-switch' : '.desktop-map-control-network-group';
            const button = Array.from(document.querySelectorAll<HTMLButtonElement>(selectors.split(', ')
              .map(selector => `${selector} .network-btn-${pending}`).join(', ')))
              .find(button => button.checkVisibility({ visibilityProperty: true, opacityProperty: true }) && !button.closest('[inert]'))!;
            const bounds = button.getBoundingClientRect();
            const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
            if (!hit || !button.contains(hit)) { clearTimeout(timeout); reject(new Error('The return switch is blocked')); return; }
            const started = performance.now();
            button.click();
            taps.push({ network: pending, started, handlerMs: performance.now() - started });
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      return taps;
    }, isMobile);
    const fades = await page.evaluate(() => window.__linewatchMapFadeProbe ?? []);
    const paints = await page.evaluate(() => window.__linewatchTogglePaints ?? []);
    console.log('Immediate return switching', { handlers: taps.map(tap => Math.round(tap.handlerMs)),
      firstPaintMs: paints.map(paint => Math.round(paint.delay)),
      fadeStartMs: taps.map((tap, index) => Math.round(fades[index * 2].started - tap.started)) });
    expect(fades).toHaveLength(16);
    expect(paints).toHaveLength(8);
    expect(paints.every(paint => paint.requested === paint.displayed && paint.delay < 100)).toBe(true);
    expect(taps.every((tap, index) => fades[index * 2].started - tap.started < 100)).toBe(true);
    await settled(page, 'ttc');
  });

  test('pointer taps and hover remain responsive immediately after every swap', async ({ page, isMobile }) => {
    await page.goto(previewUrl);
    await prepareBothDiagrams(page, isMobile);
    const session = await page.context().newCDPSession(page);
    await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.exposeFunction('__linewatchPhysicalToggleTap', async (x: number, y: number) => {
      if (isMobile) await page.touchscreen.tap(x, y);
      else await page.mouse.click(x, y);
    });
    await page.exposeFunction('__linewatchPhysicalToggleHover', (x: number, y: number) => page.mouse.move(x, y));
    const hoverPaints = await page.evaluate(async mobile => {
      const shell = document.querySelector<HTMLElement>('.linewatch-shell')!;
      const surface = document.querySelector<HTMLElement>('.network-map-transition-surface')!;
      const hoverPaints: number[] = [];
      for (let index = 0; index < 8; index++) {
        const network = index % 2 === 0 ? 'regional' : 'ttc';
        const selector = mobile ? '.mobile-map-network-switch' : '.desktop-map-control-network-group';
        const button = document.querySelector<HTMLButtonElement>(`${selector} .network-btn-${network}`)!;
        const bounds = button.getBoundingClientRect();
        await window.__linewatchPhysicalToggleTap!(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('A physical toggle tap was ignored')), 2500);
          const tick = () => {
            if (shell.dataset.network === network && !shell.dataset.networkSwitchTarget && !surface.dataset.mapSurfaceTransition) {
              clearTimeout(timeout);
              resolve();
            } else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        if (!mobile) {
          const visibleButton = document.querySelector<HTMLButtonElement>(`${selector} .network-btn-${network}`)!;
          if (!visibleButton.matches(':hover')) throw new Error('Toggle hover was lost when its map changed');
          const otherButton = document.querySelector<HTMLButtonElement>(`${selector} .network-btn-${network === 'regional' ? 'ttc' : 'regional'}`)!;
          const otherBounds = otherButton.getBoundingClientRect();
          await window.__linewatchPhysicalToggleHover!(otherBounds.x + otherBounds.width / 2, otherBounds.y + otherBounds.height / 2);
          const started = window.__linewatchToggleHoverStarted!;
          await new Promise<void>((resolve, reject) => {
            const tick = () => {
              const elapsed = performance.now() - started;
              if (otherButton.matches(':hover') && getComputedStyle(otherButton).backgroundColor === 'rgba(255, 255, 255, 0.09)') {
                hoverPaints.push(elapsed);
                resolve();
              } else if (elapsed > 100) reject(new Error('The opposite toggle option did not highlight immediately'));
              else requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          });
        }
      }
      return hoverPaints;
    }, isMobile);
    const paints = await page.evaluate(() => window.__linewatchTogglePaints ?? []);
    console.log('Physical return switching', { clickPaintMs: paints.map(paint => Math.round(paint.delay)),
      hoverPaintMs: hoverPaints.map(delay => Math.round(delay)) });
    expect(paints).toHaveLength(8);
    expect(paints.every(paint => paint.requested === paint.displayed && paint.delay < 100)).toBe(true);
    expect(hoverPaints.every(delay => delay < 100)).toBe(true);
    await settled(page, 'ttc');
  });

  test('map badges and overlays accept hover on the first frame after each fade', async ({ page, request, isMobile }) => {
    test.skip(isMobile, 'Mouse hover requires a desktop pointer');
    await setStubMode(request, 'regional-live');
    await page.goto(previewUrl);
    await prepareBothDiagrams(page, isMobile);
    await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
    const session = await page.context().newCDPSession(page);
    await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.exposeFunction('__linewatchMapPointerMove', (x: number, y: number) => page.mouse.move(x, y));
    const timings = await page.evaluate(async () => {
      const surface = document.querySelector<HTMLElement>('.network-map-transition-surface')!;
      const shell = document.querySelector<HTMLElement>('.linewatch-shell')!;
      const timings: { network: string; handlerMs: number }[] = [];
      const preparedTargets = Array.from(document.querySelectorAll<SVGElement>(
        '.network-diagram-layer .regional-impact-hit-target, .network-diagram-layer .station-hit-target',
      ));
      let eventStarted = 0;
      let hoveredLayer: HTMLElement | null = null;
      let hoverSelector = '';
      let handlerMs: number | null = null;
      let hoverApplied = false;
      document.addEventListener('pointerover', event => {
        if (event.target instanceof Element && event.target.closest('.overlap-indicator')) eventStarted = performance.now();
      }, true);
      // This runs after React's pointer-enter handler, before the next paint.
      document.addEventListener('pointerover', event => {
        if (!(event.target instanceof Element) || !event.target.closest('.overlap-indicator')) return;
        hoverApplied = Boolean(hoveredLayer?.querySelector(hoverSelector));
        handlerMs = performance.now() - eventStarted;
      });
      for (const network of ['regional', 'ttc', 'regional', 'ttc']) {
        await window.__linewatchMapPointerMove!(window.innerWidth - 10, 10);
        document.querySelector<HTMLButtonElement>(`.desktop-map-control-network-group .network-btn-${network}`)!.click();
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Map fade did not complete')), 3000);
          const tick = () => {
            if (shell.dataset.network === network && !surface.dataset.mapSurfaceTransition) {
              clearTimeout(timeout); resolve();
            } else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        if (preparedTargets.some(target => !target.isConnected)) throw new Error('A swap rebuilt prepared map hit targets');
        const layer = document.querySelector<HTMLElement>(`.network-diagram-layer[data-network-map-layer="${network}"]:not([data-preparing])`)!;
        const badges = Array.from(layer.querySelectorAll<SVGElement>('.overlap-indicator'));
        const marker = badges.find(badge => {
          const bounds = badge.getBoundingClientRect();
          const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
          return hit && badge.contains(hit);
        });
        if (!marker) throw new Error(`No reachable ${network} badge immediately after fade`);
        const bounds = marker.getBoundingClientRect();
        hoveredLayer = layer;
        hoverSelector = network === 'ttc' ? '[data-ttc-impact-hovered="true"]'
          : '.regional-impact-hover-foreground[data-regional-impact-hovered="true"]';
        handlerMs = null;
        hoverApplied = false;
        await window.__linewatchMapPointerMove!(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        if (!hoverApplied || handlerMs === null) throw new Error(`${network} ignored the first badge hover after fade`);
        timings.push({ network, handlerMs });
        for (let frame = 0; frame < 3; frame++) {
          await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
          const preview = layer.querySelector(hoverSelector);
          if (!marker.matches(':hover') || !preview || getComputedStyle(preview).visibility !== 'visible') {
            throw new Error(`${network} lost badge hover after the swap`);
          }
        }
        await window.__linewatchMapPointerMove!(window.innerWidth - 10, 10);
        let overlayPoint: { x: number; y: number } | null = null;
        for (const path of layer.querySelectorAll<SVGPathElement>('.map-segment-hit-target')) {
          const matrix = path.getScreenCTM();
          if (!matrix) continue;
          for (const fraction of [0.25, 0.5, 0.75]) {
            const point = path.getPointAtLength(path.getTotalLength() * fraction).matrixTransform(matrix);
            const hit = document.elementFromPoint(point.x, point.y);
            if (hit && path.contains(hit)) { overlayPoint = point; break; }
          }
          if (overlayPoint) break;
        }
        if (!overlayPoint) throw new Error(`No reachable ${network} overlay after fade`);
        await window.__linewatchMapPointerMove!(overlayPoint.x, overlayPoint.y);
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        const overlayPreview = layer.querySelector(hoverSelector);
        if (!overlayPreview || getComputedStyle(overlayPreview).visibility !== 'visible') {
          throw new Error(`${network} ignored the first overlay hover after fade`);
        }
      }
      return timings;
    });
    console.log('Immediate map badge hover', timings);
    expect(timings.every(timing => timing.handlerMs < 100)).toBe(true);
  });

  test('the hovered and focused toggle stays in place when the map changes', async ({ page, isMobile }) => {
    await page.goto(previewUrl);
    await prepareBothDiagrams(page, isMobile);
    const toggle = await networkButton(page, isMobile, 'regional').elementHandle();
    await toggle!.focus();
    await toggle!.press('Enter');
    await settled(page, 'regional');
    expect(await toggle!.evaluate(button => document.activeElement === button
      && button.checkVisibility({ visibilityProperty: true, opacityProperty: true })
      && !button.closest('[inert]'))).toBe(true);
    if (!isMobile) {
      await networkButton(page, isMobile, 'ttc').hover();
      await expect(networkButton(page, isMobile, 'ttc')).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.09)');
    }
  });

  test('the first station tap after a fade selects immediately in both directions', async ({ page, isMobile }) => {
    await page.goto(previewUrl);
    await prepareBothDiagrams(page, isMobile);
    if (!isMobile) await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
    await page.exposeFunction('__linewatchPhysicalToggleTap', async (x: number, y: number) => {
      if (isMobile) await page.touchscreen.tap(x, y);
      else await page.mouse.click(x, y);
    });
    const selections = await page.evaluate(async mobile => {
      const surface = document.querySelector<HTMLElement>('.network-map-transition-surface')!;
      const shell = document.querySelector<HTMLElement>('.linewatch-shell')!;
      const selections: string[] = [];
      for (const network of ['regional', 'ttc', 'regional', 'ttc']) {
        const selector = mobile ? '.mobile-map-network-switch' : '.desktop-map-control-network-group';
        document.querySelector<HTMLButtonElement>(`${selector} .network-btn-${network}`)!.click();
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Map fade did not complete')), 3000);
          const tick = () => {
            if (shell.dataset.network === network && !surface.dataset.mapSurfaceTransition) {
              clearTimeout(timeout); resolve();
            } else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        const layer = document.querySelector<HTMLElement>(`.network-diagram-layer[data-network-map-layer="${network}"]:not([data-preparing])`)!;
        const targetSelector = network === 'ttc' ? '.station-hit-target' : '.regional-station-hit-target';
        const station = Array.from(layer.querySelectorAll<SVGElement>(targetSelector)).find(station => {
          const bounds = station.getBoundingClientRect();
          const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
          return hit && station.contains(hit);
        });
        if (!station) throw new Error(`No reachable ${network} station after fade`);
        const stationId = station.dataset.stationId ?? station.dataset.regionalStationId;
        const bounds = station.getBoundingClientRect();
        await window.__linewatchPhysicalToggleTap!(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        const selected = network === 'ttc' ? station.classList.contains('selected')
          : station.dataset.regionalStationSelected === 'true';
        if (!selected) throw new Error(`The first ${network} station tap after fade was ignored`);
        selections.push(`${network}:${stationId}`);
        if (mobile) {
          const close = await new Promise<HTMLButtonElement>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Station details did not open')), 2000);
            const tick = () => {
              const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button[aria-label="Close station details"]'))
                .find(button => button.checkVisibility({ visibilityProperty: true }));
              if (button) { clearTimeout(timeout); resolve(button); }
              else requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          });
          close.click();
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Station details did not return to the map')), 2000);
            const tick = () => {
              if (document.querySelector('.mobile-map-network-switch')) { clearTimeout(timeout); resolve(); }
              else requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          });
        }
      }
      return selections;
    }, isMobile);
    expect(selections).toHaveLength(4);
  });

  for (const theme of ['dark', 'light']) {
    test(`TTC and GO/UP share the same visible fade-in curve in ${theme} theme`, async ({ page, isMobile }) => {
      await page.addInitScript(theme => localStorage.setItem('linewatch-theme-v1', theme), theme);
      await page.goto(previewUrl);
      await prepareBothDiagrams(page, isMobile);
      await page.evaluate(() => { window.__linewatchPauseMapFadeIn = true; });
      const curves: number[][] = [];
      for (const network of ['regional', 'ttc']) {
        await networkButton(page, isMobile, network).click();
        await expect(page.locator('.network-map-transition-surface')).toHaveAttribute('data-map-surface-transition', 'entering');
        curves.push(await activeDiagram(page, network).locator('.ttc-map-stage, .regional-map-stage').evaluate(stage => {
          const animation = stage.getAnimations().find(animation => animation.effect instanceof KeyframeEffect
            && animation.effect.getKeyframes()[0]?.opacity === '0')!;
          if (getComputedStyle(stage).pointerEvents === 'none' || stage.closest('[inert]')) {
            throw new Error('The incoming map is visible but still blocks interaction');
          }
          const curve = [0, 37.5, 75, 112.5, 150].map(time => {
            animation.currentTime = time;
            for (let current: Element | null = stage; current; current = current.parentElement) {
              if (getComputedStyle(current).visibility !== 'visible') throw new Error('Artwork is hidden during its fade');
              if (current !== stage && getComputedStyle(current).opacity !== '1') throw new Error('A second opacity affects the fade');
            }
            return Number(getComputedStyle(stage).opacity);
          });
          animation.currentTime = 0;
          animation.play();
          return curve;
        }));
        await settled(page, network);
      }
      expect(curves[0]).toEqual(curves[1]);
      expect(curves[0][0]).toBe(0);
      expect(curves[0][2]).toBeGreaterThan(0.5);
      expect(curves[0][4]).toBe(1);
    });
  }

  test('a slow destination retains the current artwork, controls and labels, and a later tap cancels the switch', async ({ page, isMobile }) => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route(/\/regional-rail-map\.svg/, async route => { await gate; await route.continue(); });
    try {
      await page.goto(previewUrl);
      await expect(page.locator('.ttc-map-stage')).toHaveAttribute('data-raster-map-ready', 'true');
      await networkButton(page, isMobile, 'regional').click();
      await expect(page.locator('.linewatch-shell')).toHaveAttribute('data-network-switch-target', 'regional');
      await expect(page.locator('.network-switch-notice')).toHaveCount(0);
      await expect(page.locator('.linewatch-shell')).toHaveAttribute('data-network', 'ttc');
      await expect(activeDiagram(page, 'ttc')).toBeVisible();
      expect(await page.locator('.ttc-map-stage').evaluate(element => getComputedStyle(element).opacity)).toBe('1');
      await expect(page.locator('.network-selector:visible').first()).toHaveAttribute('data-network', 'regional');
      await networkButton(page, isMobile, 'ttc').click();
      await settled(page, 'ttc');
      release();
      if (!isMobile) await expect(page.locator('.regional-map-stage')).toHaveAttribute('data-raster-map-ready', 'true');
      await expect(page.locator('.linewatch-shell')).toHaveAttribute('data-network', 'ttc');
      await networkButton(page, isMobile, 'regional').click();
      await settled(page, 'regional');
    } finally { release(); }
  });

  test('failed destination loading retains the map and can be retried', async ({ page, isMobile }) => {
    let fail = true;
    await page.route(/\/regional-rail-map\.svg/, route => fail
      ? route.fulfill({ status: 503, body: 'unavailable' }) : route.continue());
    await page.goto(previewUrl);
    await expect(page.locator('.ttc-map-stage')).toHaveAttribute('data-raster-map-ready', 'true');
    await networkButton(page, isMobile, 'regional').click();
    const retry = page.locator('.network-switch-notice').getByRole('button', { name: 'Retry' });
    await expect(retry).toBeVisible();
    await expect(page.locator('.linewatch-shell')).toHaveAttribute('data-network', 'ttc');
    await expect(activeDiagram(page, 'ttc')).toBeVisible();
    fail = false;
    await retry.click();
    await settled(page, 'regional');
  });

  test('reduced motion switches a ready map without fades', async ({ page, isMobile }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(previewUrl);
    await expect(page.locator('.ttc-map-stage')).toHaveAttribute('data-raster-map-ready', 'true');
    await networkButton(page, isMobile, 'regional').click();
    await settled(page, 'regional');
    expect(await page.evaluate(() => window.__linewatchMapFadeProbe ?? [])).toEqual([]);
  });

  test('geographic switching keeps one base canvas and camera while replacing only network layers', async ({ page, isMobile }) => {
    await page.addInitScript(() => localStorage.setItem('linewatch-map-view-v1', 'geographic'));
    // A deterministic fixture basemap isolates transit lifecycle from provider/tile latency.
    await page.route('https://tiles.openfreemap.org/styles/*', route => route.fulfill({ json: {
      version: 8, sources: {}, glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
      layers: [{ id: 'fixture-base', type: 'background', paint: { 'background-color': '#e5edf0' } }],
    } }));
    await page.route('https://tiles.openfreemap.org/fonts/**', route => route.fulfill({ body: Buffer.alloc(0), contentType: 'application/x-protobuf' }));
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && /opacity|expression|layer|global-state/i.test(message.text())) errors.push(message.text()); });
    await page.goto(previewUrl);
    const geographic = page.locator('.geographic-network-map');
    await expect(geographic).toHaveAttribute('data-status', 'ready');
    const canvas = await geographic.locator('canvas').elementHandle();
    const initial = await page.evaluate(() => ({ constructors: window.__linewatchGeographicMapLifecycle!.constructors,
      camera: window.__linewatchGeographicMapLifecycle!.getCamera() }));
    for (const network of ['regional', 'ttc', 'regional']) {
      await networkButton(page, isMobile, network).click();
      await settled(page, network);
      expect(await canvas!.evaluate(element => element.isConnected && getComputedStyle(element).opacity === '1')).toBe(true);
      const current = await page.evaluate(() => ({ constructors: window.__linewatchGeographicMapLifecycle!.constructors,
        removals: window.__linewatchGeographicMapLifecycle!.removals, styleReplacements: window.__linewatchGeographicMapLifecycle!.styleReplacements,
        camera: window.__linewatchGeographicMapLifecycle!.getCamera() }));
      expect(current.constructors).toBe(initial.constructors);
      expect(current.removals).toBe(0);
      expect(current.styleReplacements).toBe(0);
      expect(current.camera).toEqual(initial.camera);
      await expect(geographic).toHaveAttribute('data-network', network);
      await expect(geographic.locator('.maplibregl-ctrl-attrib')).toContainText(network === 'regional' ? 'Metrolinx' : 'City of Toronto');
    }
    expect(errors).toEqual([]);
  });
});
