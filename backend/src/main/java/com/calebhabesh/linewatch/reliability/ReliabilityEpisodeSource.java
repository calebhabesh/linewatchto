package com.calebhabesh.linewatch.reliability;

import com.calebhabesh.linewatch.alert.AlertCategoryLabels;
import com.calebhabesh.linewatch.reliability.ReliabilityIntervalCalculator.TimeRange;
import com.calebhabesh.linewatch.reliability.ReliabilityScheduleCapture.ServiceSpan;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

/**
 * Owns reliability episode extraction (TTC and regional) and service-span splitting.
 *
 * <p>Reads are bounded to the requested window plus alerts active at its start (and alerts with
 * closure periods overlapping the window), eliminating full-history snapshot scans.
 * Lifecycle stitching, closure period overrides and interval math reuse
 * {@link ReliabilityIntervalCalculator} unchanged so methodology v1 matches the original
 * request-time rules.
 */
@Repository
public class ReliabilityEpisodeSource {
    static final Duration LIFECYCLE_STITCH_GAP = Duration.ofMinutes(5);
    static final String CLASS_GROUP_PREFIX = "class:";
    static final List<String> DISRUPTION_CLASSES = List.of(
        AlertCategoryLabels.CLASS_SERVICE_STOPPED,
        AlertCategoryLabels.CLASS_DELAY,
        AlertCategoryLabels.CLASS_SLOW_ZONE
    );
    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() {};
    private static final ObjectMapper JSON = new ObjectMapper();

    private final NamedParameterJdbcTemplate jdbc;

    public ReliabilityEpisodeSource(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record ExtractedEpisode(
        String episodeKey,
        String alertId,
        String lineId,
        String impactKind,
        String cause,
        List<String> stationIds,
        OffsetDateTime openedAt,
        OffsetDateTime closedAt,
        List<TimeRange> ranges,
        boolean completed,
        boolean sourceActive
    ) {}

    public record DisjointSpan(
        LocalDate serviceDate,
        String lineId,
        String stationId,
        TimeRange range
    ) {}

    /**
     * Extracts episodes overlapping {@code [windowStart, windowEnd)} using bounded snapshot reads.
     * When {@code stationId} is non-null, filters to alerts/snapshots referencing that station.
     */
    public List<ExtractedEpisode> extract(
        String networkId,
        String stationId,
        OffsetDateTime windowStart,
        OffsetDateTime windowEnd
    ) {
        if (!windowStart.isBefore(windowEnd)) return List.of();
        return "regional".equals(networkId)
            ? extractRegional(stationId, windowStart, windowEnd)
            : extractTtc(stationId, windowStart, windowEnd);
    }

    /**
     * Makes daily service spans disjoint per {@code (lineId, stationId)}: each service date's
     * span starts no earlier than the previous date's end, so sums across service dates never
     * double count spans running past midnight.
     */
    static List<DisjointSpan> disjointSpans(List<ServiceSpan> spans) {
        if (spans == null || spans.isEmpty()) return List.of();
        record ScopeKey(String lineId, String stationId) {}
        Map<ScopeKey, List<ServiceSpan>> grouped = new LinkedHashMap<>();
        for (ServiceSpan span : spans) {
            grouped.computeIfAbsent(new ScopeKey(span.lineId(), span.stationId()), ignored -> new ArrayList<>())
                .add(span);
        }
        List<DisjointSpan> result = new ArrayList<>(spans.size());
        for (List<ServiceSpan> group : grouped.values()) {
            group.sort(Comparator.comparing(ServiceSpan::serviceDate).thenComparing(ServiceSpan::start));
            OffsetDateTime previousEnd = null;
            for (ServiceSpan span : group) {
                OffsetDateTime start = previousEnd != null && span.start().isBefore(previousEnd)
                    ? previousEnd
                    : span.start();
                TimeRange range = new TimeRange(start, span.end());
                if (range.valid()) {
                    result.add(new DisjointSpan(span.serviceDate(), span.lineId(), span.stationId(), range));
                    previousEnd = span.end();
                }
            }
        }
        result.sort(Comparator.comparing(DisjointSpan::serviceDate)
            .thenComparing(DisjointSpan::lineId)
            .thenComparing(DisjointSpan::stationId));
        return List.copyOf(result);
    }

    /**
     * Splits {@code ranges} across a line's or station's disjoint service-date spans.
     * Returns only dates with a non-empty intersection.
     */
    static Map<LocalDate, List<TimeRange>> splitByServiceDate(
        List<TimeRange> ranges,
        Map<LocalDate, TimeRange> disjointDaySpans
    ) {
        if (ranges == null || ranges.isEmpty() || disjointDaySpans == null || disjointDaySpans.isEmpty()) {
            return Map.of();
        }
        Map<LocalDate, List<TimeRange>> byDate = new LinkedHashMap<>();
        for (Map.Entry<LocalDate, TimeRange> entry : disjointDaySpans.entrySet()) {
            List<TimeRange> slice = ReliabilityIntervalCalculator.intersect(ranges, List.of(entry.getValue()));
            if (!slice.isEmpty()) {
                byDate.put(entry.getKey(), slice);
            }
        }
        return byDate;
    }

    /** Formats a merged range list as a PostgreSQL {@code tstzmultirange} literal. */
    static String toMultirangeLiteral(List<TimeRange> ranges) {
        List<TimeRange> merged = ReliabilityIntervalCalculator.merge(ranges, Duration.ZERO);
        if (merged.isEmpty()) return "{}";
        StringBuilder builder = new StringBuilder("{");
        for (int i = 0; i < merged.size(); i++) {
            if (i > 0) builder.append(',');
            TimeRange range = merged.get(i);
            builder.append('[').append(range.start().toInstant()).append(',').append(range.end().toInstant()).append(')');
        }
        return builder.append('}').toString();
    }

    static String toJsonArray(Collection<String> values) {
        if (values == null || values.isEmpty()) return "[]";
        try {
            return JSON.writeValueAsString(values);
        } catch (RuntimeException exception) {
            throw new IllegalStateException("Failed to serialize station_ids", exception);
        }
    }

    static List<String> parseJsonArray(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            List<String> parsed = JSON.readValue(json, STRING_LIST);
            return parsed == null ? List.of() : parsed;
        } catch (RuntimeException exception) {
            return List.of();
        }
    }

