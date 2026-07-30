package com.calebhabesh.linewatch.regional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import org.springframework.stereotype.Repository;

@Repository
public class RegionalOperationalSourceStore {
    private final NamedParameterJdbcTemplate jdbc;

    public RegionalOperationalSourceStore(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void upsertAll(List<MetrolinxFetchedRecord> records, OffsetDateTime now) {
        if (records.isEmpty()) return;
        SqlParameterSource[] rows = records.stream().map(record -> new MapSqlParameterSource()
            .addValue("sourceSystem", record.sourceSystem())
            .addValue("sourceId", record.sourceId())
            .addValue("payload", record.rawPayload())
            .addValue("now", now)
        ).toArray(SqlParameterSource[]::new);
        jdbc.batchUpdate("""
            insert into metrolinx_operational_source_records (
                source_system, source_id, payload, active, first_seen_at, last_seen_at
            ) values (
                :sourceSystem, :sourceId, cast(:payload as jsonb), true, :now, :now
            )
            on conflict (source_system, source_id) do update set
                payload = excluded.payload,
                active = true,
                last_seen_at = excluded.last_seen_at
            """, rows);
    }

    public void deactivateMissing(String sourceSystem, Set<String> sourceIds) {
        jdbc.update(
            sourceIds.isEmpty()
                ? "update metrolinx_operational_source_records set active = false where source_system = :sourceSystem and active = true"
                : "update metrolinx_operational_source_records set active = false where source_system = :sourceSystem and active = true and source_id not in (:sourceIds)",
            new MapSqlParameterSource("sourceSystem", sourceSystem).addValue("sourceIds", sourceIds)
        );
    }
}
