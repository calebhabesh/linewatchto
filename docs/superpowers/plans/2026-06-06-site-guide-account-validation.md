# Site Guide And Account Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a top-right LineWatch TO site guide/info popover and make account creation friendlier and more resilient with client-side and backend-aligned email/password validation.

**Architecture:** Keep the dashboard map-first. Add a self-contained `SiteGuideDropdown` beside the existing ingestion-log and theme buttons inside `InteractiveTtcMap`, backed by a copied public SVG icon asset and scoped CSS. Add a small pure frontend account-validation module, use it from `LineWatchShell`, improve account API error parsing, and align backend validation in `AccountService`.

**Tech Stack:** Next.js App Router, React, TypeScript, plain CSS in `frontend/src/app/globals.css`, Node built-in test runner, Playwright, Java 21, Spring Boot, Maven.

---

## Current Repo Facts Gemini Must Preserve

- `frontend/src/components/InteractiveTtcMap.tsx` owns the top-right map button rail. Current order is `<LogsDropdown />`, then the sun/moon theme button. Add the guide as the third button so the order is ingestion logs, dark-mode shifter, site guide/info.
- `frontend/src/components/LineWatchShell.tsx` owns account dialog state and `handleSubmitAccount`. The worktree already had local modifications in this file when this plan was written. Start by reading the current file and do not overwrite unrelated changes.
- The guide icon source is outside the repo at `~/Pictures/Assets/LineWatch/site-guide.svg`. The app must not reference that absolute path at runtime. Copy it to `frontend/public/assets/linewatch/site-guide.svg`.
- Current backend email validation only checks for an `@`; current backend password validation requires 10 characters. Frontend submits raw form values and turns most registration failures into `Could not create that account.`
- Do not present LineWatch TO as official TTC software. Do not claim live service data unless the current dashboard state is fresh and backend-backed.

## Files

- Create: `frontend/src/components/SiteGuideDropdown.tsx`
- Create: `frontend/src/app/account-validation.ts`
- Create: `frontend/tests/site-guide.test.mjs`
- Create: `frontend/tests/account-validation.test.mjs`
- Create: `frontend/public/assets/linewatch/site-guide.svg`
- Modify: `frontend/src/components/InteractiveTtcMap.tsx`
- Modify: `frontend/src/components/LineWatchShell.tsx`
- Modify: `frontend/src/app/account-data.ts`
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/tests/account-data.test.mjs`
- Modify: `frontend/tests/account-ui-source.test.mjs`
- Modify: `frontend/tests/smoke/dashboard.spec.ts`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/account/AccountService.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/account/AccountServiceTest.java`

## Implementation Guardrails

- Run `git status --short` first. Preserve any user edits, especially in `LineWatchShell.tsx`.
- No new npm or Maven dependencies.
- Keep cards/panels at 8px radius or less for new UI.
- Keep the guide popover dense and dashboard-native. It is an app help panel, not a landing page or marketing modal.
- Keep account signup easy: validate obvious bad emails; require a reasonable password without uppercase/special-character complexity.
- Login should not apply new-password rules. Login only needs a valid-looking email and non-empty password.
- Registration should normalize email before sending it.

---

### Task 1: Add Failing Source Tests For The Site Guide

**Files:**
- Create: `frontend/tests/site-guide.test.mjs`

- [ ] **Step 1: Write the failing guide source test**

Create `frontend/tests/site-guide.test.mjs`:

```js
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const interactiveMapSource = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const guideComponentUrl = new URL("../src/components/SiteGuideDropdown.tsx", import.meta.url);
const guideAssetUrl = new URL("../public/assets/linewatch/site-guide.svg", import.meta.url);

describe("site guide dropdown", () => {
  it("ships the guide icon as a public LineWatch asset", () => {
    assert.equal(existsSync(guideAssetUrl), true);
    const svg = readFileSync(guideAssetUrl, "utf8");
    assert.match(svg, /<svg\b/);
  });

  it("renders after the ingestion log and theme buttons in the top-right map rail", () => {
    assert.match(interactiveMapSource, /import \{ SiteGuideDropdown \} from "\.\/SiteGuideDropdown";/);
    assert.match(interactiveMapSource, /<LogsDropdown \/>[\s\S]*aria-label="Toggle theme"[\s\S]*<SiteGuideDropdown \/>/);
  });

  it("explains the dashboard, controls, overlay meanings, and bidirectional wording", () => {
    const guideSource = readFileSync(guideComponentUrl, "utf8");
    assert.match(guideSource, /export function SiteGuideDropdown/);
    assert.match(guideSource, /\/assets\/linewatch\/site-guide\.svg/);
    assert.match(guideSource, /aria-label="Open site guide"/);
    assert.match(guideSource, /role="dialog"/);
    assert.match(guideSource, /What LineWatch TO does/);
    assert.match(guideSource, /Drag the map/);
    assert.match(guideSource, /Click a station/);
    assert.match(guideSource, /Click a colored overlay/);
    assert.match(guideSource, /Both Ways/);
    assert.match(guideSource, /Suspended or closed service/);
    assert.match(guideSource, /Ordinary delay/);
    assert.match(guideSource, /Reduced Speed Zone/);
    assert.match(guideSource, /Upcoming closure preview/);
    assert.match(guideSource, /Station impact ring/);
    assert.match(guideSource, /Overlap badge/);
    assert.match(guideSource, /Shuttle badge/);
    assert.match(guideSource, /hamburger menu/);
    assert.match(guideSource, /Ingested TTC Alerts/);
  });

  it("adds scoped guide styles without broad theme churn", () => {
    assert.match(globalCss, /\.site-guide-panel/);
    assert.match(globalCss, /\.site-guide-trigger/);
    assert.match(globalCss, /\.site-guide-overlay-sample/);
    assert.match(globalCss, /\.site-guide-overlay-sample\.both-ways/);
    assert.match(globalCss, /\.site-guide-overlay-sample\.reduced-speed-zone/);
    assert.match(globalCss, /\.site-guide-overlay-sample\.planned-closure/);
  });
});
```

- [ ] **Step 2: Run the guide source test and confirm it fails**

Run:

```bash
npm --prefix frontend exec -- node --test tests/site-guide.test.mjs
```

