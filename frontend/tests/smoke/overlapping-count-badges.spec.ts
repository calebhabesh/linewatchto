import { expect, test, type Locator } from "@playwright/test";

const stubUrl = process.env.LINEWATCH_SMOKE_STUB_URL ?? "http://127.0.0.1:4174";
const openMapPreviewUrl = "/?previewTime=2026-08-14T16:00:00.000Z";

async function expectGlyphInsideBadge(badge: Locator) {
  await expect(badge).toBeVisible();
  await expect(badge.locator("svg")).toHaveCount(1);
  await expect(badge.locator("text")).toHaveCount(1);

  const bounds = await badge.evaluate((element) => {
    const badgeBounds = element.getBoundingClientRect();
    const glyphBounds = element.querySelector("text")!.getBoundingClientRect();
    return {
      htmlTextNodeCount: [...element.childNodes].filter((node) => (
        node.nodeType === Node.TEXT_NODE && node.textContent?.trim()
      )).length,
      leftInset: glyphBounds.left - badgeBounds.left,
      rightInset: badgeBounds.right - glyphBounds.right,
      topInset: glyphBounds.top - badgeBounds.top,
      bottomInset: badgeBounds.bottom - glyphBounds.bottom,
    };
  });

  expect(bounds.htmlTextNodeCount).toBe(0);
  expect(bounds.leftInset).toBeGreaterThanOrEqual(0);
  expect(bounds.rightInset).toBeGreaterThanOrEqual(0);
  expect(bounds.topInset).toBeGreaterThanOrEqual(0);
  expect(bounds.bottomInset).toBeGreaterThanOrEqual(0);
}

test("overlapping count glyphs stay inside their badge through viewport and control transforms", async ({ page, request, isMobile }) => {
  await request.post(`${stubUrl}/__test/mode`, { data: { mode: "seeded" } });
  await page.setViewportSize(isMobile ? { width: 412, height: 915 } : { width: 1280, height: 800 });
  await page.addInitScript(() => {
    window.localStorage.setItem("linewatch-welcome-seen-v1", "true");
    window.localStorage.setItem("linewatch-unofficial-notice-ack-v1", "true");
    window.localStorage.setItem("linewatch-pwa-install-dismissed-at-v1", String(Date.now()));
  });
  await page.goto(openMapPreviewUrl);
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  const badge = isMobile
    ? page.locator(".mobile-bottom-nav-badge").first()
    : page.locator(".desktop-menu-count-badge");

  await expectGlyphInsideBadge(badge);

  if (isMobile) {
    for (const viewport of [{ width: 390, height: 844 }, { width: 412, height: 915 }]) {
      await page.setViewportSize(viewport);
      await page.getByRole("button", { name: "Status", exact: true }).click();
      await expectGlyphInsideBadge(badge);
      await page.getByRole("button", { name: "Map", exact: true }).click();
      await expectGlyphInsideBadge(badge);
    }
  } else {
    const menuButton = page.getByRole("button", { name: /Toggle menu/ });
    await menuButton.hover();
    await expectGlyphInsideBadge(badge);
    await page.setViewportSize({ width: 1100, height: 700 });
    await expectGlyphInsideBadge(badge);
  }
});
