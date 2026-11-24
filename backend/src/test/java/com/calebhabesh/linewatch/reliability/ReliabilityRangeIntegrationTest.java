package com.calebhabesh.linewatch.reliability;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.calebhabesh.linewatch.reliability.ReliabilityDerivationIntegrationTest.MutableClock;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.ClassMetric;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.EpisodesResponse;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.PatternCell;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.SeriesBucket;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.SummaryResponse;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.SummaryRow;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;

/**
 * Plan 17 A7 range API over the derived read model and the live slice, against the local
 * PostGIS test database (skips when unreachable).
 *
 * <p>Fixture (TTC Line 1, stations Bloor-Yonge, Union and St George, service 06:00 to 01:00):
 * Nov 20, 21, 23 and 24 have a schedule day; Nov 22 has none, so it is a gap. Polling runs from
 * Nov 19 23:55 to now (Nov 24 12:00). Episodes: a 60 minute delay at Bloor-Yonge on Friday
 * Nov 20 08:00, a 30 minute suspension at Union and St George on Nov 21 10:00, a 60 minute
 * whole-line slow zone on Nov 23 07:00, and a delay at Bloor-Yonge open since 10:00 today.
 */
@SpringJUnitConfig(classes = ReliabilityRangeIntegrationTest.TestConfig.class)
class ReliabilityRangeIntegrationTest {
    private static final String DEFAULT_URL = "jdbc:postgresql://127.0.0.1:5434/linewatch_test";
    private static final Instant TODAY_NOON = Instant.parse("2026-11-24T17:00:00Z");
    private static final LocalDate D1 = LocalDate.parse("2026-11-20");
    private static final LocalDate D2 = LocalDate.parse("2026-11-21");
    private static final LocalDate GAP = LocalDate.parse("2026-11-22");
    private static final LocalDate YESTERDAY = LocalDate.parse("2026-11-23");
    private static final LocalDate TODAY = LocalDate.parse("2026-11-24");
    private static final List<String> STATIONS = List.of("bloor-yonge", "union", "st-george");

    @Autowired private ReliabilityDerivationService derivation;
    @Autowired private ReliabilityObservationRollup rollup;
    @Autowired private ReliabilityRangeService ranges;
    @Autowired private ReliabilityService reliabilityService;
    @Autowired private NamedParameterJdbcTemplate jdbc;
    @Autowired private MutableClock clock;

    @BeforeAll
    static void setUpDatabase() {
        Assumptions.assumeTrue(isDatabaseAvailable(), "PostgreSQL database must be reachable on port 5434");
        Flyway.configure().dataSource(createDataSource()).load().migrate();
    }

    /** Other integration tests extract every alert in their windows, so none of these may outlive a test. */
    @AfterEach
    void removeFixture() {
        clearTables();
    }

    private void clearTables() {
        jdbc.getJdbcTemplate().execute("""
            delete from reliability_episodes;
            delete from reliability_line_days;
            delete from reliability_station_days;
            delete from reliability_derivations;
            update reliability_methodology set current_version = 1, switched_at = now() where id = 1;
            delete from reliability_observation_windows;
            delete from reliability_service_spans;
            delete from reliability_schedule_days;
            delete from ingestion_runs where run_type in ('alerts', 'metrolinx-alerts');
            delete from alert_active_periods where alert_id like 'a5-%' or alert_id like 'a7-%';
            delete from snapshots where alert_id like 'a5-%' or alert_id like 'a7-%';
            delete from alert_stations where alert_id like 'a5-%' or alert_id like 'a7-%';
            delete from alerts where id like 'a5-%' or id like 'a7-%';
            delete from regional_alert_snapshots where alert_id like 'a5-%';
            delete from regional_alerts where id like 'a5-%';
            delete from regional_train_cancellations where trip_id like 'a9-%';
            delete from regional_train_cancellation_tracking;
            """);
    }

