import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeDesktopLayoutMetrics,
  readDesktopOverlayInsets,
} from "../src/app/desktop-sidebar-state.ts";

describe("desktop sidebar uniform target width and responsive metrics", () => {
  it("targets 560px uniform width across all destinations when docked", () => {
    const metrics = computeDesktopLayoutMetrics({ windowWidth: 1440, isMobile: false });
    assert.equal(metrics.mode, "docked");
    assert.equal(metrics.sidebarWidth, 560);
    assert.equal(metrics.dockBudget, 1120);
    assert.equal(metrics.railWidth, 80);
  });

  it("calculates overlay width below dock budget preserving 160px map exposure", () => {
    const m1000 = computeDesktopLayoutMetrics({ windowWidth: 1000, isMobile: false });
    assert.equal(m1000.mode, "overlay");
    assert.equal(m1000.sidebarWidth, 560);

    const m768 = computeDesktopLayoutMetrics({ windowWidth: 768, isMobile: false });
    assert.equal(m768.mode, "overlay");
    assert.equal(m768.sidebarWidth, 528);
  });
});

describe("transient 'View on map' collapse contract", () => {
  it("yields zero overlay insets when collapsed, preventing duplicate camera jumps", () => {
    // Simulated mock elements
    const mockViewport = {
      closest(selector) {
        if (selector === ".linewatch-shell") {
          return mockShell;
        }
        return null;
      },
      getBoundingClientRect() {
        return { left: 72, right: 1024, width: 952, height: 768 };
      },
    };

    let isCollapsed = false;
    const mockOverlayPanel = {
      getAttribute(attr) {
        if (attr === "aria-hidden") return isCollapsed ? "true" : null;
        return null;
      },
      getBoundingClientRect() {
        return { left: 72, right: 72 + 680, width: 680, height: 768 };
      },
    };

    const mockShell = {
      querySelector(selector) {
        if (selector.includes(".desktop-sidebar-container") && !isCollapsed) {
          return mockOverlayPanel;
        }
        return null;
      },
    };

    // Global mock window for Node test
    const prevWindow = globalThis.window;
    globalThis.window = { innerWidth: 1024 };

    try {
      // 1. When sidebar is open in overlay mode: overlay inset is measured (680px)
      isCollapsed = false;
      const openInsets = readDesktopOverlayInsets(mockViewport);
      assert.equal(openInsets.left, 680);

      // 2. When transiently collapsed: overlay inset immediately drops to 0
      isCollapsed = true;
      const collapsedInsets = readDesktopOverlayInsets(mockViewport);
      assert.equal(collapsedInsets.left, 0);
    } finally {
      globalThis.window = prevWindow;
    }
  });
});
