package com.calebhabesh.linewatch.regional;

import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class RegionalSurfaceServiceNoticeReadRepository {
    private final NamedParameterJdbcTemplate jdbc;

    public RegionalSurfaceServiceNoticeReadRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record SourceRecord(String sourceSystem, String sourceId, String rawPayload, OffsetDateTime lastSeenAt) {}

    public List<SourceRecord> findActiveRecords(OffsetDateTime seenAfter) {
        return jdbc.query("""
            select source_system, source_id, payload::text, last_seen_at
            from metrolinx_alert_source_records
            where source_system in (:sourceSystems)
              and active = true
              and last_seen_at >= :seenAfter
            order by last_seen_at desc, source_system, source_id
            """, new MapSqlParameterSource("sourceSystems", List.of(
                MetrolinxSourceSystem.GO_INFORMATION_ALERTS,
                MetrolinxSourceSystem.GO_MARKETING_ALERTS
            )).addValue("seenAfter", seenAfter), (resultSet, rowNumber) -> new SourceRecord(
                resultSet.getString("source_system"),
                resultSet.getString("source_id"),
                resultSet.getString("payload"),
                resultSet.getObject("last_seen_at", OffsetDateTime.class)
            ));
    }
}
