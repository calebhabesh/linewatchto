package com.calebhabesh.linewatch.arrival.schedule;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

class GtfsServiceTimeTest {
    // Autumn change: 2026-11-01 02:00 EDT -> 01:00 EST. Spring change: 2027-03-14 02:00 EST -> 03:00 EDT.
    private static final LocalDate FALL_BACK = LocalDate.of(2026, 11, 1);
    private static final LocalDate SPRING_FORWARD = LocalDate.of(2027, 3, 14);

    @Test
    void originIsMidnightOnOrdinaryDays() {
        LocalDate day = LocalDate.of(2026, 6, 4);

        assertThat(GtfsServiceTime.origin(day).toOffsetDateTime())
            .isEqualTo(OffsetDateTime.parse("2026-06-04T00:00:00-04:00"));
        assertThat(GtfsServiceTime.at(day, 9 * 3600 + 5 * 60))
            .isEqualTo(OffsetDateTime.parse("2026-06-04T09:05:00-04:00"));
    }

    @Test
    void autumnChangeDayKeepsPublishedClockTimes() {
        // A 20:30:00 departure means 20:30 EST; anchoring at midnight EDT gave 19:30.
        assertThat(GtfsServiceTime.at(FALL_BACK, 20 * 3600 + 30 * 60))
            .isEqualTo(OffsetDateTime.parse("2026-11-01T20:30:00-05:00"));
        assertThat(GtfsServiceTime.at(FALL_BACK, 25 * 3600 + 30 * 60))
            .isEqualTo(OffsetDateTime.parse("2026-11-02T01:30:00-05:00"));
        assertThat(GtfsServiceTime.secondsAt(FALL_BACK, Instant.parse("2026-11-02T01:25:00Z")))
            .isEqualTo(20 * 3600 + 25 * 60);
    }

    @Test
    void springChangeDayKeepsPublishedClockTimes() {
        // An 08:00:00 departure means 08:00 EDT; anchoring at midnight EST gave 09:00.
        assertThat(GtfsServiceTime.at(SPRING_FORWARD, 8 * 3600))
            .isEqualTo(OffsetDateTime.parse("2027-03-14T08:00:00-04:00"));
        assertThat(GtfsServiceTime.secondsAt(SPRING_FORWARD, Instant.parse("2027-03-15T00:00:00Z")))
            .isEqualTo(20 * 3600);
    }

    @Test
    void secondsAtRoundTripsAcrossServiceDays() {
        for (LocalDate day : List.of(FALL_BACK.minusDays(1), FALL_BACK, SPRING_FORWARD.minusDays(1), SPRING_FORWARD)) {
            for (int seconds : List.of(4 * 3600, 12 * 3600, 23 * 3600 + 59 * 60, 26 * 3600)) {
                assertThat(GtfsServiceTime.secondsAt(day, GtfsServiceTime.at(day, seconds).toInstant()))
                    .as("%s %s", day, seconds)
                    .isEqualTo(seconds);
            }
        }
    }

    @Test
    void mainSourcesDoNotAnchorServiceTimesAtMidnight() throws IOException {
        // Midnight anchoring and wall-clock "seconds of day" are each an hour off on daylight-saving
        // change days; GTFS seconds must go through GtfsServiceTime.
        Pattern midnightPlusSeconds = Pattern.compile("atStartOfDay\\([^;]*?\\)\\s*\\.plusSeconds\\(");
        Pattern secondOfDay = Pattern.compile("toSecondOfDay\\(\\)");
        Path root = Files.exists(Path.of("src/main/java")) ? Path.of("src/main/java") : Path.of("backend/src/main/java");
        try (Stream<Path> files = Files.walk(root)) {
            List<String> offenders = files.filter(path -> path.toString().endsWith(".java"))
                .filter(path -> {
                    try {
                        String source = Files.readString(path);
                        return midnightPlusSeconds.matcher(source).find() || secondOfDay.matcher(source).find();
                    } catch (IOException exception) {
                        throw new IllegalStateException(exception);
                    }
                })
                .map(Path::toString)
                .toList();
            assertThat(offenders).isEmpty();
        }
    }
}