    static String normalizeImpactKind(String impactKind) {
        if (impactKind == null || impactKind.isBlank()) return "service-alert";
        return impactKind.trim().toLowerCase(Locale.ROOT).replace('_', '-');
    }

    /** V1 breakdown folds {@code limited-service} into {@code delay}. */
    static String v1BreakdownGroup(String impactKind) {
        String normalized = normalizeImpactKind(impactKind);
        return "limited-service".equals(normalized) ? "delay" : normalized;
    }

    static String disruptionClass(String impactKind) {
        return AlertCategoryLabels.disruptionClass(impactKind);
    }

    static boolean isPlanned(String impactKind) {
        return AlertCategoryLabels.isPlannedImpactKind(impactKind);
    }

    static String classImpactGroup(String disruptionClass) {
        return CLASS_GROUP_PREFIX + disruptionClass;
    }

    static boolean isClosure(String impactKind) {
        String normalized = normalizeImpactKind(impactKind);
        return "planned-closure".equals(normalized) || "closure".equals(normalized);
    }

    private List<ExtractedEpisode> extractTtc(String stationId, OffsetDateTime windowStart, OffsetDateTime windowEnd) {
        OffsetDateTime stitchStart = windowStart.minus(LIFECYCLE_STITCH_GAP);
        Set<String> candidateIds = new LinkedHashSet<>(fetchTtcCandidateAlertIds(stationId, stitchStart, windowStart, windowEnd));
        if (candidateIds.isEmpty()) return List.of();

        Map<String, List<ClosurePeriodRecord>> periodsByAlert = fetchClosurePeriods(candidateIds);
        // Include any child alert linked to a candidate parent's period so effect overrides and deduplication match.
        Set<String> childSourceIds = periodsByAlert.values().stream()
            .flatMap(List::stream)
            .map(ClosurePeriodRecord::sourcePeriodId)
            .filter(id -> id != null && !"parent".equalsIgnoreCase(id) && !"fallback".equalsIgnoreCase(id))
            .collect(Collectors.toCollection(LinkedHashSet::new));
        if (!childSourceIds.isEmpty()) {
            List<String> linkedChildAlertIds = fetchTtcAlertIdsBySourceIds(childSourceIds, stationId);
            candidateIds.addAll(linkedChildAlertIds);
            // Also include parents of any candidate that is itself a linked child (so child deduplication works).
            List<String> linkedParentIds = fetchTtcParentAlertIdsForChildAlerts(candidateIds, stationId);
            if (!linkedParentIds.isEmpty()) {
                if (candidateIds.addAll(linkedParentIds)) {
                    periodsByAlert = fetchClosurePeriods(candidateIds);
                }
            }
        } else {
            List<String> linkedParentIds = fetchTtcParentAlertIdsForChildAlerts(candidateIds, stationId);
            if (!linkedParentIds.isEmpty() && candidateIds.addAll(linkedParentIds)) {
                periodsByAlert = fetchClosurePeriods(candidateIds);
            }
        }

        List<RawEpisode> raw = rawTtcEpisodesForAlerts(candidateIds, windowEnd);
        if (raw.isEmpty()) return List.of();

        Map<String, List<String>> stationsByAlert = fetchTtcAlertStations(candidateIds);
        Map<String, String> childPeriodParent = periodsByAlert.values().stream()
            .flatMap(List::stream)
            .filter(period -> !"parent".equalsIgnoreCase(period.sourcePeriodId())
                && !"fallback".equalsIgnoreCase(period.sourcePeriodId()))
            .collect(Collectors.toMap(
                ClosurePeriodRecord::sourcePeriodId,
                ClosurePeriodRecord::alertId,
                (first, second) -> first
            ));

        Map<String, List<RawEpisode>> byAlert = raw.stream()
            .collect(Collectors.groupingBy(RawEpisode::alertId, LinkedHashMap::new, Collectors.toList()));
        Map<String, List<RawEpisode>> bySource = raw.stream()
            .filter(episode -> episode.sourceId() != null)
            .collect(Collectors.groupingBy(RawEpisode::sourceId));

        List<ExtractedEpisode> episodes = new ArrayList<>();
        for (Map.Entry<String, List<RawEpisode>> entry : byAlert.entrySet()) {
            List<RawEpisode> alertEpisodes = entry.getValue();
            RawEpisode representative = alertEpisodes.getFirst();
            String linkedParent = childPeriodParent.get(representative.sourceId());
            if (linkedParent != null && byAlert.containsKey(linkedParent) && !linkedParent.equals(entry.getKey())) {
                continue;
            }
            List<String> stationIds = stationsByAlert.getOrDefault(entry.getKey(), List.of());
            if (isClosure(representative.impactKind())
                || ("limited-service".equals(normalizeImpactKind(representative.impactKind()))
                    && periodsByAlert.containsKey(entry.getKey()))) {
                String parentAlertId = childPeriodParent.get(representative.sourceId());
                if (parentAlertId != null && !parentAlertId.equals(representative.alertId())) continue;
                OffsetDateTime firstObserved = alertEpisodes.stream().map(RawEpisode::openedAt)
                    .min(OffsetDateTime::compareTo).orElse(windowStart);
                boolean sourceActive = alertEpisodes.stream().anyMatch(RawEpisode::sourceActive);
                Map<String, List<TimeRange>> rangesByEffect = new LinkedHashMap<>();
                for (ClosurePeriodRecord period : periodsByAlert.getOrDefault(entry.getKey(), List.of())) {
                    String effect = normalizeImpactKind(bySource.getOrDefault(period.sourcePeriodId(), List.of()).stream()
                        .filter(child -> !child.openedAt().isAfter(period.endsAt()))
                        .filter(child -> child.clearedAt() == null || child.clearedAt().isAfter(period.startsAt()))
                        .max(Comparator.comparing(RawEpisode::openedAt))
                        .map(RawEpisode::impactKind).orElse(representative.impactKind()));
                    rangesByEffect.computeIfAbsent(effect, ignored -> new ArrayList<>())
                        .add(new TimeRange(later(period.startsAt(), firstObserved), period.endsAt()));
                }
                for (Map.Entry<String, List<TimeRange>> effect : rangesByEffect.entrySet()) {
                    for (TimeRange occurrence : ReliabilityIntervalCalculator.merge(effect.getValue(), Duration.ZERO)) {
                        if (occurrence.end().isAfter(windowStart) && occurrence.start().isBefore(windowEnd)) {
                            boolean completed = !occurrence.end().isAfter(windowEnd);
                            episodes.add(new ExtractedEpisode(
                                closureEpisodeKey(entry.getKey(), effect.getKey(), occurrence.start()),
                                entry.getKey(),
                                representative.lineId(),
                                effect.getKey(),
                                representative.cause(),
                                stationIds,
                                occurrence.start(),
                                completed ? occurrence.end() : null,
                                List.of(new TimeRange(occurrence.start(), earlier(occurrence.end(), windowEnd))),
                                completed,
                                sourceActive
                            ));
                        }
                    }
                }
            } else {
                episodes.addAll(stitchLifecycleEpisodes(alertEpisodes, stationIds, windowStart, windowEnd));
            }
        }
        return List.copyOf(episodes);
    }

