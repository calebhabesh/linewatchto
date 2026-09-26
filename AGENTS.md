# LineWatchTO agent guide

LineWatchTO is an unofficial TTC subway/LRT and GO/UP reliability dashboard.
Keep the usable map and status dashboard first; this is not a landing page.

## Work proportionally

- For a local color, spacing, copy, or layout tweak: locate the owning component/style, edit it, inspect the affected view, and report briefly. Skip formal plans, broad repo audits, and unrelated docs.
- Search narrowly with `rg`; expand only when dependencies or uncertainty require it. Read linked references only when their trigger applies.
- During design iteration, use the smallest useful check. Pure CSS/copy needs no application suite; use a focused browser check for layout uncertainty. Do not run builds, smoke, E2E, or visual suites after every tweak.
- For behavior changes, add meaningful regression coverage and validate risky auth, persistence, freshness, and notification paths early. Run the affected layer's final checks once when stable; reuse unchanged passing results.
- Preserve unrelated user changes and existing patterns. Keep refactors and dependencies justified by the task. Report checks and material gaps honestly; do not ask permission for routine edits or checks.

## Scope and commands

Read the scoped guide before editing that directory, including when starting at repo root. Paths and commands below are relative to repo root.

| Area | Guide / architecture | Common checks |
| --- | --- | --- |
| Web | [frontend/AGENTS.md](frontend/AGENTS.md): Next.js App Router, React, TypeScript | `npm --prefix frontend run test:fast`, `run typecheck`, `run lint` (same prefix) |
| API | [backend/AGENTS.md](backend/AGENTS.md): Java 21, Spring Boot, Flyway, PostgreSQL/PostGIS, Redis | `mvn -f backend/pom.xml test` |
| Native | [mobile/AGENTS.md](mobile/AGENTS.md): empty Android/iOS workspace | Platform checks once a native project exists |

## Invariants

- Label fixture/demo, scheduled, live, stale, and offline data honestly. Live claims require the relevant enabled provider and fresh successful source data; estimated train markers are schematic placements.
- Keep credentials and raw provider payloads server-side and out of Git. Never cache account pages or API responses in the service worker.
- Preserve independent TTC/regional freshness and network boundaries; a source's availability does not authorize another feature's live claims.
- Use only public, source-linked data. Before changing ingestion, source use, or public data claims, read [source launch gates](docs/source-licensing-launch-gates.md).

## Read only when relevant

- Changing source semantics, alerts, arrivals, notices, commutes, push, or reliability: read the affected section of [domain invariants](docs/domain-invariants.md). For implementation background, search [feature reference](docs/feature-reference.md); confirm against code/tests.
- Choosing integration/release checks or debugging the test harness: [testing](docs/testing.md). Docs-only work needs diff/link review, not application tests.
- Deployment, Compose, or operational scripts: [operations guide](docs/operations-guide.md); use the [script inventory](docs/script-inventory.md) to find the owning tool and check.
- Preparing a publication candidate: review [P4 evidence and owner decisions](docs/refactor-plan/p4-publication-evidence.md) and select release checks from [testing](docs/testing.md). Repository visibility, code license, and deployment decisions remain with the owner.
- Setup and current product claims: relevant README sections. Update claims when behavior changes, not for cosmetic edits.

## Keep guidance lean

Use root and scoped `AGENTS.md` files as the unified instructions for all agents.
Historical plans may mention `GEMINI.md` or synchronized feature inventories; those instructions are retired. Do not recreate that file.
Keep this root under 100 lines and scoped guides under 80. Put feature history/specs in docs, repeatable procedures in linked runbooks, and add skills only when a repeated workflow needs them. Do not load every scoped guide or reference for every task.
