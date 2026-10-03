import { expect, test } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";

test.use({ serviceWorkers: "block" });

test("the first GO/UP transition matches the return to TTC after idle preparation", async ({ page, request, isMobile, browserName }) => {
  test.skip(!isMobile || browserName !== "chromium", "mobile Chromium timing regression");
  await installDismissedTransientUi(page);
  await setStubMode(request, "regional-live");
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.goto("/");
  await expect(page.locator(".ttc-map-entrance-reveal--ready")).toBeAttached();
  // Test the first switch after the browser has had time to prepare resources,
  // without selecting GO/UP as setup (which would hide the cold-switch bug).
  await page.waitForFunction(() => performance.now() > 3000);
  await expect(page.locator('[data-network-map-layer="regional"]')).toHaveAttribute("data-map-ready", "true");
  const samples: { network: string; preparationMs: number; totalMs: number }[] = [];
  for (const network of ["regional", "ttc"] as const) {
    samples.push(await page.evaluate(network => new Promise<{ network: string; preparationMs: number; totalMs: number }>(resolve => {
      const surface = document.querySelector<HTMLElement>(".network-map-transition-surface")!;
      const start = performance.now();
      let preparationMs = 0;
      const observer = new MutationObserver(() => {
        const phase = surface.dataset.mapSurfaceTransition;
        if (phase === "leaving") preparationMs = performance.now() - start;
        if (!phase && document.querySelector<HTMLElement>(".linewatch-shell")!.dataset.network === network) {
          observer.disconnect();
          resolve({ network, preparationMs, totalMs: performance.now() - start });
        }
      });
      observer.observe(surface, { attributes: true, attributeFilter: ["data-map-surface-transition"] });
      document.querySelector<HTMLButtonElement>(`.mobile-map-network-switch .network-btn-${network}`)!.click();
    }), network));
  }
  console.log("First mobile map transition timing", samples);
  // Allow paint variance with 4x CPU throttling while catching the former
  // multi-second preparation gap. Animation durations are checked separately.
  expect(Math.abs(samples[0].preparationMs - samples[1].preparationMs)).toBeLessThan(150);
  expect(Math.abs(samples[0].totalMs - samples[1].totalMs)).toBeLessThan(250);
  await session.detach();
});