    private List<ExtractedEpisode> extractRegional(String stationId, OffsetDateTime windowStart, OffsetDateTime windowEnd) {
        OffsetDateTime stitchStart = windowStart.minus(LIFECYCLE_STITCH_GAP);
        Set<String> candidateIds = new LinkedHashSet<>(fetchRegionalCandidateAlertIds(stationId, stitchStart, windowStart, windowEnd));
        if (candidateIds.isEmpty()) return List.of();

        // Always read the full lifecycle of each candidate alert without filtering by stationId inside
        // the CTE: if an alert's station_ids changed before its active=false snapshot, filtering inside
        // the CTE drops the clear snapshot and turns the alert into a zombie. Filter by stationId after.
        List<RawEpisode> raw = rawRegionalEpisodesForAlerts(candidateIds, windowEnd);
        if (raw.isEmpty()) return List.of();

        Map<String, List<RegionalSnapshotStations>> stationsByAlert = fetchRegionalSnapshotStations(candidateIds, windowEnd);
        Map<String, ApplicablePeriod> applicablePeriods = fetchRegionalApplicablePeriods(candidateIds);

        Map<String, List<RawEpisode>> byAlert = raw.stream()
            .collect(Collectors.groupingBy(RawEpisode::alertId, LinkedHashMap::new, Collectors.toList()));
        List<ExtractedEpisode> episodes = new ArrayList<>();
        for (Map.Entry<String, List<RawEpisode>> entry : byAlert.entrySet()) {
            List<RawEpisode> alertEpisodes = entry.getValue();
            RawEpisode representative = alertEpisodes.getFirst();
            List<RegionalSnapshotStations> alertStations = stationsByAlert.getOrDefault(entry.getKey(), List.of());
            if (isClosure(representative.impactKind())) {
                ApplicablePeriod period = applicablePeriods.get(representative.alertId());
                if (period == null) continue;
                OffsetDateTime firstObserved = alertEpisodes.stream().map(RawEpisode::openedAt)
                    .min(OffsetDateTime::compareTo).orElse(windowStart);
                TimeRange occurrence = new TimeRange(later(period.start(), firstObserved), period.end());
                if (occurrence.valid() && occurrence.end().isAfter(windowStart) && occurrence.start().isBefore(windowEnd)) {
                    List<String> stationIds = unionStations(alertStations, null, null);
                    if (stationId != null && !stationIds.contains(stationId)) continue;
                    boolean completed = !occurrence.end().isAfter(windowEnd);
                    String normalizedKind = normalizeImpactKind(representative.impactKind());
                    episodes.add(new ExtractedEpisode(
                        closureEpisodeKey(representative.alertId(), normalizedKind, occurrence.start()),
                        representative.alertId(),
                        representative.lineId(),
                        normalizedKind,
                        null,
                        stationIds,
                        occurrence.start(),
                        completed ? occurrence.end() : null,
                        List.of(new TimeRange(occurrence.start(), earlier(occurrence.end(), windowEnd))),
                        completed,
                        alertEpisodes.stream().anyMatch(RawEpisode::sourceActive)
                    ));
                }
            } else {
                for (ExtractedEpisode ep : stitchRegionalLifecycleEpisodes(alertEpisodes, alertStations, windowStart, windowEnd)) {
                    if (stationId == null || ep.stationIds().contains(stationId)) {
                        episodes.add(ep);
                    }
                }
            }
        }
        return List.copyOf(episodes);
    }