    @BeforeEach
    void seedFixture() {
        clock.set(TODAY_NOON);
        clearTables();
        seedPolls("2026-11-19 23:55:00-05", "2026-11-24 12:00:00-05");
        rollup.rollUp("ttc");
        for (LocalDate date : List.of(D1, D2, YESTERDAY, TODAY)) {
            seedScheduleDay(date);
            String start = date + " 06:00:00-05";
            String end = date.plusDays(1) + " 01:00:00-05";
            seedSpan("", date, start, end);
            for (String station : STATIONS) seedSpan(station, date, start, end);
        }

        seedAlert("a7-delay", "delay", "TECHNICAL_PROBLEM", List.of("bloor-yonge"), false);
        seedSnapshot("a7-delay", "delay", true, "2026-11-20 08:00:00-05", "Line 1: Delays near Bloor-Yonge");
        seedSnapshot("a7-delay", "delay", false, "2026-11-20 09:00:00-05", null);

        seedAlert("a7-susp", "suspension", null, List.of("union", "st-george"), false);
        seedSnapshot("a7-susp", "suspension", true, "2026-11-21 10:00:00-05", null);
        seedSnapshot("a7-susp", "suspension", false, "2026-11-21 10:30:00-05", null);

        seedAlert("a7-rsz", "reduced-speed-zone", null, List.of(), false);
        seedSnapshot("a7-rsz", "reduced-speed-zone", true, "2026-11-23 07:00:00-05", null);
        seedSnapshot("a7-rsz", "reduced-speed-zone", false, "2026-11-23 08:00:00-05", null);

        seedAlert("a7-today", "delay", null, List.of("bloor-yonge"), true);
        seedSnapshot("a7-today", "delay", true, "2026-11-24 10:00:00-05", "Line 1: Delays at Bloor-Yonge");

        derivation.rebuildAndSwitch(2);
    }

    @Test
    void summaryClipsToFirstAnalyzableDateAndCombinesDerivedDaysWithTodaySoFar() {
        SummaryResponse summary = ranges.summary(request("2026-11-01", "2026-11-24", null, null));

        assertThat(summary.methodologyVersion()).isEqualTo(2);
        assertThat(summary.range().clipped()).isTrue();
        assertThat(summary.range().from()).isEqualTo(D1);
        assertThat(summary.range().firstAnalyzableDate()).isEqualTo(D1);
        assertThat(summary.range().days()).isEqualTo(5);
        assertThat(summary.range().includesToday()).isTrue();
        assertThat(summary.coverage().totalDays()).isEqualTo(5);
        assertThat(summary.coverage().analyzableDays()).isEqualTo(4);
        assertThat(summary.coverage().schedulePercentage()).isEqualTo(80.0);

        assertThat(summary.rows()).singleElement().satisfies(row -> {
            assertThat(row.id()).isEqualTo("line-1");
            assertThat(row.label()).isEqualTo("Yonge-University");
            assertThat(row.incidents()).isEqualTo(4);
            assertThat(row.activeIncidents()).isEqualTo(1);
            assertThat(row.uniqueMinutes()).isEqualTo(60 + 30 + 60 + 120);
            // Station-weighted: 60 × 1/3 + 30 × 2/3 + 60 × 1 (whole line) + 120 × 1/3.
            assertThat(row.weightedImpactMinutes()).isEqualTo(140.0);
            assertThat(row.medianTimeToClearMinutes()).isEqualTo(60L);
            assertThat(row.p90TimeToClearMinutes()).isEqualTo(60L);
        });
        assertThat(summary.totals().incidents()).isEqualTo(4);
        assertThat(summary.totals().classes()).extracting(ClassMetric::disruptionClass, ClassMetric::incidents, ClassMetric::uniqueMinutes)
            .containsExactly(
                org.assertj.core.groups.Tuple.tuple("service-stopped", 1L, 30L),
                org.assertj.core.groups.Tuple.tuple("delay", 2L, 180L),
                org.assertj.core.groups.Tuple.tuple("slow-zone", 1L, 60L));
        assertThat(summary.causes()).extracting(ReliabilityRangeResponses.CauseBreakdown::label)
            .contains("Technical Problem", "Unknown Cause");
        assertThat(summary.previous()).isNull();
        assertThat(summary.previousUnavailableReason()).contains("History starts 2026-11-20");
        assertThat(summary.durations().all().clearedCount()).isEqualTo(3);
        assertThat(summary.durations().unplanned().clearedCount()).isEqualTo(3);
        assertThat(summary.durations().planned().clearedCount()).isZero();
        assertThat(summary.durations().buckets()).extracting(b -> b.id() + ":" + b.total())
            .contains("30-59:1", "60-119:2");
    }

