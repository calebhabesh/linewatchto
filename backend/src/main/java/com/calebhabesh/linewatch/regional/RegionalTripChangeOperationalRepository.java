package com.calebhabesh.linewatch.regional;

import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class RegionalTripChangeOperationalRepository {
    private final NamedParameterJdbcTemplate jdbc;

    public RegionalTripChangeOperationalRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<OperationalRecord> findActiveRecords(OffsetDateTime seenAfter) {
        return jdbc.query("""
            select source_system, source_id, payload::text, last_seen_at
            from metrolinx_operational_source_records
            where source_system in (:sourceSystems)
              and active = true
              and last_seen_at >= :seenAfter
            order by last_seen_at desc, source_system, source_id
            """, new MapSqlParameterSource()
            .addValue("sourceSystems", List.of(
                MetrolinxSourceSystem.GO_TRAIN_EXCEPTIONS,
                MetrolinxSourceSystem.GO_GTFS_TRIP_UPDATES
            ))
            .addValue("seenAfter", seenAfter), (rs, row) -> new OperationalRecord(
                rs.getString("source_system"), rs.getString("source_id"),
                rs.getString("payload"), rs.getObject("last_seen_at", OffsetDateTime.class)
            ));
    }

    public record OperationalRecord(
        String sourceSystem,
        String sourceId,
        String rawPayload,
        OffsetDateTime lastSeenAt
    ) {}
}
