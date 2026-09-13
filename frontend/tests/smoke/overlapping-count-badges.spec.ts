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
  expect(bounds.glyphHeight).toBeGreaterThanOrEqual(9);
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

test("TTC hover repaints overlay artwork above default-priority corridors", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "Mouse hover is desktop-only");
  await request.post(`${stubUrl}/__test/mode`, { data: { mode: "seeded" } });
  await page.addInitScript(() => {
    window.localStorage.setItem("linewatch-welcome-seen-v1", "true");
    window.localStorage.setItem("linewatch-unofficial-notice-ack-v1", "true");
  });
  await page.goto(openMapPreviewUrl);
  const target = page.locator('[aria-label="Disruption overlay interaction targets"] .map-segment-hit-target').first();
  await expect(target).toBeAttached();
  await target.dispatchEvent("pointerover", { pointerType: "mouse" });
  const visual = page.locator('.ttc-impact-hover-foreground[data-ttc-impact-hovered="true"]').filter({ has: page.locator("use") }).first();
  await expect(visual).toBeVisible();
  expect(await visual.evaluate((element) => {
    const href = element.querySelector("use")!.getAttribute("href")!;
    const source = document.getElementById(href.slice(1));
    const overlays = element.closest("svg")!.querySelector('[aria-label="Disruption overlays"]')!;
    const priority: Record<string, number> = { "reduced-speed-zone": 1, "planned-closure": 2, delay: 3, suspension: 4 };
    const ranks = Array.from(overlays.children).map((child) => priority[child.getAttribute("data-map-impact-kind")!]);
    return {
      artwork: Boolean(source?.querySelector(".asset-alert-path")),
      aboveOverlays: Boolean(overlays.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING),
      ordered: ranks.every((rank, index) => index === 0 || rank >= ranks[index - 1]),
    };
  })).toEqual({ artwork: true, aboveOverlays: true, ordered: true });
  await target.dispatchEvent("pointerout", { pointerType: "mouse" });
  await expect(visual).toHaveCount(0);
});

test("nav badges are visibly centered for single and multi-digit counts (1, 2, 9, 20, 99)", async ({ page, isMobile }) => {
  await page.setViewportSize(isMobile ? { width: 375, height: 667 } : { width: 1280, height: 800 });
  await page.goto(openMapPreviewUrl);

  const testCounts = [1, 2, 9, 20, 99];
  const results = await page.evaluate((counts) => {
    const container = document.createElement("div");
    container.className = "linewatch-shell";
    container.style.position = "fixed";
    container.style.top = "0";
    container.style.left = "0";
    container.style.zIndex = "99999";
    document.body.appendChild(container);

    const data = counts.map((count) => {
      const label = String(count);
      const viewBoxWidth = Math.max(9, label.length * 7 + 2);
      const isSingle = label.length <= 1;

      const span = document.createElement("span");
      span.className = "overlapping-count-badge mobile-bottom-nav-badge";
      span.setAttribute("data-count-digits", String(label.length));
      span.setAttribute("data-single-digit", isSingle ? "true" : "false");
      span.setAttribute("aria-hidden", "true");

      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "overlapping-count-badge__svg");
      svg.setAttribute("viewBox", `0 0 ${viewBoxWidth} 16`);
      svg.setAttribute("width", String(viewBoxWidth));
      svg.setAttribute("height", "16");

      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("class", "overlapping-count-badge__text");
      text.setAttribute("x", String(viewBoxWidth / 2));
      text.setAttribute("y", "8");
      text.setAttribute("dominant-baseline", "central");
      text.setAttribute("text-anchor", "middle");
      text.textContent = label;

      svg.appendChild(text);
      span.appendChild(svg);
      container.appendChild(span);

      const spanBounds = span.getBoundingClientRect();
      const textBounds = text.getBoundingClientRect();

      return {
        count,
        isSingle,
        width: spanBounds.width,
        height: spanBounds.height,
        leftInset: textBounds.left - spanBounds.left,
        rightInset: spanBounds.right - textBounds.right,
        topInset: textBounds.top - spanBounds.top,
        bottomInset: spanBounds.bottom - textBounds.bottom,
      };
    });

    document.body.removeChild(container);
    return data;
  }, testCounts);

  for (const r of results) {
    expect(r.height).toBe(15);
    if (r.isSingle) {
      expect(r.width).toBe(15);
    } else {
      expect(r.width).toBeGreaterThanOrEqual(15);
    }
    expect(r.leftInset).toBeGreaterThanOrEqual(0);
    expect(r.rightInset).toBeGreaterThanOrEqual(0);
    expect(r.topInset).toBeGreaterThanOrEqual(0);
    expect(r.bottomInset).toBeGreaterThanOrEqual(0);
    expect(Math.abs(r.leftInset - r.rightInset)).toBeLessThanOrEqual(2);
    expect(Math.abs(r.topInset - r.bottomInset)).toBeLessThanOrEqual(2);
  }
});

