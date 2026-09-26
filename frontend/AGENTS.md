# Frontend

## Find the owner

- `src/app/globals.css` is the CSS import manifest. Edit the owning file in `src/styles/{foundation,shell,map,station,account,panels,utilities}/`; preserve import order and inspect theme/responsive overrides of the selector. Avoid appending override piles to the manifest.
- `src/app/linewatch-data.ts` is the fixture/API-shape seam; preserve complete source-labeled fallback. Follow existing adapters and Server/Client Component boundaries.
- `src/app/dashboard-contract.ts` defines core dashboard contracts and types; `src/app/DataContext.tsx` distributes state to React components.
- `src/components/NetworkMap.tsx` and its renderers (`InteractiveTtcMap.tsx`, `InteractiveRegionalMap.tsx`, `GeographicNetworkMap.tsx`) render authored SVG maps and raster planes with React overlays. Before changing map assets, geometry, IDs, or overlay anchoring, read [the map contract](../docs/ttc-map-asset-contract.md).

## UI requirements

- Reuse existing tokens, authored line badges, icons, and component patterns in both networks. Preserve route identity colors; service overlays use red for suspension/closure, orange for delay, chevrons for explicit Reduced Speed Zones, and blue for planned previews.
- Keep map/current status in the first viewport, cards at 8px radius or less, and avoid nested decorative cards or ornamental hero art.
- Use **My Commutes** in user-facing copy. Preserve network-specific capabilities and source/freshness labels.
- Controls must retain stable dimensions across toggled/selected/loading states. Preserve keyboard operation, accessible names, visible focus, high contrast, and static/reduced-motion behavior.
- For responsive changes, inspect the affected view at a compact phone (360px) and desktop (1440px), plus either side of any changed media-query breakpoint. Text/controls must not overlap or create page-level horizontal overflow. Preserve deliberate map panning and internal scrolling.
- For shared presentation changes, inspect both TTC and GO/UP and relevant theme states. For a local tweak, inspect only the affected component/states; no whole-app visual tour.

## Verification

Commands run from repo root:

- Local CSS/copy: inspect the diff and affected view; use a focused browser check if needed. No mandatory build or application suite.
- Finished behavior/TypeScript change: `npm --prefix frontend run test:fast`, `npm --prefix frontend run typecheck`, and `npm --prefix frontend run lint` once. Add regression tests for meaningful behavior, not incidental spacing or implementation strings.
- Scripts/tooling: `npm --prefix frontend run test:scripts` covers Node CLI tools; run the affected Bash suite for operational scripts. `npm --prefix frontend run test:scripts:all` covers both for CI and release.
- Rendering, routing, dependencies, bundling, or Server/Client boundaries: also `npm --prefix frontend run build` and relevant smoke/E2E scenarios.
- Shell, navigation, map interaction, or cross-network changes: choose affected `test:shell:*`, `test:map-fit`, `test:lifecycle`, smoke, or E2E scenarios. Use the visual suite for broad shared styling changes; a local rule in a shared file does not require it.
- Release candidate: `npm --prefix frontend run test:release` runs the complete frontend gate. Run `mvn -f backend/pom.xml test` separately for backend verification.
- Before Playwright, read [testing](../docs/testing.md) for build reuse, focused tiers, and platform limitations. Suites sharing mutable stubs run serially. Review visual differences before updating snapshots.
