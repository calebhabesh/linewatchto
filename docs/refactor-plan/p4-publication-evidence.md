# LineWatchTO — Publication Readiness Evidence & Release Candidate Audit

This document records the publication readiness evidence, dependency audit, verification results, and owner decisions for the **LineWatchTO** release candidate in accordance with **Stage 10 (Chunk P4)** of [docs/refactor-plan/06-publication.md](06-publication.md).

**Historical candidate evidence (2026-09-25).** Versions, advisory dispositions, test counts, and passing results below describe that candidate and must not be treated as verification of later checkouts. See the [September 30 repository audit](../publication-audit-2026-09-30.md) for current credential-scan scope, privacy findings, and publication decisions, and the [dependency security review](../dependency-security-review-2026-09-30.md) for the subsequent fixes.

---

## 1. Candidate Baseline & Repository Provenance

- **Evaluation Date**: 2026-09-25
- **Branch**: `main`
- **Candidate Commit / HEAD**: Current refactored working tree
- **Target Platform**: Node.js 22 LTS, Java 21 LTS (Temurin), PostgreSQL 17/18 with PostGIS, Redis 7+
- **Secret & Credential Scan**:
  - Tree and history scans performed for private keys (`BEGIN ... PRIVATE KEY`), credentials, tokens, and passwords.
  - Zero private keys or credentials tracked in the repository.
  - `.env` files are strictly ignored via `.gitignore`; only sanitized `.example` templates (`.env.example`, `.env.production.example`, `.env.staging.example`, `.env.aws-lab.example`, `.env.release.example`) are tracked with clear placeholders (`replace_with_...` or empty values).
  - All raw provider payloads, API keys, and database passwords remain server-side and configurable via environment variables.

---

## 2. Dependency Audit & License Reconciliation

### 2.1 Dependency Pruning & Tooling Ownership

A complete audit of client, server, build, CSS/plugins, and scripts was performed:

1. **`recharts` (^3.8.1) — Removed**:
   - Scaffolding dependency from project inception with zero usage across the codebase.
   - Pruned from `frontend/package.json` and `package-lock.json`.
2. **`gsap` (^3.13.0) & `DotGrid.tsx` — Removed**:
   - `frontend/src/components/DotGrid.tsx` was orphaned dead code (superseded by `ConstellationBackground.tsx` in commit `bbdb3af6`).
   - Removing `DotGrid.tsx` permitted the safe removal of `gsap` from `package.json` and `package-lock.json`.
   - **Licensing Benefit**: Eliminated GreenSock's proprietary non-commercial license from the repository dependencies.
3. **`postcss` (^8.5.15) — Declared Ownership in `devDependencies`**:
   - `frontend/scripts/stylesheet-graph.mjs` directly imports `postcss` for AST metrics analysis.
   - Previously resolved only transitively via `@tailwindcss/postcss`. Added explicitly to `devDependencies` to ensure reproducible, isolated package manager installation.
4. **Backend Dependencies (`backend/pom.xml`) — Retained**:
   - All 15 declared dependencies are actively utilized (Spring Data JPA, Redis, Validation, Web, Actuator, Prometheus Micrometer, Mail, Flyway Core, Flyway PostgreSQL, PostgreSQL JDBC driver, Hibernate Spatial, jsoup, Spring Security Crypto, Spring Security OAuth2 Jose). No dead dependencies found.

### 2.2 License Classification

| Domain | Dependencies | License | Permissibility Status |
| --- | --- | --- | --- |
| **Frontend Runtime** | `next`, `react`, `react-dom`, `motion` | **MIT** | Permissive open source |
| | `lucide-react` | **ISC** | Permissive open source |
| | `maplibre-gl` | **BSD-3-Clause** | Permissive open source |
| **Frontend Dev/Build** | `postcss`, `tailwindcss`, `@tailwindcss/postcss`, `eslint`, `eslint-config-next`, `@types/*` | **MIT** | Permissive open source |
| | `typescript`, `@playwright/test` | **Apache-2.0** | Permissive open source |
| **Backend Runtime** | Spring Boot starters, Micrometer, Flyway Core, Spring Security | **Apache-2.0** | Permissive open source |
| | PostgreSQL JDBC Driver | **BSD-2-Clause** | Permissive open source |
| | Hibernate Spatial | **LGPL-2.1** | Standard library dynamic linking |
| | jsoup | **MIT** | Permissive open source |

