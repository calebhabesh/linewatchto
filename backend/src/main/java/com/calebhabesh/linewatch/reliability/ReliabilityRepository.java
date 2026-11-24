package com.calebhabesh.linewatch.reliability;

import com.calebhabesh.linewatch.regional.RegionalNetworkCatalog;
import com.calebhabesh.linewatch.reliability.ReliabilityEpisodeSource.DisjointSpan;
import com.calebhabesh.linewatch.reliability.ReliabilityEpisodeSource.ExtractedEpisode;
import com.calebhabesh.linewatch.reliability.ReliabilityIntervalCalculator.TimeRange;
import com.calebhabesh.linewatch.reliability.ReliabilityIntervalCalculator.WeightedInterval;
import com.calebhabesh.linewatch.reliability.ReliabilityScheduleCapture.ServiceSpan;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class ReliabilityRepository {
    private static final ZoneId TORONTO_ZONE = ZoneId.of("America/Toronto");

    private final NamedParameterJdbcTemplate jdbc;
    private final ReliabilityScheduleCapture scheduleCapture;
    private final ReliabilityObservationRollup observationRollup;
    private final ReliabilityEpisodeSource episodeSource;
    private final Clock clock;

    @Autowired
    public ReliabilityRepository(
        NamedParameterJdbcTemplate jdbc,
        ReliabilityScheduleCapture scheduleCapture,
        ReliabilityObservationRollup observationRollup,
        ReliabilityEpisodeSource episodeSource,
        Clock clock
    ) {
        this.jdbc = jdbc;
        this.scheduleCapture = scheduleCapture;
        this.observationRollup = observationRollup;
        this.episodeSource = episodeSource;
        this.clock = clock;
    }

    ReliabilityRepository(
        NamedParameterJdbcTemplate jdbc,
        ReliabilityScheduleCapture scheduleCapture,
        ReliabilityObservationRollup observationRollup,
        Clock clock
    ) {
        this(jdbc, scheduleCapture, observationRollup, new ReliabilityEpisodeSource(jdbc), clock);
    }

    /**
     * Serves a service-date range {@code [fromDate..toDate]} clipped at {@code until} from the
     * derived read model ({@code reliability_line_days}, {@code reliability_station_days},
     * {@code reliability_episodes}) for completed derived days combined with a bounded live tail
     * for today (or yesterday+today during late-night service before the nightly job runs).
     * Never recomputes historical dates before yesterday on request.
     */
    public ReliabilityAggregation aggregateServiceDates(
        String networkId,
        String stationId,
        LocalDate fromDate,
        LocalDate toDate,
        OffsetDateTime until
    ) {
        OffsetDateTime since = ReliabilityObservationRollup.dayStart(fromDate);
        int version = currentMethodologyVersion();
        LocalDate derivedThrough = derivedThrough(version, networkId);
        LocalDate today = LocalDate.now(clock.withZone(TORONTO_ZONE));
        LocalDate liveFloor = today.minusDays(1);

        List<TimeRange> observationWindows = observationWindows(networkId, since, until);
        long rollingMinutes = Math.max(1, Math.round(Duration.between(since, until).toSeconds() / 60.0));
        long observedMinutes = ReliabilityIntervalCalculator.minutes(observationWindows);
        double coveragePercentage = Math.min(100.0, Math.round(observedMinutes * 1000.0 / rollingMinutes) / 10.0);
        double scheduleCoveragePercentage = scheduleCapture.scheduleCoveragePercentage(networkId, fromDate, toDate);
        boolean scheduleBacked = scheduleCoveragePercentage > 0.0;
        String serviceWindowBasis = !scheduleBacked
            ? "published schedule coverage unavailable"
            : ("regional".equals(networkId)
                ? "published GO/UP GTFS daily corridor service spans"
                : "published TTC GTFS daily line service spans");
        CancellationAggregation cancellations = "regional".equals(networkId)
            ? regionalCancellations(stationId, since, until, observationWindows, rollingMinutes)
            : CancellationAggregation.unavailable();

        boolean v2 = version >= ReliabilityDerivationService.METHODOLOGY_V2;
        if (!scheduleBacked || observationWindows.isEmpty()) {
            return new ReliabilityAggregation(
                List.of(), List.of(), observedMinutes, coveragePercentage,
                serviceWindowBasis, scheduleBacked, scheduleCoveragePercentage, cancellations, version
            );
        }

        LocalDate lastDerived = derivedThrough == null ? fromDate.minusDays(1) : derivedThrough;
        LocalDate derivedEnd = toDate.isAfter(lastDerived) ? lastDerived : toDate;
        boolean hasDerived = !fromDate.isAfter(derivedEnd);
        LocalDate liveStart = laterDate(fromDate, laterDate(lastDerived.plusDays(1), liveFloor));
        LocalDate liveEnd = toDate.isAfter(today) ? today : toDate;
        boolean hasLive = !liveStart.isAfter(liveEnd);

        Map<String, DayTotals> lineTotals = new LinkedHashMap<>();
        Map<String, Map<String, ClassDayTotals>> classTotalsByLine = new LinkedHashMap<>();
        Map<String, Long> breakdownMinutes = new LinkedHashMap<>();
        Map<String, MergedEpisode> mergedEpisodes = new LinkedHashMap<>();

        if (hasDerived) {
            accumulateDerivedDayTotals(
                version, networkId, stationId, fromDate, derivedEnd,
                lineTotals, classTotalsByLine, breakdownMinutes
            );
            accumulateDerivedEpisodes(version, networkId, stationId, fromDate, derivedEnd, until, mergedEpisodes);
        }

        if (hasLive) {
            accumulateLiveTail(
                v2, networkId, stationId, liveStart, liveEnd, until,
                observationWindows, lineTotals, classTotalsByLine, breakdownMinutes, mergedEpisodes
            );
        }

        List<LineRecord> lines = linesForNetwork(networkId);
        Map<String, List<MergedEpisode>> episodesByLine = mergedEpisodes.values().stream()
            .collect(Collectors.groupingBy(MergedEpisode::lineId));

        List<AggregateRow> rows = lines.stream()
            .filter(line -> lineTotals.containsKey(line.id()))
            .filter(line -> stationId == null || episodesByLine.containsKey(line.id()))
            .map(line -> buildAggregateRow(
                v2,
                line,
                lineTotals.get(line.id()),
                classTotalsByLine.getOrDefault(line.id(), Map.of()),
                episodesByLine.getOrDefault(line.id(), List.of())
            ))
            .filter(row -> row.observedServiceMinutes() > 0)
            .toList();

        Map<String, List<MergedEpisode>> episodesByKind = mergedEpisodes.values().stream()
            .collect(Collectors.groupingBy(ep -> ReliabilityEpisodeSource.v1BreakdownGroup(ep.impactKind())));
        List<BreakdownRow> breakdown = episodesByKind.entrySet().stream()
            .map(entry -> {
                String kind = entry.getKey();
                long episodeCount = entry.getValue().size();
                long minutes = breakdownMinutes.getOrDefault(kind, 0L);
                return new BreakdownRow(kind, episodeCount, minutes);
            })
            .sorted((left, right) -> {
                int minutes = Long.compare(right.incidentMinutes(), left.incidentMinutes());
                return minutes != 0 ? minutes : Long.compare(right.incidents(), left.incidents());
            })
            .toList();

        List<EpisodeOutcome> outcomes = mergedEpisodes.values().stream()
            .filter(ep -> lineTotals.containsKey(ep.lineId()))
            .map(ep -> new EpisodeOutcome(
                ep.episodeKey(), ep.lineId(), ep.impactKind(), ep.disruptionClass(), ep.cause(),
                ReliabilityIntervalCalculator.minutes(ep.countedRanges()), ep.completed(), ep.active()))
            .toList();
        return new ReliabilityAggregation(
            rows, breakdown, observedMinutes, coveragePercentage,
            serviceWindowBasis, true, scheduleCoveragePercentage, cancellations, version, outcomes
        );
    }

    private void accumulateDerivedDayTotals(
        int version,
        String networkId,
        String stationId,
        LocalDate fromDate,
        LocalDate derivedEnd,
        Map<String, DayTotals> lineTotals,
        Map<String, Map<String, ClassDayTotals>> classTotalsByLine,
        Map<String, Long> breakdownMinutes
    ) {
        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("version", version)
            .addValue("networkId", networkId)
            .addValue("fromDate", fromDate)
            .addValue("derivedEnd", derivedEnd);
        String sql;
        if (stationId == null) {
            sql = """
                select line_id, impact_group,
                       sum(observed_minutes) observed_minutes,
                       sum(impacted_minutes) impacted_minutes,
                       sum(weighted_impacted_minutes) weighted_impacted_minutes,
                       sum(incident_minutes) incident_minutes
                from reliability_line_days
                where methodology_version = :version
                  and network_id = :networkId
                  and service_date between :fromDate and :derivedEnd
                group by line_id, impact_group
                """;
        } else {
            params.addValue("stationId", stationId);
            sql = """
                select line_id, impact_group,
                       sum(observed_minutes) observed_minutes,
                       sum(impacted_minutes) impacted_minutes,
                       sum(weighted_impacted_minutes) weighted_impacted_minutes,
                       sum(incident_minutes) incident_minutes
                from reliability_station_days
                where methodology_version = :version
                  and network_id = :networkId
                  and station_id = :stationId
                  and service_date between :fromDate and :derivedEnd
                group by line_id, impact_group
                """;
        }
        jdbc.query(sql, params, rs -> {
            String lineId = rs.getString("line_id");
            String group = rs.getString("impact_group");
            long observed = rs.getLong("observed_minutes");
            long impacted = rs.getLong("impacted_minutes");
            double weighted = rs.getDouble("weighted_impacted_minutes");
            long incident = rs.getLong("incident_minutes");
            if ("all".equals(group)) {
                lineTotals.merge(lineId, new DayTotals(observed, impacted, weighted, incident), DayTotals::add);
            } else if (group.startsWith(ReliabilityEpisodeSource.CLASS_GROUP_PREFIX)) {
                String cls = group.substring(ReliabilityEpisodeSource.CLASS_GROUP_PREFIX.length());
                classTotalsByLine
                    .computeIfAbsent(lineId, ignored -> new LinkedHashMap<>())
                    .merge(cls, new ClassDayTotals(impacted, weighted, incident), ClassDayTotals::add);
            } else {
                breakdownMinutes.merge(ReliabilityEpisodeSource.v1BreakdownGroup(group), incident, Long::sum);
            }
        });
    }

    private void accumulateDerivedEpisodes(
        int version,
        String networkId,
        String stationId,
        LocalDate fromDate,
        LocalDate derivedEnd,
        OffsetDateTime until,
        Map<String, MergedEpisode> mergedEpisodes
    ) {
        List<ServiceSpan> rawSpans = scheduleCapture.serviceSpans(
            networkId, stationId, fromDate.minusDays(1), derivedEnd);
        Set<LocalDate> completeDays = scheduleCapture.completeScheduleDays(networkId, fromDate, derivedEnd);
        List<DisjointSpan> disjoint = ReliabilityEpisodeSource.disjointSpans(rawSpans).stream()
            .filter(span -> !span.serviceDate().isBefore(fromDate) && !span.serviceDate().isAfter(derivedEnd))
            .filter(span -> completeDays.contains(span.serviceDate()))
            .toList();
        if (disjoint.isEmpty()) return;

        Map<String, List<TimeRange>> spansByLine = new HashMap<>();
        OffsetDateTime minStart = null;
        OffsetDateTime maxEnd = null;
        for (DisjointSpan span : disjoint) {
            spansByLine.computeIfAbsent(span.lineId(), ignored -> new ArrayList<>()).add(span.range());
            if (minStart == null || span.range().start().isBefore(minStart)) minStart = span.range().start();
            if (maxEnd == null || span.range().end().isAfter(maxEnd)) maxEnd = span.range().end();
        }
        if (minStart == null || maxEnd == null) return;

        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("version", version)
            .addValue("networkId", networkId)
            .addValue("rangeStart", minStart)
            .addValue("rangeEnd", maxEnd);
        String stationFilter = "";
        if (stationId != null) {
            params.addValue("stationId", stationId);
            stationFilter = " and jsonb_exists(ep.station_ids, :stationId) ";
        }

        Map<String, StoredEpisodeBuilder> builders = new LinkedHashMap<>();
        jdbc.query("""
            select ep.episode_key, ep.line_id, ep.impact_kind, ep.disruption_class, ep.cause, ep.closed_at, ep.completed,
                   lower(piece) starts_at, upper(piece) ends_at
            from reliability_episodes ep
            join lateral unnest(ep.counted * tstzmultirange(tstzrange(cast(:rangeStart as timestamptz), cast(:rangeEnd as timestamptz)))) piece on true
            where ep.methodology_version = :version
              and ep.network_id = :networkId
              and ep.counted && tstzrange(cast(:rangeStart as timestamptz), cast(:rangeEnd as timestamptz))
              """ + stationFilter + """
            order by ep.id, lower(piece)
            """, params, rs -> {
                String key = rs.getString("episode_key");
                StoredEpisodeBuilder builder = builders.computeIfAbsent(key, ignored -> {
                    try {
                        String impactKind = rs.getString("impact_kind");
                        String storedClass = rs.getString("disruption_class");
                        String disruptionClass = storedClass != null && !storedClass.isBlank()
                            ? storedClass
                            : ReliabilityEpisodeSource.disruptionClass(impactKind);
                        return new StoredEpisodeBuilder(
                            key,
                            rs.getString("line_id"),
                            impactKind,
                            disruptionClass,
                            rs.getString("cause"),
                            rs.getObject("closed_at", OffsetDateTime.class),
                            rs.getBoolean("completed")
                        );
                    } catch (java.sql.SQLException e) {
                        throw new IllegalStateException(e);
                    }
                });
                OffsetDateTime start = rs.getObject("starts_at", OffsetDateTime.class);
                OffsetDateTime end = rs.getObject("ends_at", OffsetDateTime.class);
                if (start != null && end != null && end.isAfter(start)) {
                    builder.ranges.add(new TimeRange(start, end));
                }
            });

        OffsetDateTime activeProbe = until.minusSeconds(1);
        for (StoredEpisodeBuilder builder : builders.values()) {
            List<TimeRange> lineSpans = spansByLine.getOrDefault(builder.lineId, List.of());
            List<TimeRange> clipped = ReliabilityIntervalCalculator.intersect(builder.ranges, lineSpans);
            if (clipped.isEmpty()) continue;
            boolean completedAtUntil = builder.completed
                && builder.closedAt != null
                && !builder.closedAt.isAfter(until);
            boolean activeAtUntil = !completedAtUntil
                && ReliabilityIntervalCalculator.contains(clipped, activeProbe);
            mergedEpisodes.put(builder.episodeKey, new MergedEpisode(
                builder.episodeKey, builder.lineId, builder.impactKind, builder.disruptionClass,
                builder.cause, clipped, completedAtUntil, activeAtUntil
            ));
        }
    }

    private void accumulateLiveTail(
        boolean v2,
        String networkId,
        String stationId,
        LocalDate liveStart,
        LocalDate toDate,
        OffsetDateTime until,
        List<TimeRange> observationWindows,
        Map<String, DayTotals> lineTotals,
        Map<String, Map<String, ClassDayTotals>> classTotalsByLine,
        Map<String, Long> breakdownMinutes,
        Map<String, MergedEpisode> mergedEpisodes
    ) {
        List<ServiceSpan> rawSpans = (stationId == null && v2)
            ? scheduleCapture.capturedAllSpans(networkId, liveStart.minusDays(1), toDate)
            : scheduleCapture.serviceSpans(networkId, stationId, liveStart.minusDays(1), toDate);
        Set<LocalDate> completeDays = scheduleCapture.completeScheduleDays(networkId, liveStart, toDate);
        List<DisjointSpan> allDisjoint = ReliabilityEpisodeSource.disjointSpans(rawSpans);

        Map<String, Map<LocalDate, TimeRange>> liveDaySpansByLine = new LinkedHashMap<>();
        Map<String, Map<LocalDate, Set<String>>> scheduledStationsByLineDate = new HashMap<>();
        OffsetDateTime minLiveStart = null;
        for (DisjointSpan span : allDisjoint) {
            if (span.serviceDate().isBefore(liveStart) || span.serviceDate().isAfter(toDate)) continue;
            if (!completeDays.contains(span.serviceDate())) continue;
            boolean wholeLine = ReliabilityScheduleCapture.WHOLE_LINE.equals(span.stationId());
            if (stationId == null && !wholeLine) {
                scheduledStationsByLineDate
                    .computeIfAbsent(span.lineId(), ignored -> new HashMap<>())
                    .computeIfAbsent(span.serviceDate(), ignored -> new HashSet<>())
                    .add(span.stationId());
                continue;
            }
            TimeRange clipped = new TimeRange(span.range().start(), earlier(span.range().end(), until));
            if (!clipped.valid()) continue;
            liveDaySpansByLine
                .computeIfAbsent(span.lineId(), ignored -> new LinkedHashMap<>())
                .put(span.serviceDate(), clipped);
            if (minLiveStart == null || clipped.start().isBefore(minLiveStart)) {
                minLiveStart = clipped.start();
            }
        }
        if (minLiveStart == null || !minLiveStart.isBefore(until)) return;

        Map<String, List<TimeRange>> liveSpansByLine = new LinkedHashMap<>();
        for (Map.Entry<String, Map<LocalDate, TimeRange>> entry : liveDaySpansByLine.entrySet()) {
            liveSpansByLine.put(entry.getKey(), List.copyOf(entry.getValue().values()));
        }

        List<ExtractedEpisode> liveExtracted = episodeSource.extract(networkId, stationId, minLiveStart, until);
        List<EvaluatedEpisode> liveEvaluated = evaluate(liveExtracted, observationWindows, liveSpansByLine, until);
        Map<String, List<EvaluatedEpisode>> liveByLine = liveEvaluated.stream()
            .collect(Collectors.groupingBy(EvaluatedEpisode::lineId));

        boolean singleStationScope = stationId != null;
        for (Map.Entry<String, Map<LocalDate, TimeRange>> lineEntry : liveDaySpansByLine.entrySet()) {
            String lineId = lineEntry.getKey();
            List<EvaluatedEpisode> lineEps = liveByLine.getOrDefault(lineId, List.of());
            Map<LocalDate, Set<String>> lineScheduledByDate =
                scheduledStationsByLineDate.getOrDefault(lineId, Map.of());
            for (Map.Entry<LocalDate, TimeRange> dayEntry : lineEntry.getValue().entrySet()) {
                LocalDate serviceDate = dayEntry.getKey();
                List<TimeRange> daySpan = List.of(dayEntry.getValue());
                long dayObserved = ReliabilityIntervalCalculator.minutes(
                    ReliabilityIntervalCalculator.intersect(daySpan, observationWindows));
                if (dayObserved <= 0) continue;

                Set<String> scheduledStations = singleStationScope
                    ? Set.of(stationId)
                    : lineScheduledByDate.getOrDefault(serviceDate, Set.of());
                int denominator = singleStationScope ? 1 : scheduledStations.size();

                List<TimeRange> allDayRanges = new ArrayList<>();
                List<WeightedInterval> allDayWeighted = new ArrayList<>();
                long allDayIncident = 0;

                Map<String, List<TimeRange>> classDayRanges = new LinkedHashMap<>();
                Map<String, List<WeightedInterval>> classDayWeighted = new LinkedHashMap<>();
                Map<String, Long> classDayIncident = new LinkedHashMap<>();

                for (EvaluatedEpisode ep : lineEps) {
                    List<TimeRange> epDayRanges = ReliabilityIntervalCalculator.intersect(ep.countedRanges(), daySpan);
                    if (epDayRanges.isEmpty()) continue;
                    long epDayMinutes = ReliabilityIntervalCalculator.minutes(epDayRanges);
                    allDayRanges.addAll(epDayRanges);
                    allDayIncident += epDayMinutes;

                    if (v2) {
                        WeightedInterval wi = ReliabilityDerivationService.toWeightedInterval(
                            epDayRanges, ep.stationIds(), scheduledStations, singleStationScope);
                        allDayWeighted.add(wi);
                        classDayRanges.computeIfAbsent(ep.disruptionClass(), ignored -> new ArrayList<>()).addAll(epDayRanges);
                        classDayWeighted.computeIfAbsent(ep.disruptionClass(), ignored -> new ArrayList<>()).add(wi);
                        classDayIncident.merge(ep.disruptionClass(), epDayMinutes, Long::sum);
                    }
                }

                long dayImpacted = ReliabilityIntervalCalculator.minutes(allDayRanges);
                long dayIncident = Math.max(dayImpacted, allDayIncident);
                double dayWeighted = v2
                    ? ReliabilityDerivationService.clampWeighted(
                        ReliabilityIntervalCalculator.weightedMinutes(allDayWeighted, denominator), dayObserved)
                    : dayImpacted;
                lineTotals.merge(lineId, new DayTotals(dayObserved, dayImpacted, dayWeighted, dayIncident), DayTotals::add);

                if (v2) {
                    for (Map.Entry<String, List<TimeRange>> clsEntry : classDayRanges.entrySet()) {
                        String cls = clsEntry.getKey();
                        long clsImpacted = ReliabilityIntervalCalculator.minutes(clsEntry.getValue());
                        long clsIncident = Math.max(clsImpacted, classDayIncident.getOrDefault(cls, 0L));
                        double clsWeighted = ReliabilityDerivationService.clampWeighted(
                            ReliabilityIntervalCalculator.weightedMinutes(classDayWeighted.get(cls), denominator), dayObserved);
                        classTotalsByLine
                            .computeIfAbsent(lineId, ignored -> new LinkedHashMap<>())
                            .merge(cls, new ClassDayTotals(clsImpacted, clsWeighted, clsIncident), ClassDayTotals::add);
                    }
                }
            }
        }

        for (EvaluatedEpisode ep : liveEvaluated) {
            breakdownMinutes.merge(ReliabilityEpisodeSource.v1BreakdownGroup(ep.impactKind()), ep.incidentMinutes(), Long::sum);
            mergedEpisodes.merge(
                ep.episodeKey(),
                new MergedEpisode(
                    ep.episodeKey(), ep.lineId(), ep.impactKind(), ep.disruptionClass(),
                    ep.cause(), ep.countedRanges(), ep.completed(), ep.active()
                ),
                (existing, live) -> {
                    List<TimeRange> combined = new ArrayList<>(existing.countedRanges().size() + live.countedRanges().size());
                    combined.addAll(existing.countedRanges());
                    combined.addAll(live.countedRanges());
                    return new MergedEpisode(
                        existing.episodeKey(),
                        existing.lineId(),
                        live.impactKind(),
                        live.disruptionClass(),
                        live.cause() != null ? live.cause() : existing.cause(),
                        ReliabilityIntervalCalculator.merge(combined, Duration.ZERO),
                        live.completed(),
                        live.active()
                    );
                }
            );
        }
    }

    private AggregateRow buildAggregateRow(
        boolean v2,
        LineRecord line,
        DayTotals totals,
        Map<String, ClassDayTotals> classTotals,
        List<MergedEpisode> episodes
    ) {
        long observedServiceMinutes = totals.observedMinutes();
        long disruptedServiceMinutes = Math.min(observedServiceMinutes, totals.impactedMinutes());
        long incidentMinutes = Math.max(disruptedServiceMinutes, totals.incidentMinutes());
        double impactedPercentage = observedServiceMinutes == 0 ? 0.0
            : Math.min(100.0, Math.round(disruptedServiceMinutes * 1000.0 / observedServiceMinutes) / 10.0);
        double rawAllWeighted = v2
            ? Math.min(observedServiceMinutes, Math.max(0.0, totals.weightedMinutes()))
            : disruptedServiceMinutes;
        double weightedImpactMinutes = round1(rawAllWeighted);
        double weightedImpactPercentage = observedServiceMinutes == 0 ? 0.0
            : Math.min(100.0, Math.round(rawAllWeighted * 1000.0 / observedServiceMinutes) / 10.0);
        List<Long> completedDurations = episodes.stream()
            .filter(MergedEpisode::completed)
            .map(ep -> ReliabilityIntervalCalculator.minutes(ep.countedRanges()))
            .filter(minutes -> minutes > 0)
            .toList();
        List<ClassAggregateRow> classes = v2
            ? buildClassRows(observedServiceMinutes, classTotals, episodes)
            : List.of();
        return new AggregateRow(
            line.id(), line.number(), line.label(),
            episodes.size(),
            episodes.stream().filter(MergedEpisode::active).count(),
            computeMedian(completedDurations),
            disruptedServiceMinutes,
            observedServiceMinutes,
            incidentMinutes,
            impactedPercentage,
            weightedImpactMinutes,
            weightedImpactPercentage,
            classes
        );
    }

    private List<ClassAggregateRow> buildClassRows(
        long observedServiceMinutes,
        Map<String, ClassDayTotals> classTotals,
        List<MergedEpisode> episodes
    ) {
        Map<String, List<MergedEpisode>> episodesByClass = episodes.stream()
            .collect(Collectors.groupingBy(MergedEpisode::disruptionClass));
        List<ClassAggregateRow> rows = new ArrayList<>(ReliabilityEpisodeSource.DISRUPTION_CLASSES.size());
        for (String cls : ReliabilityEpisodeSource.DISRUPTION_CLASSES) {
            List<MergedEpisode> clsEps = episodesByClass.getOrDefault(cls, List.of());
            ClassDayTotals totals = classTotals.getOrDefault(cls, ClassDayTotals.ZERO);
            long uniqueMinutes = Math.min(observedServiceMinutes, totals.impactedMinutes());
            double rawWeighted = Math.min(observedServiceMinutes, Math.max(0.0, totals.weightedMinutes()));
            long incidentMinutes = Math.max(uniqueMinutes, totals.incidentMinutes());
            double share = observedServiceMinutes == 0 ? 0.0
                : Math.min(100.0, Math.round(rawWeighted * 1000.0 / observedServiceMinutes) / 10.0);
            rows.add(new ClassAggregateRow(
                cls,
                clsEps.size(),
                clsEps.stream().filter(MergedEpisode::active).count(),
                uniqueMinutes,
                round1(rawWeighted),
                share,
                incidentMinutes
            ));
        }
        return List.copyOf(rows);
    }

    int currentMethodologyVersion() {
        List<Integer> versions = jdbc.query(
            "select current_version from reliability_methodology where id = 1",
            (rs, row) -> rs.getInt("current_version")
        );
        return versions.isEmpty() ? 1 : versions.getFirst();
    }

    LocalDate derivedThrough(int version, String networkId) {
        List<LocalDate> rows = jdbc.query("""
            select derived_through
            from reliability_derivations
            where methodology_version = :version and network_id = :networkId
            """, new MapSqlParameterSource()
                .addValue("version", version)
                .addValue("networkId", networkId),
            (rs, row) -> rs.getObject("derived_through", LocalDate.class));
        return rows.isEmpty() ? null : rows.getFirst();
    }

    private CancellationAggregation regionalCancellations(
        String stationId,
        OffsetDateTime since,
        OffsetDateTime until,
        List<TimeRange> observationWindows,
        long rollingMinutes
    ) {
        OffsetDateTime trackingStartedAt = jdbc.queryForObject("""
            select min(started_at)
            from regional_train_cancellation_tracking
            where id = 1 and started_at < :until
            """, new MapSqlParameterSource("until", until), OffsetDateTime.class);
        if (trackingStartedAt == null) return CancellationAggregation.unavailable();

        OffsetDateTime trackingStart = later(trackingStartedAt, since);
        List<TimeRange> trackedObservationWindows = trackingStart.isBefore(until)
            ? ReliabilityIntervalCalculator.intersect(
                observationWindows,
                List.of(new TimeRange(trackingStart, until))
            )
            : List.of();
        long trackedObservationMinutes = ReliabilityIntervalCalculator.minutes(trackedObservationWindows);
        double trackingCoverage = Math.min(100.0,
            Math.round(trackedObservationMinutes * 1000.0 / rollingMinutes) / 10.0);

        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("since", since)
            .addValue("until", until);
        if (stationId != null) params.addValue("stationId", stationId);
        String stationFilter = stationId == null
            ? ""
            : " and jsonb_exists(cancellation.station_ids, :stationId) ";
        List<CancellationRow> rows = jdbc.query("""
            select cancellation.line_id,
                   count(*) cancellations,
                   count(*) filter (where cancellation.schedule_matched) schedule_matched_cancellations
            from regional_train_cancellations cancellation
            where coalesce(cancellation.scheduled_start_at, cancellation.first_seen_at) >= :since
              and coalesce(cancellation.scheduled_start_at, cancellation.first_seen_at) < :until
              """ + stationFilter + """
            group by cancellation.line_id
            order by cancellations desc, cancellation.line_id
            """, params, (rs, row) -> new CancellationRow(
                rs.getString("line_id"),
                rs.getLong("cancellations"),
                rs.getLong("schedule_matched_cancellations")
            ));
        return new CancellationAggregation(
            rows.stream().mapToLong(CancellationRow::cancellations).sum(),
            rows.stream().mapToLong(CancellationRow::scheduleMatchedCancellations).sum(),
            trackedObservationMinutes,
            trackingCoverage,
            rows
        );
    }

    private List<EvaluatedEpisode> evaluate(
        List<ExtractedEpisode> episodes,
        List<TimeRange> observationWindows,
        Map<String, List<TimeRange>> serviceWindows,
        OffsetDateTime until
    ) {
        List<EvaluatedEpisode> evaluated = new ArrayList<>();
        OffsetDateTime activeProbe = until.minusSeconds(1);
        for (ExtractedEpisode episode : episodes) {
            List<TimeRange> counted = ReliabilityIntervalCalculator.intersectAll(
                episode.ranges(),
                observationWindows,
                serviceWindows.getOrDefault(episode.lineId(), List.of())
            );
            if (counted.isEmpty()) continue;
            evaluated.add(new EvaluatedEpisode(
                episode.episodeKey(),
                episode.lineId(),
                episode.impactKind(),
                ReliabilityEpisodeSource.disruptionClass(episode.impactKind()),
                episode.cause(),
                episode.stationIds(),
                counted,
                ReliabilityIntervalCalculator.minutes(counted),
                episode.completed(),
                episode.sourceActive() && ReliabilityIntervalCalculator.contains(counted, activeProbe)
            ));
        }
        return List.copyOf(evaluated);
    }

    /** Polling coverage: final roll-ups for completed dates, raw runs only for today and unfinalized yesterday. */
    private List<TimeRange> observationWindows(
        String networkId,
        OffsetDateTime since,
        OffsetDateTime until
    ) {
        return observationRollup.observationWindows(networkId, since, until);
    }

    private List<LineRecord> linesForNetwork(String networkId) {
        return "regional".equals(networkId)
            ? RegionalNetworkCatalog.routes().stream()
                .map(route -> new LineRecord(route.id(), route.number(), route.name()))
                .toList()
            : fetchTransitLines();
    }

    private List<LineRecord> fetchTransitLines() {
        return jdbc.query("""
            select id, number, name from transit_lines
            where id in ('line-1', 'line-2', 'line-4', 'line-5', 'line-6')
            order by number
            """, (rs, row) -> new LineRecord(
                rs.getString("id"), rs.getString("number"), rs.getString("name")
            ));
    }

    private static Long computeMedian(List<Long> values) {
        if (values == null || values.isEmpty()) return null;
        List<Long> sorted = new ArrayList<>(values);
        Collections.sort(sorted);
        int middle = sorted.size() / 2;
        return sorted.size() % 2 == 0
            ? Math.round((sorted.get(middle - 1) + sorted.get(middle)) / 2.0)
            : sorted.get(middle);
    }

    private static OffsetDateTime earlier(OffsetDateTime first, OffsetDateTime second) {
        return first.isBefore(second) ? first : second;
    }

    private static OffsetDateTime later(OffsetDateTime first, OffsetDateTime second) {
        return first.isAfter(second) ? first : second;
    }

    private static LocalDate laterDate(LocalDate first, LocalDate second) {
        return first.isAfter(second) ? first : second;
    }

    private static double round1(double value) {
        return Math.round(value * 10.0) / 10.0;
    }

    public record ReliabilityAggregation(
        List<AggregateRow> rows,
        List<BreakdownRow> breakdown,
        long observationMinutes,
        double coveragePercentage,
        String serviceWindowBasis,
        boolean scheduleBacked,
        double scheduleCoveragePercentage,
        CancellationAggregation cancellations,
        int methodologyVersion,
        List<EpisodeOutcome> episodes
    ) {
        public ReliabilityAggregation(
            List<AggregateRow> rows,
            List<BreakdownRow> breakdown,
            long observationMinutes,
            double coveragePercentage,
            String serviceWindowBasis,
            boolean scheduleBacked,
            double scheduleCoveragePercentage,
            CancellationAggregation cancellations,
            int methodologyVersion
        ) {
            this(
                rows, breakdown, observationMinutes, coveragePercentage,
                serviceWindowBasis, scheduleBacked, scheduleCoveragePercentage,
                cancellations, methodologyVersion, List.of()
            );
        }

        public ReliabilityAggregation(
            List<AggregateRow> rows,
            List<BreakdownRow> breakdown,
            long observationMinutes,
            double coveragePercentage,
            String serviceWindowBasis,
            boolean scheduleBacked,
            double scheduleCoveragePercentage,
            CancellationAggregation cancellations
        ) {
            this(
                rows, breakdown, observationMinutes, coveragePercentage,
                serviceWindowBasis, scheduleBacked, scheduleCoveragePercentage,
                cancellations, ReliabilityDerivationService.METHODOLOGY_V1
            );
        }
    }

    public record AggregateRow(
        String id,
        String number,
        String label,
        long incidents,
        long activeIncidents,
        Long medianDurationMinutes,
        long serviceImpactMinutes,
        long observedServiceMinutes,
        long incidentDisruptionMinutes,
        double serviceImpactPercentage,
        double weightedImpactMinutes,
        double weightedImpactPercentage,
        List<ClassAggregateRow> classes
    ) {
        public AggregateRow(
            String id,
            String number,
            String label,
            long incidents,
            long activeIncidents,
            Long medianDurationMinutes,
            long serviceImpactMinutes,
            long observedServiceMinutes,
            long incidentDisruptionMinutes,
            double serviceImpactPercentage
        ) {
            this(
                id, number, label, incidents, activeIncidents, medianDurationMinutes,
                serviceImpactMinutes, observedServiceMinutes, incidentDisruptionMinutes,
                serviceImpactPercentage, serviceImpactMinutes, serviceImpactPercentage, List.of()
            );
        }
    }

    public record ClassAggregateRow(
        String disruptionClass,
        long incidents,
        long activeIncidents,
        long uniqueMinutes,
        double weightedMinutes,
        double weightedSharePercentage,
        long incidentDisruptionMinutes
    ) {}

    public record BreakdownRow(String impactKind, long incidents, long incidentMinutes) {}

    /**
     * One counted episode in the aggregated range, for percentiles, totals and the cause
     * breakdown. {@code countedMinutes} is its counted time inside the range.
     */
    public record EpisodeOutcome(
        String episodeKey,
        String lineId,
        String impactKind,
        String disruptionClass,
        String cause,
        long countedMinutes,
        boolean completed,
        boolean active
    ) {}

    public record CancellationAggregation(
        long cancellations,
        long scheduleMatchedCancellations,
        long observationMinutes,
        double coveragePercentage,
        List<CancellationRow> rows
    ) {
        static CancellationAggregation unavailable() {
            return new CancellationAggregation(0, 0, 0, 0.0, List.of());
        }
    }

    public record CancellationRow(
        String lineId,
        long cancellations,
        long scheduleMatchedCancellations
    ) {}

    private record EvaluatedEpisode(
        String episodeKey,
        String lineId,
        String impactKind,
        String disruptionClass,
        String cause,
        List<String> stationIds,
        List<TimeRange> countedRanges,
        long incidentMinutes,
        boolean completed,
        boolean active
    ) {}

    private record MergedEpisode(
        String episodeKey,
        String lineId,
        String impactKind,
        String disruptionClass,
        String cause,
        List<TimeRange> countedRanges,
        boolean completed,
        boolean active
    ) {}

    private record DayTotals(
        long observedMinutes,
        long impactedMinutes,
        double weightedMinutes,
        long incidentMinutes
    ) {
        DayTotals add(DayTotals other) {
            return new DayTotals(
                observedMinutes + other.observedMinutes,
                impactedMinutes + other.impactedMinutes,
                weightedMinutes + other.weightedMinutes,
                incidentMinutes + other.incidentMinutes
            );
        }
    }

    private record ClassDayTotals(long impactedMinutes, double weightedMinutes, long incidentMinutes) {
        static final ClassDayTotals ZERO = new ClassDayTotals(0L, 0.0, 0L);

        ClassDayTotals add(ClassDayTotals other) {
            return new ClassDayTotals(
                impactedMinutes + other.impactedMinutes,
                weightedMinutes + other.weightedMinutes,
                incidentMinutes + other.incidentMinutes
            );
        }
    }

    private static final class StoredEpisodeBuilder {
        final String episodeKey;
        final String lineId;
        final String impactKind;
        final String disruptionClass;
        final String cause;
        final OffsetDateTime closedAt;
        final boolean completed;
        final List<TimeRange> ranges = new ArrayList<>();

        StoredEpisodeBuilder(
            String episodeKey,
            String lineId,
            String impactKind,
            String disruptionClass,
            String cause,
            OffsetDateTime closedAt,
            boolean completed
        ) {
            this.episodeKey = episodeKey;
            this.lineId = lineId;
            this.impactKind = impactKind;
            this.disruptionClass = disruptionClass;
            this.cause = cause;
            this.closedAt = closedAt;
            this.completed = completed;
        }
    }

    private record LineRecord(String id, String number, String label) {}
}
