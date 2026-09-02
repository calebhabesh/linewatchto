# LineWatchTO Mobile Raster Map Planes

This directory contains the bundled mobile raster map planes for LineWatchTO.

## Asset Provenance & Licensing

- **Source Artwork**: The raster planes are exported from custom vector SVG maps authored independently in Inkscape by the project author:
  - `ttc-subway-map-custom.svg` (TTC subway and LRT network)
  - `regional-rail-map.svg` (GO Transit rail corridors and UP Express)
- **Derivative Replica Status**: These maps are independent artistic schematic drawings and data-referencing replicas. They are **not** official TTC or Metrolinx map files and are not affiliated with or endorsed by the Toronto Transit Commission or Metrolinx.
- **Export Tooling**: Generated via `frontend/scripts/generate-map-rasters.mjs` using Inkscape headless rasterization with CSS layer isolation.
- **Density**: `mobile` density tier (optimized for mobile GPU texture budgets and mobile device memory constraints while preserving retina sharpness).

## Plane Architecture

Each network is split into three independent plane layers to allow dynamic, interactive service disruption overlays to be sandwiched precisely beneath labels and station markings:

1. `background`: Geographical base layer (lakes, regions, land boundaries, base guides).
2. `foreground`: Rapid transit tracks, rail corridor colored lines, station tick marks, interchange connectors.
3. `labels`: Station names, terminal labels, and route badges. Placed above dynamic overlay paths so station typography remains legible during active alerts.

## Decoded Dimensions & Asset Catalog

### TTC Subway & LRT (SVG viewBox: `0 0 8250 4000`, aspect ratio: 2.0625)

| File | Plane | Theme | Decoded Dimensions | Aspect Ratio | Size |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `ttc-background-dark-mobile.png` | background | dark | 3000 × 1455 | 2.0619 | 45.3 KB |
| `ttc-background-high-contrast-mobile.png` | background | high-contrast | 3000 × 1455 | 2.0619 | 45.3 KB |
| `ttc-foreground-dark-mobile.png` | foreground | dark | 3000 × 1455 | 2.0619 | 153.9 KB |
| `ttc-foreground-high-contrast-mobile.png` | foreground | high-contrast | 3000 × 1455 | 2.0619 | 153.9 KB |
| `ttc-labels-dark-mobile.png` | labels | dark | 3000 × 1455 | 2.0619 | 522.1 KB |
| `ttc-labels-high-contrast-mobile.png` | labels | high-contrast | 3000 × 1455 | 2.0619 | 522.1 KB |

### GO Rail & UP Express (SVG viewBox: `-200 -200 17036.959 9031.6719`, aspect ratio: 1.8864)

| File | Plane | Theme | Decoded Dimensions | Aspect Ratio | Size |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `regional-background-dark-mobile.png` | background | dark | 3200 × 1767 | 1.8110 | 132.8 KB |
| `regional-background-high-contrast-mobile.png` | background | high-contrast | 3200 × 1767 | 1.8110 | 132.8 KB |
| `regional-foreground-dark-mobile.png` | foreground | dark | 3200 × 1767 | 1.8110 | 169.9 KB |
| `regional-foreground-high-contrast-mobile.png` | foreground | high-contrast | 3200 × 1767 | 1.8110 | 169.9 KB |
| `regional-labels-dark-mobile.png` | labels | dark | 3200 × 1696 | 1.8868 | 341.1 KB |
| `regional-labels-high-contrast-mobile.png` | labels | high-contrast | 3200 × 1696 | 1.8868 | 341.1 KB |

## Memory Management

To minimize mobile memory and GPU texture memory consumption:
- The mobile app mounts only the active network's planes (TTC or Regional) based on the active dashboard network.
- When switching between TTC and Regional, the inactive network plane components are unmounted.
- Decoded texture sources use `expo-image` with native memory/disk caching policies.