    @Test
    void summaryRowsMatchTheThirtyDayLinesEndpoint() {
        ReliabilityResponses.ReliabilityMetric line = reliabilityService.lines("ttc").metrics().getFirst();
        SummaryRow row = ranges.summary(request("2026-10-26", "2026-11-24", null, null)).rows().getFirst();

        assertThat(row.incidents()).isEqualTo(line.incidents());
        assertThat(row.activeIncidents()).isEqualTo(line.activeIncidents());
        assertThat(row.observedMinutes()).isEqualTo(line.observedServiceMinutes());
        assertThat(row.uniqueMinutes()).isEqualTo(line.serviceImpactMinutes());
        assertThat(row.weightedImpactMinutes()).isEqualTo(line.weightedImpactMinutes());
        assertThat(row.medianTimeToClearMinutes()).isEqualTo(line.medianDurationMinutes());
        assertThat(row.classes()).extracting(ClassMetric::weightedSharePercentage)
            .containsExactlyElementsOf(line.classes().stream()
                .map(ReliabilityResponses.DisruptionClassMetric::weightedSharePercentage).toList());
    }

    @Test
    void previousPeriodIsReturnedWhenItIsFullyAnalyzable() {
        SummaryResponse summary = ranges.summary(request("2026-11-23", "2026-11-24", null, null));

        assertThat(summary.previous()).isNotNull();
        assertThat(summary.previous().from()).isEqualTo(D2);
        assertThat(summary.previous().to()).isEqualTo(GAP);
        assertThat(summary.previous().totals().incidents()).isEqualTo(1);
        assertThat(summary.previous().coverage().analyzableDays()).isEqualTo(1);
    }

    @Test
    void seriesBucketsCarryTheirOwnCoverageLeaveGapsEmptyAndSumToTheSummary() {
        var series = ranges.series(request("2026-11-20", "2026-11-24", null, null), "day");

        assertThat(series.buckets()).extracting(SeriesBucket::from).containsExactly(D1, D2, GAP, YESTERDAY, TODAY);
        assertThat(series.buckets()).extracting(SeriesBucket::uniqueMinutes).containsExactly(60L, 30L, null, 60L, 120L);
        assertThat(series.buckets()).extracting(SeriesBucket::incidents).containsExactly(1L, 1L, null, 1L, 1L);
        SeriesBucket gap = series.buckets().get(2);
        assertThat(gap.analyzableDays()).isZero();
        assertThat(gap.schedulePercentage()).isZero();
        assertThat(gap.weightedSharePercentage()).isNull();
        assertThat(series.buckets().getLast().includesToday()).isTrue();

        SummaryResponse summary = ranges.summary(request("2026-11-20", "2026-11-24", null, null));
        assertThat(series.buckets().stream().mapToLong(SeriesBucket::observedMinutes).sum())
            .isEqualTo(summary.totals().observedMinutes());
        assertThat(series.buckets().stream().filter(bucket -> bucket.weightedMinutes() != null)
            .mapToDouble(SeriesBucket::weightedMinutes).sum()).isEqualTo(summary.totals().weightedImpactMinutes());

        var weekly = ranges.series(request("2026-11-20", "2026-11-24", null, null), "week");
        assertThat(weekly.buckets()).extracting(SeriesBucket::from, SeriesBucket::to, SeriesBucket::incidents)
            .containsExactly(
                org.assertj.core.groups.Tuple.tuple(D1, GAP, 2L),
                org.assertj.core.groups.Tuple.tuple(YESTERDAY, TODAY, 2L));
    }