Expected: FAIL because `SiteGuideDropdown.tsx` and `frontend/public/assets/linewatch/site-guide.svg` do not exist yet, and `InteractiveTtcMap.tsx` does not import/render the component.

---

### Task 2: Add The Site Guide Asset And Component

**Files:**
- Create: `frontend/public/assets/linewatch/site-guide.svg`
- Create: `frontend/src/components/SiteGuideDropdown.tsx`

- [ ] **Step 1: Copy the icon asset into the repo**

Run:

```bash
mkdir -p frontend/public/assets/linewatch
```

Run:

```bash
cp ~/Pictures/Assets/LineWatch/site-guide.svg frontend/public/assets/linewatch/site-guide.svg
```

Expected: `frontend/public/assets/linewatch/site-guide.svg` exists and contains an `<svg>`.

- [ ] **Step 2: Create the guide component**

Create `frontend/src/components/SiteGuideDropdown.tsx` with this component. If current lint flags an icon import as unused after local edits, remove that single unused import only.

```tsx
"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  Bus,
  Calendar,
  ChevronRight,
  Construction,
  Database,
  Info,
  Map as MapIcon,
  Menu,
  Moon,
  MousePointer2,
  Navigation,
  Search,
  Sun,
  X,
} from "lucide-react";
import { DelayIcon } from "./DelayIcon";
import { ImpactTypeIcon } from "./ImpactTypeIcon";

function GuideSection({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="site-guide-section">
      <div className="site-guide-section-title">
        {icon}
        <h3>{title}</h3>
      </div>
      {children}
    </section>
  );
}

function GuideActionRow({
  icon,
  label,
  text,
}: {
  icon: ReactNode;
  label: string;
  text: string;
}) {
  return (
    <li className="site-guide-action-row">
      <span className="site-guide-action-icon">{icon}</span>
      <span>
        <strong>{label}</strong>
        <span>{text}</span>
      </span>
    </li>
  );
}

function OverlaySample({
  kind,
  direction,
}: {
  kind: "suspension" | "delay" | "reduced-speed-zone" | "planned-closure" | "station-ring" | "overlap" | "commute";
  direction?: "one-way" | "both-ways";
}) {
  return (
    <span
      className={`site-guide-overlay-sample ${kind} ${direction === "both-ways" ? "both-ways" : "one-way"}`}
      aria-hidden="true"
    >
      <span />
      <span />
      <span />
    </span>
  );
}

function OverlayGuideRow({
  icon,
  title,
  text,
  kind,
  direction,
  label,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  kind: "suspension" | "delay" | "reduced-speed-zone" | "planned-closure" | "station-ring" | "overlap" | "commute";
  direction?: "one-way" | "both-ways";
  label?: string;
}) {
  return (
    <li className="site-guide-overlay-row">
      <OverlaySample kind={kind} direction={direction} />
      <span className="site-guide-overlay-icon">{icon}</span>
      <span className="site-guide-overlay-copy">
        <strong>{title}</strong>
        <span>{text}</span>
        {label ? <em>{label}</em> : null}
      </span>
    </li>
  );
}

export function SiteGuideDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div className="site-guide-dropdown relative pointer-events-auto" ref={dropdownRef}>
      <button
        type="button"
        className="site-guide-trigger panel flex items-center justify-center w-10 sm:w-14 h-10 sm:h-14 rounded-xl border border-black/10 dark:border-white/10 shadow-lg hover:!bg-slate-100 dark:hover:!bg-[#1a1e28] hover:scale-105 active:scale-95 outline-none focus-visible:ring-4 focus-visible:ring-black/10 dark:focus-visible:ring-white/10 transition-all cursor-pointer bg-white dark:bg-[#0a0c10]"
        aria-controls={panelId}
        aria-expanded={isOpen}
        aria-label="Open site guide"
        onClick={() => setIsOpen((current) => !current)}
      >
        <Image
          src="/assets/linewatch/site-guide.svg"
          alt=""
          aria-hidden="true"
          width={28}
          height={28}
          className="site-guide-trigger-icon"
        />
      </button>

      {isOpen ? (
        <section
          id={panelId}
          className="site-guide-panel"
          role="dialog"
          aria-label="LineWatch TO site guide"
        >
          <div className="site-guide-header">
            <div className="site-guide-title">
              <Info size={18} aria-hidden="true" />
              <div>
                <h2>LineWatch TO Guide</h2>
                <p>Unofficial TTC subway and LRT reliability dashboard.</p>
              </div>
            </div>
            <button type="button" onClick={() => setIsOpen(false)} aria-label="Close site guide">
              <X size={17} />
            </button>
          </div>

          <div className="site-guide-body">
            <GuideSection icon={<MapIcon size={15} />} title="What LineWatch TO does">
              <p>
                LineWatch TO shows subway and LRT service alerts, delays, Reduced Speed Zones, planned closures, station details, and saved-commute impacts on one map. It can use fresh backend alert data when ingestion is running, and fixture mode stays available for offline demos.
              </p>
            </GuideSection>

            <GuideSection icon={<MousePointer2 size={15} />} title="How to use the map">
              <ul className="site-guide-action-list">
                <GuideActionRow icon={<MousePointer2 size={14} />} label="Drag the map" text="Move around the TTC network. Scroll, pinch, or use the zoom controls to change scale." />
                <GuideActionRow icon={<ChevronRight size={14} />} label="Click a colored overlay" text="Open the matching alert, delay, Reduced Speed Zone, or closure card." />
                <GuideActionRow icon={<MapIcon size={14} />} label="Click a station" text="Open station details, accessibility information, linked station alerts, and source-labeled arrivals." />
                <GuideActionRow icon={<Search size={14} />} label="Search stations" text="Use the station-search button on the left to jump to a station quickly." />
              </ul>
            </GuideSection>

            <GuideSection icon={<AlertTriangle size={15} />} title="Map overlays">
              <ul className="site-guide-overlay-list">
                <OverlayGuideRow
                  icon={<ImpactTypeIcon kind="suspension" size={16} />}
                  kind="suspension"
                  direction="one-way"
                  title="Suspended or closed service"
                  text="Red blocked-service styling means the affected part of a line is suspended or closed."
                  label="One direction"
                />
                <OverlayGuideRow
                  icon={<ImpactTypeIcon kind="suspension" size={16} />}
                  kind="suspension"
                  direction="both-ways"
                  title="Suspended or closed service"
                  text="A red-and-white striped segment means service is affected in both directions."
                  label="Both Ways"
                />
                <OverlayGuideRow
                  icon={<DelayIcon size={16} />}
                  kind="delay"
                  direction="one-way"
                  title="Ordinary delay"
                  text="Hourglass markers show a delay that is not classified as a Reduced Speed Zone."
                  label="One direction"
                />
                <OverlayGuideRow
                  icon={<DelayIcon size={16} />}
                  kind="delay"
                  direction="both-ways"
                  title="Ordinary delay"
                  text="Hourglasses without a single arrow direction mean the delay is shown as affecting Both Ways."
                  label="Both Ways"
                />
                <OverlayGuideRow
                  icon={<ImpactTypeIcon kind="reduced-speed-zone" size={16} />}
                  kind="reduced-speed-zone"
                  direction="one-way"
                  title="Reduced Speed Zone"
                  text="Orange chevrons mean trains are moving slower through that segment."
                  label="One direction"
                />
                <OverlayGuideRow
                  icon={<ImpactTypeIcon kind="reduced-speed-zone" size={16} />}
                  kind="reduced-speed-zone"
                  direction="both-ways"
                  title="Reduced Speed Zone"
                  text="Opposing orange chevrons mean the slow zone is shown in both directions."
                  label="Both Ways"
                />
                <OverlayGuideRow
                  icon={<ImpactTypeIcon kind="planned-closure" size={16} />}
                  kind="planned-closure"
                  direction="both-ways"
                  title="Upcoming closure preview"
                  text="Blue highlights preview upcoming planned closures. If a closure is active as a service stoppage, it may also appear in Active Alerts with red closed-service styling."
                  label="Usually Both Ways"
                />
                <OverlayGuideRow
                  icon={<AlertTriangle size={16} />}
                  kind="station-ring"
                  title="Station impact ring"
                  text="A gold ring and red glow around a station means there is a station-specific alert. Click the ring to open the alert card."
                />
                <OverlayGuideRow
                  icon={<Info size={16} />}
                  kind="overlap"
                  title="Overlap badge"
                  text="A pill with multiple symbols means more than one impact shares that segment. Click it to open the highest-priority matching card."
                />
                <OverlayGuideRow
                  icon={<Navigation size={16} />}
                  kind="commute"
                  title="Saved commute route"
                  text="A green route line appears when viewing a saved commute path. The Back chip clears the preview."
                />
              </ul>
            </GuideSection>

            <GuideSection icon={<Menu size={15} />} title="Other controls">
              <ul className="site-guide-action-list">
                <GuideActionRow icon={<Menu size={14} />} label="hamburger menu" text="Open Alerts, Delays, Reduced Speed Zones, Upcoming Closures, Saved Commutes, Reliability Analytics, high contrast, and reduced motion." />
                <GuideActionRow icon={<Database size={14} />} label="Ingested TTC Alerts" text="Open the raw alert feed panel used for debugging backend ingestion and fixture fallback." />
                <GuideActionRow icon={<Sun size={14} />} label="Sun / Moon" text="Switch the map between light and dark visual modes." />
                <GuideActionRow icon={<Bus size={14} />} label="Shuttle badge" text="A blue Shuttle badge on an alert or closure card means replacement bus service is noted by the alert source." />
                <GuideActionRow icon={<Calendar size={14} />} label="Nightly / Active now" text="Closure cards can show whether a closure window is nightly, upcoming, or active now." />
                <GuideActionRow icon={<Construction size={14} />} label="Reduced motion" text="Use the menu toggle if animated overlays make the map harder to read." />
                <GuideActionRow icon={<Moon size={14} />} label="High contrast" text="Use the menu toggle for stronger contrast on controls, cards, and map content." />
              </ul>
            </GuideSection>

            <div className="site-guide-note">
              <AlertTriangle size={14} aria-hidden="true" />
              <p>
                LineWatch TO is a personal project, not an official TTC app. Always verify critical travel decisions with TTC sources.
              </p>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Run the single test and confirm it still fails only on wiring/CSS**

Run:

```bash
npm --prefix frontend exec -- node --test tests/site-guide.test.mjs
```

Expected: FAIL on `InteractiveTtcMap.tsx` import/render and CSS assertions. Asset/component assertions should pass.

---

### Task 3: Wire The Guide Button Into The Top-Right Rail And Add Styles

**Files:**
- Modify: `frontend/src/components/InteractiveTtcMap.tsx`
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Import the guide component**

In `frontend/src/components/InteractiveTtcMap.tsx`, add this import near `LogsDropdown`:

```tsx
import { SiteGuideDropdown } from "./SiteGuideDropdown";
```

- [ ] **Step 2: Render the guide after the theme button**

In the top-right rail in `InteractiveTtcMap`, keep the existing `<LogsDropdown />` and theme button, then add:

```tsx
        <SiteGuideDropdown />
