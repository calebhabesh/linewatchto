package com.calebhabesh.linewatch.ingestion;

import com.calebhabesh.linewatch.alert.RawAlertDto;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import org.springframework.stereotype.Repository;

@Repository
public class TtcAlertStore {
    private static final Duration MAX_RECURRING_CLOSURE_WINDOW = Duration.ofHours(18);
    private static final Duration MIN_RECURRING_CLOSURE_WINDOW = Duration.ofHours(1);

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
                cause_description, target_removal, impact_kind, rsz_length,
                station_distance, track_percent, reduced_speed, average_speed,
                start_station_id, end_station_id, active_period_start, active_period_end,
                source_updated_at,
                shuttle_type, shuttle_start, shuttle_end, raw_payload,
                normalized_fingerprint, updated_at
            ) values (
                :id, :sourceId, :lineId, :type, :severity, :title, :description, true,
                :sourceAlertType, :effect, :effectDescription, :direction, :cause,
                :causeDescription, :targetRemoval, :impactKind, :rszLength,
                :stationDistance, :trackPercent, :reducedSpeed, :averageSpeed,
                :startStationId, :endStationId, :activePeriodStart, :activePeriodEnd,
                :sourceUpdatedAt,
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
                target_removal = excluded.target_removal,
                impact_kind = excluded.impact_kind,
                rsz_length = excluded.rsz_length,
                station_distance = excluded.station_distance,
                track_percent = excluded.track_percent,
                reduced_speed = excluded.reduced_speed,
                average_speed = excluded.average_speed,
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
        replaceAlertPeriods(alert, now);
        if (shouldAppendActiveSnapshot(
            existingAlert == null ? null : existingAlert.fingerprint(),
            existingAlert == null ? null : existingAlert.active(),
            alert.fingerprint()
        )) {
            appendSnapshot(alert, true, now);
        }
    }

    public void upsertAccessibilityOutage(
        NormalizedAccessibilityOutage outage,
        OffsetDateTime now
    ) {
        jdbc.update("""
            insert into accessibility_outages (
                id, source_id, asset_type, title, description, effect,
                effect_description, cause, active_period_start, active_period_end,
                source_updated_at, active, raw_payload, created_at, updated_at
            ) values (
                :id, :sourceId, :assetType, :title, :description, :effect,
                :effectDescription, :cause, :activePeriodStart, :activePeriodEnd,
                :sourceUpdatedAt, true, :rawPayload, :now, :now
            )
            on conflict (source_id) do update set
                asset_type = excluded.asset_type,
                title = excluded.title,
                description = excluded.description,
                effect = excluded.effect,
                effect_description = excluded.effect_description,
                cause = excluded.cause,
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
                .addValue("cause", outage.cause())
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
            select id, source_id, line_id, severity, title, description, source_alert_type,
                   impact_kind, start_station_id, end_station_id, direction, cause,
                   cause_description, source_updated_at
            from alerts
            where active = true and id like 'ttc-route-%'
            """, (resultSet, rowNumber) -> new ActiveAlert(
                resultSet.getString("id"),
                resultSet.getString("source_id"),
                resultSet.getString("line_id"),
                resultSet.getString("severity"),
                resultSet.getString("title"),
                resultSet.getString("description"),
                resultSet.getString("source_alert_type"),
                resultSet.getString("impact_kind"),
                resultSet.getString("start_station_id"),
                resultSet.getString("end_station_id"),
                resultSet.getString("direction"),
                resultSet.getString("cause"),
                resultSet.getString("cause_description"),
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
                appendSnapshot(alert, false, now);
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
            .addValue("direction", alert.direction().wireValue())
            .addValue("cause", alert.cause())
            .addValue("causeDescription", alert.causeDescription())
            .addValue("targetRemoval", alert.targetRemoval())
            .addValue("impactKind", alert.impactKind().wireValue())
            .addValue("rszLength", alert.rszLength())
            .addValue("stationDistance", alert.stationDistance())
            .addValue("trackPercent", alert.trackPercent())
            .addValue("reducedSpeed", alert.reducedSpeed())
            .addValue("averageSpeed", alert.averageSpeed())
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

    private void replaceAlertPeriods(NormalizedRouteAlert alert, OffsetDateTime now) {
        List<NormalizedAlertPeriod> existingPeriods = findAlertPeriods(alert.id());
        boolean preserveStartedWindows = alert.impactKind() == AlertImpactKind.PLANNED_CLOSURE
            && (hasChildPeriods(alert.periods()) || hasChildPeriods(existingPeriods));
        List<NormalizedAlertPeriod> periods = reconcilePlannedClosurePeriods(
            existingPeriods,
            alert.periods(),
            now,
            preserveStartedWindows
        );
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
            """, periods.stream()
                .map(period -> new MapSqlParameterSource()
                    .addValue("alertId", alert.id())
                    .addValue("sourcePeriodId", period.sourcePeriodId())
                    .addValue("startsAt", period.startsAt())
                    .addValue("endsAt", period.endsAt())
                    .addValue("sortOrder", period.sortOrder()))
                .toList());
    }

    private List<NormalizedAlertPeriod> findAlertPeriods(String alertId) {
        return jdbc.query("""
            select source_period_id, starts_at, ends_at, sort_order
            from alert_active_periods
            where alert_id = :alertId
            order by sort_order asc
            """, new MapSqlParameterSource("alertId", alertId), (rs, rowNum) ->
            new NormalizedAlertPeriod(
                rs.getString("source_period_id"),
                rs.getObject("starts_at", OffsetDateTime.class),
                rs.getObject("ends_at", OffsetDateTime.class),
                rs.getInt("sort_order")
            )
        );
    }

    static List<NormalizedAlertPeriod> reconcilePlannedClosurePeriods(
        List<NormalizedAlertPeriod> existingPeriods,
        List<NormalizedAlertPeriod> incomingPeriods,
        OffsetDateTime now,
        boolean preserveStartedWindows
    ) {
        if (!preserveStartedWindows || existingPeriods == null || existingPeriods.isEmpty()) {
            return incomingPeriods == null ? List.of() : List.copyOf(incomingPeriods);
        }

        // Once an authored occurrence starts, a mutable child lifecycle must not
        // shorten or temporarily remove it. Future occurrences remain fully editable.
        Map<String, NormalizedAlertPeriod> existingBySourceId = new LinkedHashMap<>();
        for (NormalizedAlertPeriod period : existingPeriods) {
            existingBySourceId.put(period.sourcePeriodId(), period);
        }

        List<NormalizedAlertPeriod> reconciled = new ArrayList<>();
        Set<String> incomingSourceIds = new java.util.LinkedHashSet<>();
        List<NormalizedAlertPeriod> suppliedPeriods = incomingPeriods == null
            ? List.of()
            : incomingPeriods;
        for (NormalizedAlertPeriod incoming : suppliedPeriods) {
            incomingSourceIds.add(incoming.sourcePeriodId());
            NormalizedAlertPeriod existing = existingBySourceId.get(incoming.sourcePeriodId());
            reconciled.add(shouldPreserveStartedWindow(existing, incoming, now)
                ? preserveCanonicalWindow(existing, incoming)
                : incoming);
        }

        for (NormalizedAlertPeriod existing : existingPeriods) {
            if (!incomingSourceIds.contains(existing.sourcePeriodId())
                && isActiveWindow(existing, now)) {
                reconciled.add(existing);
            }
        }

        return reconciled.stream()
            .sorted(Comparator.comparingInt(NormalizedAlertPeriod::sortOrder)
                .thenComparing(NormalizedAlertPeriod::sourcePeriodId))
            .toList();
    }

    private static boolean hasChildPeriods(List<NormalizedAlertPeriod> periods) {
        return periods != null && periods.stream()
            .anyMatch(period -> !"parent".equalsIgnoreCase(period.sourcePeriodId()));
    }

    private static boolean shouldPreserveStartedWindow(
        NormalizedAlertPeriod existing,
        NormalizedAlertPeriod incoming,
        OffsetDateTime now
    ) {
        OffsetDateTime start = existing == null ? null : existing.startsAt();
        if (start == null && incoming != null) {
            start = incoming.startsAt();
        }
        return existing != null
            && start != null
            && !start.isAfter(now)
            && !incomingCorrectsExpiryEnvelope(existing, incoming);
    }

    private static boolean incomingCorrectsExpiryEnvelope(
        NormalizedAlertPeriod existing,
        NormalizedAlertPeriod incoming
    ) {
        Duration existingDuration = duration(existing);
        Duration incomingDuration = duration(incoming);
        return existingDuration != null
            && existingDuration.compareTo(MAX_RECURRING_CLOSURE_WINDOW) > 0
            && incomingDuration != null
            && incomingDuration.compareTo(MIN_RECURRING_CLOSURE_WINDOW) >= 0
            && incomingDuration.compareTo(MAX_RECURRING_CLOSURE_WINDOW) <= 0;
    }

    private static Duration duration(NormalizedAlertPeriod period) {
        if (period == null || period.startsAt() == null || period.endsAt() == null
            || !period.endsAt().isAfter(period.startsAt())) {
            return null;
        }
        return Duration.between(period.startsAt(), period.endsAt());
    }

    private static NormalizedAlertPeriod preserveCanonicalWindow(
        NormalizedAlertPeriod existing,
        NormalizedAlertPeriod incoming
    ) {
        OffsetDateTime startsAt = earlier(existing.startsAt(), incoming.startsAt());
        OffsetDateTime endsAt = later(existing.endsAt(), incoming.endsAt());
        return new NormalizedAlertPeriod(
            incoming.sourcePeriodId(),
            startsAt,
            endsAt,
            incoming.sortOrder()
        );
    }

    private static boolean isActiveWindow(NormalizedAlertPeriod period, OffsetDateTime now) {
        return period.startsAt() != null
            && !period.startsAt().isAfter(now)
            && period.endsAt() != null
            && period.endsAt().isAfter(now);
    }

    private static OffsetDateTime earlier(OffsetDateTime first, OffsetDateTime second) {
        if (first == null) return second;
        if (second == null) return first;
        return first.isBefore(second) ? first : second;
    }

    private static OffsetDateTime later(OffsetDateTime first, OffsetDateTime second) {
        if (first == null) return second;
        if (second == null) return first;
        return first.isAfter(second) ? first : second;
    }

    private MapSqlParameterSource routeSnapshotParams(
        NormalizedRouteAlert alert,
        boolean active,
        OffsetDateTime now
    ) {
        return new MapSqlParameterSource()
            .addValue("alertId", alert.id())
            .addValue("severity", alert.severity())
            .addValue("description", alert.description())
            .addValue("now", now)
            .addValue("active", active)
            .addValue("sourceUpdatedAt", alert.sourceUpdatedAt())
            .addValue("sourceId", alert.sourceId())
            .addValue("lineId", alert.lineId())
            .addValue("title", alert.title())
            .addValue("eventType", alert.impactKind().wireValue())
            .addValue("sourceAlertType", alert.sourceAlertType())
            .addValue("impactKind", alert.impactKind().wireValue())
            .addValue("startStationId", alert.startStationId())
            .addValue("endStationId", alert.endStationId())
            .addValue("direction", alert.direction().wireValue())
            .addValue("cause", alert.cause())
            .addValue("causeDescription", alert.causeDescription());
    }

    private void appendSnapshot(
        NormalizedRouteAlert alert,
        boolean active,
        OffsetDateTime now
    ) {
        jdbc.update("""
            insert into snapshots (
                alert_id, severity, description, snapshot_time, active,
                source_updated_at, source_id, line_id, title, event_type,
                source_alert_type, impact_kind, start_station_id, end_station_id,
                direction, cause, cause_description
            ) values (
                :alertId, :severity, :description, :now, :active,
                :sourceUpdatedAt, :sourceId, :lineId, :title, :eventType,
                :sourceAlertType, :impactKind, :startStationId, :endStationId,
                :direction, :cause, :causeDescription
            )
            """, routeSnapshotParams(alert, active, now));
    }

    private void appendSnapshot(
        ActiveAlert alert,
        boolean active,
        OffsetDateTime now
    ) {
        jdbc.update("""
            insert into snapshots (
                alert_id, severity, description, snapshot_time, active,
                source_updated_at, source_id, line_id, title, event_type,
                source_alert_type, impact_kind, start_station_id, end_station_id,
                direction, cause, cause_description
            ) values (
                :alertId, :severity, :description, :now, :active,
                :sourceUpdatedAt, :sourceId, :lineId, :title, :eventType,
                :sourceAlertType, :impactKind, :startStationId, :endStationId,
                :direction, :cause, :causeDescription
            )
            """, new MapSqlParameterSource()
                .addValue("alertId", alert.id())
                .addValue("severity", alert.severity())
                .addValue("description", alert.description())
                .addValue("now", now)
                .addValue("active", active)
                .addValue("sourceUpdatedAt", alert.sourceUpdatedAt())
                .addValue("sourceId", alert.sourceId())
                .addValue("lineId", alert.lineId())
                .addValue("title", alert.title())
                .addValue("eventType", alert.impactKind() == null ? "service-alert" : alert.impactKind())
                .addValue("sourceAlertType", alert.sourceAlertType())
                .addValue("impactKind", alert.impactKind())
                .addValue("startStationId", alert.startStationId())
                .addValue("endStationId", alert.endStationId())
                .addValue("direction", alert.direction())
                .addValue("cause", alert.cause())
                .addValue("causeDescription", alert.causeDescription()));
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
        String lineId,
        String severity,
        String title,
        String description,
        String sourceAlertType,
        String impactKind,
        String startStationId,
        String endStationId,
        String direction,
        String cause,
        String causeDescription,
        OffsetDateTime sourceUpdatedAt
    ) {}

    public List<RawAlertDto> getRawAlerts(int limit, int offset) {
        return jdbc.query("""
            select source_section, source_id, route_type, source_updated_at, payload, active
            from ttc_alert_source_records
            order by active desc, source_updated_at desc, last_seen_at desc
            limit :limit offset :offset
            """, new MapSqlParameterSource()
                .addValue("limit", limit)
                .addValue("offset", offset), (resultSet, rowNumber) -> new RawAlertDto(
                resultSet.getString("source_section"),
                resultSet.getString("source_id"),
                resultSet.getString("route_type"),
                resultSet.getObject("source_updated_at", OffsetDateTime.class),
                resultSet.getString("payload"),
                resultSet.getBoolean("active")
            ));
    }

    private record ActiveOutage(String id, String sourceId) {}

    private record ExistingAlert(String fingerprint, boolean active) {}
}
