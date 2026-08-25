package com.calebhabesh.linewatch.ingestion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.net.URI;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;

class TtcLateOpeningWindowResolverTest {
    private final TtcScheduledServiceOpeningRepository repository =
        mock(TtcScheduledServiceOpeningRepository.class);
    private final TtcLateOpeningWindowResolver resolver = new TtcLateOpeningWindowResolver(repository);

    @Test
    void refinesTheFallbackToTheFirstScheduledDepartureAtTheAffectedBoundary() {
        TtcAlertRecord record = lateOpeningRecord();
        when(repository.firstDepartureSeconds(
            "line-2",
            LocalDate.parse("2026-08-23"),
            List.of("st-george", "chester")
        )).thenReturn(Optional.of(8 * 3600 + 7 * 60));

        TtcLateOpeningWindowResolver.Resolution resolution = resolve(record);

        assertThat(resolution.scheduleRefined()).isTrue();
        assertThat(resolution.activePeriodStart())
            .isEqualTo(OffsetDateTime.parse("2026-08-23T08:07:00-04:00"));
        assertThat(resolution.activePeriodEnd())
            .isEqualTo(OffsetDateTime.parse("2026-08-23T11:00:00-04:00"));
        assertThat(resolution.periods()).singleElement().satisfies(period -> {
            assertThat(period.startsAt()).isEqualTo(resolution.activePeriodStart());
            assertThat(period.endsAt()).isEqualTo(resolution.activePeriodEnd());
        });
    }

    @Test
    void fallsBackToTheLineScheduleWhenBoundaryMappingsAreUnavailable() {
        TtcAlertRecord record = lateOpeningRecord();
        LocalDate serviceDate = LocalDate.parse("2026-08-23");
        when(repository.firstDepartureSeconds(
            "line-2", serviceDate, List.of("st-george", "chester")
        )).thenReturn(Optional.empty());
        when(repository.firstDepartureSeconds("line-2", serviceDate, List.of()))
            .thenReturn(Optional.of(8 * 3600 + 2 * 60));

        assertThat(resolve(record).activePeriodStart())
            .isEqualTo(OffsetDateTime.parse("2026-08-23T08:02:00-04:00"));
    }

    @Test
    void rejectsAScheduleThatAlreadyReflectsTheAdvertisedLateOpening() {
        TtcAlertRecord record = lateOpeningRecord();
        when(repository.firstDepartureSeconds(
            "line-2",
            LocalDate.parse("2026-08-23"),
            List.of("st-george", "chester")
        )).thenReturn(Optional.of(11 * 3600));

        TtcLateOpeningWindowResolver.Resolution resolution = resolve(record);

        assertThat(resolution.scheduleRefined()).isFalse();
        assertThat(resolution.activePeriodStart())
            .isEqualTo(OffsetDateTime.parse("2026-08-23T08:00:00-04:00"));
    }

    @Test
    void acceptsALaterHolidayScheduleOpeningThanTheWeekdayFallback() {
        TtcAlertRecord record = weekdayLateOpeningRecord();
        when(repository.firstDepartureSeconds(
            "line-2",
            LocalDate.parse("2026-08-24"),
            List.of("st-george", "chester")
        )).thenReturn(Optional.of(8 * 3600));
        TtcAlertChildPeriod child = record.childAlerts().getFirst();

        TtcLateOpeningWindowResolver.Resolution resolution = resolver.resolve(
            record,
            "line-2",
            List.of("st-george", "chester"),
            List.of(new NormalizedAlertPeriod(
                child.id(), child.startTime(), child.endTime(), 0
            )),
            record.activePeriod().start(),
            record.activePeriod().end()
        );

        assertThat(resolution.scheduleRefined()).isTrue();
        assertThat(resolution.activePeriodStart())
            .isEqualTo(OffsetDateTime.parse("2026-08-24T08:00:00-04:00"));
        assertThat(resolution.activePeriodEnd())
            .isEqualTo(OffsetDateTime.parse("2026-08-24T09:00:00-04:00"));
    }

    @Test
    void refinesEachDateInARecurringLateOpeningIndependently() {
        TtcAlertRecord record = multiDateLateOpeningRecord();
        when(repository.firstDepartureSeconds(
            "line-2", LocalDate.parse("2026-08-23"), List.of("st-george", "chester")
        )).thenReturn(Optional.of(8 * 3600 + 7 * 60));
        when(repository.firstDepartureSeconds(
            "line-2", LocalDate.parse("2026-08-24"), List.of("st-george", "chester")
        )).thenReturn(Optional.of(6 * 3600 + 5 * 60));
        when(repository.firstDepartureSeconds(
            "line-2", LocalDate.parse("2026-08-25"), List.of("st-george", "chester")
        )).thenReturn(Optional.of(6 * 3600 + 6 * 60));

        TtcLateOpeningWindowResolver.Resolution resolution = resolve(record);

        assertThat(resolution.scheduleRefined()).isTrue();
        assertThat(resolution.periods()).hasSize(3);
        assertThat(resolution.periods())
            .extracting(NormalizedAlertPeriod::startsAt)
            .containsExactly(
                OffsetDateTime.parse("2026-08-23T08:07:00-04:00"),
                OffsetDateTime.parse("2026-08-24T06:05:00-04:00"),
                OffsetDateTime.parse("2026-08-25T06:06:00-04:00")
            );
        assertThat(resolution.activePeriodStart())
            .isEqualTo(OffsetDateTime.parse("2026-08-23T08:07:00-04:00"));
        assertThat(resolution.activePeriodEnd())
            .isEqualTo(OffsetDateTime.parse("2026-08-25T11:00:00-04:00"));
    }

