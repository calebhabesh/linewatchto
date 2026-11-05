import { expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { currentReleaseNote, RELEASE_NOTES_SEEN_STORAGE_KEY } from "../../src/app/release-notes";

const appPort = process.env.LINEWATCH_APP_PORT ?? (process.env.LINEWATCH_SMOKE_APP_URL ? new URL(process.env.LINEWATCH_SMOKE_APP_URL).port : "4175");
export const appUrl = process.env.LINEWATCH_SMOKE_APP_URL ?? `http://127.0.0.1:${appPort}`;
export const stubUrl = process.env.LINEWATCH_SMOKE_STUB_URL ?? "http://127.0.0.1:4174";

export type StubMode =
  | "seeded"
  | "diagnostics-disabled"
  | "unavailable"
  | "map-authoritative-overlap"
  | "regional-live"
  | "regional-timed-trains";

export async function setStubMode(request: APIRequestContext, mode: StubMode) {
  const response = await request.post(`${stubUrl}/__test/mode`, {
    data: { mode },
  });
  expect(response.ok()).toBeTruthy();
}

export async function installDismissedTransientUi(page: Page, isoTime = "2026-08-14T16:00:00.000Z") {
  await page.addInitScript(({ releaseNotesKey, releaseVersion, isoTime }) => {
    window.localStorage.setItem("linewatch-welcome-seen-v1", "true");
    window.localStorage.setItem("linewatch-unofficial-notice-ack-v1", "true");
    if (releaseVersion) window.localStorage.setItem(releaseNotesKey, releaseVersion);
    window.localStorage.setItem("linewatch-pwa-install-dismissed-at-v1", String(Date.now()));
    const fixedTime = new Date(isoTime).getTime();
    const RealDate = Date;
    class MockDate extends RealDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) {
          super(fixedTime);
        } else {
          super(...(args as unknown as [number]));
        }
      }
      static now() {
        return fixedTime;
      }
    }
    window.Date = MockDate as unknown as DateConstructor;
  }, { releaseNotesKey: RELEASE_NOTES_SEEN_STORAGE_KEY, releaseVersion: currentReleaseNote?.version, isoTime });
}

export function reportBrowserErrors(page: Page) {
  page.on("console", (message) => {
    const text = message.text();
    const expectedStubNoise = /Failed to load resource: the server responded with a status of (404|503)/.test(text)
      || text === "Unable to preventDefault inside passive event listener invocation.";
    if (message.type() === "error" && !expectedStubNoise) {
      console.error("BROWSER CONSOLE:", text);
    }
  });
  page.on("pageerror", (error) => console.error("BROWSER ERROR:", error.message));
}

export async function waitForNetworkTransition(page: Page, network: "ttc" | "regional") {
  await expect(page.locator(".linewatch-shell")).toHaveAttribute("data-network", network);
  await expect(page.locator(".network-map-transition-surface")).not.toHaveAttribute("data-map-surface-transition");
  await expect(page.locator(".linewatch-shell")).not.toHaveAttribute("data-network-switch-target");
}

/**
 * Presses a map position until `target` shows, for something that draws only once
 * its data arrives. A press before then reaches what is under it: a stop, which flies
 * the camera away and opens a sheet, or a line, whose card can cover the position. So
 * each try clears those and presses where the position is now, not the screen's centre.
 */
export async function pressMapPoint(page: Page, point: { lng: number; lat: number }, target: Locator) {
  const lifecycle = () => page.evaluate(() => window.__linewatchGeographicMapLifecycle?.isMoving() ?? false);
  await expect.poll(async () => {
    if (await target.isVisible()) return true;
    const stopPanel = page.locator("[data-surface-stop-panel], [data-go-bus-stop-panel]");
    if (await stopPanel.isVisible()) {
      await stopPanel.getByRole("button", { name: /^Close/ }).first().click();
      await expect(stopPanel).toHaveCount(0);
    }
    const openCard = page.locator(".overlap-chooser-close");
    if (await openCard.isVisible()) {
      await openCard.click();
      await expect(openCard).toHaveCount(0);
    }
    await expect.poll(lifecycle).toBe(false);
    const at = await page.evaluate(({ lng, lat }) => window.__linewatchGeographicMapLifecycle?.projectPoint(lng, lat) ?? null, point);
    const box = await page.locator(".geographic-network-map canvas").boundingBox();
    if (at && box) await page.mouse.click(box.x + at.x, box.y + at.y);
    return target.isVisible();
  }, { timeout: 20_000, intervals: [1_000] }).toBe(true);
}
