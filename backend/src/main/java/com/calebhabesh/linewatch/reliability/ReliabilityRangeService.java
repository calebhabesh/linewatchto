package com.calebhabesh.linewatch.reliability;

import com.calebhabesh.linewatch.alert.AlertCategoryLabels;
import com.calebhabesh.linewatch.arrival.schedule.GtfsServiceTime;
import com.calebhabesh.linewatch.reliability.ReliabilityDerivationService.LiveSlice;
import com.calebhabesh.linewatch.reliability.ReliabilityDerivationService.SliceDay;
import com.calebhabesh.linewatch.reliability.ReliabilityDerivationService.SliceEpisode;
import com.calebhabesh.linewatch.reliability.ReliabilityEpisodeSource.DisjointSpan;
import com.calebhabesh.linewatch.reliability.ReliabilityIntervalCalculator.TimeRange;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeRepository.DayFact;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeRepository.LineInfo;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeRepository.PollingDay;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeRepository.StationInfo;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeRepository.StoredEpisode;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeRepository.TitleSighting;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.AvailabilityDay;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.AvailabilityResponse;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.CauseBreakdown;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.ClassMetric;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.Coverage;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.EpisodeItem;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.EpisodesResponse;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.ExportFile;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.Hotspot;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.HotspotsResponse;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.PatternCell;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.PatternsResponse;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.PreviousPeriod;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.RangeInfo;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.SeriesBucket;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.SeriesResponse;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.Source;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.SummaryResponse;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.SummaryRow;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.Totals;
import com.calebhabesh.linewatch.reliability.ReliabilityRepository.AggregateRow;
import com.calebhabesh.linewatch.reliability.ReliabilityRepository.CancellationAggregation;
import com.calebhabesh.linewatch.reliability.ReliabilityRepository.EpisodeOutcome;
import com.calebhabesh.linewatch.reliability.ReliabilityRepository.ReliabilityAggregation;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.function.Predicate;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Plan 17 A7: reliability over any range of Toronto service dates. Completed dates come from
 * the derived read model; dates after {@code derived_through} (at most yesterday and today)
 * are computed on request with the derive job's rules and labelled "Today So Far". Dates
 * before the network's first analyzable date are clipped, and dates without a published
 * schedule or polling are gaps, never zero disruption.
 */
@Service
public class ReliabilityRangeService {
    static final int MAX_SERIES_BUCKETS = 400;
    static final int DEFAULT_HOTSPOTS = 20;
    static final int MAX_HOTSPOTS = 100;
    static final int DEFAULT_EPISODES = 50;
    static final int MAX_EPISODES = 100;
    static final int MAX_EXPORT_ROWS = 20_000;
    static final int MAX_CURSOR_LENGTH = 512;
    static final int MAX_AVAILABILITY_DAYS = 3_660;
    static final String TIME_ZONE = "America/Toronto";

    private final ReliabilityRepository reliability;
    private final ReliabilityRangeRepository ranges;
    private final ReliabilityDerivationService derivation;
    private final ReliabilityScheduleCapture scheduleCapture;
    private final ReliabilityObservationRollup observationRollup;
    private final Clock clock;

    public ReliabilityRangeService(
        ReliabilityRepository reliability,
        ReliabilityRangeRepository ranges,
        ReliabilityDerivationService derivation,
        ReliabilityScheduleCapture scheduleCapture,
        ReliabilityObservationRollup observationRollup,
        Clock clock
    ) {
        this.reliability = reliability;
        this.ranges = ranges;
        this.derivation = derivation;
        this.scheduleCapture = scheduleCapture;
        this.observationRollup = observationRollup;
        this.clock = clock;
    }

    public LocalDate today() {
        return LocalDate.now(clock.withZone(GtfsServiceTime.TORONTO));
    }

    public int currentMethodologyVersion() {
        return derivation.currentMethodologyVersion();
    }

    // ---------------------------------------------------------------- availability

    @Transactional(readOnly = true, timeout = 15)
    public AvailabilityResponse availability(String networkId) {
        ReliabilityDerivationService.MethodologyState methodology = derivation.methodologyState();
        int version = methodology.currentVersion();
        LocalDate today = today();
        OffsetDateTime now = OffsetDateTime.now(clock);
        LocalDate first = derivation.firstAnalyzableDate(networkId);
        Optional<ReliabilityDerivationService.DerivationStatus> status = derivation.derivationStatus(version, networkId);
        List<AvailabilityDay> days = List.of();
        if (first != null && !first.isAfter(today)) {
            LocalDate calendarStart = first.isBefore(today.minusDays(MAX_AVAILABILITY_DAYS - 1L))
                ? today.minusDays(MAX_AVAILABILITY_DAYS - 1L)
                : first;
            days = dailyCoverage(networkId, calendarStart, today, today, now).values().stream()
                .map(day -> new AvailabilityDay(
                    day.date(), day.pollingPercentage(), day.scheduleDay(), day.analyzable(), day.date().equals(today)))
                .toList();
        }
        String message = first == null
            ? "Reliability history begins with the first day that has both a published schedule and successful polling."
            : "History starts " + first + ". Days without a published schedule or successful polling are excluded.";
        return new AvailabilityResponse(
            networkId,
            version,
            methodology.switchedAt(),
            first,
            today,
            status.map(ReliabilityDerivationService.DerivationStatus::derivedThrough).orElse(null),
            status.map(ReliabilityDerivationService.DerivationStatus::status).orElse("never-run"),
            days,
            sources(networkId),
            message
        );
    }

    static List<Source> sources(String networkId) {
        if ("regional".equals(networkId)) {
            return List.of(
                new Source("metrolinx-alerts", "Metrolinx Alert History", "alerts"),
                new Source("go-gtfs", "GO Transit GTFS Schedule", "schedule"),
                new Source("up-gtfs", "UP Express GTFS Schedule", "schedule"),
                new Source("metrolinx-trip-changes", "Metrolinx Train Cancellations", "cancellations")
            );
        }
        return List.of(
            new Source("ttc-alerts", "LineWatch TTC Alert History", "alerts"),
            new Source("ttc-gtfs", "TTC GTFS Schedule", "schedule")
        );
    }

    // ---------------------------------------------------------------- summary

    @Transactional(readOnly = true, timeout = 30)
    public SummaryResponse summary(ReliabilityRangeRequest request) {
        Resolved range = resolve(request);
        String scope = request.lineId() == null ? "lines" : "stations";
        if (range.empty()) {
            return new SummaryResponse(
                request.networkId(), range.version(), range.info(), null, scope, request.lineId(), request.stationId(),
                emptyTotals(), List.of(), List.of(), List.of(), null, null,
                "Not enough history for the previous period.", range.emptyMessage());
        }
        OffsetDateTime until = range.until();
        ReliabilityAggregation aggregation = reliability.aggregateServiceDates(
            request.networkId(), request.stationId(), range.from(), range.to(), until);
        Coverage coverage = coverage(dailyCoverage(request.networkId(), range.from(), range.to(), range.today(), range.now()).values());

        Predicate<String> onLine = lineId -> request.lineId() == null || request.lineId().equals(lineId);
        List<AggregateRow> lineRows = aggregation.rows().stream().filter(row -> onLine.test(row.id())).toList();
        List<EpisodeOutcome> outcomes = aggregation.episodes().stream().filter(ep -> onLine.test(ep.lineId())).toList();
        boolean v2 = range.version() >= ReliabilityDerivationService.METHODOLOGY_V2;
        Totals totals = totals(lineRows, outcomes, v2);
        Map<String, LineInfo> lines = lineInfo(request.networkId());

        List<SummaryRow> rows;
        if (request.lineId() == null) {
            Map<String, List<EpisodeOutcome>> outcomesByLine = outcomes.stream()
                .collect(Collectors.groupingBy(EpisodeOutcome::lineId));
            rows = lineRows.stream()
                .map(row -> lineRow(request.networkId(), row, lines.get(row.id()),
                    outcomesByLine.getOrDefault(row.id(), List.of())))
                .toList();
        } else {
            Facts facts = facts(range, request.lineId(), request.stationId(), true);
            rows = stationRows(request, facts, v2);
        }

        ReliabilityResponses.TrainCancellationSummary cancellations = "regional".equals(request.networkId())
            ? ReliabilityService.trainCancellations(filterCancellations(aggregation.cancellations(), request.lineId()))
            : null;

        PreviousPeriod previous = null;
        String previousReason = null;
        int days = range.days();
        LocalDate previousTo = range.from().minusDays(1);
        LocalDate previousFrom = previousTo.minusDays(days - 1L);
        if (range.clipped()) {
            previousReason = "History starts " + range.firstAnalyzable() + ", so the previous " + days
                + " days are not analyzable.";
        } else if (previousFrom.isBefore(range.firstAnalyzable())) {
            previousReason = "The previous " + days + " days start before history starts on "
                + range.firstAnalyzable() + ".";
        } else {
            OffsetDateTime previousUntil = earlier(range.now(),
                ReliabilityObservationRollup.dayStart(previousTo.plusDays(2)));
            ReliabilityAggregation previousAggregation = reliability.aggregateServiceDates(
                request.networkId(), request.stationId(), previousFrom, previousTo, previousUntil);
            List<AggregateRow> previousRows = previousAggregation.rows().stream()
                .filter(row -> onLine.test(row.id())).toList();
            List<EpisodeOutcome> previousOutcomes = previousAggregation.episodes().stream()
                .filter(ep -> onLine.test(ep.lineId())).toList();
            Map<String, List<EpisodeOutcome>> previousByLine = previousOutcomes.stream()
                .collect(Collectors.groupingBy(EpisodeOutcome::lineId));
            previous = new PreviousPeriod(
                previousFrom,
                previousTo,
                coverage(dailyCoverage(request.networkId(), previousFrom, previousTo, range.today(), range.now()).values()),
                totals(previousRows, previousOutcomes, v2),
                request.lineId() != null ? List.of() : previousRows.stream()
                    .map(row -> lineRow(request.networkId(), row, lines.get(row.id()),
                        previousByLine.getOrDefault(row.id(), List.of())))
                    .toList()
            );
        }

        return new SummaryResponse(
            request.networkId(),
            range.version(),
            range.info(),
            coverage,
            scope,
            request.lineId(),
            request.stationId(),
            totals,
            rows,
            kindBreakdown(outcomes),
            "ttc".equals(request.networkId()) ? causeBreakdown(outcomes) : List.of(),
            cancellations,
            previous,
            previousReason,
            summaryMessage(request, range, aggregation)
        );
    }