```

The resulting order must be:

```tsx
        <LogsDropdown />
        <button
          onClick={onToggleTheme}
          className="panel flex items-center justify-center w-10 sm:w-14 h-10 sm:h-14 rounded-xl border border-black/10 dark:border-white/10 shadow-lg hover:!bg-slate-100 dark:hover:!bg-[#1a1e28] hover:scale-105 active:scale-95 outline-none focus-visible:ring-4 focus-visible:ring-black/10 dark:focus-visible:ring-white/10 transition-all cursor-pointer bg-white dark:bg-[#0a0c10]"
          aria-label="Toggle theme"
        >
          {isDark ? <Sun size={24} className="text-slate-800 dark:text-white" /> : <Moon size={24} className="text-slate-800 dark:text-white" />}
        </button>
        <SiteGuideDropdown />
```

- [ ] **Step 3: Add scoped guide CSS**

Append this CSS near the other map-control and account-dialog styles in `frontend/src/app/globals.css`:

```css
.site-guide-dropdown {
  position: relative;
}

.site-guide-trigger-icon {
  height: 24px;
  width: 24px;
}

.dark .site-guide-trigger-icon,
.high-contrast .site-guide-trigger-icon {
  filter: invert(1);
}

.site-guide-panel {
  background: rgba(248, 250, 252, 0.97);
  border: 1px solid rgba(15, 23, 42, 0.14);
  border-radius: 8px;
  box-shadow: 0 24px 70px rgba(2, 6, 23, 0.26);
  color: #0f172a;
  max-height: min(74vh, 760px);
  overflow: hidden;
  position: absolute;
  right: 0;
  top: 48px;
  width: min(calc(100vw - 32px), 410px);
  z-index: 55;
}