*Summary*: 100% of runtime and developer dependencies operate under standard permissive or library open-source licenses. All proprietary non-commercial constraints (GSAP) have been eliminated.

### 2.3 Package Security / Vulnerability Audit

An `npm audit` assessment was executed at implementation time:
- Total audited packages: 394 (reduced by 41 packages after pruning GSAP and Recharts).
- 9 vulnerable package entries detected (1 moderate, 6 high, 2 critical), including runtime dependencies:
  - `next`: Multiple conditional server/image-handler advisories. LineWatch uses a standalone Next.js server; the original review's description of a static export was incorrect.
  - `maplibre-gl`: DOM sanitize XSS bypass on live NamedNodeMap removal.
  - `brace-expansion`, `browserslist`, `nanoid`, `js-yaml`, `sharp`, `postcss`: Other tooling and image-processing dependencies; `sharp` is also used at runtime by Next.js.
- **Historical disposition, superseded**: Upgrades were deferred. The September 30 security follow-up upgrades Next.js within version 16 and migrates MapLibre to version 6 with browser verification; see the linked review. This earlier deferral is not a current release recommendation.

---

## 3. Verification & CI Gate Reconciliation

### 3.1 Suite Inventory & Commands

The test tiers defined in [docs/testing.md](../testing.md) and [docs/refactor-plan/07-test-suite.md](07-test-suite.md) are reconciled across package scripts, operational tools, and GitHub Actions CI:

| Tier / Command | Discovered Suites / Tests | Purpose & Scope | CI Gate? |
| --- | --- | --- | :---: |
| `npm --prefix frontend run test:fast` | 166 suites, 1,928 tests | Pure business logic, adapters, fixture contracts, CSS AST guardrails | **Yes** |
| `npm --prefix frontend run test:scripts:all` | 3 Node suites (23 tests) + 3 Shell suites (33 tests) = 56 tests | CLI tools (OG generator, map normalizer, performance runner) and operational infrastructure (production release, staging, AWS lab) | **Yes** |
| `npm --prefix frontend run typecheck` | Full frontend codebase | TypeScript compiler static verification (`tsc --noEmit`) | **Yes** |
| `npm --prefix frontend run lint` | Full frontend codebase | ESLint Next.js configuration | **Yes** |
| `npm --prefix frontend run build` | 209 static / SSG routes | Next.js production compilation, static generation, CSS bundle metadata | **Yes** |
| `npm --prefix frontend run test:smoke` | 6 tests across Desktop Chrome & Mobile Chromium | High-priority release smoke: dashboard boot, map-to-detail navigation, cross-network search, source-honest fallback | **Yes** |
| `npm --prefix frontend run test:browser-compat` | 4 tests across Chrome, Firefox, WebKit | Cross-engine SVG geometry coordinate preservation | **Yes** |
| `npm --prefix frontend run test:map-fit` | 6 tests across Mobile Chromium, Mobile WebKit | Rotated phone viewports, compact screens, safe area insets, browser zoom | **Yes** |
| `npm --prefix frontend run test:offline` | 4 tests on Mobile Chromium | Service Worker PWA offline dashboard fallback, snapshot hydration, independent network state | **Yes** |
| `npm --prefix frontend run test:lifecycle` | 13 tests on Desktop Chrome | Account dialog transitions, service badges, geographic camera/instance preservation across filter toggles | **Release** |
| `npm --prefix frontend run test:release` | Consolidated release suite | Runs fast, all scripts, typecheck, lint, build, smoke, browser-compat, map-fit, offline, and lifecycle gates | **Release** |
| `mvn -f backend/pom.xml test` | 213 test classes, 1,148 tests | Backend domain services, alert normalization, projections, controllers, security policies, Flyway migrations, PostgreSQL integration | **Yes** |