    private String summaryMessage(ReliabilityRangeRequest request, Resolved range, ReliabilityAggregation aggregation) {
        if (aggregation.coveragePercentage() == 0) return "No retained alert lifecycle history is available for this range.";
        if (!aggregation.scheduleBacked()) {
            return "Published " + ("regional".equals(request.networkId()) ? "GO/UP" : "TTC")
                + " schedule coverage is unavailable for this range, so service-hour totals are withheld.";
        }
        String unit = "regional".equals(request.networkId()) ? "corridor" : "line";
        String base = range.version() >= ReliabilityDerivationService.METHODOLOGY_V2
            ? "Observed alerts during scheduled service and successful polling. Class shares weight each disruption by the share of scheduled stations affected; alerts without listed stations count as whole-" + unit + "."
            : "Observed alerts during scheduled service and successful polling. A " + unit + " counts as affected when there is an alert anywhere on it.";
        return base + " Days without a published schedule or polling are excluded."
            + (range.includesToday() ? " Includes Today So Far." : "");
    }

    // ---------------------------------------------------------------- series

    @Transactional(readOnly = true, timeout = 30)
    public SeriesResponse series(ReliabilityRangeRequest request, String granularity) {
        String unit = parseGranularity(granularity);
        requireBucketCount(request.from(), request.to(), unit);
        Resolved range = resolve(request);
        String scope = scope(request);
        if (range.empty()) {
            return new SeriesResponse(request.networkId(), range.version(), range.info(), unit, scope,
                request.lineId(), request.stationId(), List.of(), range.emptyMessage());
        }
        boolean stationScope = request.stationId() != null;
        Facts facts = facts(range, request.lineId(), request.stationId(), stationScope);
        List<DayFact> dayFacts = stationScope ? facts.stationDays() : facts.lineDays();
        Map<LocalDate, DayCoverage> coverage = dailyCoverage(
            request.networkId(), range.from(), range.to(), range.today(), range.now());
        Map<LocalDate, List<DayFact>> factsByDate = dayFacts.stream()
            .collect(Collectors.groupingBy(DayFact::serviceDate));
        boolean v2 = range.version() >= ReliabilityDerivationService.METHODOLOGY_V2;

        List<SeriesBucket> buckets = new ArrayList<>();
        for (LocalDate[] bucket : buckets(range.from(), range.to(), unit)) {
            LocalDate bucketFrom = bucket[0];
            LocalDate bucketTo = bucket[1];
            List<DayCoverage> bucketDays = new ArrayList<>();
            List<DayFact> bucketFacts = new ArrayList<>();
            for (LocalDate date = bucketFrom; !date.isAfter(bucketTo); date = date.plusDays(1)) {
                DayCoverage day = coverage.get(date);
                if (day != null) bucketDays.add(day);
                bucketFacts.addAll(factsByDate.getOrDefault(date, List.of()));
            }
            Coverage bucketCoverage = coverage(bucketDays);
            boolean includesToday = !range.today().isBefore(bucketFrom) && !range.today().isAfter(bucketTo);
            DayTotals totals = sumDays(bucketFacts);
            if (bucketCoverage.analyzableDays() == 0 || totals.observed() == 0) {
                buckets.add(new SeriesBucket(
                    bucketFrom, bucketTo, bucketCoverage.totalDays(), bucketCoverage.analyzableDays(),
                    bucketCoverage.pollingPercentage(), bucketCoverage.schedulePercentage(), bucketCoverage.confidence(),
                    totals.observed(), null, null, null, null, List.of(), includesToday));
                continue;
            }
            List<EpisodeFact> bucketEpisodes = facts.episodes().stream()
                .filter(ep -> ep.minutesByDate().keySet().stream()
                    .anyMatch(date -> !date.isBefore(bucketFrom) && !date.isAfter(bucketTo)))
                .toList();
            Map<String, ClassTotals> classTotals = classTotals(bucketFacts);
            List<ClassMetric> classes = v2
                ? ReliabilityEpisodeSource.DISRUPTION_CLASSES.stream()
                    .map(cls -> classMetric(cls, classTotals.getOrDefault(cls, ClassTotals.ZERO), totals.observed(),
                        bucketEpisodes.stream().filter(ep -> cls.equals(ep.disruptionClass())).count(), 0))
                    .toList()
                : List.of();
            long unique = Math.min(totals.observed(), totals.impacted());
            double weighted = Math.min(totals.observed(), v2 ? totals.weighted() : unique);
            buckets.add(new SeriesBucket(
                bucketFrom, bucketTo, bucketCoverage.totalDays(), bucketCoverage.analyzableDays(),
                bucketCoverage.pollingPercentage(), bucketCoverage.schedulePercentage(), bucketCoverage.confidence(),
                totals.observed(), unique, round1(weighted), percentage(weighted, totals.observed()),
                (long) bucketEpisodes.size(), classes, includesToday));
        }
        return new SeriesResponse(request.networkId(), range.version(), range.info(), unit, scope,
            request.lineId(), request.stationId(), List.copyOf(buckets),
            "Each bucket carries its own coverage; buckets without an analyzable day have no values."
                + (range.includesToday() ? " The last bucket includes Today So Far." : ""));
    }

    static String parseGranularity(String granularity) {
        if (granularity == null || granularity.isBlank()) return "day";
        String normalized = granularity.trim().toLowerCase(Locale.ROOT);
        if (!Set.of("day", "week", "month").contains(normalized)) {
            throw ReliabilityRangeException.badRequest("invalid_granularity", "granularity must be day, week or month.");
        }
        return normalized;
    }

    static void requireBucketCount(LocalDate from, LocalDate to, String unit) {
        int count = buckets(from, to, unit).size();
        if (count > MAX_SERIES_BUCKETS) {
            throw ReliabilityRangeException.badRequest("too_many_buckets",
                "This range has " + count + " " + unit + " buckets; the limit is " + MAX_SERIES_BUCKETS
                    + ". Choose a coarser granularity or a shorter range.");
        }
    }

    /** Inclusive buckets clipped to the range; weeks start Monday, months on the 1st. */
    static List<LocalDate[]> buckets(LocalDate from, LocalDate to, String unit) {
        List<LocalDate[]> buckets = new ArrayList<>();
        LocalDate start = from;
        while (!start.isAfter(to) && buckets.size() <= MAX_SERIES_BUCKETS) {
            LocalDate end = switch (unit) {
                case "week" -> start.with(TemporalAdjusters.nextOrSame(DayOfWeek.SUNDAY));
                case "month" -> start.with(TemporalAdjusters.lastDayOfMonth());
                default -> start;
            };
            if (end.isAfter(to)) end = to;
            buckets.add(new LocalDate[] {start, end});
            start = end.plusDays(1);
        }
        return buckets;
    }

