package com.calebhabesh.linewatch.ingestion;

import java.time.LocalDate;
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
        markSuccess(
            id,
            completedAt,
            counts,
            sourceFeedUpdatedAt,
            TtcSubwayClosureSnapshot.unavailable()
        );
    }

    public void markSuccess(
        long id,
        OffsetDateTime completedAt,
        FeedApplicationCounts counts,
        OffsetDateTime sourceFeedUpdatedAt,
        TtcSubwayClosureSnapshot subwayClosures
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
                ttc_subway_closure_supplement_available = :subwayClosureAvailable,
                ttc_subway_closure_records_fetched = :subwayClosureRecordsFetched,
                error_message = null
            where id = :id
            """, new MapSqlParameterSource()
                .addValue("id", id)
                .addValue("completedAt", completedAt)
                .addValue("recordsFetched", counts.recordsFetched())
                .addValue("recordsStaged", counts.recordsStaged())
                .addValue("recordsNormalized", counts.recordsNormalized())
                .addValue("recordsUnmatched", counts.recordsUnmatched())
                .addValue("sourceFeedUpdatedAt", sourceFeedUpdatedAt)
                .addValue("subwayClosureAvailable", subwayClosures.available())
                .addValue("subwayClosureRecordsFetched", subwayClosures.records().size()));
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

    public void recordSourceFetch(
        long id,
        TtcSourceFetchStatus status,
        Integer httpStatus,
        long responseMs
    ) {
        jdbc.update("""
            update ingestion_runs set
                source_fetch_status = :sourceFetchStatus,
                source_http_status = :sourceHttpStatus,
                source_response_ms = :sourceResponseMs
            where id = :id and run_type = 'alerts'
            """, new MapSqlParameterSource()
                .addValue("id", id)
                .addValue("sourceFetchStatus", status.persistedValue())
                .addValue("sourceHttpStatus", httpStatus)
                .addValue("sourceResponseMs", Math.max(0, responseMs)));
    }

    public Optional<OffsetDateTime> findFirstSourceFetchAt() {
        OffsetDateTime first = jdbc.queryForObject("""
            select min(started_at)
            from ingestion_runs
            where run_type = 'alerts' and source_fetch_status is not null
            """, new MapSqlParameterSource(), OffsetDateTime.class);
        return Optional.ofNullable(first);
    }

    public List<SourceFetchDailyCount> sourceFetchDailyCounts(
        OffsetDateTime fromInclusive,
        OffsetDateTime toExclusive
    ) {
        return jdbc.query("""
            select
                (started_at at time zone 'America/Toronto')::date as observation_date,
                count(*) filter (where source_fetch_status = 'success') as successful_checks,
                count(*) filter (where source_fetch_status <> 'success') as failed_checks,
                count(*) as total_checks
            from ingestion_runs
            where run_type = 'alerts'
              and source_fetch_status is not null
              and started_at >= :fromInclusive
              and started_at < :toExclusive
            group by observation_date
            order by observation_date
            """, new MapSqlParameterSource()
                .addValue("fromInclusive", fromInclusive)
                .addValue("toExclusive", toExclusive),
            (resultSet, rowNumber) -> new SourceFetchDailyCount(
                resultSet.getObject("observation_date", LocalDate.class),
                resultSet.getInt("successful_checks"),
                resultSet.getInt("failed_checks"),
                resultSet.getInt("total_checks")
            ));
    }

    public Optional<IngestionRunSnapshot> findLatest() {
        return findOne("""
            select id, status, started_at, completed_at, records_fetched, records_staged,
                   records_normalized, records_unmatched, source_feed_updated_at, error_message,
                   ttc_subway_closure_supplement_available,
                   ttc_subway_closure_records_fetched
            from ingestion_runs
            where run_type = 'alerts'
            order by started_at desc
            limit 1
            """);
    }

    public Optional<IngestionRunSnapshot> findLatestSuccessful() {
        return findOne("""
            select id, status, started_at, completed_at, records_fetched, records_staged,
                   records_normalized, records_unmatched, source_feed_updated_at, error_message,
                   ttc_subway_closure_supplement_available,
                   ttc_subway_closure_records_fetched
            from ingestion_runs
            where run_type = 'alerts' and status = 'success' and completed_at is not null
            order by completed_at desc
            limit 1
            """);
    }

    private Optional<IngestionRunSnapshot> findOne(String sql) {
        List<IngestionRunSnapshot> runs = jdbc.query(sql, (resultSet, rowNumber) -> new IngestionRunSnapshot(
                resultSet.getLong("id"),
                resultSet.getString("status"),
                resultSet.getObject("started_at", OffsetDateTime.class),
                resultSet.getObject("completed_at", OffsetDateTime.class),
                resultSet.getInt("records_fetched"),
                resultSet.getInt("records_staged"),
                resultSet.getInt("records_normalized"),
                resultSet.getInt("records_unmatched"),
                resultSet.getObject("source_feed_updated_at", OffsetDateTime.class),
                resultSet.getString("error_message"),
                resultSet.getBoolean("ttc_subway_closure_supplement_available"),
                resultSet.getInt("ttc_subway_closure_records_fetched")
            ));
        return runs.stream().findFirst();
    }

    public record SourceFetchDailyCount(
        LocalDate date,
        int successfulChecks,
        int failedChecks,
        int totalChecks
    ) {}
}
