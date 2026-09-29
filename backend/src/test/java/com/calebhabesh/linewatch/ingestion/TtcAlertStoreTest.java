package com.calebhabesh.linewatch.ingestion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.sql.ResultSet;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import org.springframework.test.util.ReflectionTestUtils;

class TtcAlertStoreTest {

    @Test
    void refreshCorrectsStoredEffectDespiteIdenticalSourcePayloadWithoutNewIdentity() throws Exception {
        NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
        String sourceId = "limited-source";
        OffsetDateTime now = OffsetDateTime.parse("2026-09-29T04:00:00Z");
        NormalizedRouteAlert corrected = new NormalizedRouteAlert(
            "ttc-route-" + sourceId, sourceId, "line-1", "planned-closure", "planned",
            "Limited nightly service", "There will be limited nightly service.", "Planned", null,
            null, AlertDirection.BIDIRECTIONAL, "MAINTENANCE", "Closure - Planned Track Work", null,
            AlertImpactKind.LIMITED_SERVICE, null, null, null, null, null, "vaughan", "finch-west",
            now.minusHours(1), now.plusHours(2), now.minusHours(1), null, null, null,
            "synthetic unchanged source payload", List.of("vaughan", "finch-west"),
            List.of(new NormalizedAlertPeriod("parent", now.minusHours(1), now.plusHours(2), 0)),
            "corrected-classification-fingerprint");
        ResultSet existing = mock(ResultSet.class);
        when(existing.getString("normalized_fingerprint")).thenReturn("legacy-classification-fingerprint");
        when(existing.getBoolean("active")).thenReturn(true);
        when(jdbc.query(contains("select normalized_fingerprint"), any(SqlParameterSource.class), any(RowMapper.class)))
            .thenAnswer(invocation -> List.of(((RowMapper<?>) invocation.getArgument(2)).mapRow(existing, 0)));
        new TtcAlertStore(jdbc).upsertRouteAlert(corrected, now);
        org.mockito.ArgumentCaptor<SqlParameterSource> params = org.mockito.ArgumentCaptor.forClass(SqlParameterSource.class);
        verify(jdbc).update(contains("on conflict (source_id)"), params.capture());
        assertThat(params.getValue().getValue("impactKind")).isEqualTo("limited-service");
        assertThat(params.getValue().getValue("sourceId")).isEqualTo(sourceId);
        assertThat(params.getValue().getValue("rawPayload")).isEqualTo(corrected.rawPayload());
        verify(jdbc).update(contains("insert into snapshots"), any(SqlParameterSource.class));
    }

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
    void requiresTwoConsecutiveMissingPollsBeforeDeactivatingRouteAlert() {
        assertThat(TtcAlertStore.shouldDeactivateAfterMissingPoll(0)).isFalse();
        assertThat(TtcAlertStore.shouldDeactivateAfterMissingPoll(1)).isTrue();
    }

    @Test
    void firstMissingPollOnlyIncrementsConfirmationCount() throws Exception {
        NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
        stubActiveAlert(jdbc, 0);

        new TtcAlertStore(jdbc).deactivateMissingAlerts(
            Set.of(),
            OffsetDateTime.parse("2026-08-25T07:02:22Z")
        );

        verify(jdbc).update(
            contains("missing_poll_count = missing_poll_count + 1"),
            any(SqlParameterSource.class)
        );
        verify(jdbc, never()).update(
            contains("insert into snapshots"),
            any(SqlParameterSource.class)
        );
    }

    @Test
    void secondConsecutiveMissingPollDeactivatesAndRecordsLifecycleEvent() throws Exception {
        NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
        stubActiveAlert(jdbc, 1);
        when(jdbc.update(
            contains("set active = false, missing_poll_count = 0"),
            any(SqlParameterSource.class)
        )).thenReturn(1);

        new TtcAlertStore(jdbc).deactivateMissingAlerts(
            Set.of(),
            OffsetDateTime.parse("2026-08-25T07:02:52Z")
        );

        verify(jdbc).update(
            contains("set active = false, missing_poll_count = 0"),
            any(SqlParameterSource.class)
        );
        verify(jdbc).update(
            contains("insert into snapshots"),
            any(SqlParameterSource.class)
        );
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

    @SuppressWarnings("unchecked")
    private static void stubActiveAlert(
        NamedParameterJdbcTemplate jdbc,
        int missingPollCount
    ) throws Exception {
        ResultSet resultSet = mock(ResultSet.class);
        when(resultSet.getString("id")).thenReturn("ttc-route-71940");
        when(resultSet.getString("source_id")).thenReturn("71940");
        when(resultSet.getString("line_id")).thenReturn("1");
        when(resultSet.getString("severity")).thenReturn("warning");
        when(resultSet.getString("title")).thenReturn("Reduced speed zone");
        when(resultSet.getString("description")).thenReturn("Track work");
        when(resultSet.getString("source_alert_type")).thenReturn("Planned");
        when(resultSet.getString("impact_kind")).thenReturn("reduced-speed-zone");
        when(resultSet.getString("start_station_id")).thenReturn("rosedale");
        when(resultSet.getString("end_station_id")).thenReturn("bloor-yonge");
        when(resultSet.getString("direction")).thenReturn("southbound");
        when(resultSet.getString("cause")).thenReturn("Track Issue");
        when(resultSet.getObject("source_updated_at", OffsetDateTime.class))
            .thenReturn(OffsetDateTime.parse("2026-08-24T23:02:00Z"));
        when(resultSet.getInt("missing_poll_count")).thenReturn(missingPollCount);

        when(jdbc.query(
            anyString(),
            any(SqlParameterSource.class),
            any(RowMapper.class)
        )).thenAnswer(invocation -> {
            RowMapper<Object> mapper = invocation.getArgument(2);
            return List.of(mapper.mapRow(resultSet, 0));
        });
    }
}
