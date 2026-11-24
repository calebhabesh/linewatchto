package com.calebhabesh.linewatch.reliability;

import com.calebhabesh.linewatch.arrival.schedule.GtfsServiceTime;
import com.calebhabesh.linewatch.regional.GoTripUpdateFeed;
import com.calebhabesh.linewatch.regional.MetrolinxProperties;
import com.calebhabesh.linewatch.regional.MetrolinxTripUpdateSnapshots;
import com.calebhabesh.linewatch.regional.RegionalNetworkCatalog;
import com.calebhabesh.linewatch.regional.UpTripUpdateFeed;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.OnTimeBucket;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.OnTimeCorridorRow;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.OnTimeResponse;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.OnTimeTotals;
import com.calebhabesh.linewatch.reliability.RegionalTripObservationRepository.ObservationSummaryRow;
import com.calebhabesh.linewatch.reliability.RegionalTripObservationRepository.ScheduledCountRow;
import com.calebhabesh.linewatch.reliability.RegionalTripObservationRepository.ScheduledTripMeta;
import com.calebhabesh.linewatch.reliability.RegionalTripObservationRepository.TripObservationRow;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Plan 17 A10 (D5): derives per-trip-day GO/UP observations from {@link MetrolinxTripUpdateSnapshots}
 * and serves coverage-labelled on-time performance strictly separate from observed alert minutes.
 */
@Service
public class RegionalTripObservationService {
    private static final Logger log = LoggerFactory.getLogger(RegionalTripObservationService.class);
    static final String SOURCE_LABEL = "Metrolinx GO & UP GTFS-RT TripUpdates";
    static final String DEFINITION_TEXT =
        "Metrolinx published threshold: rail arrival at the final destination within 5 minutes of schedule, "
            + "excluding cancellations. Unobserved scheduled trips are unknown, never counted on time.";

    private final RegionalTripObservationRepository repository;
    private final MetrolinxTripUpdateSnapshots snapshots;
    private final MetrolinxProperties metrolinxProperties;
    private final ReliabilitySourcesProperties sourcesProperties;
    private final Clock clock;

    public RegionalTripObservationService(
        RegionalTripObservationRepository repository,
        MetrolinxTripUpdateSnapshots snapshots,
        MetrolinxProperties metrolinxProperties,
        ReliabilitySourcesProperties sourcesProperties,
        Clock clock
    ) {
        this.repository = repository;
        this.snapshots = snapshots;
        this.metrolinxProperties = metrolinxProperties;
        this.sourcesProperties = sourcesProperties;
        this.clock = clock;
    }

    public int pollOnce() {
        if (!metrolinxProperties.isConfigured()) {
            return 0;
        }
        int total = 0;
        try {
            total += recordGoFeed(snapshots.go());
        } catch (RuntimeException e) {
            log.warn("Failed to record GO trip-update observations: {}", e.getMessage());
        }
        try {
            total += recordUpFeed(snapshots.up());
        } catch (RuntimeException e) {
            log.warn("Failed to record UP trip-update observations: {}", e.getMessage());
        }
        return total;
    }

    public int recordGoFeed(GoTripUpdateFeed feed) {
        if (feed == null) return 0;
        OffsetDateTime observedAt = feed.sourceUpdatedAt() != null ? feed.sourceUpdatedAt() : OffsetDateTime.now(clock);
        LocalDate serviceDate = serviceDateFor(observedAt);
        Map<String, ScheduledTripMeta> schedule = RegionalTripObservationRepository.indexByTripId(
            repository.activeScheduledTrips("go", serviceDate));
        if (schedule.isEmpty()) return 0;

        List<TripObservationRow> rows = new ArrayList<>();
        for (GoTripUpdateFeed.Trip trip : feed.trips()) {
            ScheduledTripMeta meta = lookup(schedule, trip.tripId());
            if (meta == null) continue;
            rows.add(toRow("go", serviceDate, observedAt, meta, trip.stopTimes(), false));
        }
        for (String cancelledTripId : feed.cancelledTripIds()) {
            ScheduledTripMeta meta = lookup(schedule, cancelledTripId);
            if (meta == null) continue;
            rows.add(toRow("go", serviceDate, observedAt, meta, List.of(), true));
        }
        return repository.upsertObservations(rows);
    }

