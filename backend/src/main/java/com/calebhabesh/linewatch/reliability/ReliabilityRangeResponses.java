package com.calebhabesh.linewatch.reliability;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

/** Response shapes for the plan 17 A7 range API ({@code /api/reliability/{endpoint}}). */
public final class ReliabilityRangeResponses {
    private ReliabilityRangeResponses() {}

    /**
     * The requested range and the range served. {@code from} and {@code to} are null when no
     * date in the request is analyzable; {@code clipped} when {@code from} was moved to the
     * network's first analyzable date.
     */
    public record RangeInfo(
        LocalDate requestedFrom,
        LocalDate requestedTo,
        LocalDate from,
        LocalDate to,
        int days,
        boolean clipped,
        String clipReason,
        LocalDate firstAnalyzableDate,
        boolean includesToday
    ) {}

    /**
     * Coverage over the served range: polling time over calendar time (today up to now), and
     * the share of dates with a published schedule; {@code effectivePercentage} is the lower.
     */
    public record Coverage(
        double pollingPercentage,
        double schedulePercentage,
        double effectivePercentage,
        String confidence,
        int analyzableDays,
        int totalDays,
        String label
    ) {}

    public record Source(String id, String label, String role) {}

    public record AvailabilityResponse(
        String networkId,
        int methodologyVersion,
        OffsetDateTime methodologySwitchedAt,
        LocalDate firstAnalyzableDate,
        LocalDate today,
        LocalDate derivedThrough,
        String derivationStatus,
        List<AvailabilityDay> days,
        List<Source> sources,
        String message
    ) {}

    /** A day is analyzable with a published schedule and some successful polling. */
    public record AvailabilityDay(
        LocalDate date,
        double pollingPercentage,
        boolean scheduleDay,
        boolean analyzable,
        boolean today
    ) {}

    /**
     * One disruption class (or, in {@link Totals}, all classes). Minutes are line-minutes
     * (station-minutes for a station): {@code uniqueMinutes} with any alert of the class,
     * {@code weightedMinutes} weighted by the share of stations affected.
     */
    public record ClassMetric(
        String disruptionClass,
        String label,
        long incidents,
        long activeIncidents,
        long uniqueMinutes,
        double weightedMinutes,
        double weightedSharePercentage,
        long incidentDisruptionMinutes
    ) {}

    public record Totals(
        long observedMinutes,
        long incidents,
        long activeIncidents,
        Long medianTimeToClearMinutes,
        Long p90TimeToClearMinutes,
        long uniqueMinutes,
        double anyAlertPercentage,
        long incidentDisruptionMinutes,
        double weightedImpactMinutes,
        double weightedImpactPercentage,
        List<ClassMetric> classes
    ) {}

    /** A line, or a station on {@code lineId} when the summary is scoped to a line. */
    public record SummaryRow(
        String id,
        String number,
        String label,
        String lineId,
        long observedMinutes,
        long incidents,
        long activeIncidents,
        Long medianTimeToClearMinutes,
        Long p90TimeToClearMinutes,
        long uniqueMinutes,
        double anyAlertPercentage,
        long incidentDisruptionMinutes,
        double weightedImpactMinutes,
        double weightedImpactPercentage,
        List<ClassMetric> classes
    ) {}

    public record CauseBreakdown(
        String cause,
        String label,
        long incidents,
        long incidentDisruptionMinutes,
        double percentage
    ) {}

    public record PreviousPeriod(
        LocalDate from,
        LocalDate to,
        Coverage coverage,
        Totals totals,
        List<SummaryRow> rows
    ) {}

    /** One time-to-clear histogram bin, split into unplanned and planned cleared episodes. */
    public record DurationBucket(
        String id,
        String label,
        int minMinutes,
        Integer maxMinutes,
        long unplanned,
        long planned,
        long total
    ) {}

    public record DurationStats(
        long clearedCount,
        Long medianMinutes,
        Long p90Minutes
    ) {}

