# Mobile More Menu Priority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the mobile `More` sheet so conditional PWA installation remains prominent before the app is installed, while operationally important app surfaces are easier to discover without adding a sixth bottom-nav item or renaming `More` to `Settings`.

**Architecture:** Keep `MobileBottomNav` unchanged with `Map | Status | Search | Commutes | More` and the three-dot `MoreHorizontal` icon. Reorder only the `MobileMoreSheet` sections so the top-level sheet reads as a hub: conditional install prompt, account, notifications, operations, display, and support/about. Preserve existing callbacks and conditional rendering; this is a hierarchy/content-order change, not a routing or state-machine change.

**Tech Stack:** Next.js App Router, React, TypeScript, lucide-react icons, Node built-in test runner for fixture/source tests, existing CSS in `frontend/src/app/globals.css`.

---

## Constraints And Product Decisions

- Do not rename the bottom-nav item from `More` to `Settings`.
- Do not change the `More` icon from `MoreHorizontal` to a cog.
- Do not add a sixth mobile bottom-nav item.
- Keep the PWA install section first when `canShowPwaInstallHelp` is true.
- Keep the PWA install section hidden when the app cannot show install help.
- Move `Alert History`, `Reliability Analytics`, and `Source Health` into a single `Operations` section.
- Move `Share LineWatchTO`, feedback, privacy/acknowledgements, release notes, logs, and local reset into a lower `Support & About` section.
- Keep `Account`, `Notifications`, and `Display` as separate sections.
- Preserve existing button callbacks, status badges, install logic, Google-linking logic, and dev-only reset logic.
- Preserve the dirty worktree. Run `git status --short` before edits and do not revert unrelated changes.

## Target Mobile More Order

When install help is available:

1. `Install App`
2. `Account`
3. `Notifications`
4. `Operations`
5. `Display`
6. `Support & About`

When install help is not available:

1. `Account`
2. `Notifications`
3. `Operations`
4. `Display`
5. `Support & About`

## Files

- Modify: `frontend/tests/mobile-bottom-sheet-ux.test.mjs`
  - Add source-order coverage for the new mobile More hierarchy.
- Modify: `frontend/tests/pwa-install-prompt.test.mjs`
  - Keep the install-row prominence assertion.
  - Update share-row assertions because share will no longer live in a standalone `Share` section before `Display`.
- Modify: `frontend/src/components/MobileMoreSheet.tsx`
  - Reorder and regroup existing section markup.
- Do not modify: `frontend/src/components/MobileBottomNav.tsx`
  - It should remain five items with the `MoreHorizontal` icon.
- Do not modify unless a test shows it is necessary: `frontend/src/app/globals.css`
  - Existing `.mobile-more-section`, `.mobile-more-share-row`, and `.mobile-more-health-grid` styles should be reused.

---

### Task 1: Add Mobile More Hierarchy Test

**Files:**
- Modify: `frontend/tests/mobile-bottom-sheet-ux.test.mjs`

- [ ] **Step 1: Check the worktree before editing**

Run:

```bash
git status --short
```

Expected: May show existing local changes. Do not revert them.

- [ ] **Step 2: Add this test after the existing `moves secondary mobile utilities into More` test**

In `frontend/tests/mobile-bottom-sheet-ux.test.mjs`, insert this complete test block immediately after the test whose title is `moves secondary mobile utilities into More`:

```js
  it("prioritizes mobile More sections without turning More into Settings", () => {
    assert.match(bottomNavSource, /MoreHorizontal/);
    assert.match(bottomNavSource, /\{ key: "more", label: "More", Icon: MoreHorizontal \}/);
    assert.doesNotMatch(bottomNavSource, /Settings/);
    assert.doesNotMatch(bottomNavSource, /Cog/);

    assert.ok(
      moreSheetSource.indexOf("Install LineWatchTO") < moreSheetSource.indexOf("<h3>Account</h3>"),
      "Install should remain first when install help is visible.",
    );
    assert.ok(
      moreSheetSource.indexOf("<h3>Account</h3>") < moreSheetSource.indexOf("<h3>Notifications</h3>"),
      "Account should appear before notifications.",
    );
    assert.ok(
      moreSheetSource.indexOf("<h3>Notifications</h3>") < moreSheetSource.indexOf("<h3>Operations</h3>"),
      "Notifications should appear before operational tools.",
    );
    assert.ok(
      moreSheetSource.indexOf("<h3>Operations</h3>") < moreSheetSource.indexOf("Alert History"),
      "Alert History should live in Operations.",
    );
    assert.ok(
      moreSheetSource.indexOf("<h3>Operations</h3>") < moreSheetSource.indexOf("Reliability Analytics"),
      "Reliability Analytics should live in Operations.",
    );
    assert.ok(
      moreSheetSource.indexOf("<h3>Operations</h3>") < moreSheetSource.indexOf("Source Health"),
      "Source Health should live in Operations.",
    );
    assert.ok(
      moreSheetSource.indexOf("Source Health") < moreSheetSource.indexOf("<h3>Display</h3>"),
      "Source Health should not remain buried at the bottom of More.",
    );
    assert.ok(
      moreSheetSource.indexOf("<h3>Display</h3>") < moreSheetSource.indexOf("Support & About"),
      "Display preferences should appear before support and about actions.",
    );
    assert.ok(
      moreSheetSource.indexOf("Support & About") < moreSheetSource.indexOf("Share LineWatchTO"),
      "Share should live in Support & About.",
    );
    assert.doesNotMatch(moreSheetSource, /<h3>Tools<\/h3>/);
  });
```

- [ ] **Step 3: Run the focused fixture test and confirm it fails**

Run:

```bash
npm --prefix frontend run test:fixtures -- mobile-bottom-sheet-ux.test.mjs
```

Expected: FAIL. The failure should mention missing `Operations`, missing `Support & About`, or `Source Health` still appearing after `Display`.

---

### Task 2: Update PWA Share Source-Order Test

**Files:**
- Modify: `frontend/tests/pwa-install-prompt.test.mjs`

- [ ] **Step 1: Replace the share section source-order assertions**

In `frontend/tests/pwa-install-prompt.test.mjs`, inside the `describe` block whose title is `PWA share entry in More sheet`, keep the existing assertions through:

```js
    assert.match(moreSheetSource, /mobile-more-share-status/);
```

Then replace the three source-order checks using `assert.ok` that refer to `<h3>Share</h3>` and `Share LineWatchTO` appearing before `<h3>Display</h3>` with this exact block:

```js
    assert.match(moreSheetSource, /Support & About/);
    assert.ok(
      moreSheetSource.indexOf("<h3>Display</h3>") < moreSheetSource.indexOf("Support & About"),
      "Share and support actions should appear after display preferences.",
    );
    assert.ok(
      moreSheetSource.indexOf("Support & About") < moreSheetSource.indexOf("Share LineWatchTO"),
      "Share action should sit under Support & About.",
    );
```

Leave these existing shell wiring assertions unchanged:

```js
    assert.match(shellSource, /handleShareLineWatchApp/);
    assert.match(shellSource, /navigator\.share/);
    assert.match(shellSource, /navigator\.clipboard\.writeText/);
    assert.match(shellSource, /onShareApp=\{handleShareLineWatchApp\}/);
```

- [ ] **Step 2: Run the focused PWA fixture test and confirm it fails**

Run:

```bash
npm --prefix frontend run test:fixtures -- pwa-install-prompt.test.mjs
```

Expected: FAIL because `Support & About` is not present yet.

---

### Task 3: Reorganize MobileMoreSheet Sections

**Files:**
- Modify: `frontend/src/components/MobileMoreSheet.tsx`

- [ ] **Step 1: Locate the current section block**

In `frontend/src/components/MobileMoreSheet.tsx`, find the block beginning with:

```tsx
        <div className="mobile-more-section">
          <h3>Notifications</h3>
```

and ending with the current standalone `Source Health` section:

```tsx
        <div className="mobile-more-section">
          <h3>Source Health</h3>
          <div className="mobile-more-health-grid">
            {ingestionHealth.map((health, index) => (
              <div key={`${health.label}-${index}`}>
                <span>{health.label}</span>
                <strong>{health.value}</strong>
              </div>
            ))}
          </div>
        </div>
```