    @Test
    void stationScopedSummaryHotspotsAndStationSeriesUseStationDays() {
        SummaryResponse byStation = ranges.summary(request("2026-11-20", "2026-11-24", "line-1", null));
        assertThat(byStation.scope()).isEqualTo("stations");
        assertThat(byStation.rows()).extracting(SummaryRow::id, SummaryRow::incidents, SummaryRow::uniqueMinutes)
            .contains(
                org.assertj.core.groups.Tuple.tuple("bloor-yonge", 2L, 180L),
                org.assertj.core.groups.Tuple.tuple("union", 1L, 30L),
                org.assertj.core.groups.Tuple.tuple("st-george", 1L, 30L));
        assertThat(byStation.totals().incidents()).isEqualTo(4);

        var hotspots = ranges.hotspots(request("2026-11-20", "2026-11-24", null, null), "minutes", 2, null);
        assertThat(hotspots.stations()).extracting(h -> h.rank() + ":" + h.stationId() + ":" + h.incidents())
            .containsExactly("1:bloor-yonge:2", "2:st-george:1");
        assertThat(hotspots.stations().getFirst().stationName()).isEqualTo("Bloor-Yonge");
        var stopped = ranges.hotspots(request("2026-11-20", "2026-11-24", null, null), "minutes", 5, "service-stopped");
        assertThat(stopped.disruptionClass()).isEqualTo("service-stopped");
        assertThat(stopped.stations()).extracting(h -> h.stationId() + ":" + h.uniqueMinutes() + ":" + h.incidents())
            .containsExactly("st-george:30:1", "union:30:1");

        var stationSeries = ranges.series(request("2026-11-20", "2026-11-24", null, "union"), "day");
        assertThat(stationSeries.scope()).isEqualTo("station");
        assertThat(stationSeries.buckets()).extracting(SeriesBucket::uniqueMinutes).containsExactly(0L, 30L, null, 0L, 0L);
    }

    @Test
    void episodesPageNewestFirstWithAlertHistoryTitlesAndNoBodyText() {
        EpisodesResponse first = ranges.episodes(request("2026-11-20", "2026-11-24", null, null), null, 2);
        assertThat(first.episodes()).extracting(ReliabilityRangeResponses.EpisodeItem::impactKind)
            .containsExactly("delay", "reduced-speed-zone");
        var today = first.episodes().getFirst();
        assertThat(today.active()).isTrue();
        assertThat(today.closedAt()).isNull();
        assertThat(today.countedMinutes()).isEqualTo(120);
        assertThat(today.title()).isEqualTo("Line 1: Delays at Bloor-Yonge");
        assertThat(first.episodes().get(1).title()).isEqualTo("Line 1 Reduced Speed Zone");
        assertThat(first.nextCursor()).isNotNull();

        EpisodesResponse second = ranges.episodes(request("2026-11-20", "2026-11-24", null, null), first.nextCursor(), 2);
        assertThat(second.episodes()).extracting(ReliabilityRangeResponses.EpisodeItem::impactKind)
            .containsExactly("suspension", "delay");
        assertThat(second.episodes().getLast().title()).isEqualTo("Line 1: Delays near Bloor-Yonge");
        assertThat(second.episodes().getLast().causeLabel()).isEqualTo("Technical Problem");
        assertThat(second.episodes().get(0).planned()).isFalse();
        assertThat(second.nextCursor()).isNull();

        EpisodesResponse atUnion = ranges.episodes(request("2026-11-20", "2026-11-24", null, "union"), null, 10);
        assertThat(atUnion.episodes()).extracting(ReliabilityRangeResponses.EpisodeItem::impactKind).containsExactly("suspension");
        assertThat(atUnion.totalCount()).isEqualTo(1);
        assertThat(atUnion.episodes().getFirst().alertId()).isEqualTo("a7-susp");

        var byClass = ranges.episodes(request("2026-11-20", "2026-11-24", null, null), null, 10,
            new ReliabilityRangeService.EpisodeFilter("slow-zone", null, null, null, null, null, null, null, null, "recent"));
        assertThat(byClass.totalCount()).isEqualTo(1);
        assertThat(byClass.episodes().getFirst().alertId()).isEqualTo("a7-rsz");

        var byCause = ranges.episodes(request("2026-11-20", "2026-11-24", null, null), null, 10,
            new ReliabilityRangeService.EpisodeFilter(null, null, "TECHNICAL_PROBLEM", null, null, null, null, null, null, "recent"));
        assertThat(byCause.episodes()).extracting(ReliabilityRangeResponses.EpisodeItem::alertId).containsExactly("a7-delay");

        var byHour = ranges.episodes(request("2026-11-20", "2026-11-24", null, null), null, 10,
            new ReliabilityRangeService.EpisodeFilter(null, null, null, null, null, null, null, 5, 8, "recent"));
        assertThat(byHour.episodes()).extracting(ReliabilityRangeResponses.EpisodeItem::alertId).containsExactly("a7-delay");

        var longest = ranges.episodes(request("2026-11-20", "2026-11-24", null, null), null, 2,
            new ReliabilityRangeService.EpisodeFilter(null, null, null, null, null, null, null, null, null, "longest"));
        assertThat(longest.sort()).isEqualTo("longest");
        assertThat(longest.totalCount()).isEqualTo(4);
        assertThat(longest.episodes()).extracting(ReliabilityRangeResponses.EpisodeItem::countedMinutes)
            .containsExactly(120L, 60L);
        var longestPage2 = ranges.episodes(request("2026-11-20", "2026-11-24", null, null), longest.nextCursor(), 2,
            new ReliabilityRangeService.EpisodeFilter(null, null, null, null, null, null, null, null, null, "longest"));
        assertThat(longestPage2.episodes()).extracting(ReliabilityRangeResponses.EpisodeItem::countedMinutes)
            .containsExactly(60L, 30L);
    }