    public int recordUpFeed(UpTripUpdateFeed feed) {
        if (feed == null) return 0;
        OffsetDateTime observedAt = feed.sourceUpdatedAt() != null ? feed.sourceUpdatedAt() : OffsetDateTime.now(clock);
        LocalDate serviceDate = serviceDateFor(observedAt);
        Map<String, ScheduledTripMeta> schedule = RegionalTripObservationRepository.indexByTripId(
            repository.activeScheduledTrips("up", serviceDate));
        if (schedule.isEmpty()) return 0;

        List<TripObservationRow> rows = new ArrayList<>();
        for (UpTripUpdateFeed.Trip trip : feed.trips()) {
            ScheduledTripMeta meta = lookup(schedule, trip.tripId());
            if (meta == null) continue;
            rows.add(toRow("up", serviceDate, observedAt, meta, trip.stopTimes(), false));
        }
        return repository.upsertObservations(rows);
    }

    public OnTimeResponse onTime(LocalDate from, LocalDate to, String lineId, String granularity) {
        int threshold = sourcesProperties.getRegionalOtp().getOnTimeThresholdSeconds();
        List<ScheduledCountRow> scheduled = repository.scheduledCounts(from, to, lineId);
        List<ObservationSummaryRow> observed = repository.observationRows(from, to, lineId);

        Map<LocalDate, Integer> scheduledByDate = new LinkedHashMap<>();
        Map<String, Integer> scheduledByLine = new LinkedHashMap<>();
        for (ScheduledCountRow row : scheduled) {
            scheduledByDate.merge(row.serviceDate(), row.scheduledTrips(), Integer::sum);
            scheduledByLine.merge(row.lineId(), row.scheduledTrips(), Integer::sum);
        }

        Map<LocalDate, Accumulator> byDate = new LinkedHashMap<>();
        Map<String, Accumulator> byLine = new LinkedHashMap<>();
        Accumulator totalAcc = new Accumulator();
        for (ObservationSummaryRow obs : observed) {
            totalAcc.add(obs, threshold);
            byDate.computeIfAbsent(obs.serviceDate(), k -> new Accumulator()).add(obs, threshold);
            byLine.computeIfAbsent(obs.lineId(), k -> new Accumulator()).add(obs, threshold);
        }

        int totalScheduled = scheduledByDate.values().stream().mapToInt(Integer::intValue).sum();
        OnTimeTotals totals = totalAcc.toTotals(totalScheduled);

        List<OnTimeCorridorRow> corridors = new ArrayList<>();
        for (RegionalNetworkCatalog.Route route : RegionalNetworkCatalog.routes()) {
            if (lineId != null && !lineId.isBlank() && !lineId.equals(route.id())) continue;
            int lineSched = scheduledByLine.getOrDefault(route.id(), 0);
            Accumulator acc = byLine.getOrDefault(route.id(), new Accumulator());
            OnTimeTotals lineTotals = acc.toTotals(lineSched);
            corridors.add(new OnTimeCorridorRow(
                route.id(),
                route.number(),
                route.name(),
                lineTotals.scheduledTrips(),
                lineTotals.observedTrips(),
                lineTotals.terminalObservedTrips(),
                lineTotals.onTimeTrips(),
                lineTotals.lateTrips(),
                lineTotals.cancelledTrips(),
                lineTotals.coveragePercentage(),
                lineTotals.onTimePercentage()
            ));
        }
        corridors.sort(Comparator.comparing(OnTimeCorridorRow::label));

        List<LocalDate[]> bucketBounds = ReliabilityRangeService.buckets(from, to, granularity);
        List<OnTimeBucket> buckets = new ArrayList<>(bucketBounds.size());
        for (LocalDate[] bounds : bucketBounds) {
            LocalDate bFrom = bounds[0];
            LocalDate bTo = bounds[1];
            int bSched = 0;
            Accumulator bAcc = new Accumulator();
            for (LocalDate d = bFrom; !d.isAfter(bTo); d = d.plusDays(1)) {
                bSched += scheduledByDate.getOrDefault(d, 0);
                Accumulator dayAcc = byDate.get(d);
                if (dayAcc != null) bAcc.merge(dayAcc);
            }
            OnTimeTotals bt = bAcc.toTotals(bSched);
            buckets.add(new OnTimeBucket(
                bFrom,
                bTo,
                bt.scheduledTrips(),
                bt.observedTrips(),
                bt.terminalObservedTrips(),
                bt.onTimeTrips(),
                bt.lateTrips(),
                bt.cancelledTrips(),
                bt.coveragePercentage(),
                bt.onTimePercentage()
            ));
        }

        String message = totals.observedTrips() == 0
            ? (sourcesProperties.getRegionalOtp().isEnabled()
                ? "No GO/UP trip observations were recorded in this range yet."
                : "GO/UP on-time performance recording is disabled on this deployment.")
            : "Observed " + totals.observedTrips() + " of " + totals.scheduledTrips()
                + " scheduled rail trips (" + totals.coveragePercentage() + "% coverage).";

        return new OnTimeResponse(
            "regional",
            from,
            to,
            granularity,
            sourcesProperties.getRegionalOtp().isEnabled(),
            threshold,
            DEFINITION_TEXT,
            SOURCE_LABEL,
            totals,
            corridors,
            buckets,
            message
        );
    }