    private List<ExtractedEpisode> stitchLifecycleEpisodes(
        List<RawEpisode> raw,
        List<String> stationIds,
        OffsetDateTime windowStart,
        OffsetDateTime windowEnd
    ) {
        if (raw.isEmpty()) return List.of();
        RawEpisode representative = raw.getFirst();
        String normalizedKind = normalizeImpactKind(representative.impactKind());
        List<TimeRange> stitched = ReliabilityIntervalCalculator.merge(raw.stream()
            .map(episode -> new TimeRange(
                episode.openedAt(),
                earlier(episode.clearedAt() == null ? windowEnd : episode.clearedAt(), windowEnd)
            ))
            .toList(), LIFECYCLE_STITCH_GAP);
        List<ExtractedEpisode> episodes = new ArrayList<>();
        for (TimeRange range : stitched) {
            if (!range.valid()) continue;
            if (!range.end().isAfter(windowStart) || !range.start().isBefore(windowEnd)) continue;
            boolean completed = raw.stream().anyMatch(episode -> episode.clearedAt() != null
                && !episode.clearedAt().isBefore(range.end())
                && !episode.openedAt().isAfter(range.end()));
            boolean sourceActive = raw.stream().anyMatch(episode -> episode.sourceActive()
                && !episode.openedAt().isAfter(range.end())
                && (episode.clearedAt() == null || !episode.clearedAt().isBefore(range.start())));
            episodes.add(new ExtractedEpisode(
                lifecycleEpisodeKey(representative.alertId(), range.start()),
                representative.alertId(),
                representative.lineId(),
                normalizedKind,
                representative.cause(),
                stationIds,
                range.start(),
                completed ? range.end() : null,
                List.of(range),
                completed,
                sourceActive
            ));
        }
        return episodes;
    }