    @Test
    void seriesByLineReturnsPerLineMetricsInOneRequestAndCancellationsKeepOwnCoverage() {
        var byLine = ranges.series(request("2026-11-20", "2026-11-24", null, null), "day", true);
        assertThat(byLine.buckets().get(0).lines()).isNotEmpty();
        assertThat(byLine.buckets().get(0).lines().stream().filter(l -> "line-1".equals(l.lineId())).findFirst())
            .isPresent().get().satisfies(l -> {
                assertThat(l.uniqueMinutes()).isEqualTo(60L);
                assertThat(l.delayShare()).isGreaterThan(0.0);
            });
        // Gap day has empty per-line list.
        assertThat(byLine.buckets().get(2).lines()).isEmpty();

        // Regional cancellations trend keeps its own tracking coverage independent of schedule gaps.
        jdbc.update("""
            insert into ingestion_runs (run_type, status, started_at, completed_at)
            select 'metrolinx-alerts', 'success', at, at
            from generate_series(cast('2026-11-20 23:55:00-05' as timestamptz), cast('2026-11-24 12:00:00-05' as timestamptz), interval '5 minutes') at
            """, new MapSqlParameterSource());
        rollup.rollUp("regional");
        jdbc.update("""
            insert into regional_train_cancellation_tracking (id, started_at)
            values (1, cast('2026-11-21 00:00:00-05' as timestamptz))
            """, new MapSqlParameterSource());
        jdbc.update("""
            insert into regional_train_cancellations (service_date, line_id, trip_id, trip_number, scheduled_start_at, schedule_matched, station_ids, source_systems, first_seen_at, last_seen_at)
            values
              (date '2026-11-21', 'regional-lw', 'a9-1', '1001', cast('2026-11-21 08:00:00-05' as timestamptz), true, '["union"]'::jsonb, '["go"]'::jsonb, cast('2026-11-21 07:30:00-05' as timestamptz), cast('2026-11-21 08:00:00-05' as timestamptz)),
              (date '2026-11-21', 'regional-ki', 'a9-2', '2001', cast('2026-11-21 09:00:00-05' as timestamptz), false, '["union"]'::jsonb, '["go"]'::jsonb, cast('2026-11-21 08:30:00-05' as timestamptz), cast('2026-11-21 09:00:00-05' as timestamptz)),
              (date '2026-11-23', 'regional-lw', 'a9-3', '1003', cast('2026-11-23 17:00:00-05' as timestamptz), true, '["union"]'::jsonb, '["go"]'::jsonb, cast('2026-11-23 16:30:00-05' as timestamptz), cast('2026-11-23 17:00:00-05' as timestamptz))
            """, new MapSqlParameterSource());

        var cancels = ranges.cancellations(
            ReliabilityRangeRequest.parse("regional", "2026-11-20", "2026-11-24", null, null, TODAY), "day");
        // Nov 20 is before tracking started -> null count (gap).
        assertThat(cancels.buckets().get(0).trackedDays()).isZero();
        assertThat(cancels.buckets().get(0).cancellations()).isNull();
        // Nov 21 has 2 cancellations across LW and KI.
        assertThat(cancels.buckets().get(1).cancellations()).isEqualTo(2L);
        assertThat(cancels.buckets().get(1).scheduleMatchedCancellations()).isEqualTo(1L);
        assertThat(cancels.buckets().get(1).corridors()).hasSize(2);
        // Nov 22 is tracked with 0 cancellations.
        assertThat(cancels.buckets().get(2).cancellations()).isEqualTo(0L);
        assertThat(cancels.totals().cancellations()).isEqualTo(3L);
        assertThat(cancels.coverage().trackedDays()).isEqualTo(4);
    }