.dark .site-guide-panel,
.high-contrast .site-guide-panel {
  background: rgba(10, 12, 16, 0.97);
  border-color: rgba(255, 255, 255, 0.16);
  box-shadow: 0 26px 80px rgba(0, 0, 0, 0.5);
  color: #f8fafc;
}

@media (min-width: 640px) {
  .site-guide-panel {
    top: 64px;
  }
}

.site-guide-header {
  align-items: flex-start;
  border-bottom: 1px solid rgba(15, 23, 42, 0.12);
  display: flex;
  gap: 12px;
  justify-content: space-between;
  padding: 14px;
}

.dark .site-guide-header,
.high-contrast .site-guide-header {
  border-bottom-color: rgba(255, 255, 255, 0.14);
}

.site-guide-title {
  align-items: flex-start;
  display: flex;
  gap: 9px;
  min-width: 0;
}

.site-guide-title h2 {
  font-size: 15px;
  font-weight: 900;
  line-height: 1.1;
  margin: 0;
}

.site-guide-title p {
  color: #64748b;
  font-size: 11px;
  line-height: 1.35;
  margin: 4px 0 0;
}

.dark .site-guide-title p,
.high-contrast .site-guide-title p {
  color: #94a3b8;
}

.site-guide-header button {
  align-items: center;
  border-radius: 6px;
  color: #64748b;
  display: inline-flex;
  height: 30px;
  justify-content: center;
  transition: background 150ms ease, color 150ms ease;
  width: 30px;
}

.site-guide-header button:hover,
.site-guide-header button:focus-visible {
  background: rgba(15, 23, 42, 0.08);
  color: #0f172a;
  outline: none;
}

.dark .site-guide-header button:hover,
.dark .site-guide-header button:focus-visible,
.high-contrast .site-guide-header button:hover,
.high-contrast .site-guide-header button:focus-visible {
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
}

.site-guide-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-height: calc(min(74vh, 760px) - 61px);
  overflow-y: auto;
  padding: 14px;
  scrollbar-color: rgba(148, 163, 184, 0.28) transparent;
  scrollbar-width: thin;
}

.site-guide-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.site-guide-section-title {
  align-items: center;
  color: #334155;
  display: flex;
  gap: 7px;
}

.dark .site-guide-section-title,
.high-contrast .site-guide-section-title {
  color: #cbd5e1;
}

.site-guide-section-title h3 {
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0;
  line-height: 1.1;
  margin: 0;
}

.site-guide-section p,
.site-guide-action-row span span,
.site-guide-overlay-copy span,
.site-guide-note p {
  color: #64748b;
  font-size: 12px;
  line-height: 1.45;
  margin: 0;
}

.dark .site-guide-section p,
.dark .site-guide-action-row span span,
.dark .site-guide-overlay-copy span,
.dark .site-guide-note p,
.high-contrast .site-guide-section p,
.high-contrast .site-guide-action-row span span,
.high-contrast .site-guide-overlay-copy span,
.high-contrast .site-guide-note p {
  color: #cbd5e1;
}

.site-guide-action-list,
.site-guide-overlay-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.site-guide-action-row,
.site-guide-overlay-row {
  align-items: flex-start;
  display: flex;
  gap: 9px;
  min-width: 0;
}

.site-guide-action-icon,
.site-guide-overlay-icon {
  align-items: center;
  color: #475569;
  display: inline-flex;
  flex: 0 0 auto;
  justify-content: center;
  margin-top: 2px;
}

.dark .site-guide-action-icon,
.dark .site-guide-overlay-icon,
.high-contrast .site-guide-action-icon,
.high-contrast .site-guide-overlay-icon {
  color: #e2e8f0;
}

.site-guide-action-row strong,
.site-guide-overlay-copy strong {
  color: #1e293b;
  display: block;
  font-size: 12px;
  font-weight: 900;
  line-height: 1.2;
  margin-bottom: 2px;
}

.dark .site-guide-action-row strong,
.dark .site-guide-overlay-copy strong,
.high-contrast .site-guide-action-row strong,
.high-contrast .site-guide-overlay-copy strong {
  color: #ffffff;
}

.site-guide-overlay-copy {
  min-width: 0;
}

.site-guide-overlay-copy em {
  color: #2563eb;
  display: block;
  font-size: 10px;
  font-style: normal;
  font-weight: 900;
  margin-top: 3px;
  text-transform: uppercase;
}

.dark .site-guide-overlay-copy em,
.high-contrast .site-guide-overlay-copy em {
  color: #93c5fd;
}

.site-guide-overlay-sample {
  align-items: center;
  display: inline-flex;
  flex: 0 0 58px;
  height: 28px;
  justify-content: center;
  margin-top: 3px;
  position: relative;
}

.site-guide-overlay-sample::before {
  border-radius: 999px;
  content: "";
  height: 9px;
  left: 4px;
  position: absolute;
  right: 4px;
  top: 10px;
}

.site-guide-overlay-sample span {
  display: none;
}

.site-guide-overlay-sample.both-ways {
  justify-content: space-around;
}

.site-guide-overlay-sample.suspension::before {
  background: #ef4444;
}

