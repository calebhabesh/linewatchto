import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const scheduleCapture = readFileSync(
  new URL(
    "../../backend/src/main/java/com/calebhabesh/linewatch/reliability/ReliabilityScheduleCapture.java",
    import.meta.url,
  ),
  "utf8",
);
const importRepository = readFileSync(
  new URL(
    "../../backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleImportRepository.java",
    import.meta.url,
  ),
  "utf8",
);
const applicationConfig = readFileSync(
  new URL("../../backend/src/main/resources/application.yml", import.meta.url),
  "utf8",
);

describe("reliability query safeguards", () => {
  it("materializes the bounded trip set before joining GTFS stop times", () => {
    const selectedTrips = scheduleCapture.indexOf(
      "), selected_trips as materialized (",
    );
    const serviceLineSpans = scheduleCapture.indexOf(
      "), service_line_spans as materialized (",
    );
    assert.ok(selectedTrips >= 0);
    assert.ok(serviceLineSpans > selectedTrips);
    assert.match(
      scheduleCapture,
      /from selected_trips trip\s+join gtfs_stop_times stop_time/,
    );
  });

  it("refreshes GTFS planner statistics after replacement imports", () => {
    assert.match(importRepository, /analyze gtfs_schedule_imports, gtfs_routes/);
    assert.match(importRepository, /gtfs_trips, gtfs_stop_times/);
  });

  it("bounds database connection acquisition and statement execution", () => {
    assert.match(applicationConfig, /LINEWATCH_DB_CONNECTION_TIMEOUT_MS:5000/);
    assert.match(applicationConfig, /LINEWATCH_DB_STATEMENT_TIMEOUT_MS:30000/);
  });
});