    // ---------------------------------------------------------------- patterns

    @Transactional(readOnly = true, timeout = 30)
    public PatternsResponse patterns(ReliabilityRangeRequest request) {
        Resolved range = resolve(request);
        String scope = scope(request);
        if (range.empty()) {
            return new PatternsResponse(request.networkId(), range.version(), range.info(), scope,
                request.lineId(), request.stationId(), TIME_ZONE, emptyPatternCells(), range.emptyMessage());
        }
        boolean stationScope = request.stationId() != null;
        Facts facts = facts(range, request.lineId(), request.stationId(), stationScope);

        // Counted service: each counted day's span (the station's span for a station), ended at now.
        Map<String, Set<LocalDate>> countedDates = new HashMap<>();
        for (DayFact fact : stationScope ? facts.stationDays() : facts.lineDays()) {
            if ("all".equals(fact.impactGroup()) && fact.observedMinutes() > 0) {
                countedDates.computeIfAbsent(fact.lineId(), ignored -> new HashSet<>()).add(fact.serviceDate());
            }
        }
        Map<String, List<TimeRange>> servedByLine = new HashMap<>();
        if (stationScope) {
            List<DisjointSpan> stationSpans = ReliabilityEpisodeSource.disjointSpans(scheduleCapture.serviceSpans(
                request.networkId(), request.stationId(), range.from().minusDays(1), range.to()));
            for (DisjointSpan span : stationSpans) {
                if (!countedDates.getOrDefault(span.lineId(), Set.of()).contains(span.serviceDate())) continue;
                TimeRange capped = cap(span.range(), range.now());
                if (capped != null) servedByLine.computeIfAbsent(span.lineId(), ignored -> new ArrayList<>()).add(capped);
            }
        } else {
            for (Map.Entry<String, Map<LocalDate, TimeRange>> line : facts.lineSpans().entrySet()) {
                for (Map.Entry<LocalDate, TimeRange> day : line.getValue().entrySet()) {
                    if (!countedDates.getOrDefault(line.getKey(), Set.of()).contains(day.getKey())) continue;
                    TimeRange capped = cap(day.getValue(), range.now());
                    if (capped != null) servedByLine.computeIfAbsent(line.getKey(), ignored -> new ArrayList<>()).add(capped);
                }
            }
        }

        double[] observed = new double[168];
        double[] any = new double[168];
        Map<String, double[]> byClass = new LinkedHashMap<>();
        for (String cls : ReliabilityEpisodeSource.DISRUPTION_CLASSES) byClass.put(cls, new double[168]);
        OffsetDateTime windowStart = null;
        OffsetDateTime windowEnd = null;
        for (List<TimeRange> served : servedByLine.values()) {
            for (TimeRange span : served) {
                if (windowStart == null || span.start().isBefore(windowStart)) windowStart = span.start();
                if (windowEnd == null || span.end().isAfter(windowEnd)) windowEnd = span.end();
            }
        }
        if (windowStart != null) {
            List<TimeRange> polled = observationRollup.observationWindows(request.networkId(), windowStart, windowEnd);
            Map<String, List<EpisodeFact>> episodesByLine = facts.episodes().stream()
                .collect(Collectors.groupingBy(EpisodeFact::lineId));
            for (Map.Entry<String, List<TimeRange>> line : servedByLine.entrySet()) {
                List<TimeRange> served = ReliabilityIntervalCalculator.merge(line.getValue(), Duration.ZERO);
                addHourly(observed, ReliabilityIntervalCalculator.intersect(served, polled));
                List<EpisodeFact> lineEpisodes = episodesByLine.getOrDefault(line.getKey(), List.of());
                List<TimeRange> anyRanges = new ArrayList<>();
                Map<String, List<TimeRange>> classRanges = new HashMap<>();
                for (EpisodeFact ep : lineEpisodes) {
                    List<TimeRange> counted = ReliabilityIntervalCalculator.intersect(ep.counted(), served);
                    anyRanges.addAll(counted);
                    classRanges.computeIfAbsent(ep.disruptionClass(), ignored -> new ArrayList<>()).addAll(counted);
                }
                addHourly(any, ReliabilityIntervalCalculator.merge(anyRanges, Duration.ZERO));
                for (Map.Entry<String, double[]> cls : byClass.entrySet()) {
                    addHourly(cls.getValue(),
                        ReliabilityIntervalCalculator.merge(classRanges.getOrDefault(cls.getKey(), List.of()), Duration.ZERO));
                }
            }
        }

        boolean v2 = range.version() >= ReliabilityDerivationService.METHODOLOGY_V2;
        List<PatternCell> cells = new ArrayList<>(168);
        for (int index = 0; index < 168; index++) {
            Map<String, Long> classMinutes = new LinkedHashMap<>();
            if (v2) {
                for (Map.Entry<String, double[]> cls : byClass.entrySet()) {
                    classMinutes.put(cls.getKey(), Math.round(cls.getValue()[index]));
                }
            }
            cells.add(new PatternCell(index / 24 + 1, index % 24, Math.round(observed[index]), Math.round(any[index]), classMinutes));
        }
        return new PatternsResponse(request.networkId(), range.version(), range.info(), scope,
            request.lineId(), request.stationId(), TIME_ZONE, List.copyOf(cells),
            "Hour-of-week totals in Toronto time across the range's counted days. Minutes are line-minutes; "
                + "compare alert minutes with observed minutes in the same hour.");
    }

    private static List<PatternCell> emptyPatternCells() {
        List<PatternCell> cells = new ArrayList<>(168);
        for (int index = 0; index < 168; index++) cells.add(new PatternCell(index / 24 + 1, index % 24, 0, 0, Map.of()));
        return List.copyOf(cells);
    }

    /** Adds each range's minutes to its Toronto hour-of-week cells (index (day-1)*24 + hour). */
    static void addHourly(double[] cells, List<TimeRange> ranges) {
        for (TimeRange range : ranges) {
            ZonedDateTime cursor = range.start().atZoneSameInstant(GtfsServiceTime.TORONTO);
            ZonedDateTime end = range.end().atZoneSameInstant(GtfsServiceTime.TORONTO);
            while (cursor.isBefore(end)) {
                ZonedDateTime hourEnd = cursor.truncatedTo(ChronoUnit.HOURS).plusHours(1);
                ZonedDateTime sliceEnd = hourEnd.isBefore(end) ? hourEnd : end;
                int index = (cursor.getDayOfWeek().getValue() - 1) * 24 + cursor.getHour();
                cells[index] += Duration.between(cursor, sliceEnd).toSeconds() / 60.0;
                cursor = sliceEnd;
            }
        }
    }

    // ---------------------------------------------------------------- hotspots

