package com.calebhabesh.linewatch.ingestion;

import java.time.OffsetDateTime;
import java.util.List;

final class TestAlertRecords {
    private static final OffsetDateTime SOURCE_UPDATED_AT =
        OffsetDateTime.parse("2026-06-01T11:50:00Z");

    private TestAlertRecords() {}

    static TtcAlertRecord route(String sourceId) {
        return new TtcAlertRecord(
            sourceId, "Live", SOURCE_UPDATED_AT, null, List.of("Current"), "1", "Subway",
            "Eglinton", "Davisville", List.of("Eglinton", "Davisville"),
            "Route alert", "Route description", "Line 1: Route alert", "SIGNIFICANT_DELAYS",
            "Significant delays", null, null, null, null, null, null, null, null, null, null, null,
            null, null, null, List.of()
        );
    }

    static TtcAlertRecord accessibility(String sourceId) {
        return new TtcAlertRecord(
            sourceId, "Live", SOURCE_UPDATED_AT, null, List.of("Current"), null, "Elevator",
            null, null, List.of(), "Elevator outage", "Out of service",
            "Warden: Elevator outage", "ACCESSIBILITY_ISSUE", "Out of service",
            null, null, null, null, null, null, null, null, null, null, null, null, "TEST-E1", null,
            List.of()
        );
    }

    static NormalizedRouteAlert normalizedRoute(String sourceId) {
        return normalizedRoute(sourceId, AlertDirection.UNKNOWN);
    }

    static NormalizedRouteAlert normalizedRoute(String sourceId, AlertDirection direction) {
        return new NormalizedRouteAlert(
            "ttc-route-" + sourceId, sourceId, "line-1", "active-alert", "delay",
            "Route alert", "Route description", "Live", "SIGNIFICANT_DELAYS",
            "Reduced Speed Zone", direction, null, null, null, AlertImpactKind.REDUCED_SPEED_ZONE,
            "600 metres", "900 metres", "67%", "15 km/h", "35 km/h", "eglinton", "davisville",
            SOURCE_UPDATED_AT, null, SOURCE_UPDATED_AT, null, null, null,
            "{\"id\":\"" + sourceId + "\"}", List.of("eglinton", "davisville"),
            List.of(new NormalizedAlertPeriod("parent", SOURCE_UPDATED_AT, null, 0)),
            "fingerprint"
        );
    }

    static NormalizedAccessibilityOutage normalizedAccessibility(String sourceId) {
        return new NormalizedAccessibilityOutage(
            "ttc-accessibility-" + sourceId, sourceId, "elevator", "Elevator outage",
            "Out of service", "ACCESSIBILITY_ISSUE", "Out of service",
            SOURCE_UPDATED_AT, null, SOURCE_UPDATED_AT,
            "{\"id\":\"" + sourceId + "\"}", List.of("warden")
        );
    }
}