    private TripObservationRow toRow(
        String sourceSystem,
        LocalDate serviceDate,
        OffsetDateTime observedAt,
        ScheduledTripMeta meta,
        List<UpTripUpdateFeed.StopTime> stopTimes,
        boolean cancelled
    ) {
        Integer latestDelay = null;
        Integer terminalDelay = null;
        if (!stopTimes.isEmpty()) {
            UpTripUpdateFeed.StopTime lastStop = stopTimes.getLast();
            latestDelay = delaySeconds(lastStop);
            for (UpTripUpdateFeed.StopTime st : stopTimes) {
                String stationId = RegionalNetworkCatalog.stationIdForStopCode(st.stopCode()).orElse(null);
                if (meta.terminalStationId() != null && meta.terminalStationId().equals(stationId)) {
                    terminalDelay = delaySeconds(st);
                }
            }
        }
        return new TripObservationRow(
            sourceSystem,
            serviceDate,
            meta.tripId(),
            meta.tripNumber(),
            meta.lineId(),
            observedAt,
            observedAt,
            latestDelay,
            terminalDelay,
            stopTimes.size(),
            cancelled,
            OffsetDateTime.now(clock)
        );
    }

    private static Integer delaySeconds(UpTripUpdateFeed.StopTime stop) {
        if (stop == null || stop.scheduledAt() == null || stop.reachedAt() == null) return null;
        return (int) Duration.between(stop.scheduledAt(), stop.reachedAt()).toSeconds();
    }

    private static ScheduledTripMeta lookup(Map<String, ScheduledTripMeta> schedule, String tripId) {
        if (tripId == null || tripId.isBlank()) return null;
        String normalized = tripId.trim().toLowerCase(Locale.CANADA);
        ScheduledTripMeta exact = schedule.get(normalized);
        if (exact != null) return exact;
        return schedule.get(normalized.replaceFirst("^\\d{8}[-_]", ""));
    }

    /** GO/UP service dates roll over at 03:30 America/Toronto so post-midnight trains stay on their service day. */
    static LocalDate serviceDateFor(OffsetDateTime instant) {
        ZonedDateTime toronto = instant.atZoneSameInstant(GtfsServiceTime.TORONTO);
        return toronto.toLocalTime().isBefore(java.time.LocalTime.of(3, 30))
            ? toronto.toLocalDate().minusDays(1)
            : toronto.toLocalDate();
    }

    private static final class Accumulator {
        int observed;
        int terminalObserved;
        int onTime;
        int late;
        int cancelled;

        void add(ObservationSummaryRow obs, int thresholdSeconds) {
            observed++;
            if (obs.cancelled()) {
                cancelled++;
                return;
            }
            Integer delay = obs.terminalArrivalDelaySeconds();
            if (delay != null) {
                terminalObserved++;
                if (delay <= thresholdSeconds) {
                    onTime++;
                } else {
                    late++;
                }
            }
        }

        void merge(Accumulator other) {
            this.observed += other.observed;
            this.terminalObserved += other.terminalObserved;
            this.onTime += other.onTime;
            this.late += other.late;
            this.cancelled += other.cancelled;
        }

        OnTimeTotals toTotals(int scheduledTrips) {
            double coverage = scheduledTrips <= 0 ? 0.0
                : Math.min(100.0, Math.round(1000.0 * observed / scheduledTrips) / 10.0);
            int evaluated = terminalObserved + cancelled;
            Double onTimePct = evaluated == 0 ? null
                : Math.round(1000.0 * onTime / evaluated) / 10.0;
            return new OnTimeTotals(
                scheduledTrips,
                observed,
                terminalObserved,
                onTime,
                late,
                cancelled,
                coverage,
                onTimePct
            );
        }
    }
}