    public record DurationDistribution(
        DurationStats all,
        DurationStats unplanned,
        DurationStats planned,
        List<DurationBucket> buckets
    ) {}

    public record SummaryResponse(
        String networkId,
        int methodologyVersion,
        RangeInfo range,
        Coverage coverage,
        String scope,
        String lineId,
        String stationId,
        Totals totals,
        List<SummaryRow> rows,
        List<ReliabilityResponses.AlertTypeBreakdown> breakdown,
        List<CauseBreakdown> causes,
        ReliabilityResponses.TrainCancellationSummary trainCancellations,
        PreviousPeriod previous,
        String previousUnavailableReason,
        String message,
        DurationDistribution durations
    ) {}

    /** Per-line daily or bucket metrics included in {@link SeriesBucket#lines()} when {@code byLine=true}. */
    public record SeriesLineMetric(
        String lineId,
        String number,
        String label,
        long observedMinutes,
        Long uniqueMinutes,
        Double weightedMinutes,
        Double weightedSharePercentage,
        Double serviceStoppedShare,
        Double delayShare,
        Double slowZoneShare
    ) {}

    /**
     * One bucket's days and its own coverage. Metrics are null when the bucket has no
     * analyzable day: a gap, not zero disruption.
     */
    public record SeriesBucket(
        LocalDate from,
        LocalDate to,
        int days,
        int analyzableDays,
        double pollingPercentage,
        double schedulePercentage,
        String confidence,
        long observedMinutes,
        Long uniqueMinutes,
        Double weightedMinutes,
        Double weightedSharePercentage,
        Long incidents,
        List<ClassMetric> classes,
        boolean includesToday,
        List<SeriesLineMetric> lines
    ) {}

    public record SeriesResponse(
        String networkId,
        int methodologyVersion,
        RangeInfo range,
        String granularity,
        String scope,
        String lineId,
        String stationId,
        List<SeriesBucket> buckets,
        String message
    ) {}

    /**
     * One hour of the week in Toronto time ({@code dayOfWeek} 1 = Monday). Minutes are
     * line-minutes: {@code observedMinutes} of scheduled, polled service, and the minutes of
     * it with any alert, per class.
     */
    public record PatternCell(
        int dayOfWeek,
        int hour,
        long observedMinutes,
        long anyAlertMinutes,
        Map<String, Long> classMinutes
    ) {}

    public record PatternsResponse(
        String networkId,
        int methodologyVersion,
        RangeInfo range,
        String scope,
        String lineId,
        String stationId,
        String timeZone,
        List<PatternCell> cells,
        String message
    ) {}

    public record Hotspot(
        int rank,
        String stationId,
        String stationName,
        String lineId,
        String lineNumber,
        String lineLabel,
        long observedMinutes,
        long uniqueMinutes,
        double weightedMinutes,
        double sharePercentage,
        long incidents,
        List<ClassMetric> classes
    ) {}

    /** {@code disruptionClass}, when set, is the one class the stations are ranked on. */
    public record HotspotsResponse(
        String networkId,
        int methodologyVersion,
        RangeInfo range,
        String lineId,
        String disruptionClass,
        String sort,
        int limit,
        List<Hotspot> stations,
        String message
    ) {}

    /** An episode as counted in the range. No provider body text is included. */
    public record EpisodeItem(
        String id,
        String alertId,
        String lineId,
        String lineNumber,
        String lineLabel,
        String disruptionClass,
        String classLabel,
        String impactKind,
        String kindLabel,
        boolean planned,
        String cause,
        String causeLabel,
        String title,
        List<String> stationIds,
        OffsetDateTime openedAt,
        OffsetDateTime closedAt,
        long countedMinutes,
        boolean active
    ) {}

    public record EpisodesResponse(
        String networkId,
        int methodologyVersion,
        RangeInfo range,
        String lineId,
        String stationId,
        int limit,
        long totalCount,
        String sort,
        List<EpisodeItem> episodes,
        String nextCursor,
        String message
    ) {}