- [ ] **Step 2: Replace that entire block with this exact markup**

```tsx
        <div className="mobile-more-section">
          <h3>Notifications</h3>
          <button type="button" className="mobile-more-row w-full flex items-center justify-between gap-[9px]" onClick={onOpenNotifications}>
            <div className="flex items-center gap-[9px] min-w-0 flex-1">
              <div className="shrink-0">
                <Bell size={18} className="text-slate-500 dark:text-slate-400" />
              </div>
              <div className="flex-1 flex flex-col min-w-0">
                <span>Notifications</span>
                <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400 mt-0.5">
                  Press to Configure
                </span>
              </div>
            </div>
            <div className="shrink-0 flex items-center">
              {!accountState.authenticated ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide bg-blue-500 text-white dark:bg-blue-600">
                  Sign In
                </span>
              ) : notificationStatusLabel === "On" ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-emerald-500 text-white dark:bg-emerald-600/80">
                  ON
                </span>
              ) : notificationStatusLabel === "Off" ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                  OFF
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-slate-100 text-slate-400 dark:bg-slate-900 dark:text-slate-600">
                  {notificationStatusLabel}
                </span>
              )}
            </div>
          </button>
        </div>

        <div className="mobile-more-section">
          <h3>Operations</h3>
          <button type="button" className="mobile-more-row" onClick={onOpenAlertHistory}>
            <History size={18} className="text-slate-500 dark:text-slate-400" />
            Alert History
          </button>
          <button type="button" className="mobile-more-row" onClick={onOpenAnalytics}>
            <BarChart3 size={18} className="text-slate-500 dark:text-slate-400" />
            Reliability Analytics
          </button>
          <div className="mobile-more-health-grid" aria-label="Source Health">
            {ingestionHealth.map((health, index) => (
              <div key={`${health.label}-${index}`}>
                <span>{health.label}</span>
                <strong>{health.value}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="mobile-more-section">
          <h3>Display</h3>
          <button type="button" className="mobile-more-row" aria-pressed={highContrast} onClick={onToggleHighContrast}>
            <Contrast size={18} className="text-slate-500 dark:text-slate-400" />
            High Contrast Mode
            <div className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ml-auto shrink-0 ${highContrast ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${highContrast ? 'translate-x-4' : 'translate-x-1'}`} />
            </div>
          </button>
          <button type="button" className="mobile-more-row" aria-pressed={reducedMotion} onClick={onToggleReducedMotion}>
            <Pause size={18} className="text-slate-500 dark:text-slate-400" />
            Reduced Motion
            <div className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ml-auto shrink-0 ${reducedMotion ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${reducedMotion ? 'translate-x-4' : 'translate-x-1'}`} />
            </div>
          </button>
        </div>

        <div className="mobile-more-section">
          <h3>{"Support & About"}</h3>
          <button type="button" className="mobile-more-row mobile-more-share-row" onClick={onShareApp}>
            <Share2 size={18} className="text-slate-500 dark:text-slate-400" />
            <span className="mobile-more-share-copy">
              <span>Share LineWatchTO</span>
              <span>Send app link to friends</span>
            </span>
            {shareStatusLabel ? (
              <strong className="mobile-more-share-status" aria-live="polite">
                {shareStatusLabel}
              </strong>
            ) : null}
          </button>
          <button type="button" className="mobile-more-row" onClick={onOpenFeedback}>
            <MessageSquareText size={18} className="text-slate-500 dark:text-slate-400" />
            Leave Feedback / Support
          </button>
          <button type="button" className="mobile-more-row" onClick={onOpenPrivacyAcknowledgements}>
            <FileText size={18} className="text-slate-500 dark:text-slate-400" />
            Privacy & Acknowledgements
          </button>
          {hasReleaseNotes ? (
            <button type="button" className="mobile-more-row" onClick={onOpenReleaseNotes}>
              <Sparkles size={18} className="text-slate-500 dark:text-slate-400" />
              {"What's New"}
            </button>
          ) : null}
          <LogsDropdown isMobileMore={true} />
          {canResetLocalAppCache ? (
            <button type="button" className="mobile-more-row" onClick={() => { void resetLineWatchLocalAppState(); }}>
              <RefreshCcw size={18} className="text-slate-500 dark:text-slate-400" />
              Reset Local App Cache
            </button>
          ) : null}
        </div>
```

- [ ] **Step 3: Confirm imports are still used**

At the top of `MobileMoreSheet.tsx`, these imported icons should still be used after the change:

```tsx
BarChart3, Bell, Download, FileText, LogIn, LogOut, MessageSquareText, RefreshCcw, Contrast, Pause, Share2, ShieldCheck, Sparkles, UserPlus, UserRound, X, History
```

Expected: no unused imports are introduced.

---

### Task 4: Run Focused Fixture Tests

**Files:**
- Test: `frontend/tests/mobile-bottom-sheet-ux.test.mjs`
- Test: `frontend/tests/pwa-install-prompt.test.mjs`

- [ ] **Step 1: Run the mobile bottom sheet fixture test**

Run:

```bash
npm --prefix frontend run test:fixtures -- mobile-bottom-sheet-ux.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run the PWA install/share fixture test**

Run:

```bash
npm --prefix frontend run test:fixtures -- pwa-install-prompt.test.mjs
```

Expected: PASS.

- [ ] **Step 3: If the focused test command ignores the filename argument**

If `npm --prefix frontend run test:fixtures -- mobile-bottom-sheet-ux.test.mjs` runs the whole fixture suite instead of a focused file, that is acceptable. Read the output and continue only if the relevant tests pass.

---

### Task 5: Full Frontend Verification

**Files:**
- Verification only.

- [ ] **Step 1: Run all fixture tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: PASS.

- [ ] **Step 2: Run TypeScript typecheck**

Run:

```bash
npm --prefix frontend run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run frontend lint**

Run:

```bash
npm --prefix frontend run lint
```

Expected: PASS.

- [ ] **Step 4: Inspect changed files**

Run:

```bash
git diff -- frontend/src/components/MobileMoreSheet.tsx frontend/tests/mobile-bottom-sheet-ux.test.mjs frontend/tests/pwa-install-prompt.test.mjs
```

Expected:

- `MobileBottomNav.tsx` is unchanged.
- PWA install section is still conditional and above `Account`.
- `Account` appears before `Notifications`.
- `Notifications` contains only the notification settings row.
- `Operations` contains `Alert History`, `Reliability Analytics`, and the `mobile-more-health-grid`.
- `Display` contains high contrast and reduced motion toggles.
- `Support & About` contains share, feedback, privacy/acknowledgements, release notes, logs, and dev-only reset.

---

### Task 6: Optional Mobile Smoke Check

**Files:**
- No required edits.

- [ ] **Step 1: Run smoke tests only if the environment is already set up**

Run:

```bash
npm --prefix frontend run test:smoke
```

Expected: PASS.

If Playwright browsers or local services are unavailable, do not block completion on this optional step. Report the exact failure and rely on the required fixture, typecheck, and lint verification.

---

### Task 7: Commit The Change

**Files:**
- Commit modified frontend source and tests only.

- [ ] **Step 1: Review status**

Run:

```bash
git status --short
```

Expected: Only intended files should be staged in the next step. If other files are modified, leave them unstaged unless they are part of this task.

- [ ] **Step 2: Stage only intended files**

Run:

```bash
git add frontend/src/components/MobileMoreSheet.tsx frontend/tests/mobile-bottom-sheet-ux.test.mjs frontend/tests/pwa-install-prompt.test.mjs
```

- [ ] **Step 3: Commit**

Run:

```bash
git commit -m "Improve mobile More menu hierarchy"
```

Expected: Commit succeeds.

---

## Self-Review Checklist For Implementer

- The mobile bottom nav is still exactly five items.
- The mobile bottom nav still labels the fifth item `More`.
- The mobile bottom nav still uses `MoreHorizontal`.
- The mobile More heading still says `More`.
- The PWA install section remains first when visible.
- No visible section is called `Settings`.
- No section is still called `Tools`.
- `Source Health` is no longer a standalone bottom section.
- `Share LineWatchTO` is still available.
- `canResetLocalAppCache` remains production-gated.
- Required verification commands passed or exact failures were reported.