    @Transactional(readOnly = true, timeout = 30)
    public HotspotsResponse hotspots(ReliabilityRangeRequest request, String sort, int limit, String disruptionClass) {
        String normalizedSort = parseHotspotSort(sort);
        String onlyClass = parseDisruptionClass(disruptionClass);
        Resolved range = resolve(request);
        if (range.empty()) {
            return new HotspotsResponse(request.networkId(), range.version(), range.info(), request.lineId(),
                onlyClass, normalizedSort, limit, List.of(), range.emptyMessage());
        }
        boolean v2 = range.version() >= ReliabilityDerivationService.METHODOLOGY_V2;
        Facts facts = facts(range, request.lineId(), request.stationId(), true);
        Map<String, StationInfo> stations = ranges.stations(request.networkId());
        Map<String, LineInfo> lines = lineInfo(request.networkId());
        record Key(String lineId, String stationId) {}
        Map<Key, List<DayFact>> daysByStation = facts.stationDays().stream()
            .collect(Collectors.groupingBy(fact -> new Key(fact.lineId(), fact.stationId()), LinkedHashMap::new, Collectors.toList()));
        Map<Key, List<EpisodeFact>> episodesByStation = new HashMap<>();
        for (EpisodeFact ep : facts.episodes()) {
            for (String stationId : ep.stationIds()) {
                episodesByStation.computeIfAbsent(new Key(ep.lineId(), stationId), ignored -> new ArrayList<>()).add(ep);
            }
        }
        record Candidate(Key key, DayTotals totals, Map<String, ClassTotals> classes, List<EpisodeFact> episodes) {}
        List<Candidate> candidates = new ArrayList<>();
        for (Map.Entry<Key, List<DayFact>> entry : daysByStation.entrySet()) {
            DayTotals all = sumDays(entry.getValue());
            Map<String, ClassTotals> classes = classTotals(entry.getValue());
            // Ranked on one class when asked, so long-running slow zones do not bury closures.
            DayTotals totals = onlyClass == null ? all : new DayTotals(all.observed(),
                classes.getOrDefault(onlyClass, ClassTotals.ZERO).impacted(),
                classes.getOrDefault(onlyClass, ClassTotals.ZERO).weighted(),
                classes.getOrDefault(onlyClass, ClassTotals.ZERO).incident());
            List<EpisodeFact> stationEpisodes = episodesByStation.getOrDefault(entry.getKey(), List.of()).stream()
                .filter(ep -> ep.minutes() > 0)
                .filter(ep -> onlyClass == null || onlyClass.equals(ep.disruptionClass()))
                .toList();
            if (totals.observed() == 0 || (totals.impacted() == 0 && stationEpisodes.isEmpty())) continue;
            candidates.add(new Candidate(entry.getKey(), totals, classes, stationEpisodes));
        }
        Comparator<Candidate> byMinutes = Comparator.comparingDouble((Candidate c) -> -c.totals().weighted())
            .thenComparingInt(c -> -c.episodes().size());
        Comparator<Candidate> byIncidents = Comparator.comparingInt((Candidate c) -> -c.episodes().size())
            .thenComparingDouble(c -> -c.totals().weighted());
        candidates.sort(("incidents".equals(normalizedSort) ? byIncidents : byMinutes)
            .thenComparing(c -> c.key().stationId()).thenComparing(c -> c.key().lineId()));

        List<Hotspot> hotspots = new ArrayList<>();
        for (Candidate candidate : candidates.subList(0, Math.min(limit, candidates.size()))) {
            long observedMinutes = candidate.totals().observed();
            long unique = Math.min(observedMinutes, candidate.totals().impacted());
            double weighted = Math.min(observedMinutes, v2 ? candidate.totals().weighted() : unique);
            StationInfo station = stations.get(candidate.key().stationId());
            LineInfo line = lines.get(candidate.key().lineId());
            hotspots.add(new Hotspot(
                hotspots.size() + 1,
                candidate.key().stationId(),
                station == null ? com.calebhabesh.linewatch.station.StationDisplayNameFormatter.fromStationId(candidate.key().stationId()) : station.name(),
                candidate.key().lineId(),
                line == null ? null : line.number(),
                line == null ? candidate.key().lineId() : line.label(),
                observedMinutes,
                unique,
                round1(weighted),
                percentage(weighted, observedMinutes),
                candidate.episodes().size(),
                v2 ? ReliabilityEpisodeSource.DISRUPTION_CLASSES.stream()
                    .map(cls -> classMetric(cls, candidate.classes().getOrDefault(cls, ClassTotals.ZERO), observedMinutes,
                        candidate.episodes().stream().filter(ep -> cls.equals(ep.disruptionClass())).count(),
                        candidate.episodes().stream().filter(ep -> cls.equals(ep.disruptionClass()) && ep.active()).count()))
                    .toList() : List.of()
            ));
        }
        return new HotspotsResponse(request.networkId(), range.version(), range.info(), request.lineId(),
            onlyClass, normalizedSort, limit, List.copyOf(hotspots),
            "Stations ranked by " + ("incidents".equals(normalizedSort) ? "incidents naming them" : "minutes with an alert naming them")
                + (onlyClass == null ? "" : " (" + AlertCategoryLabels.disruptionClassLabel(onlyClass) + " only)")
                + " during their scheduled, polled service. An interchange is ranked on each of its lines; alerts without listed stations are not attributed to stations.");
    }

    /** Null when absent; otherwise one of the three disruption classes. */
    static String parseDisruptionClass(String disruptionClass) {
        if (disruptionClass == null || disruptionClass.isBlank()) return null;
        String normalized = disruptionClass.trim().toLowerCase(Locale.ROOT);
        if (!ReliabilityEpisodeSource.DISRUPTION_CLASSES.contains(normalized)) {
            throw ReliabilityRangeException.badRequest("invalid_class", "class must be service-stopped, delay or slow-zone.");
        }
        return normalized;
    }

    static String parseHotspotSort(String sort) {
        if (sort == null || sort.isBlank()) return "minutes";
        String normalized = sort.trim().toLowerCase(Locale.ROOT);
        if (!"minutes".equals(normalized) && !"incidents".equals(normalized)) {
            throw ReliabilityRangeException.badRequest("invalid_sort", "sort must be minutes or incidents.");
        }
        return normalized;
    }

    // ---------------------------------------------------------------- episodes

    @Transactional(readOnly = true, timeout = 30)
    public EpisodesResponse episodes(ReliabilityRangeRequest request, String cursor, int limit) {
        Cursor after = decodeCursor(cursor);
        Resolved range = resolve(request);
        if (range.empty()) {
            return new EpisodesResponse(request.networkId(), range.version(), range.info(), request.lineId(),
                request.stationId(), limit, List.of(), null, range.emptyMessage());
        }
        Facts facts = facts(range, request.lineId(), request.stationId(), false);
        Comparator<EpisodeFact> order = Comparator.comparing(EpisodeFact::openedAt, Comparator.reverseOrder())
            .thenComparing(EpisodeFact::key);
        List<EpisodeFact> sorted = facts.episodes().stream()
            .filter(ep -> ep.minutes() > 0 || ep.active())
            .sorted(order)
            .toList();
        int start = 0;
        if (after != null) {
            while (start < sorted.size() && !isAfterCursor(sorted.get(start), after)) start++;
        }
        int end = Math.min(sorted.size(), start + limit);
        List<EpisodeFact> page = sorted.subList(start, end);
        String nextCursor = end < sorted.size() ? encodeCursor(page.getLast()) : null;

        Map<String, LineInfo> lines = lineInfo(request.networkId());
        Map<String, List<TitleSighting>> titles = ranges.titleSightings(request.networkId(),
            page.stream().map(EpisodeFact::alertId).collect(Collectors.toCollection(LinkedHashSet::new)));
        List<EpisodeItem> items = page.stream().map(ep -> {
            LineInfo line = lines.get(ep.lineId());
            OffsetDateTime titleAt = ep.closedAt() != null ? ep.closedAt() : range.now();
            return new EpisodeItem(
                ep.key(),
                ep.lineId(),
                line == null ? null : line.number(),
                line == null ? ep.lineId() : line.label(),
                ep.disruptionClass(),
                AlertCategoryLabels.disruptionClassLabel(ep.disruptionClass()),
                ep.impactKind(),
                AlertCategoryLabels.singular(ep.impactKind()),
                ep.planned(),
                ep.cause(),
                causeLabel(ep.cause()),
                title(titles.getOrDefault(ep.alertId(), List.of()), titleAt, request.networkId(), line, ep.impactKind()),
                ep.stationIds(),
                ep.openedAt(),
                ep.completed() ? ep.closedAt() : null,
                ep.minutes(),
                ep.active()
            );
        }).toList();
        return new EpisodesResponse(request.networkId(), range.version(), range.info(), request.lineId(),
            request.stationId(), limit, items, nextCursor,
            "Episodes counted in this range, newest first. Minutes are each episode's counted time inside the range.");
    }

    /** The title the alert carried when the episode ended, as Alert History shows it. */
    static String title(List<TitleSighting> sightings, OffsetDateTime end, String networkId, LineInfo line, String impactKind) {
        String chosen = null;
        for (TitleSighting sighting : sightings) {
            if (sighting.firstSeen() == null || !sighting.firstSeen().isAfter(end)) chosen = sighting.title();
        }
        if (chosen == null && !sightings.isEmpty()) chosen = sightings.getFirst().title();
        if (chosen != null && !chosen.isBlank()) return chosen.trim();
        String prefix;
        if (line == null) {
            prefix = "regional".equals(networkId) ? "GO" : "TTC";
        } else {
            prefix = "regional".equals(networkId) ? line.label() : "Line " + line.number();
        }
        return prefix + " " + AlertCategoryLabels.singular(impactKind);
    }

    record Cursor(Instant openedAt, String key) {}

    static String encodeCursor(EpisodeFact ep) {
        String raw = ep.openedAt().toInstant() + "\n" + ep.key();
        return Base64.getUrlEncoder().withoutPadding().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
    }