    private List<ExtractedEpisode> stitchRegionalLifecycleEpisodes(
        List<RawEpisode> raw,
        List<RegionalSnapshotStations> alertStations,
        OffsetDateTime windowStart,
        OffsetDateTime windowEnd
    ) {
        if (raw.isEmpty()) return List.of();
        RawEpisode representative = raw.getFirst();
        String normalizedKind = normalizeImpactKind(representative.impactKind());
        List<TimeRange> stitched = ReliabilityIntervalCalculator.merge(raw.stream()
            .map(episode -> new TimeRange(
                episode.openedAt(),
                earlier(episode.clearedAt() == null ? windowEnd : episode.clearedAt(), windowEnd)
            ))
            .toList(), LIFECYCLE_STITCH_GAP);
        List<ExtractedEpisode> episodes = new ArrayList<>();
        for (TimeRange range : stitched) {
            if (!range.valid()) continue;
            if (!range.end().isAfter(windowStart) || !range.start().isBefore(windowEnd)) continue;
            boolean completed = raw.stream().anyMatch(episode -> episode.clearedAt() != null
                && !episode.clearedAt().isBefore(range.end())
                && !episode.openedAt().isAfter(range.end()));
            boolean sourceActive = raw.stream().anyMatch(episode -> episode.sourceActive()
                && !episode.openedAt().isAfter(range.end())
                && (episode.clearedAt() == null || !episode.clearedAt().isBefore(range.start())));
            List<String> stationIds = unionStations(alertStations, range.start(), range.end());
            episodes.add(new ExtractedEpisode(
                lifecycleEpisodeKey(representative.alertId(), range.start()),
                representative.alertId(),
                representative.lineId(),
                normalizedKind,
                null,
                stationIds,
                range.start(),
                completed ? range.end() : null,
                List.of(range),
                completed,
                sourceActive
            ));
        }
        return episodes;
    }

    private static List<String> unionStations(
        List<RegionalSnapshotStations> snapshots,
        OffsetDateTime rangeStart,
        OffsetDateTime rangeEnd
    ) {
        TreeSet<String> union = new TreeSet<>();
        for (RegionalSnapshotStations snapshot : snapshots) {
            if (rangeStart != null && snapshot.snapshotTime().isBefore(rangeStart)) continue;
            if (rangeEnd != null && snapshot.snapshotTime().isAfter(rangeEnd)) continue;
            union.addAll(snapshot.stationIds());
        }
        if (union.isEmpty() && rangeStart != null) {
            for (RegionalSnapshotStations snapshot : snapshots) {
                union.addAll(snapshot.stationIds());
            }
        }
        return List.copyOf(union);
    }