    @Test
    void keepsThePublishedHoursFallbackWhenScheduleStorageIsUnavailable() {
        TtcAlertRecord record = lateOpeningRecord();
        when(repository.firstDepartureSeconds(
            "line-2",
            LocalDate.parse("2026-08-23"),
            List.of("st-george", "chester")
        )).thenThrow(new DataAccessResourceFailureException("schedule unavailable"));

        TtcLateOpeningWindowResolver.Resolution resolution = resolve(record);

        assertThat(resolution.scheduleRefined()).isFalse();
        assertThat(resolution.activePeriodStart())
            .isEqualTo(OffsetDateTime.parse("2026-08-23T08:00:00-04:00"));
    }

    private TtcLateOpeningWindowResolver.Resolution resolve(TtcAlertRecord record) {
        List<NormalizedAlertPeriod> periods = java.util.stream.IntStream
            .range(0, record.childAlerts().size())
            .mapToObj(index -> {
                TtcAlertChildPeriod child = record.childAlerts().get(index);
                return new NormalizedAlertPeriod(
                    child.id(), child.startTime(), child.endTime(), index
                );
            })
            .toList();
        return resolver.resolve(
            record,
            "line-2",
            List.of("st-george", "chester"),
            periods,
            record.activePeriod().start(),
            record.activePeriod().end()
        );
    }

    private TtcAlertRecord lateOpeningRecord() {
        return new TtcSubwayClosureParser().parse(
            "late-opening",
            URI.create("https://www.ttc.ca/service-advisories/subway-service/late-opening"),
            """
                <html><body>
                  <h1>
                    <span class="field-routename">Line 2 (Bloor-Danforth)</span>
                    <span class="field-satitle">St George to Chester stations – Late opening at 11 a.m. – Sunday, August 23, 2026</span>
                  </h1>
                  <div class="sa-effective-date">
                    <span class="field-starteffectivedate">August 23, 2026</span>
                    <span class="field-endeffectivedate">August 23, 2026</span>
                  </div>
                  <div class="component content"><div class="u-type--body">
                    Subway service on Line 2 between St George and Chester stations will start at 11 a.m. due to planned work.
                  </div></div>
                </body></html>
                """
        ).record();
    }

    private TtcAlertRecord weekdayLateOpeningRecord() {
        return new TtcSubwayClosureParser().parse(
            "weekday-late-opening",
            URI.create("https://www.ttc.ca/service-advisories/subway-service/weekday-late-opening"),
            """
                <html><body>
                  <h1>
                    <span class="field-routename">Line 2 (Bloor-Danforth)</span>
                    <span class="field-satitle">St George to Chester stations – Late opening at 9 a.m. – Monday, August 24, 2026</span>
                  </h1>
                  <div class="sa-effective-date">
                    <span class="field-starteffectivedate">August 24, 2026</span>
                    <span class="field-endeffectivedate">August 24, 2026</span>
                  </div>
                  <div class="component content"><div class="u-type--body">
                    Subway service on Line 2 between St George and Chester stations will start at 9 a.m. due to planned work.
                  </div></div>
                </body></html>
                """
        ).record();
    }

    private TtcAlertRecord multiDateLateOpeningRecord() {
        return new TtcSubwayClosureParser().parse(
            "multi-date-late-opening",
            URI.create("https://www.ttc.ca/service-advisories/subway-service/multi-date"),
            """
                <html><body>
                  <h1>
                    <span class="field-routename">Line 2 (Bloor-Danforth)</span>
                    <span class="field-satitle">St George to Chester stations – Late openings at 11 a.m. – August 23 to 25, 2026</span>
                  </h1>
                  <div class="sa-effective-date">
                    <span class="field-starteffectivedate">August 23, 2026</span>
                    <span class="field-endeffectivedate">August 25, 2026</span>
                  </div>
                  <div class="component content"><div class="u-type--body">
                    Subway service between St George and Chester stations will start at 11 a.m. each day due to planned work.
                  </div></div>
                </body></html>
                """
        ).record();
    }
}
