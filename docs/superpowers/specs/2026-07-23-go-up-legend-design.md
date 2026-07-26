# Spec: GO/UP Regional Rail Map Legend & Line Label System

**Date:** 2026-07-23
**Status:** Approved
**Target Application:** LineWatchTO / TTC Reliability Navigator (GO/UP Regional Rail View)

---

## 1. Overview

This document specifies the design for the **GO/UP Map Legend & Line Label System**. The implementation provides visual and functional parity between the TTC Subway/LRT map and the GO/UP Regional Rail map by:
1. Embedding a native SVG legend block and North cardinal direction compass (`cardinal-north.svg`) directly on the `regional-rail-map.svg` canvas in the bottom-right coordinate area.
2. Extracting standalone SVG badge assets for all 8 regional lines (`go-br`, `go-ki`, `go-le`, `go-lw`, `go-mi`, `go-rh`, `go-st`, `up-express`) from the SVG `line-labels` layer for sitewide reuse.
3. Updating `TransitLineBadge.tsx`, `LineLegend.tsx`, and `MobileLegend.tsx` to support both TTC and GO/UP modes with interactive alert indicators.
4. Replacing the temporary floating overlay card in `InteractiveRegionalMap.tsx` with the embedded SVG map canvas legend.

---

## 2. SVG Map Canvas Legend & North Compass

### 2.1 Placement & Coordinates
- **File:** `frontend/public/assets/linewatch/regional-rail-map.svg`
- **ViewBox:** `-200 -200 17036.959 9031.6719`
- **Legend Group Location:** Bottom-right corner space below the Lakeshore East line (approx. X: `13200` to `16600`, Y: `6200` to `8600`).
- **North Compass Location:** Positioned directly above the legend in the bottom-right coordinate region (approx. X: `15800`, Y: `5600`), embedding the geometry from `cardinal-north.svg` (triangle + circle 'N' emblem).

### 2.2 Legend Visual Sections (`<g id="regional-map-legend">`)
1. **Header 1: Regional trains / Trains régionaux [GO]**
   - Line swatches (solid stroke segments) + SVG badges + route labels:
     - **BR**: Barrie Line (`#005596` / `#0050A0`)
     - **KI**: Kitchener Line (`#138336`)
     - **LE**: Lakeshore East Line (`#E42526`)
     - **LW**: Lakeshore West Line (`#7B1632`)
     - **MI**: Milton Line (`#F58220`)
     - **RH**: Richmond Hill Line (`#27ADEA`)
     - **ST**: Stouffville Line (`#8D5B2D`)
   - **Service Patterns**:
     - *Regular service / Service régulier*: Solid neutral line segment.
     - *Limited service / Service limité*: Dashed neutral line segment.
2. **Header 2: Airport train / Train de l'aéroport [UP]**
   - Patterned blue line segment + **UP** badge + *Union Pearson Express* (`#007BB6`).
3. **Header 3: Subway and light rail / Métro et train léger [TTC]**
   - Mapped TTC rapid transit connections (Line 1, 2, 4, 5, 6 badges & line segments).
4. **Header 4: Station Legend / Légende**
   - Interchange station node symbol (`#ffffff` fill with black stroke).
   - Wheelchair accessibility icon (`wheel-chair-symbol.svg`).

---

## 3. Standalone SVG Line Badges & Component Seam

### 3.1 SVG Legend Badges (`frontend/public/assets/linewatch/`)
8 standalone SVG assets created derived from `<g id="line-labels">`:
- `go-br-legend.svg`
- `go-ki-legend.svg`
- `go-le-legend.svg`
- `go-lw-legend.svg`
- `go-mi-legend.svg`
- `go-rh-legend.svg`
- `go-st-legend.svg`
- `up-express-legend.svg`

Each asset features the exact line fill color, rounded corner geometry, white outer border stroke, and centered bold text.

### 3.2 Component Wiring (`TransitLineBadge.tsx`)
- Extend `LINE_NAMES`:
  - `go-br`: "Barrie"
  - `go-ki`: "Kitchener"
  - `go-le`: "Lakeshore East"
  - `go-lw`: "Lakeshore West"
  - `go-mi`: "Milton"
  - `go-rh`: "Richmond Hill"
  - `go-st`: "Stouffville"
  - `up-express`: "Union Pearson Express"
- Extend `FALLBACK_COLORS` for graceful rendering if assets fail to load.
- Extend `transitLineBadgeSrc(lineId)` to return `/assets/linewatch/${lineId}-legend.svg?v=2` for GO/UP line IDs.

---

## 4. UI Legend Controls & Regional Map Integration

### 4.1 `LineLegend.tsx` & `MobileLegend.tsx`
- Support a `mode?: "ttc" | "regional"` property.
- In `"regional"` mode, map over regional line definitions (`go-br` through `up-express`).
- Render live alert buttons (suspensions, delays, reduced speed zones, planned closures) alongside each regional line badge.

### 4.2 `InteractiveRegionalMap.tsx`
- Remove the temporary floating overlay box ("GO & UP corridors").
- Update camera framing boundaries to account for the canvas-embedded legend and North indicator.

---

## 5. Verification Plan

1. **Fixture Tests:** `npm --prefix frontend run test:fixtures`
2. **Type Check:** `npm --prefix frontend run typecheck`
3. **Linter:** `npm --prefix frontend run lint`
4. **Production Build:** `npm --prefix frontend run build`