    private List<String> fetchTtcCandidateAlertIds(
        String stationId,
        OffsetDateTime stitchStart,
        OffsetDateTime windowStart,
        OffsetDateTime windowEnd
    ) {
        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("stitchStart", stitchStart)
            .addValue("windowStart", windowStart)
            .addValue("windowEnd", windowEnd);
        String stationJoin = "";
        if (stationId != null) {
            params.addValue("stationId", stationId);
            stationJoin = " join alert_stations filter_station on filter_station.alert_id = candidates.alert_id and filter_station.station_id = :stationId ";
        }
        return jdbc.query("""
            with candidates as (
                select distinct s.alert_id
                from snapshots s
                where s.snapshot_time >= :stitchStart and s.snapshot_time < :windowEnd
                union
                select prior.alert_id from (
                    select distinct on (s.alert_id) s.alert_id, s.active
                    from snapshots s
                    where s.snapshot_time < :stitchStart
                    order by s.alert_id, s.snapshot_time desc, s.id desc
                ) prior
                where prior.active = true
                union
                select distinct ap.alert_id
                from alert_active_periods ap
                where ap.starts_at is not null and ap.ends_at is not null
                  and ap.starts_at < :windowEnd and ap.ends_at > :windowStart
                union
                select a.id alert_id
                from alerts a
                where a.type = 'planned-closure'
                  and a.active_period_start is not null and a.active_period_end is not null
                  and a.active_period_start < :windowEnd and a.active_period_end > :windowStart
            )
            select candidates.alert_id
            from candidates
            """ + stationJoin + """
            order by candidates.alert_id
            """, params, (rs, row) -> rs.getString("alert_id"));
    }

    private List<String> fetchTtcAlertIdsBySourceIds(Set<String> sourceIds, String stationId) {
        MapSqlParameterSource params = new MapSqlParameterSource("sourceIds", sourceIds);
        String stationFilter = "";
        if (stationId != null) {
            params.addValue("stationId", stationId);
            stationFilter = " and exists (select 1 from alert_stations st where st.alert_id = s.alert_id and st.station_id = :stationId) ";
        }
        return jdbc.query("""
            select distinct s.alert_id
            from snapshots s
            where s.source_id in (:sourceIds)
            """ + stationFilter, params, (rs, row) -> rs.getString("alert_id"));
    }

    private List<String> fetchTtcParentAlertIdsForChildAlerts(Set<String> alertIds, String stationId) {
        MapSqlParameterSource params = new MapSqlParameterSource("alertIds", alertIds);
        String stationFilter = "";
        if (stationId != null) {
            params.addValue("stationId", stationId);
            stationFilter = " and exists (select 1 from alert_stations st where st.alert_id = ap.alert_id and st.station_id = :stationId) ";
        }
        return jdbc.query("""
            select distinct ap.alert_id
            from alert_active_periods ap
            where ap.source_period_id != 'parent'
              and ap.source_period_id in (
                  select distinct s.source_id
                  from snapshots s
                  where s.alert_id in (:alertIds) and s.source_id is not null
              )
            """ + stationFilter, params, (rs, row) -> rs.getString("alert_id"));
    }

    private List<RawEpisode> rawTtcEpisodesForAlerts(Set<String> alertIds, OffsetDateTime until) {
        return jdbc.query("""
            with lifecycle as (
                select s.id, s.alert_id, s.source_id, s.line_id, s.snapshot_time, s.active, s.impact_kind,
                       lag(s.active) over (partition by s.alert_id order by s.snapshot_time, s.id) previous_active
                from snapshots s
                where s.alert_id in (:alertIds) and s.snapshot_time < :until
            )
            select o.alert_id, o.source_id, o.line_id, a.cause,
                   coalesce((select c.impact_kind from lifecycle c
                       where c.alert_id = o.alert_id and c.active = true
                         and c.snapshot_time >= o.snapshot_time
                         and c.snapshot_time < coalesce((select min(e.snapshot_time) from lifecycle e
                             where e.alert_id = o.alert_id and e.snapshot_time > o.snapshot_time and e.active = false), :until)
                       order by c.snapshot_time desc, c.id desc limit 1), o.impact_kind) impact_kind,
                   o.snapshot_time opened_at,
                   (select min(c.snapshot_time) from lifecycle c
                    where c.alert_id = o.alert_id and c.snapshot_time > o.snapshot_time and c.active = false) cleared_at,
                   not exists (select 1 from lifecycle c where c.alert_id = o.alert_id
                    and c.snapshot_time > o.snapshot_time and c.active = false) source_active
            from lifecycle o
            left join alerts a on a.id = o.alert_id
            where o.active = true and (o.previous_active is null or o.previous_active = false)
            order by o.alert_id, o.snapshot_time, o.id
            """, new MapSqlParameterSource()
                .addValue("alertIds", alertIds)
                .addValue("until", until),
            this::rawEpisode);
    }

