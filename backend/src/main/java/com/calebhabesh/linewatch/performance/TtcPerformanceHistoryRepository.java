package com.calebhabesh.linewatch.performance;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import org.springframework.stereotype.Repository;

/**
 * Plan 17 A10: persists each fresh {@link TtcPerformanceService} snapshot reading so official
 * TTC.ca performance metrics can be charted over time without making extra upstream calls.
 */
@Repository
public class TtcPerformanceHistoryRepository {
    private final NamedParameterJdbcTemplate jdbc;

    public TtcPerformanceHistoryRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public int record(TtcPerformanceResponses.SnapshotResponse snapshot, LocalDate readingDate) {
        if (snapshot == null || snapshot.metrics() == null || snapshot.metrics().isEmpty() || readingDate == null) {
            return 0;
        }
        String updatedLabel = snapshot.updatedLabel() == null ? "" : snapshot.updatedLabel().trim();
        if (updatedLabel.length() > 120) updatedLabel = updatedLabel.substring(0, 120);
        OffsetDateTime fetchedAt = snapshot.fetchedAt() != null ? snapshot.fetchedAt() : OffsetDateTime.now();
        String sourceUrl = snapshot.sourceUrl();
        if (sourceUrl != null && sourceUrl.length() > 240) sourceUrl = sourceUrl.substring(0, 240);

        List<SqlParameterSource> rows = new ArrayList<>();
        for (TtcPerformanceResponses.MetricResponse metric : snapshot.metrics()) {
            if (metric == null || metric.id() == null || metric.id().isBlank()) continue;
            rows.add(new MapSqlParameterSource()
                .addValue("metricKey", truncate(metric.id().trim(), 80))
                .addValue("label", truncate(metric.label() == null ? metric.id() : metric.label().trim(), 120))
                .addValue("category", metric.category() == null ? null : truncate(metric.category().trim(), 80))
                .addValue("percentage", metric.percentage())
                .addValue("target", metric.target())
                .addValue("valueLabel", metric.valueLabel() == null ? null : truncate(metric.valueLabel().trim(), 60))
                .addValue("updatedLabel", updatedLabel)
                .addValue("readingDate", readingDate)
                .addValue("fetchedAt", fetchedAt)
                .addValue("sourceUrl", sourceUrl));
        }
        if (rows.isEmpty()) return 0;

        jdbc.batchUpdate("""
            insert into ttc_performance_readings (
                metric_key, label, category, percentage, target, value_label,
                updated_label, reading_date, fetched_at, source_url
            ) values (
                :metricKey, :label, :category, :percentage, :target, :valueLabel,
                :updatedLabel, :readingDate, :fetchedAt, :sourceUrl
            )
            on conflict (metric_key, reading_date, updated_label) do update
            set label = excluded.label,
                category = excluded.category,
                percentage = excluded.percentage,
                target = excluded.target,
                value_label = excluded.value_label,
                fetched_at = excluded.fetched_at,
                source_url = excluded.source_url
            """, rows.toArray(SqlParameterSource[]::new));
        return rows.size();
    }

    public List<ReadingRow> readings(LocalDate from, LocalDate to) {
        return jdbc.query("""
            select metric_key, label, category, percentage, target, value_label,
                   updated_label, reading_date, fetched_at
            from ttc_performance_readings
            where reading_date between :from and :to
            order by reading_date asc, fetched_at asc, metric_key asc
            """, new MapSqlParameterSource()
                .addValue("from", from)
                .addValue("to", to),
            (rs, row) -> new ReadingRow(
                rs.getString("metric_key"),
                rs.getString("label"),
                rs.getString("category"),
                rs.getObject("percentage", Integer.class),
                rs.getObject("target", Integer.class),
                rs.getString("value_label"),
                rs.getString("updated_label"),
                rs.getObject("reading_date", LocalDate.class),
                rs.getObject("fetched_at", OffsetDateTime.class)
            ));
    }

    public Map<String, List<ReadingRow>> readingsByMetric(LocalDate from, LocalDate to) {
        Map<String, List<ReadingRow>> grouped = new LinkedHashMap<>();
        for (ReadingRow row : readings(from, to)) {
            grouped.computeIfAbsent(row.metricKey(), k -> new ArrayList<>()).add(row);
        }
        return grouped;
    }

    private static String truncate(String value, int max) {
        return value.length() <= max ? value : value.substring(0, max);
    }

    public record ReadingRow(
        String metricKey,
        String label,
        String category,
        Integer percentage,
        Integer target,
        String valueLabel,
        String updatedLabel,
        LocalDate readingDate,
        OffsetDateTime fetchedAt
    ) {}
}
