package com.calebhabesh.linewatch.ingestion;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.test.util.ReflectionTestUtils;

class TtcAlertStoreTest {

    @Test
    void appendsSnapshotOnlyForNewOrChangedFingerprint() {
        assertThat(TtcAlertStore.shouldAppendSnapshot(null, "new")).isTrue();
        assertThat(TtcAlertStore.shouldAppendSnapshot("old", "new")).isTrue();
        assertThat(TtcAlertStore.shouldAppendSnapshot("same", "same")).isFalse();
    }

    @Test
    void appendsActiveSnapshotWhenUnchangedAlertReactivates() {
        assertThat(TtcAlertStore.shouldAppendActiveSnapshot(null, null, "new")).isTrue();
        assertThat(TtcAlertStore.shouldAppendActiveSnapshot("old", true, "new")).isTrue();
        assertThat(TtcAlertStore.shouldAppendActiveSnapshot("same", false, "same")).isTrue();
        assertThat(TtcAlertStore.shouldAppendActiveSnapshot("same", true, "same")).isFalse();
    }

    @Test
    void buildsSectionQualifiedSourceKey() {
        TtcFetchedRecord fetched = new TtcFetchedRecord(
            TestAlertRecords.route("route-source"),
            "{\"id\":\"route-source\"}"
        );

        assertThat(TtcAlertStore.sourceKey("routes", fetched))
            .isEqualTo("routes:route-source");
    }

    @Test
    void buildsDeterministicFallbackKeyWhenSourceIdIsMissing() {
        String rawPayload = "{\"route\":\"1\"}";
        TtcFetchedRecord fetched = new TtcFetchedRecord(
            TestAlertRecords.route(null),
            rawPayload
        );

        assertThat(TtcAlertStore.sourceKey("routes", fetched))
            .isEqualTo("routes:missing-" + AlertFingerprint.sha256(rawPayload));
    }

    @Test
    void storesNormalizedRouteAlertWireValuesAndReducedSpeedZoneMetadata() {
        MapSqlParameterSource params = ReflectionTestUtils.invokeMethod(
            new TtcAlertStore(null),
            "routeAlertParams",
            TestAlertRecords.normalizedRoute("route-source", AlertDirection.SOUTHBOUND),
            OffsetDateTime.parse("2026-06-01T12:00:00Z")
        );

        assertThat(params.getValue("direction")).isEqualTo("southbound");
        assertThat(params.getValue("impactKind")).isEqualTo("reduced-speed-zone");
        assertThat(params.getValue("rszLength")).isEqualTo("600 metres");
        assertThat(params.getValue("stationDistance")).isEqualTo("900 metres");
        assertThat(params.getValue("trackPercent")).isEqualTo("67%");
        assertThat(params.getValue("reducedSpeed")).isEqualTo("15 km/h");
        assertThat(params.getValue("averageSpeed")).isEqualTo("35 km/h");
    }

    @Test
    void snapshotParamsIncludeRenderableAlertHistoryContext() {
        NormalizedRouteAlert alert = TestAlertRecords.normalizedRoute(
            "route-source",
            AlertDirection.SOUTHBOUND
        );

        MapSqlParameterSource params = ReflectionTestUtils.invokeMethod(
            new TtcAlertStore(null),
            "routeSnapshotParams",
            alert,
            true,
            OffsetDateTime.parse("2026-06-01T12:00:00Z")
        );

        assertThat(params.getValue("alertId")).isEqualTo(alert.id());
        assertThat(params.getValue("sourceId")).isEqualTo(alert.sourceId());
        assertThat(params.getValue("lineId")).isEqualTo(alert.lineId());
        assertThat(params.getValue("title")).isEqualTo(alert.title());
        assertThat(params.getValue("eventType")).isEqualTo(alert.impactKind().wireValue());
        assertThat(params.getValue("sourceAlertType")).isEqualTo(alert.sourceAlertType());
        assertThat(params.getValue("impactKind")).isEqualTo(alert.impactKind().wireValue());
        assertThat(params.getValue("startStationId")).isEqualTo(alert.startStationId());
        assertThat(params.getValue("endStationId")).isEqualTo(alert.endStationId());
        assertThat(params.getValue("direction")).isEqualTo("southbound");
        assertThat(params.getValue("cause")).isEqualTo(alert.cause());
        assertThat(params.getValue("causeDescription")).isEqualTo(alert.causeDescription());
        assertThat(params.getValue("active")).isEqualTo(true);
        assertThat(params.getValue("sourceUpdatedAt")).isEqualTo(alert.sourceUpdatedAt());
    }

    @Test
    void preservesStartedCanonicalClosureWindowAcrossShortRestorationUpdate() {
        OffsetDateTime now = OffsetDateTime.parse("2026-08-04T05:26:52Z");
        NormalizedAlertPeriod canonical = new NormalizedAlertPeriod(
            "73254",
            OffsetDateTime.parse("2026-08-04T05:00:00Z"),
            OffsetDateTime.parse("2026-08-04T07:30:00Z"),
            0
        );
        NormalizedAlertPeriod restorationMutation = new NormalizedAlertPeriod(
            "73254",
            OffsetDateTime.parse("2026-08-04T05:00:00Z"),
            OffsetDateTime.parse("2026-08-04T05:24:44.85Z"),
            0
        );

        assertThat(TtcAlertStore.reconcilePlannedClosurePeriods(
            List.of(canonical),
            List.of(restorationMutation),
            now,
            true
        )).containsExactly(canonical);
    }

    @Test
    void acceptsFutureScheduleChangesAndRetainsTemporarilyMissingActiveWindow() {
        OffsetDateTime now = OffsetDateTime.parse("2026-08-04T05:26:52Z");
        NormalizedAlertPeriod active = new NormalizedAlertPeriod(
            "active-child",
            OffsetDateTime.parse("2026-08-04T05:00:00Z"),
            OffsetDateTime.parse("2026-08-04T07:30:00Z"),
            0
        );
        NormalizedAlertPeriod oldFuture = new NormalizedAlertPeriod(
            "future-child",
            OffsetDateTime.parse("2026-08-05T05:00:00Z"),
            OffsetDateTime.parse("2026-08-05T07:30:00Z"),
            1
        );
        NormalizedAlertPeriod revisedFuture = new NormalizedAlertPeriod(
            "future-child",
            OffsetDateTime.parse("2026-08-05T06:00:00Z"),
            OffsetDateTime.parse("2026-08-05T08:00:00Z"),
            1
        );

        assertThat(TtcAlertStore.reconcilePlannedClosurePeriods(
            List.of(active, oldFuture),
            List.of(revisedFuture),
            now,
            true
        )).containsExactly(active, revisedFuture);
    }

    @Test
    void replacesStartedExpiryEnvelopeWithNormalizedCanonicalWindow() {
        OffsetDateTime now = OffsetDateTime.parse("2026-08-04T05:10:00Z");
        NormalizedAlertPeriod expiryEnvelope = new NormalizedAlertPeriod(
            "active-child",
            OffsetDateTime.parse("2026-08-04T05:00:00Z"),
            OffsetDateTime.parse("2026-08-05T07:30:00Z"),
            0
        );
        NormalizedAlertPeriod canonical = new NormalizedAlertPeriod(
            "active-child",
            OffsetDateTime.parse("2026-08-04T05:00:00Z"),
            OffsetDateTime.parse("2026-08-04T07:30:00Z"),
            0
        );

        assertThat(TtcAlertStore.reconcilePlannedClosurePeriods(
            List.of(expiryEnvelope),
            List.of(canonical),
            now,
            true
        )).containsExactly(canonical);
    }
}