    private Map<String, List<String>> fetchTtcAlertStations(Set<String> alertIds) {
        Map<String, List<String>> byAlert = new HashMap<>();
        jdbc.query("""
            select alert_id, station_id
            from alert_stations
            where alert_id in (:alertIds)
            order by alert_id, sort_order, station_id
            """, new MapSqlParameterSource("alertIds", alertIds), rs -> {
                byAlert.computeIfAbsent(rs.getString("alert_id"), ignored -> new ArrayList<>())
                    .add(rs.getString("station_id"));
            });
        return byAlert;
    }

    private Map<String, List<ClosurePeriodRecord>> fetchClosurePeriods(Set<String> alertIds) {
        return jdbc.query("""
            with closure_child_counts as (
                select alert_id, count(*) filter (where source_period_id != 'parent') child_count
                from alert_active_periods
                where alert_id in (:alertIds)
                group by alert_id
            )
            select ap.alert_id, ap.source_period_id, ap.starts_at, ap.ends_at
            from alert_active_periods ap
            join closure_child_counts counts on counts.alert_id = ap.alert_id and counts.child_count > 0
            where ap.alert_id in (:alertIds) and ap.source_period_id != 'parent'
              and ap.starts_at is not null and ap.ends_at is not null and ap.ends_at > ap.starts_at
            union all
            select ap.alert_id, ap.source_period_id, ap.starts_at, ap.ends_at
            from alert_active_periods ap
            join closure_child_counts counts on counts.alert_id = ap.alert_id and counts.child_count = 0
            where ap.alert_id in (:alertIds)
              and ap.starts_at is not null and ap.ends_at is not null and ap.ends_at > ap.starts_at
              and (ap.source_current_continuous = true or ap.ends_at - ap.starts_at <= interval '80 hours')
            union all
            select alert.id, 'fallback', alert.active_period_start, alert.active_period_end
            from alerts alert
            where alert.id in (:alertIds)
              and alert.type = 'planned-closure'
              and alert.active_period_start is not null and alert.active_period_end is not null
              and alert.active_period_end > alert.active_period_start
              and alert.active_period_end - alert.active_period_start <= interval '80 hours'
              and not exists (select 1 from alert_active_periods period where period.alert_id = alert.id)
            """, new MapSqlParameterSource("alertIds", alertIds), (rs, row) -> new ClosurePeriodRecord(
                rs.getString("alert_id"), rs.getString("source_period_id"),
                rs.getObject("starts_at", OffsetDateTime.class),
                rs.getObject("ends_at", OffsetDateTime.class)
            )).stream().collect(Collectors.groupingBy(ClosurePeriodRecord::alertId));
    }

    private List<String> fetchRegionalCandidateAlertIds(
        String stationId,
        OffsetDateTime stitchStart,
        OffsetDateTime windowStart,
        OffsetDateTime windowEnd
    ) {
        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("stitchStart", stitchStart)
            .addValue("windowStart", windowStart)
            .addValue("windowEnd", windowEnd);
        String stationFilter = "";
        if (stationId != null) {
            params.addValue("stationId", stationId);
            stationFilter = " where exists (select 1 from regional_alert_snapshots st where st.alert_id = candidates.alert_id and st.active = true and jsonb_exists(st.station_ids, :stationId)) ";
        }
        return jdbc.query("""
            with candidates as (
                select distinct s.alert_id
                from regional_alert_snapshots s
                where s.snapshot_time >= :stitchStart and s.snapshot_time < :windowEnd
                union
                select prior.alert_id from (
                    select distinct on (s.alert_id) s.alert_id, s.active
                    from regional_alert_snapshots s
                    where s.snapshot_time < :stitchStart
                    order by s.alert_id, s.snapshot_time desc, s.id desc
                ) prior
                where prior.active = true
                union
                select ra.id alert_id
                from regional_alerts ra
                where ra.impact_kind = 'planned-closure'
                  and ra.active_period_start is not null and ra.active_period_end is not null
                  and ra.active_period_start < :windowEnd and ra.active_period_end > :windowStart
            )
            select candidates.alert_id
            from candidates
            """ + stationFilter + """
            order by candidates.alert_id
            """, params, (rs, row) -> rs.getString("alert_id"));
    }