.site-guide-overlay-sample.suspension.both-ways::before {
  background: repeating-linear-gradient(45deg, #ef4444 0 8px, #ffffff 8px 13px);
  box-shadow: 0 0 0 1px rgba(239, 68, 68, 0.45);
}

.site-guide-overlay-sample.suspension.one-way span:first-child {
  border: 2px solid #ffffff;
  border-radius: 999px;
  display: block;
  height: 14px;
  position: relative;
  width: 14px;
  z-index: 1;
}

.site-guide-overlay-sample.suspension.one-way span:first-child::after {
  background: #ffffff;
  content: "";
  height: 2px;
  left: 1px;
  position: absolute;
  top: 5px;
  transform: rotate(-45deg);
  width: 10px;
}

.site-guide-overlay-sample.delay::before {
  background: #f59e0b;
}

.site-guide-overlay-sample.delay span {
  background: #fef3c7;
  border: 1px solid #0284c7;
  border-radius: 3px;
  display: block;
  height: 12px;
  margin: 0 2px;
  transform: skewX(-12deg);
  width: 8px;
  z-index: 1;
}

.site-guide-overlay-sample.delay.one-way span:last-child {
  border-color: transparent transparent transparent #ffffff;
  border-radius: 0;
  border-style: solid;
  border-width: 6px 0 6px 9px;
  height: 0;
  transform: none;
  width: 0;
}

.site-guide-overlay-sample.reduced-speed-zone::before {
  background: #f59e0b;
}

.site-guide-overlay-sample.reduced-speed-zone span {
  border: solid #111827;
  border-width: 0 3px 3px 0;
  display: block;
  height: 8px;
  margin: 0 1px;
  transform: rotate(-45deg);
  width: 8px;
  z-index: 1;
}

.site-guide-overlay-sample.reduced-speed-zone.both-ways span:nth-child(2) {
  transform: rotate(135deg);
}

.site-guide-overlay-sample.planned-closure::before {
  background: #2563eb;
}

.site-guide-overlay-sample.station-ring::before {
  background: radial-gradient(circle, #ef4444 0 30%, transparent 32%), radial-gradient(circle, transparent 0 42%, #facc15 44% 58%, transparent 61%);
  height: 28px;
  left: 15px;
  right: 15px;
  top: 0;
}

.site-guide-overlay-sample.overlap::before {
  background: #0f172a;
  border: 1px solid rgba(148, 163, 184, 0.8);
  height: 22px;
  top: 3px;
}

.site-guide-overlay-sample.overlap span {
  border-radius: 999px;
  display: block;
  height: 10px;
  margin: 0 1px;
  width: 10px;
  z-index: 1;
}

.site-guide-overlay-sample.overlap span:nth-child(1) {
  background: #ef4444;
}

.site-guide-overlay-sample.overlap span:nth-child(2) {
  background: #f59e0b;
}

.site-guide-overlay-sample.overlap span:nth-child(3) {
  background: #2563eb;
}

.site-guide-overlay-sample.commute::before {
  background: #22c55e;
  box-shadow: 0 0 12px rgba(34, 197, 94, 0.6);
}

.site-guide-overlay-sample.commute span:first-child,
.site-guide-overlay-sample.commute span:last-child {
  background: #dcfce7;
  border: 2px solid #16a34a;
  border-radius: 999px;
  display: block;
  height: 13px;
  position: absolute;
  top: 7px;
  width: 13px;
  z-index: 1;
}

.site-guide-overlay-sample.commute span:first-child {
  left: 2px;
}

.site-guide-overlay-sample.commute span:last-child {
  right: 2px;
}

.site-guide-note {
  align-items: flex-start;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.24);
  border-radius: 6px;
  color: #b45309;
  display: flex;
  gap: 8px;
  padding: 9px;
}

.dark .site-guide-note,
.high-contrast .site-guide-note {
  background: rgba(120, 53, 15, 0.34);
  border-color: rgba(245, 158, 11, 0.28);
  color: #fbbf24;
}
```

- [ ] **Step 4: Verify guide source tests pass**

Run:

```bash
npm --prefix frontend exec -- node --test tests/site-guide.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit guide component slice**

Run:

```bash
git add frontend/public/assets/linewatch/site-guide.svg frontend/src/components/SiteGuideDropdown.tsx frontend/src/components/InteractiveTtcMap.tsx frontend/src/app/globals.css frontend/tests/site-guide.test.mjs
git commit -m "feat(frontend): add site guide popover"
```

Expected: commit succeeds if the user wants commits. If the current workflow does not want commits, skip the commit and keep the same staged-file list for the final summary.

---

### Task 4: Add Frontend Account Validation Tests

**Files:**
- Create: `frontend/tests/account-validation.test.mjs`
- Modify: `frontend/tests/account-data.test.mjs`
- Modify: `frontend/tests/account-ui-source.test.mjs`

- [ ] **Step 1: Add pure validation tests**

Create `frontend/tests/account-validation.test.mjs`:

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  normalizeAccountEmail,
  validateAccountCredentials,
} from "../src/app/account-validation.ts";

