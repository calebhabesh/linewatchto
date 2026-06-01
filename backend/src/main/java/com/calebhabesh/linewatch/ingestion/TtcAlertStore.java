package com.calebhabesh.linewatch.ingestion;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import org.springframework.stereotype.Repository;

@Repository
public class TtcAlertStore {
    private final NamedParameterJdbcTemplate jdbc;

    public TtcAlertStore(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public static String sourceKey(String section, TtcFetchedRecord fetched) {
        return section + ":" + stagedSourceId(fetched);
    }

    static boolean shouldAppendSnapshot(String previousFingerprint, String nextFingerprint) {
        return !Objects.equals(previousFingerprint, nextFingerprint);
    }

    static boolean shouldAppendActiveSnapshot(
        String previousFingerprint,
        Boolean previousActive,
        String nextFingerprint
    ) {
        return previousActive == null
            || !previousActive
            || shouldAppendSnapshot(previousFingerprint, nextFingerprint);
    }

    public String upsertSource(
        String sourceSection,
        TtcFetchedRecord fetched,
        OffsetDateTime now
    ) {
        TtcAlertRecord record = fetched.record();
        jdbc.update("""
            insert into ttc_alert_source_records (
                source_section, source_id, route_type, source_updated_at, payload,
                active, first_seen_at, last_seen_at
            ) values (
                :sourceSection, :sourceId, :routeType, :sourceUpdatedAt, :payload,
                true, :now, :now
            )
            on conflict (source_section, source_id) do update set
                route_type = excluded.route_type,
                source_updated_at = excluded.source_updated_at,
                payload = excluded.payload,
                active = true,
                last_seen_at = excluded.last_seen_at
            """, new MapSqlParameterSource()
                .addValue("sourceSection", sourceSection)
                .addValue("sourceId", stagedSourceId(fetched))
                .addValue("routeType", record.routeType())
                .addValue("sourceUpdatedAt", record.lastUpdated())
                .addValue("payload", fetched.rawPayload())
                .addValue("now", now));
        return sourceKey(sourceSection, fetched);
    }

    public void upsertRouteAlert(NormalizedRouteAlert alert, OffsetDateTime now) {
        ExistingAlert existingAlert = findExistingAlert(alert.sourceId());
        MapSqlParameterSource params = routeAlertParams(alert, now);
        jdbc.update("""
            insert into alerts (
                id, source_id, line_id, type, severity, title, description, active,
                source_alert_type, effect, effect_description, direction, cause,
                cause_description, start_station_id, end_station_id,
                active_period_start, active_period_end, source_updated_at,
                shuttle_type, shuttle_start, shuttle_end, raw_payload,
                normalized_fingerprint, updated_at
            ) values (
                :id, :sourceId, :lineId, :type, :severity, :title, :description, true,
                :sourceAlertType, :effect, :effectDescription, :direction, :cause,
                :causeDescription, :startStationId, :endStationId,
                :activePeriodStart, :activePeriodEnd, :sourceUpdatedAt,
                :shuttleType, :shuttleStart, :shuttleEnd, :rawPayload,
                :fingerprint, :now
            )
            on conflict (source_id) do update set
                line_id = excluded.line_id,
                type = excluded.type,
                severity = excluded.severity,
                title = excluded.title,
                description = excluded.description,
                active = true,
                source_alert_type = excluded.source_alert_type,
                effect = excluded.effect,
                effect_description = excluded.effect_description,
                direction = excluded.direction,
                cause = excluded.cause,
                cause_description = excluded.cause_description,
                start_station_id = excluded.start_station_id,
                end_station_id = excluded.end_station_id,
                active_period_start = excluded.active_period_start,
                active_period_end = excluded.active_period_end,
                source_updated_at = excluded.source_updated_at,
                shuttle_type = excluded.shuttle_type,
                shuttle_start = excluded.shuttle_start,
                shuttle_end = excluded.shuttle_end,
                raw_payload = excluded.raw_payload,
                normalized_fingerprint = excluded.normalized_fingerprint,
                updated_at = excluded.updated_at
            """, params);

        replaceAlertStations(alert);
        replaceAlertPeriods(alert);
        if (shouldAppendActiveSnapshot(
            existingAlert == null ? null : existingAlert.fingerprint(),
            existingAlert == null ? null : existingAlert.active(),
            alert.fingerprint()
        )) {
            appendSnapshot(alert.id(), alert.severity(), alert.description(), true, now,
                alert.sourceUpdatedAt());
        }
    }

    public void upsertAccessibilityOutage(
        NormalizedAccessibilityOutage outage,
        OffsetDateTime now
    ) {
        jdbc.update("""
            insert into accessibility_outages (
                id, source_id, asset_type, title, description, effect,
                effect_description, active_period_start, active_period_end,
                source_updated_at, active, raw_payload, created_at, updated_at
            ) values (
                :id, :sourceId, :assetType, :title, :description, :effect,
                :effectDescription, :activePeriodStart, :activePeriodEnd,
                :sourceUpdatedAt, true, :rawPayload, :now, :now
            )
            on conflict (source_id) do update set
                asset_type = excluded.asset_type,
                title = excluded.title,
                description = excluded.description,
                effect = excluded.effect,
                effect_description = excluded.effect_description,
                active_period_start = excluded.active_period_start,
                active_period_end = excluded.active_period_end,
                source_updated_at = excluded.source_updated_at,
                active = true,
                raw_payload = excluded.raw_payload,
                updated_at = excluded.updated_at
            """, new MapSqlParameterSource()
                .addValue("id", outage.id())
                .addValue("sourceId", outage.sourceId())
                .addValue("assetType", outage.assetType())
                .addValue("title", outage.title())
                .addValue("description", outage.description())
                .addValue("effect", outage.effect())
                .addValue("effectDescription", outage.effectDescription())
                .addValue("activePeriodStart", outage.activePeriodStart())
                .addValue("activePeriodEnd", outage.activePeriodEnd())
                .addValue("sourceUpdatedAt", outage.sourceUpdatedAt())
                .addValue("rawPayload", outage.rawPayload())
                .addValue("now", now));

        jdbc.update(
            "delete from accessibility_outage_stations where outage_id = :outageId",
            new MapSqlParameterSource("outageId", outage.id())
        );
        batchUpdate("""
            insert into accessibility_outage_stations (outage_id, station_id)
            values (:outageId, :stationId)
            """, outage.stationIds().stream()
                .map(stationId -> new MapSqlParameterSource()
                    .addValue("outageId", outage.id())
                    .addValue("stationId", stationId))
                .toList());
    }

    public void deactivateMissingSources(Set<String> sourceKeys) {
        List<ActiveSource> activeSources = jdbc.query("""
            select source_section, source_id
            from ttc_alert_source_records
            where active = true
            """, (resultSet, rowNumber) -> new ActiveSource(
                resultSet.getString("source_section"),
                resultSet.getString("source_id")
            ));

        for (ActiveSource source : activeSources) {
            if (!sourceKeys.contains(source.key())) {
                jdbc.update("""
                    update ttc_alert_source_records
                    set active = false
                    where source_section = :sourceSection and source_id = :sourceId
                    """, new MapSqlParameterSource()
                        .addValue("sourceSection", source.sourceSection())
                        .addValue("sourceId", source.sourceId()));
            }
        }
    }

    public void deactivateMissingAlerts(Set<String> sourceIds, OffsetDateTime now) {
        List<ActiveAlert> activeAlerts = jdbc.query("""
            select id, source_id, severity, description, source_updated_at
            from alerts
            where active = true and id like 'ttc-route-%'
            """, (resultSet, rowNumber) -> new ActiveAlert(
                resultSet.getString("id"),
                resultSet.getString("source_id"),
                resultSet.getString("severity"),
                resultSet.getString("description"),
                resultSet.getObject("source_updated_at", OffsetDateTime.class)
            ));

        for (ActiveAlert alert : activeAlerts) {
            if (!sourceIds.contains(alert.sourceId())) {
                jdbc.update("""
                    update alerts
                    set active = false, updated_at = :now
                    where id = :id
                    """, new MapSqlParameterSource()
                        .addValue("id", alert.id())
                        .addValue("now", now));
                appendSnapshot(alert.id(), alert.severity(), alert.description(), false, now,
                    alert.sourceUpdatedAt());
            }
        }
    }

    public void deactivateMissingAccessibilityOutages(
        Set<String> sourceIds,
        OffsetDateTime now
    ) {
        List<ActiveOutage> activeOutages = jdbc.query("""
            select id, source_id
            from accessibility_outages
            where active = true
            """, (resultSet, rowNumber) -> new ActiveOutage(
                resultSet.getString("id"),
                resultSet.getString("source_id")
            ));

        for (ActiveOutage outage : activeOutages) {
            if (!sourceIds.contains(outage.sourceId())) {
                jdbc.update("""
                    update accessibility_outages
                    set active = false, updated_at = :now
                    where id = :id
                    """, new MapSqlParameterSource()
                        .addValue("id", outage.id())
                        .addValue("now", now));
            }
        }
    }

    private ExistingAlert findExistingAlert(String sourceId) {
        List<ExistingAlert> alerts = jdbc.query("""
            select normalized_fingerprint, active
            from alerts
            where source_id = :sourceId
            """, new MapSqlParameterSource("sourceId", sourceId),
            (resultSet, rowNumber) -> new ExistingAlert(
                resultSet.getString("normalized_fingerprint"),
                resultSet.getBoolean("active")
            ));
        return alerts.isEmpty() ? null : alerts.getFirst();
    }

    private MapSqlParameterSource routeAlertParams(
        NormalizedRouteAlert alert,
        OffsetDateTime now
    ) {
        return new MapSqlParameterSource()
            .addValue("id", alert.id())
            .addValue("sourceId", alert.sourceId())
            .addValue("lineId", alert.lineId())
            .addValue("type", alert.type())
            .addValue("severity", alert.severity())
            .addValue("title", alert.title())
            .addValue("description", alert.description())
            .addValue("sourceAlertType", alert.sourceAlertType())
            .addValue("effect", alert.effect())
            .addValue("effectDescription", alert.effectDescription())
            .addValue("direction", alert.direction())
            .addValue("cause", alert.cause())
            .addValue("causeDescription", alert.causeDescription())
            .addValue("startStationId", alert.startStationId())
            .addValue("endStationId", alert.endStationId())
            .addValue("activePeriodStart", alert.activePeriodStart())
            .addValue("activePeriodEnd", alert.activePeriodEnd())
            .addValue("sourceUpdatedAt", alert.sourceUpdatedAt())
            .addValue("shuttleType", alert.shuttleType())
            .addValue("shuttleStart", alert.shuttleStart())
            .addValue("shuttleEnd", alert.shuttleEnd())
            .addValue("rawPayload", alert.rawPayload())
            .addValue("fingerprint", alert.fingerprint())
            .addValue("now", now);
    }

    private void replaceAlertStations(NormalizedRouteAlert alert) {
        jdbc.update(
            "delete from alert_stations where alert_id = :alertId",
            new MapSqlParameterSource("alertId", alert.id())
        );
        batchUpdate("""
            insert into alert_stations (alert_id, station_id, sort_order)
            values (:alertId, :stationId, :sortOrder)
            """, alert.stationIds().stream()
                .map(stationId -> new MapSqlParameterSource()
                    .addValue("alertId", alert.id())
                    .addValue("stationId", stationId)
                    .addValue("sortOrder", alert.stationIds().indexOf(stationId)))
                .toList());
    }

    private void replaceAlertPeriods(NormalizedRouteAlert alert) {
        jdbc.update(
            "delete from alert_active_periods where alert_id = :alertId",
            new MapSqlParameterSource("alertId", alert.id())
        );
        batchUpdate("""
            insert into alert_active_periods (
                alert_id, source_period_id, starts_at, ends_at, sort_order
            ) values (
                :alertId, :sourcePeriodId, :startsAt, :endsAt, :sortOrder
            )
            """, alert.periods().stream()
                .map(period -> new MapSqlParameterSource()
                    .addValue("alertId", alert.id())
                    .addValue("sourcePeriodId", period.sourcePeriodId())
                    .addValue("startsAt", period.startsAt())
                    .addValue("endsAt", period.endsAt())
                    .addValue("sortOrder", period.sortOrder()))
                .toList());
    }

    private void appendSnapshot(
        String alertId,
        String severity,
        String description,
        boolean active,
        OffsetDateTime now,
        OffsetDateTime sourceUpdatedAt
    ) {
        jdbc.update("""
            insert into snapshots (
                alert_id, severity, description, snapshot_time, active, source_updated_at
            ) values (
                :alertId, :severity, :description, :now, :active, :sourceUpdatedAt
            )
            """, new MapSqlParameterSource()
                .addValue("alertId", alertId)
                .addValue("severity", severity)
                .addValue("description", description)
                .addValue("now", now)
                .addValue("active", active)
                .addValue("sourceUpdatedAt", sourceUpdatedAt));
    }

    private void batchUpdate(String sql, List<MapSqlParameterSource> params) {
        if (!params.isEmpty()) {
            jdbc.batchUpdate(sql, params.toArray(SqlParameterSource[]::new));
        }
    }

    private static String stagedSourceId(TtcFetchedRecord fetched) {
        String sourceId = fetched.record().id();
        return sourceId == null || sourceId.isBlank()
            ? "missing-" + AlertFingerprint.sha256(fetched.rawPayload())
            : sourceId;
    }

    private record ActiveSource(String sourceSection, String sourceId) {
        String key() {
            return sourceSection + ":" + sourceId;
        }
    }

    private record ActiveAlert(
        String id,
        String sourceId,
        String severity,
        String description,
        OffsetDateTime sourceUpdatedAt
    ) {}

    private record ActiveOutage(String id, String sourceId) {}

    private record ExistingAlert(String fingerprint, boolean active) {}
}