    @Test
    void patternsPlaceMinutesInTorontoHourOfWeekCells() {
        var patterns = ranges.patterns(request("2026-11-20", "2026-11-24", null, null));
        assertThat(patterns.cells()).hasSize(168);
        PatternCell fridayEight = patterns.cells().get(4 * 24 + 8);
        assertThat(fridayEight.dayOfWeek()).isEqualTo(5);
        assertThat(fridayEight.hour()).isEqualTo(8);
        assertThat(fridayEight.anyAlertMinutes()).isEqualTo(60);
        assertThat(fridayEight.classMinutes()).containsEntry("delay", 60L).containsEntry("service-stopped", 0L);
        assertThat(fridayEight.observedMinutes()).isEqualTo(60);
        // Tuesday (today) 10:00 and 11:00 hold the open delay; 12:00 is not observed yet.
        assertThat(patterns.cells().get(24 + 10).anyAlertMinutes()).isEqualTo(60);
        assertThat(patterns.cells().get(24 + 11).anyAlertMinutes()).isEqualTo(60);
        assertThat(patterns.cells().get(24 + 12).observedMinutes()).isZero();
        // Sunday Nov 22 has no schedule day: nothing counted.
        assertThat(patterns.cells().get(6 * 24 + 8).observedMinutes()).isZero();
    }

    @Test
    void exportWritesOneRowPerLineDayAndFlagsTodaySoFar() {
        var file = ranges.export(request("2026-11-20", "2026-11-24", null, null));
        String[] lines = file.csv().split("\r\n");
        assertThat(lines[0]).startsWith("service_date,network_id,line_id,line_name,scheduled_minutes,observed_minutes,any_alert_minutes");
        assertThat(file.rows()).isEqualTo(4);
        assertThat(lines).hasSize(5);
        assertThat(lines[1]).startsWith("2026-11-20,ttc,line-1,Yonge-University,1140,1140,60,20.0,60,0,0.0,60,20.0,0,0.0,false,2");
        assertThat(lines[4]).startsWith("2026-11-24,ttc,line-1,Yonge-University,360,").endsWith(",true,2");
        assertThat(file.filename()).isEqualTo("linewatchto-reliability-ttc-2026-11-20-to-2026-11-24.csv");

        var stationFile = ranges.export(request("2026-11-20", "2026-11-24", null, "union"));
        assertThat(stationFile.csv().split("\r\n")[0]).contains("station_id,station_name");
        assertThat(stationFile.csv()).contains("2026-11-21,ttc,line-1,Yonge-University,union,Union,1140,1140,30,30.0");
    }

