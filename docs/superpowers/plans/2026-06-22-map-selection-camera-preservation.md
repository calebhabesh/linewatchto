# Map Selection Camera Preservation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the current map zoom and camera position when a station or service-impact selection is cleared.

**Architecture:** Keep selection focus as a one-shot command inside `InteractiveTtcMap`. When the focus target becomes empty, reset only the remembered focus key so the same target can be selected again; leave the pan/zoom transform unchanged and reserve recentering for the existing Center Map control and layout-reset effect.

**Tech Stack:** React, TypeScript, Next.js App Router, Node built-in test runner.

---

## File Structure

- Modify `frontend/tests/pan-zoom-behavior.test.mjs`
  - Add a source-level regression guard for selection clearing without recentering.
- Modify `frontend/src/components/InteractiveTtcMap.tsx`
  - Stop the selected-target focus effect from issuing a recenter command when its target is cleared.

### Task 1: Preserve Camera When Selection Clears

**Files:**
- Modify: `frontend/tests/pan-zoom-behavior.test.mjs`
- Modify: `frontend/src/components/InteractiveTtcMap.tsx:414-505`

- [ ] **Step 1: Add the failing regression test**

Add this test after the existing one-shot focus guard:

```js
it("preserves the camera when the selected focus target is cleared", () => {
  const noTargetBranch = mapSource.match(
    /if \(!focusTargetKey\) \{([\s\S]*?)\n    \}/,
  )?.[1] ?? "";

  assert.match(noTargetBranch, /lastFocusedTargetKeyRef\.current = null/);
  assert.doesNotMatch(noTargetBranch, /recenter\(\)/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test frontend/tests/pan-zoom-behavior.test.mjs
```

Expected: FAIL in `preserves the camera when the selected focus target is cleared` because the matched branch contains `recenter()`.

- [ ] **Step 3: Implement the minimal behavior change**

In the selected-target focus effect in `frontend/src/components/InteractiveTtcMap.tsx`, replace:

```ts
if (!focusTargetKey) {
  if (lastFocusedTargetKeyRef.current !== null) {
    lastFocusedTargetKeyRef.current = null;
    lastFocusLayoutSignalRef.current = currentLayoutSignal;
    recenter();
  }
  return;
}
```

with:

```ts
if (!focusTargetKey) {
  if (lastFocusedTargetKeyRef.current !== null) {
    lastFocusedTargetKeyRef.current = null;
    lastFocusLayoutSignalRef.current = currentLayoutSignal;
  }
  return;
}
```

Keep `recenter` in the separate layout-reset effect and remove it only from the selected-target focus effect dependency list:

```ts
  }, [
    focusTargetKey,
    isGestureActive,
    selection,
    selectedStationId,
    selectedSegmentIds,
    networkSegments,
    mapStations,
    anchorPoints,
    guidePaths,
    zoomToPoint,
    loadState,
    stationNodeImpacts,
    stations,
    stationPointFor,
    layoutResetSignal,
  ]);
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
node --test frontend/tests/pan-zoom-behavior.test.mjs
```

Expected: all tests pass.

- [ ] **Step 5: Run required frontend verification**

Run:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

Expected: all commands exit successfully.

- [ ] **Step 6: Review the scoped diff**

Run:

```bash
git diff --check
git diff -- frontend/src/components/InteractiveTtcMap.tsx frontend/tests/pan-zoom-behavior.test.mjs
```

Expected: no whitespace errors; the production diff removes only the selection-clear `recenter()` call and its effect dependency.

- [ ] **Step 7: Commit the implementation**

```bash
git add frontend/src/components/InteractiveTtcMap.tsx frontend/tests/pan-zoom-behavior.test.mjs
git commit -m "fix: preserve map camera after selection"
```
