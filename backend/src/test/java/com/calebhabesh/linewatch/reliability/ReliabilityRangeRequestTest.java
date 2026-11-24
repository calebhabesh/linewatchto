package com.calebhabesh.linewatch.reliability;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.calebhabesh.linewatch.reliability.ReliabilityIntervalCalculator.TimeRange;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class ReliabilityRangeRequestTest {
    private static final LocalDate TODAY = LocalDate.parse("2026-11-24");

    @Test
    void parsesNetworkDatesAndIds() {
        ReliabilityRangeRequest request = ReliabilityRangeRequest.parse(
            "Regional", "2026-11-01", "2026-11-24", " LAKESHORE-WEST ", "Union", TODAY);
        assertThat(request.networkId()).isEqualTo("regional");
        assertThat(request.from()).isEqualTo(LocalDate.parse("2026-11-01"));
        assertThat(request.lineId()).isEqualTo("lakeshore-west");
        assertThat(request.stationId()).isEqualTo("union");
        assertThat(request.keyPart()).isEqualTo("regional:2026-11-01:2026-11-24:lakeshore-west:union");
        assertThat(ReliabilityRangeRequest.parse(null, "2026-11-01", "2026-11-01", "", null, TODAY).keyPart())
            .isEqualTo("ttc:2026-11-01:2026-11-01:-:-");
    }

    @Test
    void datesParseStrictly() {
        assertRefused(() -> parse("2026-02-30", "2026-03-01"), "invalid_date");
        assertRefused(() -> parse("2026-2-01", "2026-03-01"), "invalid_date");
        assertRefused(() -> parse("2026-02-01T00:00", "2026-03-01"), "invalid_date");
        assertRefused(() -> parse(null, "2026-03-01"), "invalid_date");
        assertThat(parse("2024-02-29", "2024-03-01").from()).isEqualTo(LocalDate.parse("2024-02-29"));
    }

    @Test
    void fromMustNotFollowToAndToMustNotFollowToday() {
        assertRefused(() -> parse("2026-11-10", "2026-11-09"), "invalid_range");
        assertRefused(() -> parse("2026-11-10", "2026-11-25"), "invalid_range");
        assertThat(parse("2026-11-24", "2026-11-24").to()).isEqualTo(TODAY);
    }

    @Test
    void refusesUnknownNetworksAndMalformedIds() {
        assertRefused(() -> ReliabilityRangeRequest.parse("go", "2026-11-01", "2026-11-02", null, null, TODAY), "invalid_network");
        assertRefused(() -> ReliabilityRangeRequest.parse("ttc", "2026-11-01", "2026-11-02", "line 1", null, TODAY), "invalid_line");
        assertRefused(() -> ReliabilityRangeRequest.parse("ttc", "2026-11-01", "2026-11-02", null, "x".repeat(81), TODAY), "invalid_station");
        assertRefused(() -> ReliabilityRangeRequest.parse("ttc", "2026-11-01", "2026-11-02", null, "../union", TODAY), "invalid_station");
    }

    @Test
    void limitsParseWithinBounds() {
        assertThat(ReliabilityRangeRequest.parseInt("limit", null, 20, 1, 100)).isEqualTo(20);
        assertThat(ReliabilityRangeRequest.parseInt("limit", "100", 20, 1, 100)).isEqualTo(100);
        assertRefused(() -> ReliabilityRangeRequest.parseInt("limit", "101", 20, 1, 100), "invalid_limit");
        assertRefused(() -> ReliabilityRangeRequest.parseInt("limit", "0", 20, 1, 100), "invalid_limit");
        assertRefused(() -> ReliabilityRangeRequest.parseInt("limit", "ten", 20, 1, 100), "invalid_limit");
    }

    @Test
    void bucketsStartWeeksOnMondayAndMonthsOnTheFirstAndAreCapped() {
        List<LocalDate[]> weeks = ReliabilityRangeService.buckets(
            LocalDate.parse("2026-11-04"), LocalDate.parse("2026-11-24"), "week");
        assertThat(weeks).extracting(bucket -> bucket[0] + ".." + bucket[1]).containsExactly(
            "2026-11-04..2026-11-08", "2026-11-09..2026-11-15", "2026-11-16..2026-11-22", "2026-11-23..2026-11-24");
        List<LocalDate[]> months = ReliabilityRangeService.buckets(
            LocalDate.parse("2024-01-31"), LocalDate.parse("2024-03-02"), "month");
        assertThat(months).extracting(bucket -> bucket[0] + ".." + bucket[1]).containsExactly(
            "2024-01-31..2024-01-31", "2024-02-01..2024-02-29", "2024-03-01..2024-03-02");
        ReliabilityRangeService.requireBucketCount(LocalDate.parse("2025-10-21"), LocalDate.parse("2026-11-24"), "day");
        assertRefused(() -> ReliabilityRangeService.requireBucketCount(
            LocalDate.parse("2025-10-20"), LocalDate.parse("2026-11-24"), "day"), "too_many_buckets");
        assertRefused(() -> ReliabilityRangeService.parseGranularity("year"), "invalid_granularity");
        assertThat(ReliabilityRangeService.parseGranularity(null)).isEqualTo("day");
    }

    @Test
    void csvCellsQuoteAndNeverStartAFormula() {
        assertThat(ReliabilityRangeService.csvCell("Union")).isEqualTo("Union");
        assertThat(ReliabilityRangeService.csvCell("Bloor, Yonge")).isEqualTo("\"Bloor, Yonge\"");
        assertThat(ReliabilityRangeService.csvCell("Say \"hi\"")).isEqualTo("\"Say \"\"hi\"\"\"");
        assertThat(ReliabilityRangeService.csvCell("=HYPERLINK(\"x\")")).isEqualTo("\"'=HYPERLINK(\"\"x\"\")\"");
        assertThat(ReliabilityRangeService.csvCell("+1")).isEqualTo("'+1");
        assertThat(ReliabilityRangeService.csvCell("line\nbreak")).isEqualTo("\"line\nbreak\"");
        assertThat(ReliabilityRangeService.csvCell(null)).isEmpty();
    }

    @Test
    void cursorsRoundTripAndRejectTampering() {
        var episode = new ReliabilityRangeService.EpisodeFact(
            "alert-1:2026-11-20T13:00:00Z", "alert-1", "line-1", "delay", "delay", false, null, List.of(),
            OffsetDateTime.parse("2026-11-20T08:00:00-05:00"), null, false, false, List.of(), Map.of());
        String cursor = ReliabilityRangeService.encodeCursor(episode);
        ReliabilityRangeService.Cursor decoded = ReliabilityRangeService.decodeCursor(cursor);
        assertThat(decoded.key()).isEqualTo(episode.key());
        assertThat(decoded.openedAt()).isEqualTo(episode.openedAt().toInstant());
        assertThat(ReliabilityRangeService.decodeCursor(null)).isNull();
        assertRefused(() -> ReliabilityRangeService.decodeCursor("not base64!"), "invalid_cursor");
        assertRefused(() -> ReliabilityRangeService.decodeCursor("bm8tbmV3bGluZQ"), "invalid_cursor");
        assertRefused(() -> ReliabilityRangeService.decodeCursor("a".repeat(513)), "invalid_cursor");
    }

    @Test
    void percentilesAndCauseLabels() {
        assertThat(ReliabilityRangeService.median(List.of(10L, 30L, 20L, 40L))).isEqualTo(25L);
        assertThat(ReliabilityRangeService.p90(List.of(1L, 2L, 3L, 4L, 5L, 6L, 7L, 8L, 9L, 100L))).isEqualTo(9L);
        assertThat(ReliabilityRangeService.p90(List.of(5L))).isEqualTo(5L);
        assertThat(ReliabilityRangeService.p90(List.of())).isNull();
        assertThat(ReliabilityRangeService.causeLabel("TECHNICAL_PROBLEM")).isEqualTo("Technical Problem");
        assertThat(ReliabilityRangeService.causeLabel(null)).isNull();
    }

    @Test
    void hourOfWeekSplitsAtTorontoHoursIncludingTheRepeatedHourWhenClocksFallBack() {
        double[] cells = new double[168];
        // Friday 2026-11-20 08:30..10:15 EST.
        ReliabilityRangeService.addHourly(cells, List.of(new TimeRange(
            OffsetDateTime.parse("2026-11-20T08:30:00-05:00"), OffsetDateTime.parse("2026-11-20T10:15:00-05:00"))));
        assertThat(cells[4 * 24 + 8]).isEqualTo(30.0);
        assertThat(cells[4 * 24 + 9]).isEqualTo(60.0);
        assertThat(cells[4 * 24 + 10]).isEqualTo(15.0);
        // Sunday 2026-11-01: 01:00 EDT .. 02:00 EST is two real hours, both 1 AM local.
        double[] fallBack = new double[168];
        ReliabilityRangeService.addHourly(fallBack, List.of(new TimeRange(
            OffsetDateTime.parse("2026-11-01T01:00:00-04:00"), OffsetDateTime.parse("2026-11-01T02:00:00-05:00"))));
        assertThat(fallBack[6 * 24 + 1]).isEqualTo(120.0);
    }

    private static ReliabilityRangeRequest parse(String from, String to) {
        return ReliabilityRangeRequest.parse("ttc", from, to, null, null, TODAY);
    }

    private static void assertRefused(Runnable call, String error) {
        assertThatThrownBy(call::run)
            .isInstanceOfSatisfying(ReliabilityRangeException.class, exception -> {
                assertThat(exception.getError()).isEqualTo(error);
                assertThat(exception.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
            });
    }
}