    @Test
    void availabilityListsEachDayFromHistoryStartWithItsCoverage() {
        var availability = ranges.availability("ttc");
        assertThat(availability.firstAnalyzableDate()).isEqualTo(D1);
        assertThat(availability.derivedThrough()).isEqualTo(YESTERDAY);
        assertThat(availability.methodologyVersion()).isEqualTo(2);
        assertThat(availability.days()).extracting(ReliabilityRangeResponses.AvailabilityDay::date)
            .containsExactly(D1, D2, GAP, YESTERDAY, TODAY);
        assertThat(availability.days().get(2).scheduleDay()).isFalse();
        assertThat(availability.days().get(2).analyzable()).isFalse();
        assertThat(availability.days().get(0).pollingPercentage()).isEqualTo(100.0);
        assertThat(availability.days().getLast().today()).isTrue();
        assertThat(availability.days().getLast().pollingPercentage()).isEqualTo(100.0);
    }

    @Test
    void rangeBeforeHistoryIsEmptyAndUnknownScopesAreRefused() {
        SummaryResponse before = ranges.summary(request("2026-11-01", "2026-11-19", null, null));
        assertThat(before.range().from()).isNull();
        assertThat(before.rows()).isEmpty();
        assertThat(before.message()).contains("History starts 2026-11-20");

        assertThatThrownBy(() -> ranges.summary(request("2026-11-20", "2026-11-24", "line-9", null)))
            .isInstanceOfSatisfying(ReliabilityRangeException.class, e -> assertThat(e.getError()).isEqualTo("invalid_line"));
        assertThatThrownBy(() -> ranges.summary(request("2026-11-20", "2026-11-24", null, "kipling-nowhere")))
            .isInstanceOfSatisfying(ReliabilityRangeException.class, e -> assertThat(e.getError()).isEqualTo("invalid_station"));
        assertThatThrownBy(() -> ranges.summary(request("2026-11-20", "2026-11-24", "line-2", "union")))
            .isInstanceOfSatisfying(ReliabilityRangeException.class, e -> assertThat(e.getError()).isEqualTo("invalid_station"));
    }

    private static ReliabilityRangeRequest request(String from, String to, String line, String station) {
        return ReliabilityRangeRequest.parse("ttc", from, to, line, station, TODAY);
    }

    private void seedPolls(String fromTs, String toTs) {
        jdbc.update("""
            insert into ingestion_runs (run_type, status, started_at, completed_at)
            select 'alerts', 'success', at, at
            from generate_series(cast(:fromTs as timestamptz), cast(:toTs as timestamptz), interval '5 minutes') at
            """, new MapSqlParameterSource().addValue("fromTs", fromTs).addValue("toTs", toTs));
    }

    private void seedScheduleDay(LocalDate date) {
        jdbc.update("""
            insert into reliability_schedule_days (network_id, source_system, service_date, import_id, feed_version, source_kind, captured_at)
            values ('ttc', 'ttc', :date, 1, 'test', 'import', now())
            on conflict do nothing
            """, new MapSqlParameterSource("date", date));
    }

    private void seedSpan(String stationId, LocalDate date, String startTs, String endTs) {
        jdbc.update("""
            insert into reliability_service_spans (network_id, line_id, station_id, service_date, source_system, starts_at, ends_at)
            values ('ttc', 'line-1', :stationId, :date, 'ttc', cast(:startTs as timestamptz), cast(:endTs as timestamptz))
            """, new MapSqlParameterSource()
                .addValue("stationId", stationId)
                .addValue("date", date)
                .addValue("startTs", startTs)
                .addValue("endTs", endTs));
    }

    private void seedAlert(String id, String impactKind, String cause, List<String> stations, boolean active) {
        String severity = "suspension".equals(impactKind) ? "suspension" : "delay";
        jdbc.update("""
            insert into alerts (id, source_id, type, severity, title, description, active, line_id, cause, impact_kind)
            values (:id, :id, 'active-alert', :severity, 'Test alert', 'Provider body text', :active, 'line-1', :cause, :impactKind)
            """, new MapSqlParameterSource()
                .addValue("id", id)
                .addValue("severity", severity)
                .addValue("active", active)
                .addValue("cause", cause)
                .addValue("impactKind", impactKind));
        for (int i = 0; i < stations.size(); i++) {
            jdbc.update("""
                insert into alert_stations (alert_id, station_id, sort_order)
                values (:alertId, :stationId, :sortOrder)
                """, new MapSqlParameterSource()
                    .addValue("alertId", id)
                    .addValue("stationId", stations.get(i))
                    .addValue("sortOrder", i));
        }
    }

