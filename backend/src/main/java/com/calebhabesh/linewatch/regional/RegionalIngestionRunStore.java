package com.calebhabesh.linewatch.regional;

import com.calebhabesh.linewatch.ingestion.FeedApplicationCounts;
import com.calebhabesh.linewatch.ingestion.IngestionRunSnapshot;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import org.springframework.stereotype.Repository;

@Repository
public class RegionalIngestionRunStore {
    public static final String RUN_TYPE = "metrolinx-alerts";
    private final NamedParameterJdbcTemplate jdbc;

    public RegionalIngestionRunStore(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public long createRunning(OffsetDateTime startedAt) {
        Long id = jdbc.queryForObject("""
            insert into ingestion_runs (run_type, status, started_at)
            values (:runType, 'running', :startedAt)
            returning id
            """, new MapSqlParameterSource()
                .addValue("runType", RUN_TYPE)
                .addValue("startedAt", startedAt), Long.class);
        if (id == null) throw new IllegalStateException("Unable to create Metrolinx ingestion run");
        return id;
    }

    public void markSuccess(long id, OffsetDateTime completedAt, FeedApplicationCounts counts, OffsetDateTime sourceUpdatedAt) {
        jdbc.update("""
            update ingestion_runs set status = 'success', completed_at = :completedAt,
                records_processed = :normalized, records_fetched = :fetched,
                records_staged = :staged, records_normalized = :normalized,
                records_unmatched = :unmatched, source_feed_updated_at = :sourceUpdatedAt,
                error_message = null
            where id = :id
            """, new MapSqlParameterSource()
                .addValue("id", id).addValue("completedAt", completedAt)
                .addValue("fetched", counts.recordsFetched()).addValue("staged", counts.recordsStaged())
                .addValue("normalized", counts.recordsNormalized()).addValue("unmatched", counts.recordsUnmatched())
                .addValue("sourceUpdatedAt", sourceUpdatedAt));
    }

    public void markFailed(long id, OffsetDateTime completedAt, String errorMessage) {
        jdbc.update("""
            update ingestion_runs set status = 'failed', completed_at = :completedAt, error_message = :errorMessage
            where id = :id
            """, new MapSqlParameterSource("id", id)
                .addValue("completedAt", completedAt).addValue("errorMessage", errorMessage));
    }

    public void replaceSourceStatuses(long runId, MetrolinxFeed feed) {
        Map<String, Long> counts = feed.records().stream().collect(Collectors.groupingBy(
            MetrolinxFetchedRecord::sourceSystem,
            Collectors.counting()
        ));
        SqlParameterSource[] rows = MetrolinxSourceSystem.descriptors().stream()
            .map(descriptor -> new MapSqlParameterSource()
                .addValue("runId", runId)
                .addValue("sourceSystem", descriptor.sourceSystem())
                .addValue("required", descriptor.required())
                .addValue("complete", Boolean.TRUE.equals(feed.completeSources().get(descriptor.sourceSystem())))
                .addValue("recordsFetched", counts.getOrDefault(descriptor.sourceSystem(), 0L))
                .addValue("sourceUpdatedAt", feed.sourceUpdatedAts().get(descriptor.sourceSystem())))
            .toArray(SqlParameterSource[]::new);
        jdbc.batchUpdate("""
            insert into metrolinx_ingestion_source_runs (
                run_id, source_system, required, complete, records_fetched, source_feed_updated_at
            ) values (
                :runId, :sourceSystem, :required, :complete, :recordsFetched, :sourceUpdatedAt
            )
            on conflict (run_id, source_system) do update set
                required = excluded.required,
                complete = excluded.complete,
                records_fetched = excluded.records_fetched,
                source_feed_updated_at = excluded.source_feed_updated_at
            """, rows);
    }

    public Optional<IngestionRunSnapshot> findLatest() {
        List<IngestionRunSnapshot> rows = jdbc.query("""
            select id, status, started_at, completed_at, records_fetched, records_staged,
                   records_normalized, records_unmatched, source_feed_updated_at, error_message
            from ingestion_runs where run_type = :runType order by started_at desc limit 1
            """, new MapSqlParameterSource("runType", RUN_TYPE), (resultSet, rowNumber) -> new IngestionRunSnapshot(
                resultSet.getLong("id"), resultSet.getString("status"),
                resultSet.getObject("started_at", OffsetDateTime.class),
                resultSet.getObject("completed_at", OffsetDateTime.class),
                resultSet.getInt("records_fetched"), resultSet.getInt("records_staged"),
                resultSet.getInt("records_normalized"), resultSet.getInt("records_unmatched"),
                resultSet.getObject("source_feed_updated_at", OffsetDateTime.class),
                resultSet.getString("error_message")
            ));
        return rows.stream().findFirst();
    }

    public List<SourceStatus> findSourceStatuses(long runId) {
        return jdbc.query("""
            select source_system, complete, records_fetched, source_feed_updated_at
            from metrolinx_ingestion_source_runs
            where run_id = :runId
            order by source_system
            """, Map.of("runId", runId), (resultSet, rowNumber) -> new SourceStatus(
            resultSet.getString("source_system"),
            resultSet.getBoolean("complete"),
            resultSet.getInt("records_fetched"),
            resultSet.getObject("source_feed_updated_at", OffsetDateTime.class)
        ));
    }

    public record SourceStatus(
        String sourceSystem,
        boolean complete,
        int recordsFetched,
        OffsetDateTime sourceUpdatedAt
    ) {}
}
