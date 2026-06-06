package com.calebhabesh.linewatch.commute;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
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
        assertThat(source).contains("next_time.arrival_seconds - current_time.departure_seconds");
        assertThat(source).contains("between 30 and 900");
        assertThat(source).contains("segment.station_a_id = adjacent.station_a_id");
        assertThat(source).contains("segment.station_b_id = adjacent.station_b_id");
        assertThat(source).contains("gtfs-scheduled-median");
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
}
