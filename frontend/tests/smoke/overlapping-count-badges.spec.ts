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
      glyphHeight: glyphBounds.height,
      leftInset: glyphBounds.left - badgeBounds.left,
      rightInset: badgeBounds.right - glyphBounds.right,
      topInset: glyphBounds.top - badgeBounds.top,
      bottomInset: badgeBounds.bottom - glyphBounds.bottom,
    };
  });

  expect(bounds.htmlTextNodeCount).toBe(0);
  expect(bounds.glyphHeight).toBeGreaterThanOrEqual(12);
  expect(bounds.leftInset).toBeGreaterThanOrEqual(0);
  expect(bounds.rightInset).toBeGreaterThanOrEqual(0);
  expect(bounds.topInset).toBeGreaterThanOrEqual(0);
  expect(bounds.bottomInset).toBeGreaterThanOrEqual(0);
}

async function expectMapVectorGlyphInsideBadge(marker: Locator) {
  await expect(marker).toBeVisible();
  const countBadges = marker.locator(".overlap-indicator-count-badge");
  expect(await countBadges.count()).toBeGreaterThan(0);

  const results = await countBadges.evaluateAll((circles) => circles.map((circle) => {
    const group = circle.parentElement;
    const glyph = group?.querySelector<SVGGraphicsElement>(".overlap-indicator-vector-label");
    const badgeBounds = circle.getBoundingClientRect();
    const glyphBounds = glyph?.getBoundingClientRect();
    return {
      glyphPathCount: glyph?.querySelectorAll("path").length ?? 0,
      liveTextCount: group?.querySelectorAll("text").length ?? -1,
      leftInset: glyphBounds ? glyphBounds.left - badgeBounds.left : -1,
      rightInset: glyphBounds ? badgeBounds.right - glyphBounds.right : -1,
      topInset: glyphBounds ? glyphBounds.top - badgeBounds.top : -1,
      bottomInset: glyphBounds ? badgeBounds.bottom - glyphBounds.bottom : -1,
    };
  }));

  for (const result of results) {
    expect(result.glyphPathCount).toBeGreaterThan(0);
    expect(result.liveTextCount).toBe(0);
    expect(result.leftInset).toBeGreaterThanOrEqual(0);
    expect(result.rightInset).toBeGreaterThanOrEqual(0);
    expect(result.topInset).toBeGreaterThanOrEqual(0);
    expect(result.bottomInset).toBeGreaterThanOrEqual(0);
  }
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
    : page.locator(".desktop-menu-count-badge").first();

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

test("TTC and GO/UP map overlap counts stay bounded through mobile compositor changes", async ({ page, request, isMobile }) => {
  await page.setViewportSize(isMobile ? { width: 412, height: 915 } : { width: 1280, height: 800 });
  await page.addInitScript(() => {
    window.localStorage.setItem("linewatch-welcome-seen-v1", "true");
    window.localStorage.setItem("linewatch-unofficial-notice-ack-v1", "true");
    window.localStorage.setItem("linewatch-pwa-install-dismissed-at-v1", String(Date.now()));
  });

  await request.post(`${stubUrl}/__test/mode`, { data: { mode: "seeded" } });
  await page.goto(openMapPreviewUrl);
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
  const ttcMarker = page.locator('[data-overlap-segment-id="stub-line-1-segment"]');
  await expectMapVectorGlyphInsideBadge(ttcMarker);

  if (isMobile) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Rotate map" }).click();
    await expectMapVectorGlyphInsideBadge(ttcMarker);
    await page.getByRole("button", { name: "Exit rotated map" }).click();
  }

  await request.post(`${stubUrl}/__test/mode`, { data: { mode: "regional-live" } });
  await page.reload();
  await page.getByRole("group", { name: "Select transit network" })
    .getByRole("button", { name: "GO/UP", exact: true })
    .click();
  const regionalMarker = page.getByRole("button", {
    name: /Overlapping alerts: Delay x2 on Union to Niagara Falls/,
  });
  await expectMapVectorGlyphInsideBadge(regionalMarker);

  if (isMobile) {
    await page.setViewportSize({ width: 412, height: 915 });
    await page.getByRole("button", { name: "Rotate map" }).click();
    await expectMapVectorGlyphInsideBadge(regionalMarker);
  }
});
