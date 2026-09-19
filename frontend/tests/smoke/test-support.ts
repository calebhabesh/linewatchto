import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { currentReleaseNote, RELEASE_NOTES_SEEN_STORAGE_KEY } from "../../src/app/release-notes";

export const appUrl = process.env.LINEWATCH_SMOKE_APP_URL ?? "http://127.0.0.1:4173";
export const stubUrl = process.env.LINEWATCH_SMOKE_STUB_URL ?? "http://127.0.0.1:4174";

export type StubMode =
  | "seeded"
  | "diagnostics-disabled"
  | "unavailable"
  | "map-authoritative-overlap"
  | "regional-live";

export async function setStubMode(request: APIRequestContext, mode: StubMode) {
  const response = await request.post(`${stubUrl}/__test/mode`, {
    data: { mode },
  });
  expect(response.ok()).toBeTruthy();
}

export async function installDismissedTransientUi(page: Page) {
  await page.clock.setFixedTime("2026-08-14T16:00:00.000Z");
  await page.addInitScript(({ releaseNotesKey, releaseVersion }) => {
    window.localStorage.setItem("linewatch-welcome-seen-v1", "true");
    window.localStorage.setItem("linewatch-unofficial-notice-ack-v1", "true");
    if (releaseVersion) window.localStorage.setItem(releaseNotesKey, releaseVersion);
    window.localStorage.setItem("linewatch-pwa-install-dismissed-at-v1", String(Date.now()));
  }, { releaseNotesKey: RELEASE_NOTES_SEEN_STORAGE_KEY, releaseVersion: currentReleaseNote?.version });
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
  await expect(page.locator("html")).not.toHaveAttribute("data-network-transition-direction");
}
