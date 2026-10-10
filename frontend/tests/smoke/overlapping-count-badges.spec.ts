import { expect, test, type Locator } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";

const stubUrl = process.env.LINEWATCH_SMOKE_STUB_URL ?? "http://127.0.0.1:4174";
const openMapPreviewUrl = "/?previewTime=2026-08-14T16:00:00.000Z";

for (const network of ["ttc", "regional"] as const) {
  test(`${network} chooser close remains usable after panning the open map`, async ({ page, request, isMobile }) => {
    await setStubMode(request, "regional-live");
    await installDismissedTransientUi(page);
    await page.addInitScript(value => localStorage.setItem("linewatch-default-network-v1", value), network);
    await page.setViewportSize(isMobile ? { width: 360, height: 800 } : { width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const stage = page.locator(`.${network}-map-stage`);
    await expect(stage).toHaveAttribute("data-raster-map-ready", "true");
    const marker = network === "ttc"
      ? page.locator('[data-overlap-segment-id="stub-line-1-segment"]')
      : page.getByRole("button", { name: /Overlapping alerts: Delay x2 on Union to Niagara Falls/ });
    await marker.dispatchEvent("click");
    const chooser = page.locator("[data-overlap-chooser]");
    await expect(chooser).toBeVisible();
    const viewport = stage.locator("..");
    const before = await stage.evaluate(element => element.style.transform);
    const pointer = { pointerId: 81, pointerType: isMobile ? "touch" : "mouse", isPrimary: true, button: 0, buttons: 1 };
    await viewport.dispatchEvent("pointerdown", { ...pointer, clientX: 200, clientY: 250 });
    await viewport.dispatchEvent("pointermove", { ...pointer, clientX: 250, clientY: 280 });
    await viewport.dispatchEvent("pointerup", { ...pointer, buttons: 0, clientX: 250, clientY: 280 });
    await expect.poll(() => stage.evaluate(element => element.style.transform)).not.toBe(before);
    await expect(chooser).toBeVisible();
    const close = chooser.getByRole("button", { name: "Close alert chooser" });
    if (isMobile) await close.tap();
    else await close.click();
    await expect(chooser).toHaveCount(0);
  });
}

test("default map hierarchy preserves effect priority without extra outlines", async ({ page, request, isMobile }) => {
  await setStubMode(request, "map-authoritative-overlap");
  await installDismissedTransientUi(page);
  await page.setViewportSize(isMobile ? { width: 360, height: 800 } : { width: 1440, height: 900 });
  await page.goto("/");
  const overlays = page.getByLabel("Disruption overlays", { exact: true });
  const speedZone = overlays.locator('[data-map-impact-id="reduced-speed-zone-stub-line-1-overlap"]');
  await expect(speedZone).toBeAttached();
  const orderedKinds = await overlays.locator(":scope > [data-map-impact-kind]").evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-map-impact-kind")),
  );
  const priority = ["planned-closure", "reduced-speed-zone", "delay", "suspension"];
  expect(orderedKinds.map((kind) => priority.indexOf(kind!))).toEqual(
    orderedKinds.map((kind) => priority.indexOf(kind!)).sort((a, b) => a - b),
  );
  await expect(page.locator("[data-secondary-overlap-kind]")).toHaveCount(0);
  await expect(page.locator("[data-overlap-chooser]")).toHaveCount(0);
  await expect(page.locator('[data-ttc-impact-hovered="true"]')).toHaveCount(0);
  await page.screenshot({ path: `/tmp/linewatch-hierarchy-${isMobile ? "mobile" : "desktop"}.png` });
  if (!isMobile) {
    await setStubMode(request, "regional-live");
    await page.getByRole("group", { name: "Select transit network" })
      .getByRole("button", { name: "GO/UP", exact: true }).click();
    await expect(page.locator(".regional-map .regional-overlay-segment-group").first()).toBeAttached();
    await expect(page.locator("[data-secondary-overlap-kind]")).toHaveCount(0);
    await page.screenshot({ path: "/tmp/linewatch-hierarchy-regional.png" });
  }
});

for (const network of ["TTC", "GO/UP"] as const) {
  for (const closeAction of ["close button", "Escape"] as const) {
    test(`${network} chooser clears hover outlines after closing with ${closeAction}`, async ({ page, request, isMobile }) => {
      test.skip(isMobile, "Mouse hover requires a desktop pointer");
      await setStubMode(request, "regional-live");
      await installDismissedTransientUi(page);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/");
      if (network === "GO/UP") {
        await page.getByRole("group", { name: "Select transit network" })
          .getByRole("button", { name: network, exact: true }).click();
      }
      const marker = network === "TTC"
        ? page.locator('[data-overlap-segment-id="stub-line-1-segment"]').getByRole("button")
        : page.getByRole("button", { name: /Overlapping alerts: Delay x2 on Union to Niagara Falls/ });
      await marker.dispatchEvent("click");
      const chooser = page.locator("[data-overlap-chooser]");
      const previews = page.locator(network === "TTC"
        ? '[data-ttc-impact-hovered="true"]'
        : '.regional-impact-hover-foreground[data-regional-impact-hovered="true"]');
      await expect(chooser.locator(".overlap-chooser-choice").first()).toBeFocused();
      await chooser.locator(".overlap-chooser-choice").nth(1).hover();
      await expect(previews.first()).toBeAttached();
      if (closeAction === "Escape") {
        await page.keyboard.press("Escape");
      } else {
        await chooser.getByRole("button", { name: "Close alert chooser" }).click();
      }
      await expect(chooser).toHaveCount(0);
      await expect(marker).toBeFocused();
      await expect(previews).toHaveCount(0);
      // A subsequent user focus should still preview the group normally.
      await marker.evaluate((element) => (element as SVGGElement).blur());
      await marker.focus();
      await expect(previews.first()).toBeAttached();
    });
  }

  test(`${network} chooser preserves the group preview and previews mouse and keyboard choices`, async ({ page, request, isMobile }) => {
    test.skip(isMobile && network === "GO/UP", "Desktop network selector coverage");
    await setStubMode(request, "regional-live");
    await installDismissedTransientUi(page);
    await page.setViewportSize(isMobile ? { width: 360, height: 800 } : { width: 1440, height: 900 });
    await page.goto("/");
    if (network === "GO/UP") {
      await page.getByRole("group", { name: "Select transit network" })
        .getByRole("button", { name: network, exact: true }).click();
    }
    const marker = network === "TTC"
      ? page.locator('[data-overlap-segment-id="stub-line-1-segment"]')
      : page.getByRole("button", { name: /Overlapping alerts: Delay x2 on Union to Niagara Falls/ });
    await expect(marker).toBeVisible();
    await marker.dispatchEvent("click");
    const chooser = page.locator("[data-overlap-chooser]");
    const choices = chooser.locator(".overlap-chooser-choice");
    await expect(choices.first()).toBeFocused();
    const identities = await choices.evaluateAll((elements) => elements.map((element) =>
      `${element.getAttribute("data-overlap-choice-kind")}:${element.getAttribute("data-overlap-choice-id")}`,
    ).sort());
    const previewedIdentities = () => page.locator(network === "TTC"
      ? '[data-ttc-impact-hovered="true"]'
      : '.regional-impact-hover-foreground[data-regional-impact-hovered="true"]',
    ).evaluateAll((elements, network) => [...new Set(elements.map((element) =>
      network === "TTC"
        ? `${element.getAttribute("data-ttc-hover-impact-kind")}:${element.getAttribute("data-ttc-hover-impact-id")}`
        : `${element.getAttribute("data-regional-hover-impact-kind")}:${element.getAttribute("data-regional-hover-impact-id")}`,
    ))].sort(), network);
    await expect.poll(previewedIdentities).toEqual(identities);
    if (isMobile) {
      await choices.nth(1).click();
      await expect(chooser).toHaveCount(0);
      return;
    }
    await choices.nth(1).hover();
    const secondIdentity = await choices.nth(1).evaluate((element) =>
      `${element.getAttribute("data-overlap-choice-kind")}:${element.getAttribute("data-overlap-choice-id")}`,
    );
    await expect.poll(previewedIdentities).toEqual([secondIdentity]);
    await chooser.getByRole("button", { name: "Close alert chooser" }).hover();
    await expect.poll(previewedIdentities).toEqual(identities);
    await page.keyboard.press("Tab");
    await expect(choices.nth(1)).toBeFocused();
    await expect.poll(previewedIdentities).toEqual([secondIdentity]);
    await page.keyboard.press("Enter");
    await expect(chooser).toHaveCount(0);
  });
}

for (const network of ["TTC", "GO/UP"] as const) {
  for (const reducedMotion of [false, true]) {
    test(`${network} chooser opens and closes with ${reducedMotion ? "reduced" : "simple"} motion`, async ({ page, request, isMobile }) => {
      test.skip(isMobile, "Desktop network selector coverage");
      await setStubMode(request, "regional-live");
      await installDismissedTransientUi(page);
      await page.emulateMedia({ reducedMotion: reducedMotion ? "reduce" : "no-preference" });
      await page.addInitScript(() => {
        const animate = Element.prototype.animate;
        Element.prototype.animate = function (frames, options) {
          const animation = animate.call(this, frames, options);
          if (this instanceof HTMLElement && this.matches("[data-overlap-chooser]")) {
            const effect = animation.effect as KeyframeEffect;
            this.dataset.animationProperties = [...new Set(effect.getKeyframes().flatMap((frame) =>
              Object.keys(frame).filter((key) => !["offset", "computedOffset", "easing", "composite"].includes(key)),
            ))].sort().join(",");
            this.dataset.animationDuration = String(effect.getTiming().duration);
          }
          return animation;
        };
      });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/");
      if (network === "GO/UP") {
        await page.getByRole("group", { name: "Select transit network" })
          .getByRole("button", { name: network, exact: true }).click();
      }
      const marker = network === "TTC"
        ? page.locator('[data-overlap-segment-id="stub-line-1-segment"]')
        : page.getByRole("button", { name: /Overlapping alerts: Delay x2 on Union to Niagara Falls/ });
      await expect(marker).toBeVisible();
      await marker.dispatchEvent("click");
      const chooser = page.locator("[data-overlap-chooser]");
      await expect(chooser).toBeVisible();
      await expect(chooser.locator(".overlap-chooser-choice").first()).toBeFocused();
      if (reducedMotion) {
        await expect(chooser).not.toHaveAttribute("data-animation-properties");
      } else {
        await expect(chooser).toHaveAttribute("data-animation-properties", "opacity,transform");
        await expect(chooser).toHaveAttribute("data-animation-duration", "140");
        await expect.poll(() => chooser.evaluate((element) => element.getAnimations().length)).toBe(0);
      }
      await page.keyboard.press("Escape");
      if (!reducedMotion) {
        await expect(chooser).toHaveAttribute("data-animation-duration", "100");
      }
      await expect(chooser).toHaveCount(0);
      await expect(network === "TTC" ? marker.getByRole("button") : marker).toBeFocused();
    });
  }
}

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
  await installDismissedTransientUi(page);

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
      text.setAttribute("y", "7.35");
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


for (const width of [1440, 1024]) {
  test(`alert chooser clears the open desktop sidebar at ${width}px`, async ({ page, request, isMobile }) => {
    test.skip(isMobile, "Desktop sidebar coverage");
    await setStubMode(request, "seeded");
    await installDismissedTransientUi(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const sidebar = page.locator("#desktop-sidebar-container");
    await expect(sidebar).toBeVisible();
    const marker = page.locator('[data-overlap-segment-id="stub-line-1-segment"]');
    await expect(marker).toBeVisible();
    await marker.dispatchEvent("click");
    const chooser = page.locator("[data-overlap-chooser]");
    await expect(chooser).toBeVisible();
    const expectClearSidebar = async () => {
      await expect.poll(async () => {
        const panelBox = await sidebar.boundingBox();
        const chooserBox = await chooser.boundingBox();
        return Boolean(panelBox && chooserBox
          && chooserBox.x >= panelBox.x + panelBox.width + 7
          && chooserBox.x + chooserBox.width <= width);
      }).toBe(true);
    };
    await expectClearSidebar();
    await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
    await expect(sidebar).toHaveAttribute("aria-hidden", "true");
    await expect(chooser).toBeVisible();
    await page.getByRole("button", { name: "Expand sidebar", exact: true }).click();
    await expectClearSidebar();
    await chooser.getByRole("button", { name: "Close alert chooser" }).click();
    await expect(chooser).toHaveCount(0);
  });
}

test("alert chooser stays within the compact phone viewport", async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await installDismissedTransientUi(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  const marker = page.locator('[data-overlap-segment-id="stub-line-1-segment"]');
  await expect(marker).toBeVisible();
  await marker.dispatchEvent("click");
  const chooser = page.locator("[data-overlap-chooser]");
  await expect(chooser).toBeVisible();
  await expect.poll(async () => {
    const box = await chooser.boundingBox();
    return Boolean(box && box.x >= 0 && box.x + box.width <= 360);
  }).toBe(true);
  await chooser.getByRole("button", { name: "Close alert chooser" }).click();
  await expect(chooser).toHaveCount(0);
});

for (const network of ["TTC", "GO/UP"] as const) {
  test(`${network} alert chooser survives panning and menu navigation but dismisses on map selection`, async ({ page, request, isMobile }) => {
    test.skip(isMobile && network === "GO/UP", "Desktop network selector coverage");
    await setStubMode(request, network === "TTC" ? "seeded" : "regional-live");
    await installDismissedTransientUi(page);
    await page.setViewportSize(isMobile ? { width: 360, height: 800 } : { width: 1440, height: 900 });
    await page.goto(openMapPreviewUrl);
    if (network === "GO/UP") {
      await page.getByRole("group", { name: "Select transit network" })
        .getByRole("button", { name: network, exact: true }).click();
    }
    const marker = network === "TTC"
      ? page.locator('[data-overlap-segment-id="stub-line-1-segment"]')
      : page.getByRole("button", { name: /Overlapping alerts: Delay x2 on Union to Niagara Falls/ });
    const chooser = page.locator("[data-overlap-chooser]");
    const outsideControl = page.getByRole("button", { name: "Center map view", exact: true });
    await marker.dispatchEvent("click");
    await expect(chooser.locator(".overlap-chooser-choice").first()).toBeFocused();
    await outsideControl.focus();
    await expect(chooser).toBeVisible();
    await expect(outsideControl).toBeFocused();

    const viewport = page.locator(network === "TTC" ? '[data-map-pan-zoom-viewport]' : '.regional-map-viewport');
    const stage = viewport.locator(network === "TTC" ? '.ttc-map-stage' : '.regional-map-stage');
    const before = await stage.getAttribute("style");
    await viewport.dispatchEvent("pointerdown", { pointerId: 45, pointerType: "mouse", button: 0, clientX: 200, clientY: 200 });
    await viewport.dispatchEvent("pointermove", { pointerId: 45, pointerType: "mouse", buttons: 1, clientX: 240, clientY: 230 });
    await viewport.dispatchEvent("pointerup", { pointerId: 45, pointerType: "mouse", button: 0, clientX: 240, clientY: 230 });
    await expect.poll(() => stage.getAttribute("style")).not.toBe(before);
    await expect(chooser).toBeVisible();

    await page.getByRole("button", { name: "More", exact: true }).click();
    await expect(chooser).toBeVisible();
    if (isMobile) {
      await page.getByRole("button", { name: "Map", exact: true }).click();
    } else {
      await page.locator('[data-dest="status"]').click();
    }
    const target = network === "TTC"
      ? page.locator('.map-segment-hit-target').first()
      : page.locator('.regional-station-hit-target[data-regional-station-id="weston"]');
    await target.press("Enter");
    await expect(chooser).toHaveCount(0);
  });
}

test("planned chooser distinguishes closure and limited service with readable dates and joined arrows", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await installDismissedTransientUi(page);
  await page.setViewportSize({ width: isMobile ? 360 : 1440, height: 900 });
  await page.route("**/api/dashboard?network=ttc", async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    payload.plannedClosures = ["suspension", "limited-service"].map((serviceEffect, index) => ({
      ...payload.plannedClosures.find((closure: { activeNow: boolean }) => !closure.activeNow),
      id: `stub-upcoming-advisory-${index}`,
      serviceEffect,
      location: "St Clair West < - > Cedarvale",
    }));
    await route.fulfill({ response, json: payload });
  });
  await page.goto(openMapPreviewUrl);
  await page.locator('[data-overlap-segment-id="stub-line-1-segment"]').dispatchEvent("click");
  const chooser = page.locator("[data-overlap-chooser]");
  const planned = chooser.locator('[data-overlap-choice-kind="planned-closure"]');
  await expect(planned.locator(".overlap-chooser-choice-effect")).toHaveText([" · Closure", " · Limited Service"]);
  for (const choice of await planned.all()) {
    const heading = await choice.locator("strong").evaluate((element) => {
      const style = getComputedStyle(element);
      const effect = getComputedStyle(element.querySelector(".overlap-chooser-choice-effect")!);
      return {
        fontSize: style.fontSize,
        effectFontSize: effect.fontSize,
        fontWeight: style.fontWeight,
        effectFontWeight: effect.fontWeight,
        height: element.getBoundingClientRect().height,
        lineHeight: parseFloat(style.lineHeight),
        width: element.getBoundingClientRect().width,
        availableWidth: element.parentElement!.clientWidth,
      };
    });
    expect(heading.effectFontSize).toBe(heading.fontSize);
    expect(heading.effectFontWeight).toBe(heading.fontWeight);
    expect(heading.height).toBeLessThan(heading.lineHeight * 1.5);
    expect(heading.width).toBeLessThanOrEqual(heading.availableWidth + 1);
  }
  await expect(planned.first().locator(".overlap-chooser-choice-date")).toBeVisible();
  expect(await planned.first().locator(".overlap-chooser-choice-date").evaluate((element) =>
    parseFloat(getComputedStyle(element).fontSize),
  )).toBeGreaterThanOrEqual(12);
  await expect(planned.first().locator(".overlap-chooser-choice-location svg")).toBeVisible();
  await expect(planned.first()).not.toContainText("< - >");
  await planned.last().scrollIntoViewIfNeeded();
  await page.screenshot({ path: `/tmp/linewatch-chooser-polish-${isMobile ? "mobile" : "desktop"}.png` });
});

test("focusing a TTC impact preserves the hit widths of other overlays", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await installDismissedTransientUi(page);
  await page.setViewportSize({ width: isMobile ? 360 : 1440, height: 900 });
  await page.goto(openMapPreviewUrl);
  const targets = page.locator('[aria-label="Disruption overlay interaction targets"] [data-overlay-interaction-target]');
  await expect(targets.first()).toBeAttached();
  const widths = () => targets.evaluateAll(elements => Object.fromEntries(elements.map(element => [
    element.getAttribute("data-overlay-interaction-target"), getComputedStyle(element).strokeWidth,
  ])));
  const before = await widths();
  await targets.first().dispatchEvent("click");
  await expect(page.locator('[data-selected-impact-emphasis]').first()).toBeAttached();
  const after = await widths();
  for (const [id, width] of Object.entries(before)) {
    if (id in after) expect(after[id], `Hit width for ${id}`).toBe(width);
  }
});