    public record CancellationCoverage(
        long observationMinutes,
        double coveragePercentage,
        String confidence,
        int trackedDays,
        int totalDays,
        String label
    ) {}

    public record CancellationCorridorBucket(
        String lineId,
        String number,
        String label,
        long cancellations,
        long scheduleMatchedCancellations
    ) {}

    /** One cancellation trend bucket with its own tracking coverage; counts are null when untracked. */
    public record CancellationBucket(
        LocalDate from,
        LocalDate to,
        int days,
        int trackedDays,
        double coveragePercentage,
        String confidence,
        Long cancellations,
        Long scheduleMatchedCancellations,
        List<CancellationCorridorBucket> corridors,
        boolean includesToday
    ) {}

    public record CancellationsResponse(
        String networkId,
        int methodologyVersion,
        RangeInfo range,
        String granularity,
        String lineId,
        String stationId,
        OffsetDateTime trackingStartedAt,
        CancellationCoverage coverage,
        ReliabilityResponses.TrainCancellationSummary totals,
        List<CancellationBucket> buckets,
        String message
    ) {}

    public record ExportFile(String filename, String csv, int rows) {}

    public record OnTimeTotals(
        int scheduledTrips,
        int observedTrips,
        int terminalObservedTrips,
        int onTimeTrips,
        int lateTrips,
        int cancelledTrips,
        double coveragePercentage,
        Double onTimePercentage
    ) {}

    public record OnTimeCorridorRow(
        String lineId,
        String number,
        String label,
        int scheduledTrips,
        int observedTrips,
        int terminalObservedTrips,
        int onTimeTrips,
        int lateTrips,
        int cancelledTrips,
        double coveragePercentage,
        Double onTimePercentage
    ) {}

    public record OnTimeBucket(
        LocalDate from,
        LocalDate to,
        int scheduledTrips,
        int observedTrips,
        int terminalObservedTrips,
        int onTimeTrips,
        int lateTrips,
        int cancelledTrips,
        double coveragePercentage,
        Double onTimePercentage
    ) {}

    public record OnTimeResponse(
        String networkId,
        LocalDate from,
        LocalDate to,
        String granularity,
        boolean enabled,
        int onTimeThresholdSeconds,
        String definition,
        String source,
        OnTimeTotals totals,
        List<OnTimeCorridorRow> corridors,
        List<OnTimeBucket> buckets,
        String message
    ) {}

    public record TtcDelayLogPublicationPeriod(
        LocalDate from,
        LocalDate to,
        String lastModified,
        int rowCount
    ) {}

    public record TtcDelayLogTotals(
        int incidents,
        int delayMinutes,
        Integer medianDelayMinutes
    ) {}

    public record TtcDelayLogLineRow(
        String lineId,
        String label,
        int incidents,
        int delayMinutes
    ) {}

    public record TtcDelayLogCodeRow(
        String code,
        String description,
        int incidents,
        int delayMinutes
    ) {}

    public record TtcDelayLogBucket(
        LocalDate from,
        LocalDate to,
        int incidents,
        int delayMinutes
    ) {}

    public record TtcDelayLogResponse(
        String networkId,
        LocalDate from,
        LocalDate to,
        String granularity,
        String source,
        String licence,
        TtcDelayLogPublicationPeriod publicationPeriod,
        TtcDelayLogTotals totals,
        List<TtcDelayLogLineRow> lines,
        List<TtcDelayLogCodeRow> topCodes,
        List<TtcDelayLogBucket> buckets,
        String message
    ) {}

    public record TtcPerformancePoint(
        LocalDate readingDate,
        Integer percentage,
        String valueLabel,
        String updatedLabel
    ) {}

    public record TtcPerformanceSeries(
        String metricKey,
        String label,
        String category,
        Integer target,
        List<TtcPerformancePoint> points
    ) {}

    public record TtcPerformanceHistoryResponse(
        String networkId,
        LocalDate from,
        LocalDate to,
        String source,
        List<TtcPerformanceSeries> metrics,
        String message
    ) {}

    public record ErrorResponse(String error, String message) {}
}