    private List<RawEpisode> rawRegionalEpisodesForAlerts(
        Set<String> alertIds,
        OffsetDateTime until
    ) {
        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("alertIds", alertIds)
            .addValue("until", until);
        return jdbc.query("""
            with lifecycle as (
                select s.id, s.alert_id, s.line_id, s.snapshot_time, s.active, s.impact_kind,
                       lag(s.active) over (partition by s.alert_id order by s.snapshot_time, s.id) previous_active
                from regional_alert_snapshots s
                where s.alert_id in (:alertIds) and s.snapshot_time < :until
            )
            select o.alert_id, o.alert_id source_id, o.line_id, cast(null as text) cause, o.impact_kind,
                   o.snapshot_time opened_at,
                   (select min(c.snapshot_time) from lifecycle c
                    where c.alert_id = o.alert_id and c.snapshot_time > o.snapshot_time and c.active = false) cleared_at,
                   not exists (select 1 from lifecycle c where c.alert_id = o.alert_id
                    and c.snapshot_time > o.snapshot_time and c.active = false) source_active
            from lifecycle o
            where o.active = true and (o.previous_active is null or o.previous_active = false)
            order by o.alert_id, o.snapshot_time, o.id
            """, params, this::rawEpisode);
    }

    private Map<String, List<RegionalSnapshotStations>> fetchRegionalSnapshotStations(
        Set<String> alertIds,
        OffsetDateTime until
    ) {
        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("alertIds", alertIds)
            .addValue("until", until);
        Map<String, List<RegionalSnapshotStations>> byAlert = new HashMap<>();
        jdbc.query("""
            select s.alert_id, s.snapshot_time, s.station_ids::text station_ids
            from regional_alert_snapshots s
            where s.alert_id in (:alertIds) and s.snapshot_time < :until and s.active = true
            order by s.alert_id, s.snapshot_time, s.id
            """, params, rs -> {
                byAlert.computeIfAbsent(rs.getString("alert_id"), ignored -> new ArrayList<>())
                    .add(new RegionalSnapshotStations(
                        rs.getObject("snapshot_time", OffsetDateTime.class),
                        parseJsonArray(rs.getString("station_ids"))
                    ));
            });
        return byAlert;
    }

    private Map<String, ApplicablePeriod> fetchRegionalApplicablePeriods(Set<String> alertIds) {
        return jdbc.query("""
            select id, active_period_start, active_period_end
            from regional_alerts
            where id in (:alertIds)
              and impact_kind = 'planned-closure'
              and active_period_start is not null
              and active_period_end is not null
              and active_period_end > active_period_start
            """, new MapSqlParameterSource("alertIds", alertIds), (rs, row) -> new ApplicablePeriod(
                rs.getString("id"),
                rs.getObject("active_period_start", OffsetDateTime.class),
                rs.getObject("active_period_end", OffsetDateTime.class)
            )).stream().collect(Collectors.toMap(ApplicablePeriod::alertId, Function.identity()));
    }

    private RawEpisode rawEpisode(ResultSet rs, int row) throws SQLException {
        return new RawEpisode(
            rs.getString("alert_id"),
            rs.getString("source_id"),
            rs.getString("line_id"),
            rs.getString("cause"),
            rs.getString("impact_kind"),
            rs.getObject("opened_at", OffsetDateTime.class),
            rs.getObject("cleared_at", OffsetDateTime.class),
            rs.getBoolean("source_active")
        );
    }

    static String lifecycleEpisodeKey(String alertId, OffsetDateTime openedAt) {
        return alertId + "|" + openedAt.toInstant();
    }

    static String closureEpisodeKey(String alertId, String normalizedImpactKind, OffsetDateTime occurrenceStart) {
        return alertId + "|p|" + normalizedImpactKind + "|" + occurrenceStart.toInstant();
    }

    private static OffsetDateTime earlier(OffsetDateTime first, OffsetDateTime second) {
        return first.isBefore(second) ? first : second;
    }

    private static OffsetDateTime later(OffsetDateTime first, OffsetDateTime second) {
        return first.isAfter(second) ? first : second;
    }

    private record RawEpisode(
        String alertId,
        String sourceId,
        String lineId,
        String cause,
        String impactKind,
        OffsetDateTime openedAt,
        OffsetDateTime clearedAt,
        boolean sourceActive
    ) {}

    private record ClosurePeriodRecord(
        String alertId,
        String sourcePeriodId,
        OffsetDateTime startsAt,
        OffsetDateTime endsAt
    ) {}

    private record ApplicablePeriod(String alertId, OffsetDateTime start, OffsetDateTime end) {}

    private record RegionalSnapshotStations(OffsetDateTime snapshotTime, List<String> stationIds) {}
}
