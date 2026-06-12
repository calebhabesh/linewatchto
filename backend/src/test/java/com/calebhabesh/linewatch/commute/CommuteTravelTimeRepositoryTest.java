package com.calebhabesh.linewatch.commute;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class CommuteTravelTimeRepositoryTest {

    @Test
    void repositoryDerivesMedianSegmentWeightsFromActiveGtfsImport() throws IOException {
        String source = source("/com/calebhabesh/linewatch/commute/CommuteTravelTimeRepository.java");

        assertThat(source).contains("gtfs_schedule_imports");
        assertThat(source).contains("gtfs_stop_times");
        assertThat(source).contains("gtfs_station_stops");
        assertThat(source).contains("percentile_cont(0.5)");
        assertThat(source).contains("next_time.arrival_seconds - curr_time.departure_seconds");
        assertThat(source).contains("between 30 and 900");
        assertThat(source).contains("segment.station_a_id = adjacent.station_a_id");
        assertThat(source).contains("segment.station_b_id = adjacent.station_b_id");
        assertThat(source).contains("gtfs-scheduled-median");
    }

    @Test
    void repositoryReadsSeededFallbackWeightsFromPerSegmentTable() throws IOException {
        String source = source("/com/calebhabesh/linewatch/commute/CommuteTravelTimeRepository.java");
        String migration = migrationSql("/db/migration/V21__line_segment_fallback_travel_times.sql");

        assertThat(source).contains("seeded-fallback");
        assertThat(source).contains("findSeededFallbackSegmentWeights");
        assertThat(source).contains("from line_segment_fallback_travel_times");
        assertThat(migration).contains("create table line_segment_fallback_travel_times");
        assertThat(migration).contains("segment_id varchar(120) primary key references line_segments(id) on delete cascade");
        assertThat(migration).contains("'line-5' then 170");
        assertThat(migration).contains("'line-6' then 190");
        assertThat(migration).contains("insert into line_segment_fallback_travel_times");
    }

    private String source(String path) throws IOException {
        String relative = path.startsWith("/") ? path.substring(1) : path;
        Path backendRelative = Path.of("src/main/java", relative);
        if (Files.exists(backendRelative)) {
            return Files.readString(backendRelative);
        }
        Path repoRelative = Path.of("backend/src/main/java", relative);
        assertThat(repoRelative).exists();
        return Files.readString(repoRelative);
    }

    private String migrationSql(String path) throws IOException {
        try (var input = getClass().getResourceAsStream(path)) {
            assertThat(input).isNotNull();
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
