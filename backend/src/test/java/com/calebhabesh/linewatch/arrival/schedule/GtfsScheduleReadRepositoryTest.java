package com.calebhabesh.linewatch.arrival.schedule;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class GtfsScheduleReadRepositoryTest {

    @Test
    void arrivalLookupScopesStationStopsToTheMatchedLineAtInterchanges() throws IOException {
        String source = source("/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleReadRepository.java");

        assertThat(source).contains("gtfs_station_stops");
        assertThat(source).contains("and route.line_id = station_stop.line_id");
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