describe("account validation", () => {
  it("normalizes emails before account requests", () => {
    assert.equal(normalizeAccountEmail(" Rider@Example.COM "), "rider@example.com");
  });

  it("accepts simple valid registration inputs", () => {
    const result = validateAccountCredentials({
      mode: "register",
      email: "rider@example.com",
      password: "correct horse battery staple",
    });

    assert.equal(result.valid, true);
    assert.equal(result.normalizedEmail, "rider@example.com");
  });

  it("rejects malformed emails", () => {
    const result = validateAccountCredentials({
      mode: "register",
      email: "rider@localhost",
      password: "correct horse battery staple",
    });

    assert.equal(result.valid, false);
    assert.equal(result.message, "Enter a valid email address.");
  });

  it("keeps registration password rules easy but useful", () => {
    assert.equal(validateAccountCredentials({
      mode: "register",
      email: "rider@example.com",
      password: "short1",
    }).message, "Password must be at least 10 characters.");

    assert.equal(validateAccountCredentials({
      mode: "register",
      email: "rider@example.com",
      password: "1234567890!",
    }).message, "Password must include at least one letter.");

    assert.equal(validateAccountCredentials({
      mode: "register",
      email: "rider@example.com",
      password: "aaaaaaaaaa",
    }).message, "Password must include a number, symbol, or space.");
  });

  it("does not apply new-password rules to login", () => {
    const result = validateAccountCredentials({
      mode: "login",
      email: "rider@example.com",
      password: "legacy",
    });

    assert.equal(result.valid, true);
  });
});
```

- [ ] **Step 2: Add account API error parsing tests**

In `frontend/tests/account-data.test.mjs`, update the import block to include `AccountRequestError` and `registerAccount`:

```js
import {
  AccountRequestError,
  createSavedCommute,
  getCurrentAccount,
  getSavedCommutes,
  loginDemoAccount,
  logoutAccount,
  registerAccount,
} from "../src/app/account-data.ts";
```

Add these tests before the saved-commute tests:

```js
  it("posts registration with normalized payload and credentials included", async () => {
    const requests = [];
    const result = await registerAccount(
      { email: "rider@example.com", password: "correct horse battery staple", displayName: "Rider" },
      {
        fetcher: async (input, init) => {
          requests.push({ input, init });
          return new Response(
            JSON.stringify({
              authenticated: true,
              user: { id: "user_1", email: "rider@example.com", displayName: "Rider", demo: false },
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        },
      }
    );

    assert.equal(result.authenticated, true);
    assert.equal(requests[0].init.method, "POST");
    assert.equal(requests[0].init.credentials, "include");
    assert.equal(requests[0].init.body, JSON.stringify({
      email: "rider@example.com",
      password: "correct horse battery staple",
      displayName: "Rider",
    }));
  });

  it("surfaces backend account error messages", async () => {
    await assert.rejects(
      () => registerAccount(
        { email: "rider@example.com", password: "correct horse battery staple", displayName: "Rider" },
        {
          fetcher: async () =>
            new Response(
              JSON.stringify({ error: "email_exists", message: "An account with that email already exists." }),
              { status: 409, headers: { "content-type": "application/json" } }
            ),
        }
      ),
      (error) => {
        assert.equal(error instanceof AccountRequestError, true);
        assert.equal(error.status, 409);
        assert.equal(error.errorCode, "email_exists");
        assert.equal(error.message, "An account with that email already exists.");
        return true;
      }
    );
  });
```

- [ ] **Step 3: Add account UI source assertions**

In `frontend/tests/account-ui-source.test.mjs`, add this test:

```js
  it("validates create-account input before sending registration requests", () => {
    assert.match(shellSource, /validateAccountCredentials/);
    assert.match(shellSource, /normalizeAccountEmail/);
    assert.match(shellSource, /account-error-live/);
    assert.match(shellSource, /autoComplete=\{accountDialogMode === "login" \? "current-password" : "new-password"\}/);
    assert.match(shellSource, /aria-invalid=\{Boolean\(accountError && accountDialogMode === "register"\)\}/);
    assert.match(shellSource, /Use at least 10 characters with a letter and a number, symbol, or space\./);
    assert.match(shellSource, /error instanceof AccountRequestError/);
  });
```

- [ ] **Step 4: Run account frontend tests and confirm they fail**

Run:

```bash
npm --prefix frontend exec -- node --test tests/account-validation.test.mjs tests/account-data.test.mjs tests/account-ui-source.test.mjs
```

Expected: FAIL because `account-validation.ts`, `AccountRequestError`, improved UI validation, and helper text do not exist yet.

---

### Task 5: Implement Frontend Account Validation

**Files:**
- Create: `frontend/src/app/account-validation.ts`
- Modify: `frontend/src/app/account-data.ts`
- Modify: `frontend/src/components/LineWatchShell.tsx`

- [ ] **Step 1: Add pure account validation helpers**

Create `frontend/src/app/account-validation.ts`:

```ts
export type AccountDialogMode = "login" | "register";

export type AccountCredentialInput = {
  mode: AccountDialogMode;
  email: string;
  password: string;
};

export type AccountValidationResult = {
  valid: boolean;
  normalizedEmail: string;
  message: string | null;
};

export const ACCOUNT_EMAIL_PATTERN = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
export const MIN_ACCOUNT_PASSWORD_LENGTH = 10;

export function normalizeAccountEmail(email: string) {
  return email.trim().toLowerCase();
}

function hasLetter(value: string) {
  return /[A-Za-z]/.test(value);
}

function hasNumberSymbolOrSpace(value: string) {
  return /[\d\s]|[^A-Za-z0-9]/.test(value);
}

export function validateAccountCredentials(input: AccountCredentialInput): AccountValidationResult {
  const normalizedEmail = normalizeAccountEmail(input.email);
  const password = input.password;

  if (!ACCOUNT_EMAIL_PATTERN.test(normalizedEmail)) {
    return {
      valid: false,
      normalizedEmail,
      message: "Enter a valid email address.",
    };
  }

  if (!password) {
    return {
      valid: false,
      normalizedEmail,
      message: "Enter a password.",
    };
  }

  if (input.mode === "login") {
    return {
      valid: true,
      normalizedEmail,
      message: null,
    };
  }

  const trimmedPassword = password.trim();
  if (trimmedPassword.length < MIN_ACCOUNT_PASSWORD_LENGTH) {
    return {
      valid: false,
      normalizedEmail,
      message: "Password must be at least 10 characters.",
    };
  }

  if (!hasLetter(trimmedPassword)) {
    return {
      valid: false,
      normalizedEmail,
      message: "Password must include at least one letter.",
    };
  }

  if (!hasNumberSymbolOrSpace(trimmedPassword)) {
    return {
      valid: false,
      normalizedEmail,
      message: "Password must include a number, symbol, or space.",
    };
  }

  return {
    valid: true,
    normalizedEmail,
    message: null,
  };
}
```

- [ ] **Step 2: Improve account API error parsing**

In `frontend/src/app/account-data.ts`, add this class after the account response types:

```ts
export class AccountRequestError extends Error {
  status: number;
  errorCode: string | null;

  constructor(status: number, message: string, errorCode: string | null = null) {
    super(message);
    this.name = "AccountRequestError";
    this.status = status;
    this.errorCode = errorCode;
  }
}
```

Add this helper above `authRequest`:

```ts
async function readAccountError(response: Response) {
  try {
    const body = await response.json() as { error?: string; message?: string };
    return {
      errorCode: body.error ?? null,
      message: body.message || `Account request failed with ${response.status}`,
    };
  } catch {
    return {
      errorCode: null,
      message: `Account request failed with ${response.status}`,
    };
  }
}
```

Replace the `if (!response.ok)` block in `authRequest` with:

```ts
  if (!response.ok) {
    const error = await readAccountError(response);
    throw new AccountRequestError(response.status, error.message, error.errorCode);
  }
```

- [ ] **Step 3: Import validation helpers in `LineWatchShell`**

In `frontend/src/components/LineWatchShell.tsx`, update imports from `../app/account-data` to include `AccountRequestError`:

```tsx
  AccountRequestError,
  commutePathPreviewFromCommute,
```

Add this import near the account-data import:

```tsx
import { normalizeAccountEmail, validateAccountCredentials } from "../app/account-validation";
```

- [ ] **Step 4: Validate before submit and use backend messages**

Replace the top of `handleSubmitAccount` in `LineWatchShell.tsx` with this logic. Keep the rest of the successful state update behavior the same.

```tsx
  const handleSubmitAccount = async () => {
    if (!accountDialogMode) return;

    const validation = validateAccountCredentials({
      mode: accountDialogMode,
      email: accountEmail,
      password: accountPassword,
    });

    if (!validation.valid) {
      setAccountError(validation.message);
      return;
    }

    setAccountBusy(true);
    setAccountError(null);
    try {
      const normalizedEmail = validation.normalizedEmail;
      const response = accountDialogMode === "login"
        ? await loginAccount({ email: normalizedEmail, password: accountPassword })
        : await registerAccount({
            email: normalizedEmail,
            password: accountPassword,
            displayName: accountDisplayName.trim(),
          });
      setAccountState({ source: "backend", authenticated: response.authenticated, user: response.user });
      setAccountDialogMode(null);
      resetAccountForm();
    } catch (error) {
      if (error instanceof AccountRequestError) {
        setAccountError(error.message);
      } else {
        setAccountError(accountDialogMode === "login" ? "Incorrect Email or Password." : "Could not create that account.");
      }
    } finally {
      setAccountBusy(false);
    }
  };
```

- [ ] **Step 5: Add account dialog accessibility and helper text**

In the email input, add `autoComplete`, `aria-invalid`, and normalized `onBlur`:

```tsx
                <input
                  type="email"
                  value={accountEmail}
                  autoComplete="email"
                  aria-invalid={Boolean(accountError && accountDialogMode === "register")}
                  onBlur={() => setAccountEmail((current) => normalizeAccountEmail(current))}
                  onChange={(event) => setAccountEmail(event.target.value)}
                />
```

In the password input, replace the current single-line input with:

```tsx
                <input
                  type="password"
                  value={accountPassword}
                  autoComplete={accountDialogMode === "login" ? "current-password" : "new-password"}
                  aria-describedby={accountDialogMode === "register" ? "account-password-help" : undefined}
                  aria-invalid={Boolean(accountError && accountDialogMode === "register")}
                  onChange={(event) => setAccountPassword(event.target.value)}
                />
```

Immediately after the password label, render the helper text only for registration:

```tsx
              {accountDialogMode === "register" ? (
                <p id="account-password-help" className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                  Use at least 10 characters with a letter and a number, symbol, or space.
                </p>
              ) : null}
```

Replace the account error paragraph inside the dialog with:

```tsx
              {accountError ? (
                <p id="account-error-live" role="alert" className="text-xs font-semibold text-red-600 dark:text-red-300">
                  {accountError}
                </p>
              ) : null}
```

- [ ] **Step 6: Run focused frontend account tests**

Run:

```bash
npm --prefix frontend exec -- node --test tests/account-validation.test.mjs tests/account-data.test.mjs tests/account-ui-source.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit frontend account validation slice**

Run:

```bash
git add frontend/src/app/account-validation.ts frontend/src/app/account-data.ts frontend/src/components/LineWatchShell.tsx frontend/tests/account-validation.test.mjs frontend/tests/account-data.test.mjs frontend/tests/account-ui-source.test.mjs
git commit -m "feat(frontend): validate account signup input"
```

Expected: commit succeeds if the user wants commits. If commits are not wanted, skip and report the changed files.

---

### Task 6: Add Backend Validation Tests

**Files:**
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/account/AccountServiceTest.java`

- [ ] **Step 1: Add backend email/password validation tests**

In `AccountServiceTest.java`, add these tests after `registerRejectsDuplicateEmail`:

```java
    @Test
    void registerRejectsMalformedEmail() {
        assertThatThrownBy(() -> service.register(
            new AccountService.RegisterRequest("rider@localhost", "correct horse battery staple", "Rider")
        ))
            .isInstanceOf(AccountException.class)
            .extracting("status")
            .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void registerAcceptsEasyPassphrasePassword() {
        when(accountRepository.existsByEmail("rider@example.com")).thenReturn(false);
        when(accountRepository.save(any(AccountEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(sessionRepository.save(any(UserSessionEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        AccountResponses.AuthSession response = service.register(
            new AccountService.RegisterRequest("rider@example.com", "correct horse battery staple", "Rider")
        );

        assertThat(response.user().email()).isEqualTo("rider@example.com");
    }

    @Test
    void registerRejectsPasswordWithoutLetter() {
        assertThatThrownBy(() -> service.register(
            new AccountService.RegisterRequest("rider@example.com", "1234567890!", "Rider")
        ))
            .isInstanceOf(AccountException.class)
            .hasMessageContaining("Password must include at least one letter");
    }

    @Test
    void registerRejectsPasswordWithoutNumberSymbolOrSpace() {
        assertThatThrownBy(() -> service.register(
            new AccountService.RegisterRequest("rider@example.com", "aaaaaaaaaa", "Rider")
        ))
            .isInstanceOf(AccountException.class)
            .hasMessageContaining("Password must include a number, symbol, or space");
    }
```

- [ ] **Step 2: Run backend account tests and confirm they fail**

Run:

```bash
mvn -f backend/pom.xml -Dtest=AccountServiceTest test
```

Expected: FAIL because backend still accepts `rider@localhost`, `1234567890!`, and `aaaaaaaaaa` under current validation.

---

### Task 7: Implement Backend Validation

**Files:**
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/account/AccountService.java`

- [ ] **Step 1: Add Java regex import and pattern**

In `AccountService.java`, add:

```java
import java.util.regex.Pattern;
```

Add constants near `MIN_PASSWORD_LENGTH`:

```java
    private static final Pattern EMAIL_PATTERN = Pattern.compile(
        "^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$",
        Pattern.CASE_INSENSITIVE
    );
```

- [ ] **Step 2: Replace email validation**

Replace `normalizeEmail` with:

```java
    private String normalizeEmail(String email) {
        String normalized = email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
        if (normalized.isBlank() || !EMAIL_PATTERN.matcher(normalized).matches()) {
            throw new AccountException(HttpStatus.BAD_REQUEST, "invalid_email", "Enter a valid email address.");
        }
        return normalized;
    }
```

- [ ] **Step 3: Replace password validation**

Replace `validatePassword` with:

```java
    private void validatePassword(String password) {
        String candidate = password == null ? "" : password.trim();
        if (candidate.length() < MIN_PASSWORD_LENGTH) {
            throw new AccountException(HttpStatus.BAD_REQUEST, "weak_password", "Password must be at least 10 characters.");
        }
        boolean hasLetter = candidate.chars().anyMatch(Character::isLetter);
        if (!hasLetter) {
            throw new AccountException(HttpStatus.BAD_REQUEST, "weak_password", "Password must include at least one letter.");
        }
        boolean hasNumberSymbolOrSpace = candidate.chars().anyMatch(value ->
            Character.isDigit(value) || !Character.isLetterOrDigit(value)
        );
        if (!hasNumberSymbolOrSpace) {
            throw new AccountException(HttpStatus.BAD_REQUEST, "weak_password", "Password must include a number, symbol, or space.");
        }
    }
```

This keeps `correct horse battery staple` valid because the space satisfies the second factor. It rejects all-letter passwords and number/symbol-only passwords.

- [ ] **Step 4: Run backend account tests**

Run:

```bash
mvn -f backend/pom.xml -Dtest=AccountServiceTest test
```

Expected: PASS.

- [ ] **Step 5: Commit backend validation slice**

Run:

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/account/AccountService.java backend/src/test/java/com/calebhabesh/linewatch/account/AccountServiceTest.java
git commit -m "feat(backend): strengthen account signup validation"
```

Expected: commit succeeds if the user wants commits. If commits are not wanted, skip and report the changed files.

---

### Task 8: Add Smoke Coverage For Guide And Signup Validation

**Files:**
- Modify: `frontend/tests/smoke/dashboard.spec.ts`

- [ ] **Step 1: Add Playwright guide and signup validation smoke test**

In `frontend/tests/smoke/dashboard.spec.ts`, add this test after `renders the seeded dashboard API payload`:

```ts
test("opens the site guide and blocks invalid account signup input", async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  await page.getByRole("button", { name: "Open site guide" }).click();
  const guide = page.getByRole("dialog", { name: "LineWatch TO site guide" });
  await expect(guide).toBeVisible();
  await expect(guide).toContainText("What LineWatch TO does");
  await expect(guide).toContainText("Both Ways");
  await expect(guide).toContainText("Reduced Speed Zone");
  await expect(guide).toContainText("Shuttle badge");
  await guide.getByRole("button", { name: "Close site guide" }).click();
  await expect(guide).toHaveCount(0);

  await page.getByRole("button", { name: "Toggle menu" }).click();
  await page.getByRole("menuitem", { name: "Create account" }).click();
  const dialog = page.getByRole("dialog", { name: "Create LineWatch TO account" });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("Email").fill("rider@localhost");
  await dialog.getByLabel("Password").fill("correct horse battery staple");
  await dialog.getByRole("button", { name: "Create account" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Enter a valid email address.");

  await dialog.getByLabel("Email").fill("rider@example.com");
  await dialog.getByLabel("Password").fill("aaaaaaaaaa");
  await dialog.getByRole("button", { name: "Create account" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Password must include a number, symbol, or space.");
});
```

- [ ] **Step 2: Run the focused smoke test**

Run:

```bash
npm --prefix frontend run test:smoke -- --grep "site guide"
```

Expected: PASS once the app server and smoke API stub are started by the existing Playwright config. If the local environment lacks Playwright browser dependencies, run `npm --prefix frontend run test:smoke:install` only with user approval if network is required.

- [ ] **Step 3: Commit smoke coverage**

Run:

```bash
git add frontend/tests/smoke/dashboard.spec.ts
git commit -m "test(frontend): cover guide and signup validation"
```

Expected: commit succeeds if the user wants commits. If commits are not wanted, skip and report the changed file.

---

### Task 9: Full Verification

**Files:**
- No planned edits.

- [ ] **Step 1: Run frontend fixture tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: PASS.

- [ ] **Step 2: Run frontend typecheck**

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

- [ ] **Step 4: Run frontend build**

Run:

```bash
npm --prefix frontend run build
```

Expected: PASS.

- [ ] **Step 5: Run backend tests**

Run:

```bash
mvn -f backend/pom.xml test
```

Expected: PASS.

- [ ] **Step 6: Run smoke tests**

Run:

```bash
npm --prefix frontend run test:smoke
```

Expected: PASS. If smoke tests fail because the browser cannot be installed or local ports are unavailable, report the exact command and failure output.

- [ ] **Step 7: Final source scan**

Run:

```bash
rg -n "official TTC|live station arrivals|push notifications|email notifications|unfinished implementation" frontend/src/components/SiteGuideDropdown.tsx frontend/src/components/LineWatchShell.tsx frontend/src/app/account-validation.ts backend/src/main/java/com/calebhabesh/linewatch/account/AccountService.java
```

Expected: no overclaiming language in the new guide and no unfinished-implementation markers in touched implementation files. The words `email` and `Email` may appear as form labels or validation text; that is acceptable.

## Final Handoff Notes For Gemini

- Summarize the guide as a top-right popover using the copied public SVG asset.
- Summarize account validation as frontend preflight plus backend-aligned enforcement.
- Mention all commands run and whether each passed.
- Mention if commits were skipped because the user did not request committing.
- If there are still pre-existing dirty files after implementation, list them separately from files changed for this task.