    private void seedSnapshot(String alertId, String impactKind, boolean active, String snapshotTs, String title) {
        jdbc.update("""
            insert into snapshots (alert_id, source_id, line_id, severity, title, description, snapshot_time, active, impact_kind)
            values (:alertId, :alertId, 'line-1', 'delay', :title, 'Provider body text', cast(:ts as timestamptz), :active, :impactKind)
            """, new MapSqlParameterSource()
                .addValue("alertId", alertId)
                .addValue("title", title)
                .addValue("ts", snapshotTs)
                .addValue("active", active)
                .addValue("impactKind", impactKind));
    }

    private static boolean isDatabaseAvailable() {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress("127.0.0.1", 5434), 500);
            return true;
        } catch (Exception exception) {
            return false;
        }
    }

    private static DataSource createDataSource() {
        return new DriverManagerDataSource(
            System.getProperty("spring.datasource.url", System.getenv().getOrDefault("SPRING_DATASOURCE_URL", DEFAULT_URL)),
            System.getProperty("spring.datasource.username", System.getenv().getOrDefault("SPRING_DATASOURCE_USERNAME", "linewatch")),
            System.getProperty("spring.datasource.password", System.getenv().getOrDefault("SPRING_DATASOURCE_PASSWORD", "linewatch_dev_password"))
        );
    }

    @Configuration
    @EnableTransactionManagement
    static class TestConfig {
        @Bean DataSource dataSource() { return createDataSource(); }
        @Bean PlatformTransactionManager transactionManager(DataSource ds) { return new DataSourceTransactionManager(ds); }
        @Bean NamedParameterJdbcTemplate jdbc(DataSource ds) { return new NamedParameterJdbcTemplate(ds); }
        @Bean MutableClock clock() { return new MutableClock(TODAY_NOON); }
        @Bean ReliabilityScheduleCapture scheduleCapture(NamedParameterJdbcTemplate jdbc, MutableClock clock) {
            return new ReliabilityScheduleCapture(jdbc, clock);
        }
        @Bean ReliabilityObservationRollup observationRollup(NamedParameterJdbcTemplate jdbc, MutableClock clock) {
            return new ReliabilityObservationRollup(jdbc, clock);
        }
        @Bean ReliabilityEpisodeSource episodeSource(NamedParameterJdbcTemplate jdbc) {
            return new ReliabilityEpisodeSource(jdbc);
        }
        @Bean ReliabilityDerivationService derivationService(
            NamedParameterJdbcTemplate jdbc,
            ReliabilityScheduleCapture scheduleCapture,
            ReliabilityObservationRollup observationRollup,
            ReliabilityEpisodeSource episodeSource,
            PlatformTransactionManager txManager,
            MutableClock clock
        ) {
            return new ReliabilityDerivationService(jdbc, scheduleCapture, observationRollup, episodeSource, txManager, clock);
        }
        @Bean ReliabilityRepository reliabilityRepository(
            NamedParameterJdbcTemplate jdbc,
            ReliabilityScheduleCapture scheduleCapture,
            ReliabilityObservationRollup observationRollup,
            ReliabilityEpisodeSource episodeSource,
            MutableClock clock
        ) {
            return new ReliabilityRepository(jdbc, scheduleCapture, observationRollup, episodeSource, clock);
        }
        @Bean ReliabilityService reliabilityService(ReliabilityRepository repository, MutableClock clock) {
            return new ReliabilityService(repository, clock);
        }
        @Bean ReliabilityRangeRepository rangeRepository(NamedParameterJdbcTemplate jdbc) {
            return new ReliabilityRangeRepository(jdbc);
        }
        @Bean ReliabilityRangeService rangeService(
            ReliabilityRepository repository,
            ReliabilityRangeRepository rangeRepository,
            ReliabilityDerivationService derivation,
            ReliabilityScheduleCapture scheduleCapture,
            ReliabilityObservationRollup observationRollup,
            MutableClock clock
        ) {
            return new ReliabilityRangeService(repository, rangeRepository, derivation, scheduleCapture, observationRollup, clock);
        }
    }
}
