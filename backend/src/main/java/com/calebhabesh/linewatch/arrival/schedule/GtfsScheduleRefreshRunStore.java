package com.calebhabesh.linewatch.arrival.schedule;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class GtfsScheduleRefreshRunStore {
    private final NamedParameterJdbcTemplate jdbc;

    public GtfsScheduleRefreshRunStore(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public long createRunning(OffsetDateTime startedAt) {
        Long id = jdbc.queryForObject("""
            insert into ingestion_runs (run_type, status, started_at)
            values ('gtfs-schedule', 'running', :startedAt)
            returning id
            """, new MapSqlParameterSource("startedAt", startedAt), Long.class);
        if (id == null) {
            throw new IllegalStateException("Unable to create gtfs-schedule refresh run");
        }
        return id;
    }

    public void markSuccess(long id, OffsetDateTime completedAt, int recordsProcessed) {
        jdbc.update("""
            update ingestion_runs set
                status = 'success',
                completed_at = :completedAt,
                records_processed = :recordsProcessed,
                error_message = null
            where id = :id and run_type = 'gtfs-schedule'
            """, new MapSqlParameterSource()
                .addValue("id", id)
                .addValue("completedAt", completedAt)
                .addValue("recordsProcessed", recordsProcessed));
    }

    public void markFailed(long id, OffsetDateTime completedAt, String errorMessage) {
        jdbc.update("""
            update ingestion_runs set
                status = 'failed',
                completed_at = :completedAt,
                error_message = :errorMessage
            where id = :id and run_type = 'gtfs-schedule'
            """, new MapSqlParameterSource()
                .addValue("id", id)
                .addValue("completedAt", completedAt)
                .addValue("errorMessage", errorMessage));
    }

    public Optional<GtfsScheduleRefreshRunSnapshot> findLatest() {
        List<GtfsScheduleRefreshRunSnapshot> runs = jdbc.query("""
            select id, status, started_at, completed_at, records_processed, error_message
            from ingestion_runs
            where run_type = 'gtfs-schedule'
            order by started_at desc
            limit 1
            """, (resultSet, rowNumber) -> new GtfsScheduleRefreshRunSnapshot(
                resultSet.getLong("id"),
                resultSet.getString("status"),
                resultSet.getObject("started_at", OffsetDateTime.class),
                resultSet.getObject("completed_at", OffsetDateTime.class),
                resultSet.getInt("records_processed"),
                resultSet.getString("error_message")
            ));
        return runs.stream().findFirst();
    }
}
