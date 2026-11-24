package com.calebhabesh.linewatch.reliability;

import static org.assertj.core.api.Assertions.assertThat;

import com.calebhabesh.linewatch.reliability.ReliabilityEpisodeSource.DisjointSpan;
import com.calebhabesh.linewatch.reliability.ReliabilityIntervalCalculator.TimeRange;
import com.calebhabesh.linewatch.reliability.ReliabilityScheduleCapture.ServiceSpan;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class ReliabilityEpisodeSourceTest {
    @Test
    void disjointSpansClipsOverlappingMidnightSpanWithoutTouchingOtherLinesOrStations() {
        LocalDate d1 = LocalDate.parse("2026-11-10");
        LocalDate d2 = LocalDate.parse("2026-11-11");
        LocalDate d3 = LocalDate.parse("2026-11-12");

        List<ServiceSpan> raw = List.of(
            // Line 1 whole line: d1 runs to 02:30 next morning; d2 starts at 02:00 (30m overlap)
            new ServiceSpan(d1, "line-1", "", odt("2026-11-10T06:00:00-05:00"), odt("2026-11-11T02:30:00-05:00")),
            new ServiceSpan(d2, "line-1", "", odt("2026-11-11T02:00:00-05:00"), odt("2026-11-12T02:00:00-05:00")),
            // Line 1 whole line d3 starts cleanly after d2
            new ServiceSpan(d3, "line-1", "", odt("2026-11-12T06:00:00-05:00"), odt("2026-11-13T01:30:00-05:00")),
            // Line 2 is independent and must not be clipped by Line 1
            new ServiceSpan(d2, "line-2", "", odt("2026-11-11T02:00:00-05:00"), odt("2026-11-12T01:00:00-05:00")),
            // Station span on line-1 is independent from whole-line span
            new ServiceSpan(d1, "line-1", "union", odt("2026-11-10T06:05:00-05:00"), odt("2026-11-11T02:20:00-05:00")),
            new ServiceSpan(d2, "line-1", "union", odt("2026-11-11T02:10:00-05:00"), odt("2026-11-12T01:50:00-05:00"))
        );

        List<DisjointSpan> disjoint = ReliabilityEpisodeSource.disjointSpans(raw);

        DisjointSpan line1D1 = find(disjoint, d1, "line-1", "");
        DisjointSpan line1D2 = find(disjoint, d2, "line-1", "");
        DisjointSpan line1D3 = find(disjoint, d3, "line-1", "");
        DisjointSpan line2D2 = find(disjoint, d2, "line-2", "");
        DisjointSpan unionD2 = find(disjoint, d2, "line-1", "union");

        assertThat(line1D1.range()).isEqualTo(new TimeRange(odt("2026-11-10T06:00:00-05:00"), odt("2026-11-11T02:30:00-05:00")));
        assertThat(line1D2.range()).isEqualTo(new TimeRange(odt("2026-11-11T02:30:00-05:00"), odt("2026-11-12T02:00:00-05:00")));
        assertThat(line1D3.range()).isEqualTo(new TimeRange(odt("2026-11-12T06:00:00-05:00"), odt("2026-11-13T01:30:00-05:00")));
        assertThat(line2D2.range()).isEqualTo(new TimeRange(odt("2026-11-11T02:00:00-05:00"), odt("2026-11-12T01:00:00-05:00")));
        assertThat(unionD2.range()).isEqualTo(new TimeRange(odt("2026-11-11T02:20:00-05:00"), odt("2026-11-12T01:50:00-05:00")));
    }

    @Test
    void disjointSpansDropsCompletelySwallowedSpan() {
        LocalDate d1 = LocalDate.parse("2026-11-10");
        LocalDate d2 = LocalDate.parse("2026-11-11");

        List<DisjointSpan> disjoint = ReliabilityEpisodeSource.disjointSpans(List.of(
            new ServiceSpan(d1, "line-1", "", odt("2026-11-10T06:00:00-05:00"), odt("2026-11-11T04:00:00-05:00")),
            new ServiceSpan(d2, "line-1", "", odt("2026-11-11T02:00:00-05:00"), odt("2026-11-11T03:30:00-05:00"))
        ));

        assertThat(disjoint).singleElement().satisfies(span -> assertThat(span.serviceDate()).isEqualTo(d1));
    }

    @Test
    void splitByServiceDateKeepsPastMidnightServiceOnItsOwnDateAndSplitsMultiDayRanges() {
        LocalDate d1 = LocalDate.parse("2026-11-10");
        LocalDate d2 = LocalDate.parse("2026-11-11");
        Map<LocalDate, TimeRange> daySpans = new LinkedHashMap<>();
        daySpans.put(d1, new TimeRange(odt("2026-11-10T06:00:00-05:00"), odt("2026-11-11T02:00:00-05:00")));
        daySpans.put(d2, new TimeRange(odt("2026-11-11T06:00:00-05:00"), odt("2026-11-12T02:00:00-05:00")));

        // An incident from 23:30 on d1 to 00:30 next calendar morning belongs wholly to d1's service span.
        Map<LocalDate, List<TimeRange>> lateNight = ReliabilityEpisodeSource.splitByServiceDate(
            List.of(new TimeRange(odt("2026-11-10T23:30:00-05:00"), odt("2026-11-11T00:30:00-05:00"))),
            daySpans
        );
        assertThat(lateNight.keySet()).containsExactly(d1);
        assertThat(ReliabilityIntervalCalculator.minutes(lateNight.get(d1))).isEqualTo(60);

        // A multi-day incident from 22:00 on d1 through 09:00 on d2 splits cleanly into 4h on d1 and 3h on d2.
        Map<LocalDate, List<TimeRange>> multiDay = ReliabilityEpisodeSource.splitByServiceDate(
            List.of(new TimeRange(odt("2026-11-10T22:00:00-05:00"), odt("2026-11-11T09:00:00-05:00"))),
            daySpans
        );
        assertThat(multiDay.keySet()).containsExactly(d1, d2);
        assertThat(ReliabilityIntervalCalculator.minutes(multiDay.get(d1))).isEqualTo(240);
        assertThat(ReliabilityIntervalCalculator.minutes(multiDay.get(d2))).isEqualTo(180);
    }

    @Test
    void formatsMultirangeLiteralAndJsonArrays() {
        assertThat(ReliabilityEpisodeSource.toMultirangeLiteral(List.of())).isEqualTo("{}");
        assertThat(ReliabilityEpisodeSource.toMultirangeLiteral(List.of(
            new TimeRange(odt("2026-11-10T10:00:00Z"), odt("2026-11-10T11:00:00Z")),
            new TimeRange(odt("2026-11-10T11:00:00Z"), odt("2026-11-10T12:00:00Z")),
            new TimeRange(odt("2026-11-10T14:00:00Z"), odt("2026-11-10T15:00:00Z"))
        ))).isEqualTo("{[2026-11-10T10:00:00Z,2026-11-10T12:00:00Z),[2026-11-10T14:00:00Z,2026-11-10T15:00:00Z)}");

        String json = ReliabilityEpisodeSource.toJsonArray(List.of("bloor-yonge", "union"));
        assertThat(ReliabilityEpisodeSource.parseJsonArray(json)).containsExactly("bloor-yonge", "union");
    }

    private static DisjointSpan find(List<DisjointSpan> spans, LocalDate date, String lineId, String stationId) {
        return spans.stream()
            .filter(s -> s.serviceDate().equals(date) && s.lineId().equals(lineId) && s.stationId().equals(stationId))
            .findFirst()
            .orElseThrow();
    }

    private static OffsetDateTime odt(String value) {
        return OffsetDateTime.parse(value);
    }
}