    static Cursor decodeCursor(String cursor) {
        if (cursor == null || cursor.isBlank()) return null;
        if (cursor.length() > MAX_CURSOR_LENGTH) {
            throw ReliabilityRangeException.badRequest("invalid_cursor", "cursor is not valid for this list.");
        }
        try {
            String raw = new String(Base64.getUrlDecoder().decode(cursor.trim()), StandardCharsets.UTF_8);
            int split = raw.indexOf('\n');
            if (split <= 0 || split == raw.length() - 1) throw new IllegalArgumentException();
            return new Cursor(Instant.parse(raw.substring(0, split)), raw.substring(split + 1));
        } catch (RuntimeException exception) {
            throw ReliabilityRangeException.badRequest("invalid_cursor", "cursor is not valid for this list.");
        }
    }

    private static boolean isAfterCursor(EpisodeFact ep, Cursor cursor) {
        int opened = ep.openedAt().toInstant().compareTo(cursor.openedAt());
        if (opened != 0) return opened < 0;
        return ep.key().compareTo(cursor.key()) > 0;
    }

    // ---------------------------------------------------------------- export

    @Transactional(readOnly = true, timeout = 30)
    public ExportFile export(ReliabilityRangeRequest request) {
        Resolved range = resolve(request);
        boolean stationScope = request.stationId() != null;
        String filename = "linewatchto-reliability-" + request.networkId()
            + (request.lineId() == null ? "" : "-" + request.lineId())
            + (stationScope ? "-" + request.stationId() : "")
            + "-" + request.from() + "-to-" + request.to() + ".csv";
        List<String> header = new ArrayList<>(List.of("service_date", "network_id", "line_id", "line_name"));
        if (stationScope) header.addAll(List.of("station_id", "station_name"));
        header.addAll(List.of(
            "scheduled_minutes", "observed_minutes", "any_alert_minutes", "weighted_impacted_minutes",
            "incident_minutes", "service_stopped_minutes", "service_stopped_weighted_minutes",
            "delay_minutes", "delay_weighted_minutes", "slow_zone_minutes", "slow_zone_weighted_minutes",
            "today_so_far", "methodology_version"));
        StringBuilder csv = new StringBuilder();
        csv.append(String.join(",", header)).append("\r\n");
        if (range.empty()) return new ExportFile(filename, csv.toString(), 0);

        Facts facts = facts(range, request.lineId(), request.stationId(), stationScope);
        List<DayFact> dayFacts = stationScope ? facts.stationDays() : facts.lineDays();
        record RowKey(LocalDate date, String lineId, String stationId) {}
        Map<RowKey, Map<String, DayFact>> rows = new TreeMap<>(Comparator.comparing(RowKey::date)
            .thenComparing(RowKey::lineId).thenComparing(RowKey::stationId));
        for (DayFact fact : dayFacts) {
            rows.computeIfAbsent(new RowKey(fact.serviceDate(), fact.lineId(), fact.stationId()), ignored -> new HashMap<>())
                .put(fact.impactGroup(), fact);
        }
        rows.values().removeIf(groups -> !groups.containsKey("all"));
        if (rows.size() > MAX_EXPORT_ROWS) {
            throw ReliabilityRangeException.badRequest("export_too_large",
                "This export has " + rows.size() + " rows; the limit is " + MAX_EXPORT_ROWS + ". Choose a shorter range.");
        }
        Map<String, LineInfo> lines = lineInfo(request.networkId());
        Map<String, StationInfo> stations = stationScope ? ranges.stations(request.networkId()) : Map.of();
        for (Map.Entry<RowKey, Map<String, DayFact>> row : rows.entrySet()) {
            DayFact all = row.getValue().get("all");
            LineInfo line = lines.get(row.getKey().lineId());
            List<String> cells = new ArrayList<>();
            cells.add(row.getKey().date().toString());
            cells.add(request.networkId());
            cells.add(csvCell(row.getKey().lineId()));
            cells.add(csvCell(line == null ? row.getKey().lineId() : line.label()));
            if (stationScope) {
                StationInfo station = stations.get(row.getKey().stationId());
                cells.add(csvCell(row.getKey().stationId()));
                cells.add(csvCell(station == null ? row.getKey().stationId() : station.name()));
            }
            cells.add(Integer.toString(all.scheduledMinutes()));
            cells.add(Integer.toString(all.observedMinutes()));
            cells.add(Integer.toString(all.impactedMinutes()));
            cells.add(decimal(all.weightedMinutes()));
            cells.add(Integer.toString(all.incidentMinutes()));
            for (String cls : ReliabilityEpisodeSource.DISRUPTION_CLASSES) {
                DayFact fact = row.getValue().get(ReliabilityEpisodeSource.classImpactGroup(cls));
                cells.add(Integer.toString(fact == null ? 0 : fact.impactedMinutes()));
                cells.add(decimal(fact == null ? 0.0 : fact.weightedMinutes()));
            }
            cells.add(Boolean.toString(all.live()));
            cells.add(Integer.toString(range.version()));
            csv.append(String.join(",", cells)).append("\r\n");
        }
        return new ExportFile(filename, csv.toString(), rows.size());
    }

    /** RFC 4180 quoting, and a leading apostrophe so spreadsheets never run a cell as a formula. */
    static String csvCell(String value) {
        if (value == null) return "";
        String cell = !value.isEmpty() && "=+-@\t\r".indexOf(value.charAt(0)) >= 0 ? "'" + value : value;
        if (cell.contains(",") || cell.contains("\"") || cell.contains("\n") || cell.contains("\r")) {
            return "\"" + cell.replace("\"", "\"\"") + "\"";
        }
        return cell;
    }

    private static String decimal(double value) {
        return String.format(Locale.ROOT, "%.1f", value);
    }

    // ---------------------------------------------------------------- range resolution

    record Resolved(
        ReliabilityRangeRequest request,
        int version,
        LocalDate today,
        OffsetDateTime now,
        LocalDate firstAnalyzable,
        LocalDate from,
        LocalDate to,
        boolean clipped
    ) {
        boolean empty() {
            return from == null;
        }

        boolean includesToday() {
            return to != null && to.equals(today);
        }

        int days() {
            return empty() ? 0 : (int) ChronoUnit.DAYS.between(from, to) + 1;
        }

        /** Late service on {@code to} runs past midnight, so episodes are read to two days after. */
        OffsetDateTime until() {
            return earlier(now, ReliabilityObservationRollup.dayStart(to.plusDays(2)));
        }

        RangeInfo info() {
            String clipReason = clipped
                ? "History starts " + firstAnalyzable + "; earlier dates are not analyzable."
                : (empty() ? emptyMessage() : null);
            return new RangeInfo(request.from(), request.to(), from, to, days(), clipped || empty(), clipReason,
                firstAnalyzable, includesToday());
        }

        String emptyMessage() {
            return firstAnalyzable == null
                ? "Not enough history for this range: no day has both a published schedule and successful polling yet."
                : "Not enough history for this range. History starts " + firstAnalyzable + ".";
        }
    }

    Resolved resolve(ReliabilityRangeRequest request) {
        requireScope(request);
        int version = derivation.currentMethodologyVersion();
        LocalDate today = today();
        OffsetDateTime now = OffsetDateTime.now(clock);
        LocalDate first = derivation.firstAnalyzableDate(request.networkId());
        if (first == null || request.to().isBefore(first)) {
            return new Resolved(request, version, today, now, first, null, null, false);
        }
        boolean clipped = request.from().isBefore(first);
        return new Resolved(request, version, today, now, first, clipped ? first : request.from(), request.to(), clipped);
    }

    /** An unknown line, a station not on the network, or a station not on the line is a 400. */
    private void requireScope(ReliabilityRangeRequest request) {
        if (request.lineId() != null && !lineInfo(request.networkId()).containsKey(request.lineId())) {
            throw ReliabilityRangeException.badRequest("invalid_line", "Unknown line for this network.");
        }
        if (request.stationId() != null) {
            StationInfo station = ranges.stations(request.networkId()).get(request.stationId());
            if (station == null) {
                throw ReliabilityRangeException.badRequest("invalid_station", "Unknown station for this network.");
            }
            if (request.lineId() != null && !station.lineIds().contains(request.lineId())) {
                throw ReliabilityRangeException.badRequest("invalid_station", "That station is not on this line.");
            }
        }
    }

    private Map<String, LineInfo> lineInfo(String networkId) {
        Map<String, LineInfo> lines = new LinkedHashMap<>();
        for (LineInfo line : ranges.lines(networkId)) lines.put(line.id(), line);
        return lines;
    }

