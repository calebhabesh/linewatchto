package com.calebhabesh.linewatch.regional;

import com.calebhabesh.linewatch.alert.RawAlertDto;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class RegionalAlertStore {
    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() {};

    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final Clock clock;
    private final MetrolinxProperties properties;

    public RegionalAlertStore(NamedParameterJdbcTemplate jdbc, ObjectMapper objectMapper) {
        this(jdbc, objectMapper, Clock.systemUTC(), new MetrolinxProperties());
    }

    @Autowired
    public RegionalAlertStore(
        NamedParameterJdbcTemplate jdbc, ObjectMapper objectMapper, Clock clock,
        MetrolinxProperties properties
    ) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
        this.clock = clock;
        this.properties = properties;
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
                last_seen_at = excluded.last_seen_at,
                canonical_event_id = null,
                deterministic_classification = null
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
                station_ids, affected_segment_ids, active_period_basis, active, created_at, updated_at
            ) values (
                :id, :sourceSystem, :sourceId, :lineId, :impactKind, :title, :description,
                :cause, :activePeriodStart, :activePeriodEnd, :sourceUpdatedAt,
                cast(:stationIds as jsonb), cast(:affectedSegmentIds as jsonb), :activePeriodBasis,
                true, :now, :now
            )
            on conflict (id) do update set
                source_system = excluded.source_system,
                source_id = excluded.source_id,
                line_id = excluded.line_id,
                impact_kind = excluded.impact_kind,
                title = excluded.title,
                description = excluded.description,
                cause = excluded.cause,
                active_period_start = excluded.active_period_start,
                active_period_end = excluded.active_period_end,
                source_updated_at = excluded.source_updated_at,
                station_ids = excluded.station_ids,
                affected_segment_ids = excluded.affected_segment_ids,
                active_period_basis = excluded.active_period_basis,
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
                .addValue("activePeriodBasis", alert.activePeriodBasis())
                .addValue("now", now));
        snapshotIfChanged(alert.id(), now);
    }

    public void updateSourceClassification(
        RegionalAlertClassification.SourceReference source,
        RegionalAlertClassification classification
    ) {
        jdbc.update("""
            update metrolinx_alert_source_records
            set canonical_event_id = :canonicalEventId,
                deterministic_classification = cast(:classification as jsonb)
            where source_system = :sourceSystem and source_id = :sourceId
            """, new MapSqlParameterSource()
                .addValue("canonicalEventId", classification.canonicalEventId())
                .addValue("classification", json(classification))
                .addValue("sourceSystem", source.sourceSystem())
                .addValue("sourceId", source.sourceId()));
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
        snapshotDeactivations(sourceSystem, now);
    }

    private void snapshotIfChanged(String alertId, OffsetDateTime now) {
        jdbc.update("""
            with projected as (
                select a.id, a.line_id, a.impact_kind, a.title, a.station_ids,
                       (a.active and a.impact_kind <> 'advisory'
                        and (a.active_period_end is null or a.active_period_end > :now)) as active
                from regional_alerts a where a.id = :alertId
            )
            insert into regional_alert_snapshots (
                alert_id, line_id, impact_kind, title, station_ids, active, snapshot_time
            )
            select a.id, a.line_id, a.impact_kind, a.title, a.station_ids, a.active, :now
            from projected a
            where not exists (
                  select 1
                  from regional_alert_snapshots s
                  where s.id = (
                      select latest.id from regional_alert_snapshots latest
                      where latest.alert_id = a.id
                      order by latest.snapshot_time desc, latest.id desc limit 1
                  )
                    and s.line_id = a.line_id and s.impact_kind = a.impact_kind
                    and s.title = a.title and s.station_ids = a.station_ids and s.active = a.active
              )
            """, new MapSqlParameterSource()
                .addValue("alertId", alertId)
                .addValue("now", now));
    }

    private void snapshotDeactivations(String sourceSystem, OffsetDateTime now) {
        jdbc.update("""
            insert into regional_alert_snapshots (
                alert_id, line_id, impact_kind, title, station_ids, active, snapshot_time
            )
            select a.id, a.line_id, a.impact_kind, a.title, a.station_ids, false, :now
            from regional_alerts a
            where a.source_system = :sourceSystem
              and a.active = false
              and not exists (
                  select 1
                  from regional_alert_snapshots s
                  where s.id = (
                      select latest.id from regional_alert_snapshots latest
                      where latest.alert_id = a.id
                      order by latest.snapshot_time desc, latest.id desc limit 1
                  )
                    and s.active = false
              )
            """, new MapSqlParameterSource()
                .addValue("sourceSystem", sourceSystem)
                .addValue("now", now));
    }

    public List<RegionalNormalizedAlert> findActiveAlerts() {
        return jdbc.query("""
            select a.id, a.source_system, a.source_id, a.line_id, a.impact_kind, a.title, a.description,
                   a.cause, a.active_period_start, a.active_period_end, a.source_updated_at,
                   a.station_ids::text, a.affected_segment_ids::text, a.active_period_basis,
                   s.deterministic_classification ->> 'replacementService' as replacement_service,
                   (s.deterministic_classification ->> 'maximumDelayMinutes')::integer as maximum_delay_minutes,
                   (s.deterministic_classification ->> 'publishedAt')::timestamptz as published_at
            from regional_alerts a
            left join metrolinx_alert_source_records s
              on s.source_system = a.source_system and s.source_id = a.source_id and s.active = true
            where a.active = true and a.source_updated_at >= :seenAfter
            order by a.source_updated_at desc nulls last, a.id
            """, new MapSqlParameterSource("seenAfter", OffsetDateTime.now(clock)
                .minus(properties.getMaxDashboardAge())), (resultSet, rowNumber) -> new RegionalNormalizedAlert(
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
                resultSet.getString("active_period_basis"),
                "", resultSet.getString("replacement_service"),
                resultSet.getObject("maximum_delay_minutes", Integer.class),
                resultSet.getObject("published_at", OffsetDateTime.class)
            )).stream().map(alert -> RegionalAlertProjection.at(alert, clock.instant()))
            .filter(java.util.Objects::nonNull).toList();
    }

    public java.util.Optional<Duration> nextTransition() {
        OffsetDateTime now = OffsetDateTime.now(clock);
        OffsetDateTime next = jdbc.queryForObject("""
            select min(boundary) from (
                select active_period_start as boundary from regional_alerts
                where active and active_period_start > :now and source_updated_at >= :seenAfter
                union all
                select active_period_end as boundary from regional_alerts
                where active and active_period_end > :now and source_updated_at >= :seenAfter
            ) transitions
            """, new MapSqlParameterSource("now", now)
                .addValue("seenAfter", now.minus(properties.getMaxDashboardAge())),
            OffsetDateTime.class);
        return next == null ? java.util.Optional.empty()
            : java.util.Optional.of(Duration.between(now, next));
    }

    public List<StoredClassification> findActiveClassifications(
        String serviceEffect,
        OffsetDateTime seenAfter
    ) {
        return jdbc.query("""
            select distinct on (canonical_event_id)
                   deterministic_classification::text as classification,
                   last_seen_at
            from metrolinx_alert_source_records
            where active = true
              and canonical_event_id is not null
              and deterministic_classification is not null
              and deterministic_classification ->> 'serviceEffect' = :serviceEffect
              and last_seen_at >= :seenAfter
            order by canonical_event_id, last_seen_at desc, source_system, source_id
            """, new MapSqlParameterSource()
                .addValue("serviceEffect", serviceEffect)
                .addValue("seenAfter", seenAfter),
            (resultSet, rowNumber) -> new StoredClassification(
                classification(resultSet.getString("classification")),
                resultSet.getObject("last_seen_at", OffsetDateTime.class)
            ));
    }

    public List<RawAlertDto> findRawAlerts(int limit, int offset) {
        return jdbc.query("""
            select source_system, source_id, payload::text, active, last_seen_at
            from metrolinx_alert_source_records
            order by active desc, last_seen_at desc, source_system, source_id
            limit :limit offset :offset
            """, new MapSqlParameterSource()
                .addValue("limit", limit)
                .addValue("offset", offset), (resultSet, rowNumber) -> {
                String sourceSystem = resultSet.getString("source_system");
                boolean upExpress = MetrolinxSourceSystem.UP_GTFS_ALERTS.equals(sourceSystem);
                return new RawAlertDto(
                    upExpress ? "up" : "go",
                    resultSet.getString("source_id"),
                    upExpress ? "UP Express" : "GO Rail",
                    resultSet.getObject("last_seen_at", OffsetDateTime.class),
                    resultSet.getString("payload"),
                    resultSet.getBoolean("active")
                );
            });
    }

    public Map<String, Set<String>> sourceIdsBySystem(MetrolinxFeed feed) {
        return feed.records().stream().collect(Collectors.groupingBy(
            MetrolinxFetchedRecord::sourceSystem,
            Collectors.mapping(MetrolinxFetchedRecord::sourceId, Collectors.toSet())
        ));
    }

    private String json(List<String> values) {
        return json((Object) values);
    }

    private String json(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
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

    private RegionalAlertClassification classification(String json) {
        try {
            return objectMapper.readValue(json, RegionalAlertClassification.class);
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to read regional alert classification", exception);
        }
    }

    public record StoredClassification(
        RegionalAlertClassification classification,
        OffsetDateTime lastSeenAt
    ) {}
}