### 3.2 Candidate Execution Results

All gates executed against the release candidate working tree:

```text
Backend Test Suite (Maven):
  Tests run: 1,148, Failures: 0, Errors: 0, Skipped: 0
  Total time: 14.924 s

Frontend Fast Suite (Node):
  Tests run: 1,928, Failures: 0, Errors: 0, Skipped: 0
  Duration: ~1.8 s

Operational Script Tools (Node + Bash):
  Script Node tests: 23 passed (136 ms)
  Production release tools: 18 passed
  Staging tools: 8 passed
  AWS lab tools: 7 passed
  Total: 56/56 passing (~1.1 s)

Typecheck & Lint:
  TypeScript: 0 errors
  ESLint: 0 errors (19 react-hooks warnings acknowledged in existing shell)

Next.js Production Build:
  209/209 static pages prerendered successfully
  CSS AST metadata recorded cleanly

Browser Playwright Suites:
  test:smoke: 6/6 passed (9.8 s)
  test:browser-compat: 4/4 passed (Chrome & Firefox, 8.8 s)
  test:map-fit: 6/6 passed (Mobile Chromium, 15.4 s)
  test:offline: 4/4 passed (Mobile Chromium, 12.6 s)
  test:lifecycle: 13/13 passed (Desktop Chrome, 38.8 s)
```

### 3.3 Known Environment Gaps

- **Local Host WebKit Execution**:
  The developer machine runs Arch Linux (`rolling`). In accordance with [docs/testing.md:80](../testing.md#L80), Playwright's Ubuntu WebKit binary requires specific Debian/Ubuntu shared libraries that are not native to Arch Linux. The cross-browser WebKit gate is provided by the GitHub Actions Ubuntu CI runner (`ubuntu-latest`). Local testing covers Chromium and Firefox.

---

## 4. Boundary Enforcement & Operational Soundness

1. **Fixture Mode & Zero-Credential Quickstart**:
   - Validated that `npm run dev` and `npm run build` boot without any environment variables, databases, or API keys required.
   - Frontend defaults strictly to fixture data when the backend is unreachable or disabled.
2. **Source-Honest Data Invariants**:
   - Live claims require enabled ingestion providers and fresh upstream payloads.
   - Offline fallback displays clear "Offline" / "Last updated" banners and retains real snapshots rather than substituting mock live claims.
   - Train markers are explicitly labeled as schematic placements.
3. **Internal & Management Isolation**:
   - Actuator endpoints run on private management port 9090 inside the Docker container network.
   - Caddy reverse proxy rules explicitly reject `/actuator*`, `/api/admin/*`, and `/api/diagnostics/raw-alerts/*` with HTTP `404 Not Found`.
   - Private and authenticated APIs enforce `Cache-Control: no-store`.

---

## 5. Owner Decisions and Current Publication Candidate

The results above are historical. Current repository publication preparation is recorded in the [September 30 candidate report](../publication-candidate-2026-09-30.md).

1. **Code License Selection**:
   - Resolved on 2026-09-30: project code and original documentation use the root [MIT license](../../LICENSE). Third-party source data and assets retain separate terms.
2. **External Data Source Approvals**:
   - In accordance with [docs/source-licensing-launch-gates.md](../source-licensing-launch-gates.md), keep deployed integration terms and any agreements in a private operational location. The owner chose to retain the authored maps with source credits; public fixtures use synthetic records.
3. **Repository Visibility & Deployment**:
   - The repository remains private until the owner authorizes visibility changes.
   - The owner chose a sanitized copy preserving development history, with old workstation details removed. The private source history remains intact; see the [candidate report](../publication-candidate-2026-09-30.md).
   - Production deployment is executed separately via [scripts/prod-deploy.sh](../../scripts/prod-deploy.sh).