    private static String scope(ReliabilityRangeRequest request) {
        if (request.stationId() != null) return "station";
        return request.lineId() != null ? "line" : "network";
    }

    // ---------------------------------------------------------------- daily coverage

    record DayCoverage(LocalDate date, long polledMinutes, long dayMinutes, boolean scheduleDay) {
        boolean analyzable() {
            return scheduleDay && polledMinutes > 0;
        }

        double pollingPercentage() {
            return dayMinutes <= 0 ? 0.0 : Math.min(100.0, Math.round(polledMinutes * 1000.0 / dayMinutes) / 10.0);
        }
    }

    /**
     * Each date's polled minutes over its calendar minutes (today's up to now) and whether it has
     * a published schedule. Final roll-ups serve completed dates; yesterday and today without a
     * final row read the observation windows directly.
     */
    Map<LocalDate, DayCoverage> dailyCoverage(String networkId, LocalDate from, LocalDate to, LocalDate today, OffsetDateTime now) {
        Map<LocalDate, PollingDay> polling = ranges.pollingDays(networkId, from, to);
        Set<LocalDate> scheduled = scheduleCapture.scheduledDates(networkId, from, to);
        Map<LocalDate, DayCoverage> days = new LinkedHashMap<>();
        for (LocalDate date = from; !date.isAfter(to); date = date.plusDays(1)) {
            OffsetDateTime dayStart = ReliabilityObservationRollup.dayStart(date);
            OffsetDateTime dayEnd = earlier(ReliabilityObservationRollup.dayStart(date.plusDays(1)), now);
            long dayMinutes = Math.max(1, Math.round(Duration.between(dayStart, dayEnd).toSeconds() / 60.0));
            PollingDay row = polling.get(date);
            long polled;
            if (row != null && row.finalRow()) {
                polled = row.polledMinutes();
            } else if (!date.isBefore(today.minusDays(1)) && dayStart.isBefore(dayEnd)) {
                polled = ReliabilityIntervalCalculator.minutes(observationRollup.observationWindows(networkId, dayStart, dayEnd));
            } else {
                polled = row == null ? 0 : row.polledMinutes();
            }
            days.put(date, new DayCoverage(date, Math.min(polled, dayMinutes), dayMinutes, scheduled.contains(date)));
        }
        return days;
    }

    static Coverage coverage(Collection<DayCoverage> days) {
        long polled = days.stream().mapToLong(DayCoverage::polledMinutes).sum();
        long total = days.stream().mapToLong(DayCoverage::dayMinutes).sum();
        int totalDays = days.size();
        long scheduleDays = days.stream().filter(DayCoverage::scheduleDay).count();
        int analyzable = (int) days.stream().filter(DayCoverage::analyzable).count();
        double pollingPercentage = total == 0 ? 0.0 : Math.min(100.0, Math.round(polled * 1000.0 / total) / 10.0);
        double schedulePercentage = totalDays == 0 ? 0.0 : Math.round(scheduleDays * 1000.0 / totalDays) / 10.0;
        double effective = Math.min(pollingPercentage, schedulePercentage);
        String label;
        if (pollingPercentage == 0) {
            label = "No verified polling coverage";
        } else if (schedulePercentage == 0) {
            label = String.format(Locale.CANADA, "%.1f%% polling · no schedule-date coverage", pollingPercentage);
        } else {
            label = String.format(Locale.CANADA, "%.1f%% polling · %.1f%% schedule-date coverage · %d of %d days analyzable",
                pollingPercentage, schedulePercentage, analyzable, totalDays);
        }
        return new Coverage(pollingPercentage, schedulePercentage, effective,
            ReliabilityService.confidence(effective), analyzable, totalDays, label);
    }

    // ---------------------------------------------------------------- facts: derived days + live slice

    /**
     * An episode as counted in the range: {@code counted} is its time inside the range's counted
     * line spans, split by service date in {@code minutesByDate}.
     */
    record EpisodeFact(
        String key,
        String alertId,
        String lineId,
        String impactKind,
        String disruptionClass,
        boolean planned,
        String cause,
        List<String> stationIds,
        OffsetDateTime openedAt,
        OffsetDateTime closedAt,
        boolean completed,
        boolean active,
        List<TimeRange> counted,
        Map<LocalDate, Long> minutesByDate
    ) {
        long minutes() {
            return ReliabilityIntervalCalculator.minutes(counted);
        }
    }

    record Facts(
        List<DayFact> lineDays,
        List<DayFact> stationDays,
        List<EpisodeFact> episodes,
        Map<String, Map<LocalDate, TimeRange>> lineSpans
    ) {}

    /**
     * The range's day rows and episodes: derived rows through {@code derived_through}, then the
     * live slice for the dates after it (at most yesterday and today, as {@code /lines} does).
     */
    Facts facts(Resolved range, String lineId, String stationId, boolean includeStationDays) {
        String networkId = range.request().networkId();
        int version = range.version();
        LocalDate derivedThrough = reliability.derivedThrough(version, networkId);
        LocalDate lastDerived = derivedThrough == null ? range.from().minusDays(1) : derivedThrough;
        LocalDate derivedEnd = range.to().isAfter(lastDerived) ? lastDerived : range.to();
        OffsetDateTime until = range.until();

        List<DayFact> lineDays = new ArrayList<>();
        List<DayFact> stationDays = new ArrayList<>();
        Map<String, EpisodeFact> episodes = new LinkedHashMap<>();
        Map<String, Map<LocalDate, TimeRange>> lineSpans = new HashMap<>();

        if (!range.from().isAfter(derivedEnd)) {
            lineDays.addAll(ranges.lineDays(version, networkId, range.from(), derivedEnd, lineId));
            if (includeStationDays) {
                stationDays.addAll(ranges.stationDays(version, networkId, range.from(), derivedEnd, lineId, stationId));
            }
            Set<LocalDate> completeDays = scheduleCapture.completeScheduleDays(networkId, range.from(), derivedEnd);
            for (DisjointSpan span : ReliabilityEpisodeSource.disjointSpans(
                scheduleCapture.serviceSpans(networkId, null, range.from().minusDays(1), derivedEnd))) {
                if (span.serviceDate().isBefore(range.from()) || span.serviceDate().isAfter(derivedEnd)) continue;
                if (!completeDays.contains(span.serviceDate())) continue;
                if (lineId != null && !lineId.equals(span.lineId())) continue;
                lineSpans.computeIfAbsent(span.lineId(), ignored -> new LinkedHashMap<>()).put(span.serviceDate(), span.range());
            }
            OffsetDateTime minStart = null;
            OffsetDateTime maxEnd = null;
            for (Map<LocalDate, TimeRange> spans : lineSpans.values()) {
                for (TimeRange span : spans.values()) {
                    if (minStart == null || span.start().isBefore(minStart)) minStart = span.start();
                    if (maxEnd == null || span.end().isAfter(maxEnd)) maxEnd = span.end();
                }
            }
            if (minStart != null) {
                for (StoredEpisode stored : ranges.episodes(version, networkId, minStart, maxEnd, lineId, stationId)) {
                    Map<LocalDate, TimeRange> spans = lineSpans.getOrDefault(stored.lineId(), Map.of());
                    Map<LocalDate, List<TimeRange>> byDate = ReliabilityEpisodeSource.splitByServiceDate(stored.pieces(), spans);
                    if (byDate.isEmpty()) continue;
                    List<TimeRange> counted = byDate.values().stream().flatMap(List::stream).toList();
                    boolean completed = stored.completed() && stored.closedAt() != null && !stored.closedAt().isAfter(until);
                    episodes.put(stored.episodeKey(), new EpisodeFact(
                        stored.episodeKey(), stored.alertId(), stored.lineId(), stored.impactKind(),
                        stored.disruptionClass(), stored.planned(), stored.cause(), stored.stationIds(),
                        stored.openedAt(), stored.closedAt(), completed, false,
                        ReliabilityIntervalCalculator.merge(counted, Duration.ZERO), minutesByDate(byDate)));
                }
            }
        }

        if (range.to().isAfter(lastDerived)) {
            LocalDate liveStart = laterDate(range.from(), laterDate(lastDerived.plusDays(1), range.to().minusDays(1)));
            LiveSlice slice = derivation.computeLiveSlice(version, networkId, liveStart, range.to(), until);
            Predicate<String> onLine = id -> lineId == null || lineId.equals(id);
            for (SliceDay day : slice.lineDays()) {
                if (onLine.test(day.lineId())) lineDays.add(liveFact(day));
            }
            if (includeStationDays) {
                for (SliceDay day : slice.stationDays()) {
                    if (onLine.test(day.lineId()) && (stationId == null || stationId.equals(day.stationId()))) {
                        stationDays.add(liveFact(day));
                    }
                }
            }
            for (Map.Entry<String, Map<LocalDate, TimeRange>> line : slice.lineSpans().entrySet()) {
                if (onLine.test(line.getKey())) {
                    lineSpans.computeIfAbsent(line.getKey(), ignored -> new LinkedHashMap<>()).putAll(line.getValue());
                }
            }
            for (SliceEpisode live : slice.episodes()) {
                var ep = live.episode();
                if (!onLine.test(ep.lineId())) continue;
                if (stationId != null && !ep.stationIds().contains(stationId)) continue;
                Map<LocalDate, List<TimeRange>> byDate = ReliabilityEpisodeSource.splitByServiceDate(
                    live.counted(), slice.lineSpans().getOrDefault(ep.lineId(), Map.of()));
                if (byDate.isEmpty()) continue;
                List<TimeRange> counted = byDate.values().stream().flatMap(List::stream).toList();
                EpisodeFact liveFact = new EpisodeFact(
                    ep.episodeKey(), ep.alertId(), ep.lineId(), ep.impactKind(), live.disruptionClass(), live.planned(),
                    ep.cause(), ep.stationIds(), ep.openedAt(), ep.closedAt(), ep.completed(), live.active(),
                    ReliabilityIntervalCalculator.merge(counted, Duration.ZERO), minutesByDate(byDate));
                episodes.merge(ep.episodeKey(), liveFact, (stored, current) -> {
                    List<TimeRange> combined = new ArrayList<>(stored.counted());
                    combined.addAll(current.counted());
                    Map<LocalDate, Long> minutes = new TreeMap<>(stored.minutesByDate());
                    current.minutesByDate().forEach((date, value) -> minutes.merge(date, value, Long::sum));
                    return new EpisodeFact(
                        stored.key(), stored.alertId(), stored.lineId(), current.impactKind(), current.disruptionClass(),
                        current.planned(), current.cause() != null ? current.cause() : stored.cause(),
                        current.stationIds(), stored.openedAt(), current.closedAt(), current.completed(), current.active(),
                        ReliabilityIntervalCalculator.merge(combined, Duration.ZERO), Map.copyOf(minutes));
                });
            }
        }
        return new Facts(List.copyOf(lineDays), List.copyOf(stationDays), List.copyOf(episodes.values()), lineSpans);
    }

