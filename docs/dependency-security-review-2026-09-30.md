# Dependency security review — September 30, 2026

This review covers the sanitized publication candidate. Repository publication
and production deployment are separate transitions: the running service receives
these fixes only when the resulting release is deployed.

This report records the original dependency patch at `89c16467`. The subsequent
[Spring Boot 4.1 migration](spring-boot-4-migration-2026-09-30.md) supersedes its
backend version/count results: 1,220 tests pass and the new 167-dependency Maven
graph has zero OSV findings. Frontend dependencies and their validation are unchanged.

## Findings and fixes

The initial frontend `npm audit` reported nine vulnerable package entries:
one moderate, six high, and two critical. These are package counts, not nine
distinct vulnerabilities. The critical packages were Next.js and MapLibre GL JS.

| Dependency | Before | Candidate | Reason |
| --- | --- | --- | --- |
| Next.js / matching ESLint configuration | 16.2.6 | 16.3.8 | Patched server/image-handler dependencies and advisories |
| MapLibre GL JS | 5.24.0 | 6.11.2 | Patched third-party attribution sanitizer |
| PostCSS | 8.5.15 | 8.5.23 | Patched source-map handling |
| Other npm dependencies | Previous lockfile | Patched compatible resolutions | Includes Sharp, Nano ID, browser metadata, YAML, and brace expansion |
| Spring Boot parent | 3.5.14 | 3.5.16 | Latest community patch in the existing major |
| Jackson BOM | 2.21.2 | 2.21.7 | Current deserialization/parser patches |
| Log4j BOM | 2.24.3 | 2.25.5 | MapMessage serialization patch |
| Netty BOM | 4.1.132.Final | 4.1.137.Final | TLS/SNI and codec patches |
| PostgreSQL JDBC | 42.7.10 | 42.7.13 | Authentication patches |
| Embedded Tomcat | 10.1.54 | 10.1.60 | Current server/authentication patches in version 10.1 |
| jsoup | 1.18.3 | 1.23.2 | Cleaner/parser patches |

The resolved Maven graph contained 137 external dependencies. An
[OSV batch query](https://google.github.io/osv.dev/api/) found 61 distinct advisory
IDs across 18 packages: seven critical, 23 high, 26 moderate, and five low.
These are affected-version matches, not proof that every vulnerable feature is
reachable in this application. Boot 3.5.16 also updates Spring Framework, Spring
Data, Logback, and Micrometer. The five explicit BOM/version overrides in
`backend/pom.xml` cover patches newer than Boot's final community BOM.

Both final checks report **zero findings**: the full npm audit, including developer
dependencies, and OSV queries for all 137 resolved Maven dependencies. No force
upgrade, advisory suppression, or excluded runtime dependency was used to obtain
those results. Scan results are time-specific; they do not cover Maven build
plugins, container/system packages, production configuration, or unknown flaws.

## Runtime applicability and compatibility

LineWatch runs a standalone Next.js server. Static generation of guide pages does
not make the application a static export. Several Next advisories have additional
conditions, including Windows hosting, AVIF optimization, Server Actions, or
attacker-controlled `next/og` SVG generation. No `next/og` endpoint or Server
Action declaration was found in the application. The upgrades cover the affected
dependencies without relying on those features remaining unused. See the
[Next.js advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4)
and [ImageResponse advisory](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j).

The geographic view loads an OpenFreeMap style, so third-party attribution reaches
MapLibre's attribution control. This makes the
[sanitizer advisory](https://github.com/maplibre/maplibre-gl-js/security/advisories/GHSA-jrc7-96c5-q579)
relevant even though the app does not create HTML popups.

The [MapLibre 6 migration](https://maplibre.org/maplibre-gl-js/docs/guides/v5-to-v6-migration-guide/)
requires named ESM imports, WebGL2, and explicit worker setup with Next.js. The
candidate copies the installed worker, shared module, and license before dev/build
to ignored, versioned public assets. Geographic rendering uses that matching
worker URL. Devices without WebGL2 retain the existing **Use Diagram** recovery
action, covered by a browser regression test.

The extra mobile lifecycle checks reproduced two failures on the pre-upgrade
baseline. The focus camera now reserves the original regression's required
24-pixel clearance above the impact inspector. That test waits for settled
framing without relaxing its bounds. The overlap-chooser test also respects
**Unfocus impact** returning to the originating Delays panel, then closes that
panel before interacting with the map.

Weekly Dependabot checks now cover npm, Maven, and GitHub Actions. Patch/minor
package updates are grouped for review; major upgrades remain separate. CI also
fails the frontend advisory check for high/critical findings. These configurations
take effect after pushing them to GitHub; updates are not automatically merged.

## Verification

| Check | Result |
| --- | --- |
| Full npm audit | Zero vulnerable package entries |
| Resolved Maven graph queried against OSV | 137 dependencies; zero findings |
| Frontend fast tests and all script-tool checks | Passed |
| Frontend typecheck and lint | Passed; 18 lint warnings, zero errors |
| Production frontend build | Passed; 209 prerendered pages plus dynamic routes |
| Desktop/mobile Chromium smoke | Six passed |
| Chromium/Firefox geometry and animation checks | 17 passed; platform-specific cases skipped |
| WebKit geometry/network-switch checks | Three passed |
| Mobile Chromium/WebKit map-fit checks | Six passed in each browser |
| Mobile offline snapshot/reconnect checks | Four passed |
| Desktop account/geographic lifecycle and mobile geographic flows | Passed; affected mobile cases rerun after the framing fix |
| Backend tests | 1,219 passed; zero failures/errors/skips |

The existing test tiers were selected explicitly so mobile-only offline checks
ran on their intended project. WebKit ran in the matching official Playwright
1.60.0 Ubuntu container; Chromium and Firefox ran locally. The backend results
cover the patched dependency graph. Unchanged passing checks were reused after
the small geographic framing/test corrections. No production deployment, GitHub
CI run, or container-image vulnerability scan is claimed by these local results.

## Follow-up ownership

- Verify the GitHub CI result after replacing the still-private remote's history.
  Local release checks include WebKit through the supported container; see
  [testing](testing.md#local-browser-support).
- Publish and deploy the validated security release through the existing release
  workflow so users receive the fixes; source publication alone does not do that.
- Completed locally: move to Spring Boot 4.1.1 with Jackson 3.1.7 and Tomcat
  11.0.26; see the [migration verification](spring-boot-4-migration-2026-09-30.md).
  Spring states that
  [3.5.16 is the final community-supported 3.5 release](https://spring.io/blog/2026/06/25/spring-boot-3-5-16-available-now/).
  The original Boot 3.5 overrides are replaced by two patches newer than the
  Boot 4.1.1 BOM. Reassess those when updating the parent.

The [publication procedure](publication-candidate-2026-09-30.md#github-publication-procedure)
keeps the existing GitHub repository as the development home after sanitization
and visibility change. The original local clone becomes a private archive.
