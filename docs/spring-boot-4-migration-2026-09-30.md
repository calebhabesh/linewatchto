# Spring Boot 4 migration — September 30, 2026

The sanitized development checkout now uses Spring Boot **4.1.1**, with Java 21.
This completes the support follow-up from the
[dependency security review](dependency-security-review-2026-09-30.md).
GitHub publication and production deployment are still pending.

## Migration

- Replace the web starter with `spring-boot-starter-webmvc`, add the explicit
  RestClient and Flyway starters, and use the MVC test starter. Boot 4 modularizes
  these features; retaining only the old Flyway dependency would lose its startup
  auto-configuration.
- Migrate JSON readers, cached DTOs, provider parsing, and tests to Jackson 3.
  Jackson annotations retain their `com.fasterxml.jackson.annotation` package.
  Update the TTC timestamp deserializer and Jackson exception handling.
- Set `spring.jackson.use-jackson2-defaults=true` to retain existing JSON defaults.
  The startup regression verifies ISO timestamp/null-field compatibility with a
  pre-upgrade cache shape, malformed request rejection, and API serialization.
- Remove the old Log4j, Netty, and PostgreSQL version overrides. Keep two overrides
  newer than Boot 4.1.1's BOM: **Jackson 3.1.7** and **Tomcat 11.0.26**. The default
  graph had eight OSV advisory matches across Jackson databind and Tomcat core;
  the patched graph has none. No suppressions or dependency exclusions were used.
- Add PostgreSQL 17/PostGIS to backend CI so database and complete-application
  regression tests execute rather than skipping for an absent test database.

The migration follows the official
[Boot 4 migration guide](https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-4.0-Migration-Guide)
and [Boot 4.1 release notes](https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-4.1-Release-Notes).
Patch references: [Tomcat security](https://tomcat.apache.org/security-11.html),
[Jackson advisory](https://github.com/FasterXML/jackson-databind/security/advisories/GHSA-wv8q-qhhj-9h54).

## Verification

| Check | Result |
| --- | --- |
| Early account/cache/provider/persistence/push tests | 362 passed |
| Clean complete backend suite and executable JAR packaging | 1,220 passed; zero failures/errors/skips |
| OSV batch scan of resolved Maven graph, including test dependencies | 167 dependencies; zero findings |
| Complete application regression on PostgreSQL 18.4/PostGIS | Passed within the full suite |
| Same application regression on PostgreSQL 17/PostGIS, matching the CI service | Passed |
| Backend Dockerfile build and packaged-image startup on PostgreSQL 17/PostGIS | Passed |
| Packaged-image public health/dashboard and management isolation | Health OK; dashboard unavailable/live false with providers off; public actuator returns 404 |

The complete application regression uses a temporary schema: it runs all 84
existing Flyway migrations, validates Hibernate mappings, serves real HTTP APIs,
checks the private Prometheus endpoint, and verifies demo-session creation,
protected account reads, logout, and rejection of the revoked session. The schema
is dropped afterward. The Docker image check also exercises Boot's nested JAR
loader and Tomcat 11 in the Java 21 runtime image.

Frontend files and dependencies are unchanged; their passing checks from the
earlier security review are reused. These are local results. GitHub CI, ARM64
release images, production deployment, and container/system vulnerability scans
are not claimed. OSV results are time-specific and exclude Maven build plugins.

## Development directory and remaining transition

Work in `linewatchto`, the renamed sanitized checkout. The original clone is
`../linewatchto-archive`, with its files/history preserved and origin pushes
disabled locally. Keep original archive commits out of sanitized development.

Follow the [publication procedure](publication-candidate-2026-09-30.md#github-publication-procedure):
replace all reviewed remote branches/tag while private, verify a fresh remote
clone and obsolete GitHub references, require successful CI and release image
publication, then change visibility. Enable private vulnerability reporting once
public. Deploy the new release through the existing manual workflow, retaining
the production backup and previous release digests for rollback. The deployment
workflow fetches/checks out the sanitized release SHA separately from this local
directory rename; preserve server-local environment files and persistent volumes.
