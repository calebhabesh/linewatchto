# Mobile Camera and Spadina Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore desktop recentering after station-detail dismissal while preserving the mobile camera and hiding inactive Spadina selection indicators.

**Architecture:** Pass viewport policy explicitly from `LineWatchShell` into `InteractiveTtcMap`. Keep both Spadina indicator nodes mounted, but make mobile-performance CSS respect their inactive and active classes.

**Tech Stack:** React, TypeScript, CSS, Next.js App Router, Node test runner, Playwright.

---

## File Structure

- Modify `frontend/src/components/InteractiveTtcMap.tsx`
  - Add explicit selection-clear camera policy and apply it in the focus effect.
- Modify `frontend/src/components/LineWatchShell.tsx`
  - Pass mobile camera policy to the map.
- Modify `frontend/src/app/globals.css`
  - Preserve hidden inactive multi-anchor selection indicators on mobile.
- Modify `frontend/tests/pan-zoom-behavior.test.mjs`
  - Guard the explicit prop and desktop/mobile branch.
- Modify `frontend/tests/mobile-performance-guardrails.test.mjs`
  - Guard inactive and active multi-anchor opacity rules.
- Modify `frontend/tests/smoke/dashboard.spec.ts`
  - Verify desktop/mobile camera behavior and Spadina visibility.

### Task 1: Add Failing Regression Coverage

- [ ] Add a desktop smoke test that selects a station, closes details, waits for camera motion, and expects the default transform.
- [ ] Extend the mobile Spadina smoke coverage to expect both selected indicators to have opacity `0` before selection and positive opacity after selection.
- [ ] Add source guards for `preserveCameraOnSelectionClear={isMobile}` and mobile multi-anchor opacity selectors.
- [ ] Run the focused tests and confirm failures represent the missing behavior.

### Task 2: Implement Viewport-Scoped Camera Policy

- [ ] Add `preserveCameraOnSelectionClear?: boolean` to `InteractiveTtcMap`, defaulting to `false`.
- [ ] Pass `preserveCameraOnSelectionClear={isMobile}` from `LineWatchShell`.
- [ ] In the no-focus-target branch, call `recenter()` only when the prop is false.
- [ ] Add the prop to the effect dependencies.
- [ ] Run focused camera tests and confirm desktop and mobile pass.

### Task 3: Hide Inactive Mobile Spadina Indicators

- [ ] Change the broad mobile-performance selected-indicator opacity rule so it does not reveal inactive multi-anchor indicators.
- [ ] Add explicit rules:

```css
.linewatch-shell.mobile-performance-mode .station-selected-indicator.multi-anchor {
  opacity: 0;
}

.linewatch-shell.mobile-performance-mode .station-selected-indicator.multi-anchor.active {
  opacity: 0.85;
}
```

- [ ] Run focused Spadina tests and confirm both dots are hidden before selection and visible after selection.

### Task 4: Verify and Commit

- [ ] Run:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run test:smoke
```

- [ ] Run `git diff --check` and review only scoped changes.
- [ ] Commit implementation files without touching unrelated user edits.
