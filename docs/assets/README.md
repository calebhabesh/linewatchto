# README screenshots

Captured and reviewed: September 30, 2026 at 19:23 EDT.

Every image in the README is a screenshot of the public production application at [linewatchto.ca](https://linewatchto.ca), using actual source-backed data. They are historical snapshots of a running product, not current service information or evidence of user counts or performance. Source labels distinguish live predictions from scheduled departures.

| Image | Framing and resolution |
| --- | --- |
| `ttc-desktop.png` | Full TTC dashboard and network overview; 1600 × 1000 viewport, captured at 2× resolution (3200 × 2000 PNG) |
| `regional-desktop.png` | Full GO/UP dashboard and network overview; same viewport and resolution |
| `ttc-mobile.png` | Natural phone dashboard framing; 412 × 915 viewport, 824 × 1830 PNG |
| `station-details.png` | Deliberate close-up of the Union station panel after opening its Train Arrivals section; captured at 2× resolution |

The desktop map cameras were zoomed out and panned through ordinary controls so endpoints remain visible beside the status panel. The regional map is positioned above its fixed legend. The desktop images contain the complete viewport; the phone image keeps the application's usual phone framing. README previews scale to the available width, and each links to its original PNG.

All captures used a new signed-out browser context. No personal account, saved commute, provider key, raw upstream response, or authentication state is included. The station detail replaces the earlier demo-account image so the README gallery uses production views throughout. Application onboarding assets continue to use their existing synthetic examples.

Source freshness was verified separately for TTC and regional public dashboard responses: each reported `availability: available` and `status.generatedAt.live: true`. Union's public station response provided TTC GTFS-RT subway predictions, with the LIVE source labels visible in the panel. [Capture provenance](capture-provenance.json) records only public source identifiers, timestamps, viewport dimensions, and framing.

## Refreshing the images

Use Playwright with a clean, signed-out browser context against the public application. Use the viewport sizes above, 2× pixel density, dark mode, reduced motion, and the real clock. Dismiss first-visit guidance through normal preferences, wait for a successful relevant dashboard response, fonts, raster-map readiness, and a settled camera, then capture the rendered UI.

Use Center and the zoom/pan controls to frame the complete desktop network beside the sidebar. Capture a selected station separately when detail readability matters. Do not use a fixed example clock, response interception, API fixtures, or a synthetic account for these README images. Keep source labels visible and do not label an unavailable or stale source as live.

If a source is not fresh, defer its replacement or explicitly caption the actual state. Inspect all images for clipped endpoints, legends, loading placeholders, account details, and operational identifiers. Update capture provenance and README timestamps together. Normal application builds do not require screenshot regeneration, and refreshing README images does not require updating application onboarding assets or browser-test baselines.
