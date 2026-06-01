package com.calebhabesh.linewatch.ingestion;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class IngestionRunStore {
    private final NamedParameterJdbcTemplate jdbc;

    public IngestionRunStore(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public long createRunning(OffsetDateTime startedAt) {
        Long id = jdbc.queryForObject("""
            insert into ingestion_runs (run_type, status, started_at)
            values ('alerts', 'running', :startedAt)
            returning id
            """, new MapSqlParameterSource("startedAt", startedAt), Long.class);
        if (id == null) {
            throw new IllegalStateException("Unable to create alert ingestion run");
        }
        return id;
    }

    public void markSuccess(
        long id,
        OffsetDateTime completedAt,
        FeedApplicationCounts counts,
        OffsetDateTime sourceFeedUpdatedAt
    ) {
        jdbc.update("""
            update ingestion_runs set
                status = 'success',
                completed_at = :completedAt,
                records_processed = :recordsNormalized,
                records_fetched = :recordsFetched,
                records_staged = :recordsStaged,
                records_normalized = :recordsNormalized,
                records_unmatched = :recordsUnmatched,
                source_feed_updated_at = :sourceFeedUpdatedAt,
                error_message = null
            where id = :id
            """, new MapSqlParameterSource()
                .addValue("id", id)
                .addValue("completedAt", completedAt)
                .addValue("recordsFetched", counts.recordsFetched())
                .addValue("recordsStaged", counts.recordsStaged())
                .addValue("recordsNormalized", counts.recordsNormalized())
                .addValue("recordsUnmatched", counts.recordsUnmatched())
                .addValue("sourceFeedUpdatedAt", sourceFeedUpdatedAt));
    }

    public void markFailed(long id, OffsetDateTime completedAt, String errorMessage) {
        jdbc.update("""
            update ingestion_runs set
                status = 'failed',
                completed_at = :completedAt,
                error_message = :errorMessage
            where id = :id
            """, new MapSqlParameterSource()
                .addValue("id", id)
                .addValue("completedAt", completedAt)
                .addValue("errorMessage", errorMessage));
    }

    public Optional<IngestionRunSnapshot> findLatest() {
        List<IngestionRunSnapshot> runs = jdbc.query("""
            select id, status, started_at, completed_at, records_fetched, records_staged,
                   records_normalized, records_unmatched, source_feed_updated_at, error_message
            from ingestion_runs
            where run_type = 'alerts'
            order by started_at desc
            limit 1
            """, (resultSet, rowNumber) -> new IngestionRunSnapshot(
                resultSet.getLong("id"),
                resultSet.getString("status"),
                resultSet.getObject("started_at", OffsetDateTime.class),
                resultSet.getObject("completed_at", OffsetDateTime.class),
                resultSet.getInt("records_fetched"),
                resultSet.getInt("records_staged"),
                resultSet.getInt("records_normalized"),
                resultSet.getInt("records_unmatched"),
                resultSet.getObject("source_feed_updated_at", OffsetDateTime.class),
                resultSet.getString("error_message")
            ));
        return runs.stream().findFirst();
    }
}