    private static DayFact liveFact(SliceDay day) {
        return new DayFact(day.lineId(), day.stationId(), day.serviceDate(), day.impactGroup(), day.scheduledMinutes(),
            day.observedMinutes(), day.impactedMinutes(), day.weightedImpactedMinutes(), day.incidentMinutes(), true);
    }

    private static Map<LocalDate, Long> minutesByDate(Map<LocalDate, List<TimeRange>> byDate) {
        Map<LocalDate, Long> minutes = new TreeMap<>();
        byDate.forEach((date, ranges) -> minutes.put(date, ReliabilityIntervalCalculator.minutes(ranges)));
        return Map.copyOf(minutes);
    }

    // ---------------------------------------------------------------- metrics

    record DayTotals(long observed, long impacted, double weighted, long incident) {}

    record ClassTotals(long impacted, double weighted, long incident) {
        static final ClassTotals ZERO = new ClassTotals(0, 0.0, 0);
    }

    static DayTotals sumDays(List<DayFact> facts) {
        long observed = 0;
        long impacted = 0;
        double weighted = 0.0;
        long incident = 0;
        for (DayFact fact : facts) {
            if (!"all".equals(fact.impactGroup())) continue;
            observed += fact.observedMinutes();
            impacted += fact.impactedMinutes();
            weighted += fact.weightedMinutes();
            incident += fact.incidentMinutes();
        }
        return new DayTotals(observed, impacted, weighted, incident);
    }

    static Map<String, ClassTotals> classTotals(List<DayFact> facts) {
        Map<String, ClassTotals> totals = new HashMap<>();
        for (DayFact fact : facts) {
            if (!fact.impactGroup().startsWith(ReliabilityEpisodeSource.CLASS_GROUP_PREFIX)) continue;
            String cls = fact.impactGroup().substring(ReliabilityEpisodeSource.CLASS_GROUP_PREFIX.length());
            totals.merge(cls, new ClassTotals(fact.impactedMinutes(), fact.weightedMinutes(), fact.incidentMinutes()),
                (left, right) -> new ClassTotals(left.impacted() + right.impacted(),
                    left.weighted() + right.weighted(), left.incident() + right.incident()));
        }
        return totals;
    }

    private static ClassMetric classMetric(String cls, ClassTotals totals, long observed, long incidents, long active) {
        long unique = Math.min(observed, totals.impacted());
        double weighted = Math.min(observed, Math.max(0.0, totals.weighted()));
        return new ClassMetric(cls, AlertCategoryLabels.disruptionClassLabel(cls), incidents, active, unique,
            round1(weighted), percentage(weighted, observed), Math.max(unique, totals.incident()));
    }

    private List<SummaryRow> stationRows(ReliabilityRangeRequest request, Facts facts, boolean v2) {
        Map<String, StationInfo> stations = ranges.stations(request.networkId());
        Map<String, List<DayFact>> daysByStation = facts.stationDays().stream()
            .filter(fact -> request.lineId().equals(fact.lineId()))
            .collect(Collectors.groupingBy(DayFact::stationId));
        Map<String, List<EpisodeFact>> episodesByStation = new HashMap<>();
        for (EpisodeFact ep : facts.episodes()) {
            if (!request.lineId().equals(ep.lineId()) || ep.minutes() <= 0 && !ep.active()) continue;
            for (String stationId : ep.stationIds()) {
                episodesByStation.computeIfAbsent(stationId, ignored -> new ArrayList<>()).add(ep);
            }
        }
        List<SummaryRow> rows = new ArrayList<>();
        for (StationInfo station : stations.values()) {
            if (!station.lineIds().contains(request.lineId())) continue;
            if (request.stationId() != null && !request.stationId().equals(station.id())) continue;
            List<DayFact> days = daysByStation.getOrDefault(station.id(), List.of());
            DayTotals totals = sumDays(days);
            if (totals.observed() == 0) continue;
            List<EpisodeFact> stationEpisodes = episodesByStation.getOrDefault(station.id(), List.of());
            List<Long> cleared = stationEpisodes.stream().filter(EpisodeFact::completed)
                .map(EpisodeFact::minutes).filter(minutes -> minutes > 0).toList();
            long unique = Math.min(totals.observed(), totals.impacted());
            double weighted = Math.min(totals.observed(), v2 ? totals.weighted() : unique);
            Map<String, ClassTotals> classTotals = classTotals(days);
            rows.add(new SummaryRow(
                station.id(), null, station.name(), request.lineId(),
                totals.observed(),
                stationEpisodes.size(),
                stationEpisodes.stream().filter(EpisodeFact::active).count(),
                median(cleared), p90(cleared),
                unique, percentage(unique, totals.observed()),
                Math.max(unique, totals.incident()),
                round1(weighted), percentage(weighted, totals.observed()),
                v2 ? ReliabilityEpisodeSource.DISRUPTION_CLASSES.stream()
                    .map(cls -> classMetric(cls, classTotals.getOrDefault(cls, ClassTotals.ZERO), totals.observed(),
                        stationEpisodes.stream().filter(ep -> cls.equals(ep.disruptionClass())).count(),
                        stationEpisodes.stream().filter(ep -> cls.equals(ep.disruptionClass()) && ep.active()).count()))
                    .toList() : List.of()
            ));
        }
        return List.copyOf(rows);
    }

    private static SummaryRow lineRow(String networkId, AggregateRow row, LineInfo line, List<EpisodeOutcome> outcomes) {
        List<Long> cleared = outcomes.stream().filter(EpisodeOutcome::completed)
            .map(EpisodeOutcome::countedMinutes).filter(minutes -> minutes > 0).toList();
        return new SummaryRow(
            row.id(),
            line == null ? row.number() : line.number(),
            line == null ? row.label() : line.label(),
            row.id(),
            row.observedServiceMinutes(),
            row.incidents(),
            row.activeIncidents(),
            row.medianDurationMinutes(),
            p90(cleared),
            row.serviceImpactMinutes(),
            row.serviceImpactPercentage(),
            row.incidentDisruptionMinutes(),
            row.weightedImpactMinutes(),
            row.weightedImpactPercentage(),
            row.classes().stream().map(cls -> new ClassMetric(
                cls.disruptionClass(),
                AlertCategoryLabels.disruptionClassLabel(cls.disruptionClass()),
                cls.incidents(), cls.activeIncidents(), cls.uniqueMinutes(), cls.weightedMinutes(),
                cls.weightedSharePercentage(), cls.incidentDisruptionMinutes())).toList()
        );
    }

