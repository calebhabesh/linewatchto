# Alert Ingestion and Normalization Slice Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Design and implement the first slice of TTC alert polling, normalization, and persistence. This slice introduces scheduled ingestion jobs, parses unstructured alert text, maps alerts to PostGIS line segments, and saves them to the database.

**Architecture:** A Spring `@Scheduled` job will periodically fetch TTC alerts from a configurable endpoint. An `AlertNormalizer` will use text-matching to extract the affected transit line, the bounds (Station A to Station B), and the disruption type (Delay vs Suspension). An `ImpactMatcher` will link the normalized alert to specific `line_segments` in PostGIS. The ingestion status is tracked in `ingestion_runs`.

---

## File Map

### New Files to Create
- `backend/src/main/java/com/calebhabesh/linewatch/ingestion/AlertIngestionService.java`: The scheduled job coordinator.
- `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertClient.java`: Spring `@RestClient` or `RestTemplate` wrapper to fetch the external feed.
- `backend/src/main/java/com/calebhabesh/linewatch/ingestion/AlertNormalizer.java`: Parses raw text and maps to internal `AlertEntity` and affected segment IDs.
- `backend/src/main/java/com/calebhabesh/linewatch/ingestion/IngestionRunEntity.java` & `IngestionRunRepository.java`: Maps to the `ingestion_runs` table.
- `backend/src/main/java/com/calebhabesh/linewatch/alert/AlertEntity.java` & `AlertRepository.java`: Maps to the `alerts` and `alert_segments` tables.
- `backend/src/test/java/com/calebhabesh/linewatch/ingestion/AlertNormalizerTest.java`: Unit tests covering regex boundary extraction for TTC-style alerts.

### Existing Files to Modify
- `backend/src/main/java/com/calebhabesh/linewatch/LinewatchApplication.java`: Enable scheduling (`@EnableScheduling`).
- `backend/src/main/resources/application.yml`: Add external feed URL and scheduling properties.

---

## Task 1: Foundation and Entity Mapping
- Add `@EnableScheduling` to the main application class.
- Create JPA entities for `IngestionRunEntity`, `AlertEntity` (including `@ManyToMany` or `@ElementCollection` for segment IDs), and the corresponding repositories.
- *Verification:* `mvn test` should still pass, and the application context should load successfully.

## Task 2: Alert Normalization Logic
- Create `AlertNormalizer.java`.
- Implement regex or keyword-based parsing logic to identify standard TTC alert patterns (e.g., "No service on Line 2 between Broadview and Woodbine due to...").
- Map parsed data into standard severity (`delay`, `suspension`) and extract station boundaries.
- Create robust unit tests in `AlertNormalizerTest.java` with various mock TTC alert strings to prove normalization correctness.

## Task 3: Ingestion Polling and Persistence
- Create `TtcAlertClient.java` to fetch JSON data from the feed. (Configured via `application.yml`, allowing easy mocking during integration tests).
- Create `AlertIngestionService.java` with a `@Scheduled` method (e.g., every 2 minutes).
- Within the job:
  1. Create and save a new `IngestionRunEntity` (`status = running`).
  2. Fetch alerts via the client.
  3. Pass them through `AlertNormalizer`.
  4. Deduplicate or update existing records in the `alerts` table.
  5. Update the run to `success` or `failed`, recording the processed count.
- *Verification:* Add an integration or slice test for the ingestion flow using WireMock or Mockito.

## Task 4: Connect Backend APIs (Optional Slice 2 Prep)
- Once ingestion works in the background, we can adapt `/api/alerts` to read from the database instead of the current seeded/hardcoded demo boundaries. This will be verified in a subsequent slice to keep this branch focused strictly on ingestion.

---
**Review & Next Steps:**
Once this plan is approved by the user, we will execute it task-by-task.
