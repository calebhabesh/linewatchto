package com.calebhabesh.linewatch.regional;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class RegionalAlertStore {
    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() {};

    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public RegionalAlertStore(NamedParameterJdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    public void upsertSource(MetrolinxFetchedRecord record, OffsetDateTime now) {
        jdbc.update("""
            insert into metrolinx_alert_source_records (
                source_system, source_id, payload, active, first_seen_at, last_seen_at
            ) values (
                :sourceSystem, :sourceId, cast(:payload as jsonb), true, :now, :now
            )
            on conflict (source_system, source_id) do update set
                payload = excluded.payload,
                active = true,
                last_seen_at = excluded.last_seen_at
            """, new MapSqlParameterSource()
                .addValue("sourceSystem", record.sourceSystem())
                .addValue("sourceId", record.sourceId())
                .addValue("payload", record.rawPayload())
                .addValue("now", now));
    }

    public void upsertAlert(RegionalNormalizedAlert alert, OffsetDateTime now) {
        jdbc.update("""
            insert into regional_alerts (
                id, source_system, source_id, line_id, impact_kind, title, description,
                cause, active_period_start, active_period_end, source_updated_at,
                station_ids, affected_segment_ids, active, created_at, updated_at
            ) values (
                :id, :sourceSystem, :sourceId, :lineId, :impactKind, :title, :description,
                :cause, :activePeriodStart, :activePeriodEnd, :sourceUpdatedAt,
                cast(:stationIds as jsonb), cast(:affectedSegmentIds as jsonb), true, :now, :now
            )
            on conflict (source_system, source_id, line_id) do update set
                id = excluded.id,
                impact_kind = excluded.impact_kind,
                title = excluded.title,
                description = excluded.description,
                cause = excluded.cause,
                active_period_start = excluded.active_period_start,
                active_period_end = excluded.active_period_end,
                source_updated_at = excluded.source_updated_at,
                station_ids = excluded.station_ids,
                affected_segment_ids = excluded.affected_segment_ids,
                active = true,
                updated_at = excluded.updated_at
            """, new MapSqlParameterSource()
                .addValue("id", alert.id())
                .addValue("sourceSystem", alert.sourceSystem())
                .addValue("sourceId", alert.sourceId())
                .addValue("lineId", alert.lineId())
                .addValue("impactKind", alert.impactKind())
                .addValue("title", alert.title())
                .addValue("description", alert.description())
                .addValue("cause", alert.cause())
                .addValue("activePeriodStart", alert.activePeriodStart())
                .addValue("activePeriodEnd", alert.activePeriodEnd())
                .addValue("sourceUpdatedAt", alert.sourceUpdatedAt())
                .addValue("stationIds", json(alert.stationIds()))
                .addValue("affectedSegmentIds", json(alert.affectedSegmentIds()))
                .addValue("now", now));
    }

    public void deactivateMissingSources(String sourceSystem, Set<String> sourceIds) {
        jdbc.update(
            sourceIds.isEmpty()
                ? "update metrolinx_alert_source_records set active = false where source_system = :sourceSystem and active = true"
                : "update metrolinx_alert_source_records set active = false where source_system = :sourceSystem and active = true and source_id not in (:sourceIds)",
            new MapSqlParameterSource("sourceSystem", sourceSystem).addValue("sourceIds", sourceIds)
        );
    }

    public void deactivateMissingAlerts(String sourceSystem, Set<String> alertIds, OffsetDateTime now) {
        jdbc.update(
            alertIds.isEmpty()
                ? "update regional_alerts set active = false, updated_at = :now where source_system = :sourceSystem and active = true"
                : "update regional_alerts set active = false, updated_at = :now where source_system = :sourceSystem and active = true and id not in (:alertIds)",
            new MapSqlParameterSource("sourceSystem", sourceSystem)
                .addValue("alertIds", alertIds)
                .addValue("now", now)
        );
    }

    public List<RegionalNormalizedAlert> findActiveAlerts() {
        return jdbc.query("""
            select id, source_system, source_id, line_id, impact_kind, title, description,
                   cause, active_period_start, active_period_end, source_updated_at,
                   station_ids::text, affected_segment_ids::text
            from regional_alerts
            where active = true
            order by source_updated_at desc nulls last, id
            """, (resultSet, rowNumber) -> new RegionalNormalizedAlert(
                resultSet.getString("id"),
                resultSet.getString("source_system"),
                resultSet.getString("source_id"),
                resultSet.getString("line_id"),
                resultSet.getString("impact_kind"),
                resultSet.getString("title"),
                resultSet.getString("description"),
                resultSet.getString("cause"),
                resultSet.getObject("active_period_start", OffsetDateTime.class),
                resultSet.getObject("active_period_end", OffsetDateTime.class),
                resultSet.getObject("source_updated_at", OffsetDateTime.class),
                strings(resultSet.getString("station_ids")),
                strings(resultSet.getString("affected_segment_ids")),
                ""
            ));
    }

    public Map<String, Set<String>> sourceIdsBySystem(MetrolinxFeed feed) {
        return feed.records().stream().collect(Collectors.groupingBy(
            MetrolinxFetchedRecord::sourceSystem,
            Collectors.mapping(MetrolinxFetchedRecord::sourceId, Collectors.toSet())
        ));
    }

    private String json(List<String> values) {
        try {
            return objectMapper.writeValueAsString(values);
        } catch (Exception exception) {
            throw new IllegalArgumentException("Unable to serialize regional alert topology", exception);
        }
    }

    private List<String> strings(String json) {
        try {
            return objectMapper.readValue(json, STRING_LIST);
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to read regional alert topology", exception);
        }
    }
}