    static Totals totals(List<AggregateRow> rows, List<EpisodeOutcome> outcomes, boolean v2) {
        long observed = rows.stream().mapToLong(AggregateRow::observedServiceMinutes).sum();
        long unique = rows.stream().mapToLong(AggregateRow::serviceImpactMinutes).sum();
        long incidentMinutes = rows.stream().mapToLong(AggregateRow::incidentDisruptionMinutes).sum();
        double weighted = rows.stream().mapToDouble(AggregateRow::weightedImpactMinutes).sum();
        List<Long> cleared = outcomes.stream().filter(EpisodeOutcome::completed)
            .map(EpisodeOutcome::countedMinutes).filter(minutes -> minutes > 0).toList();
        List<ClassMetric> classes = new ArrayList<>();
        if (v2) {
            for (String cls : ReliabilityEpisodeSource.DISRUPTION_CLASSES) {
                long classUnique = 0;
                double classWeighted = 0.0;
                long classIncident = 0;
                for (AggregateRow row : rows) {
                    for (ReliabilityRepository.ClassAggregateRow classRow : row.classes()) {
                        if (!cls.equals(classRow.disruptionClass())) continue;
                        classUnique += classRow.uniqueMinutes();
                        classWeighted += classRow.weightedMinutes();
                        classIncident += classRow.incidentDisruptionMinutes();
                    }
                }
                classes.add(new ClassMetric(cls, AlertCategoryLabels.disruptionClassLabel(cls),
                    outcomes.stream().filter(ep -> cls.equals(ep.disruptionClass())).count(),
                    outcomes.stream().filter(ep -> cls.equals(ep.disruptionClass()) && ep.active()).count(),
                    classUnique, round1(classWeighted), percentage(classWeighted, observed), classIncident));
            }
        }
        return new Totals(
            observed,
            outcomes.size(),
            outcomes.stream().filter(EpisodeOutcome::active).count(),
            median(cleared),
            p90(cleared),
            unique,
            percentage(unique, observed),
            incidentMinutes,
            round1(weighted),
            percentage(weighted, observed),
            List.copyOf(classes)
        );
    }

    private static Totals emptyTotals() {
        return new Totals(0, 0, 0, null, null, 0, 0.0, 0, 0.0, 0.0, List.of());
    }

    static List<ReliabilityResponses.AlertTypeBreakdown> kindBreakdown(List<EpisodeOutcome> outcomes) {
        Map<String, List<EpisodeOutcome>> byKind = outcomes.stream()
            .collect(Collectors.groupingBy(ep -> ReliabilityEpisodeSource.v1BreakdownGroup(ep.impactKind())));
        long totalMinutes = outcomes.stream().mapToLong(EpisodeOutcome::countedMinutes).sum();
        long totalIncidents = outcomes.size();
        return byKind.entrySet().stream()
            .map(entry -> {
                long incidents = entry.getValue().size();
                long minutes = entry.getValue().stream().mapToLong(EpisodeOutcome::countedMinutes).sum();
                return new ReliabilityResponses.AlertTypeBreakdown(
                    entry.getKey(), AlertCategoryLabels.plural(entry.getKey()), incidents, minutes,
                    share(minutes, incidents, totalMinutes, totalIncidents));
            })
            .sorted(Comparator.comparingLong(ReliabilityResponses.AlertTypeBreakdown::incidentDisruptionMinutes).reversed()
                .thenComparing(Comparator.comparingLong(ReliabilityResponses.AlertTypeBreakdown::incidents).reversed())
                .thenComparing(ReliabilityResponses.AlertTypeBreakdown::impactKind))
            .toList();
    }

    static List<CauseBreakdown> causeBreakdown(List<EpisodeOutcome> outcomes) {
        Map<String, List<EpisodeOutcome>> byCause = outcomes.stream()
            .collect(Collectors.groupingBy(ep -> normalizeCause(ep.cause())));
        long totalMinutes = outcomes.stream().mapToLong(EpisodeOutcome::countedMinutes).sum();
        long totalIncidents = outcomes.size();
        return byCause.entrySet().stream()
            .map(entry -> {
                long incidents = entry.getValue().size();
                long minutes = entry.getValue().stream().mapToLong(EpisodeOutcome::countedMinutes).sum();
                return new CauseBreakdown(entry.getKey(), causeLabel(entry.getKey()), incidents, minutes,
                    share(minutes, incidents, totalMinutes, totalIncidents));
            })
            .sorted(Comparator.comparingLong(CauseBreakdown::incidentDisruptionMinutes).reversed()
                .thenComparing(Comparator.comparingLong(CauseBreakdown::incidents).reversed())
                .thenComparing(CauseBreakdown::cause))
            .toList();
    }

    private static String normalizeCause(String cause) {
        if (cause == null || cause.isBlank()) return "UNKNOWN_CAUSE";
        return cause.trim().toUpperCase(Locale.ROOT);
    }

    /** {@code TECHNICAL_PROBLEM} → "Technical Problem"; a missing cause reads "Unknown Cause". */
    static String causeLabel(String cause) {
        if (cause == null || cause.isBlank()) return null;
        StringBuilder label = new StringBuilder();
        for (String word : cause.trim().toLowerCase(Locale.ROOT).split("[_\\s-]+")) {
            if (word.isBlank()) continue;
            if (!label.isEmpty()) label.append(' ');
            label.append(Character.toUpperCase(word.charAt(0))).append(word.substring(1));
        }
        return label.toString();
    }

    private static double share(long minutes, long incidents, long totalMinutes, long totalIncidents) {
        if (totalMinutes > 0) return Math.round(minutes * 1000.0 / totalMinutes) / 10.0;
        return totalIncidents > 0 ? Math.round(incidents * 1000.0 / totalIncidents) / 10.0 : 0.0;
    }

    private static CancellationAggregation filterCancellations(CancellationAggregation aggregation, String lineId) {
        if (lineId == null) return aggregation;
        List<ReliabilityRepository.CancellationRow> rows = aggregation.rows().stream()
            .filter(row -> lineId.equals(row.lineId())).toList();
        return new CancellationAggregation(
            rows.stream().mapToLong(ReliabilityRepository.CancellationRow::cancellations).sum(),
            rows.stream().mapToLong(ReliabilityRepository.CancellationRow::scheduleMatchedCancellations).sum(),
            aggregation.observationMinutes(),
            aggregation.coveragePercentage(),
            rows
        );
    }

    /** The median as {@code /lines} computes it: the mean of the middle pair, rounded. */
    static Long median(List<Long> values) {
        if (values == null || values.isEmpty()) return null;
        List<Long> sorted = values.stream().sorted().toList();
        int middle = sorted.size() / 2;
        return sorted.size() % 2 == 0
            ? Math.round((sorted.get(middle - 1) + sorted.get(middle)) / 2.0)
            : sorted.get(middle);
    }

    /** Nearest-rank 90th percentile. */
    static Long p90(List<Long> values) {
        if (values == null || values.isEmpty()) return null;
        List<Long> sorted = values.stream().sorted().toList();
        int rank = (int) Math.ceil(0.9 * sorted.size());
        return sorted.get(Math.max(0, rank - 1));
    }

    private static double percentage(double part, long whole) {
        return whole <= 0 ? 0.0 : Math.min(100.0, Math.round(part * 1000.0 / whole) / 10.0);
    }

    private static double round1(double value) {
        return Math.round(value * 10.0) / 10.0;
    }

    private static TimeRange cap(TimeRange range, OffsetDateTime now) {
        TimeRange capped = range.end().isAfter(now) ? new TimeRange(range.start(), now) : range;
        return capped.valid() ? capped : null;
    }

    private static OffsetDateTime earlier(OffsetDateTime first, OffsetDateTime second) {
        return first.isBefore(second) ? first : second;
    }

    private static LocalDate laterDate(LocalDate first, LocalDate second) {
        return first.isAfter(second) ? first : second;
    }
}
