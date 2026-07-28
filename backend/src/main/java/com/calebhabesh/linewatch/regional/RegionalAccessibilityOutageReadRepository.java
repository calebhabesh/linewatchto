package com.calebhabesh.linewatch.regional;

import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class RegionalAccessibilityOutageReadRepository {
    private final NamedParameterJdbcTemplate jdbc;

    public RegionalAccessibilityOutageReadRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record SourceRecord(String sourceId, String rawPayload, OffsetDateTime lastSeenAt) {}

    public List<SourceRecord> findActiveGoAmenityRecords() {
        return jdbc.query("""
            select source_id, payload::text, last_seen_at
            from metrolinx_alert_source_records
            where source_system = :sourceSystem
              and active = true
              and lower(payload ->> 'Category') = 'amenity'
              and lower(payload ->> 'SubCategory') = 'elevator-escalator disruption'
            order by last_seen_at desc, source_id
            """, new MapSqlParameterSource("sourceSystem", MetrolinxSourceSystem.GO_SERVICE_ALERTS),
            (resultSet, rowNumber) -> new SourceRecord(
                resultSet.getString("source_id"),
                resultSet.getString("payload"),
                resultSet.getObject("last_seen_at", OffsetDateTime.class)
            ));
    }
}
