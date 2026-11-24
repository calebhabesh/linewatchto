package com.calebhabesh.linewatch.reliability;

import com.calebhabesh.linewatch.arrival.schedule.GtfsServiceTime;
import com.calebhabesh.linewatch.cache.DashboardCacheService;
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
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Derives reliability episodes and per-service-date line/station facts into the read model
 * tables ({@code reliability_episodes}, {@code reliability_line_days},
 * {@code reliability_station_days}), manages incremental nightly derivation and full version
 * rebuilds with atomic methodology switches, and records per-network derivation status.
 */
@Service
public class ReliabilityDerivationService {
    private static final Logger log = LoggerFactory.getLogger(ReliabilityDerivationService.class);
    static final int METHODOLOGY_V1 = 1;
    static final int METHODOLOGY_V2 = 2;
    static final int LATEST_METHODOLOGY_VERSION = METHODOLOGY_V2;
    static final int DEFAULT_REDERIVE_DAYS = 14;
    static final int REBUILD_CHUNK_DAYS = 31;
    private static final int BATCH_SIZE = 1000;
    private static final int MAX_ERROR_LENGTH = 500;

    private final NamedParameterJdbcTemplate jdbc;
    private final ReliabilityScheduleCapture scheduleCapture;
    private final ReliabilityObservationRollup observationRollup;
    private final ReliabilityEpisodeSource episodeSource;
    private final TransactionTemplate txTemplate;
    private final TransactionTemplate requiresNewTx;
    private final Clock clock;
    private final int rederiveDays;
    private final @Nullable DashboardCacheService dashboardCache;

    @Autowired
    public ReliabilityDerivationService(
        NamedParameterJdbcTemplate jdbc,
        ReliabilityScheduleCapture scheduleCapture,
        ReliabilityObservationRollup observationRollup,
        ReliabilityEpisodeSource episodeSource,
        PlatformTransactionManager transactionManager,
        Clock clock,
        @Value("${linewatch.reliability.derivation.rederive-days:14}") int rederiveDays,
        @Autowired(required = false) @Nullable DashboardCacheService dashboardCache
    ) {
        this.jdbc = jdbc;
        this.scheduleCapture = scheduleCapture;
        this.observationRollup = observationRollup;
        this.episodeSource = episodeSource;
        this.txTemplate = new TransactionTemplate(transactionManager);
        this.requiresNewTx = new TransactionTemplate(transactionManager);
        this.requiresNewTx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.clock = clock;
        this.rederiveDays = Math.max(1, rederiveDays);
        this.dashboardCache = dashboardCache;
    }

    public ReliabilityDerivationService(
        NamedParameterJdbcTemplate jdbc,
        ReliabilityScheduleCapture scheduleCapture,
        ReliabilityObservationRollup observationRollup,
        ReliabilityEpisodeSource episodeSource,
        PlatformTransactionManager transactionManager,
        Clock clock
    ) {
        this(jdbc, scheduleCapture, observationRollup, episodeSource, transactionManager, clock, DEFAULT_REDERIVE_DAYS, null);
    }

    public record MethodologyState(int currentVersion, OffsetDateTime switchedAt) {}

    public record DerivationStatus(
        int methodologyVersion,
        String networkId,
        LocalDate derivedThrough,
        String status,
        OffsetDateTime lastStartedAt,
        OffsetDateTime lastSucceededAt,
        OffsetDateTime lastFailedAt,
        Long lastDurationMs,
        int consecutiveFailures
    ) {}

    public record DeriveResult(
        int methodologyVersion,
        String networkId,
        LocalDate fromDate,
        LocalDate toDate,
        int episodesUpserted,
        int lineDaysWritten,
        int stationDaysWritten,
        long durationMs
    ) {}

    public MethodologyState methodologyState() {
        List<MethodologyState> rows = jdbc.query("""
            select current_version, switched_at
            from reliability_methodology
            where id = 1
            """, (rs, row) -> new MethodologyState(
                rs.getInt("current_version"),
                rs.getObject("switched_at", OffsetDateTime.class)
            ));
        return rows.isEmpty() ? new MethodologyState(METHODOLOGY_V1, null) : rows.getFirst();
    }

    public int currentMethodologyVersion() {
        return methodologyState().currentVersion();
    }

    public Optional<DerivationStatus> derivationStatus(int version, String networkId) {
        List<DerivationStatus> rows = jdbc.query("""
            select methodology_version, network_id, derived_through, status,
                   last_started_at, last_succeeded_at, last_failed_at,
                   last_duration_ms, consecutive_failures
            from reliability_derivations
            where methodology_version = :version and network_id = :networkId
            """, new MapSqlParameterSource()
                .addValue("version", version)
                .addValue("networkId", networkId),
            (rs, row) -> mapStatus(rs));
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.getFirst());
    }

    public List<DerivationStatus> derivationStatuses(int version) {
        return jdbc.query("""
            select methodology_version, network_id, derived_through, status,
                   last_started_at, last_succeeded_at, last_failed_at,
                   last_duration_ms, consecutive_failures
            from reliability_derivations
            where methodology_version = :version
            order by network_id
            """, new MapSqlParameterSource("version", version),
            (rs, row) -> mapStatus(rs));
    }

    /**
     * Earliest service date that has both a complete schedule day and rolled-up polling coverage.
     */
    public LocalDate firstAnalyzableDate(String networkId) {
        LocalDate firstSchedule = scheduleCapture.firstCompleteScheduleDate(networkId);
        LocalDate firstObserved = observationRollup.firstObservedDate(networkId);
        if (firstSchedule == null || firstObserved == null) return null;
        return firstSchedule.isAfter(firstObserved) ? firstSchedule : firstObserved;
    }

    /**
     * Incremental nightly derivation for {@code networkId}: finalizes yesterday and re-derives
     * the last {@code rederiveDays} days (or catches up from {@link #firstAnalyzableDate} on
     * first run / after downtime).
     */
    public DeriveResult deriveIncremental(String networkId) {
        int version = currentMethodologyVersion();
        OffsetDateTime startedAt = OffsetDateTime.now(clock);
        long startNanos = System.nanoTime();
        LocalDate yesterday = LocalDate.now(clock.withZone(GtfsServiceTime.TORONTO)).minusDays(1);
        LocalDate firstAnalyzable = firstAnalyzableDate(networkId);
        Optional<DerivationStatus> existing = derivationStatus(version, networkId);
        LocalDate existingThrough = existing.map(DerivationStatus::derivedThrough).orElse(null);

        markRunning(version, networkId, startedAt);
        try {
            if (firstAnalyzable == null || firstAnalyzable.isAfter(yesterday)) {
                long durationMs = elapsedMs(startNanos);
                markSucceeded(version, networkId, existingThrough, OffsetDateTime.now(clock), durationMs);
                return new DeriveResult(version, networkId, null, null, 0, 0, 0, durationMs);
            }
            LocalDate fromDate;
            if (existingThrough == null) {
                fromDate = firstAnalyzable;
            } else {
                LocalDate rederiveStart = yesterday.minusDays(rederiveDays - 1L);
                LocalDate nextAfterThrough = existingThrough.plusDays(1);
                LocalDate candidate = nextAfterThrough.isBefore(rederiveStart) ? nextAfterThrough : rederiveStart;
                fromDate = candidate.isBefore(firstAnalyzable) ? firstAnalyzable : candidate;
            }
            DeriveResult result = deriveChunked(version, networkId, fromDate, yesterday, true, startNanos);
            evictCache(networkId);
            return result;
        } catch (RuntimeException exception) {
            long durationMs = elapsedMs(startNanos);
            markFailed(version, networkId, OffsetDateTime.now(clock), durationMs, exception);
            throw exception;
        }
    }

    /**
     * Derives a specific inclusive date range {@code [fromDate..toDate]} into {@code version}.
     * Exposed for targeted rebuilds and tests; updates {@code reliability_derivations} on success
     * when {@code recordStatus} is true.
     */
    public DeriveResult deriveRange(
        int version,
        String networkId,
        LocalDate fromDate,
        LocalDate toDate,
        boolean recordStatus
    ) {
        if (fromDate.isAfter(toDate)) {
            throw new IllegalArgumentException("fromDate must not be after toDate");
        }
        OffsetDateTime startedAt = OffsetDateTime.now(clock);
        long startNanos = System.nanoTime();
        if (recordStatus) {
            markRunning(version, networkId, startedAt);
        }
        try {
            DeriveResult result = deriveChunked(version, networkId, fromDate, toDate, recordStatus, startNanos);
            if (recordStatus) {
                evictCache(networkId);
            }
            return result;
        } catch (RuntimeException exception) {
            if (recordStatus) {
                markFailed(version, networkId, OffsetDateTime.now(clock), elapsedMs(startNanos), exception);
            }
            throw exception;
        }
    }

    /**
     * Builds {@code targetVersion} for every analyzable date through yesterday across both
     * networks, switches {@code reliability_methodology.current_version} in one transaction,
     * and deletes obsolete versions' rows after the switch.
     */
    public List<DeriveResult> rebuildAndSwitch(int targetVersion) {
        if (targetVersion < 1) {
            throw new IllegalArgumentException("targetVersion must be >= 1");
        }
        LocalDate yesterday = LocalDate.now(clock.withZone(GtfsServiceTime.TORONTO)).minusDays(1);
        List<DeriveResult> results = new ArrayList<>();
        for (String networkId : ReliabilityObservationRollup.NETWORKS) {
            OffsetDateTime startedAt = OffsetDateTime.now(clock);
            long startNanos = System.nanoTime();
            markRunning(targetVersion, networkId, startedAt);
            try {
                // Clear any previous partial rows for targetVersion before rebuilding.
                clearVersionForNetwork(targetVersion, networkId);
                LocalDate firstAnalyzable = firstAnalyzableDate(networkId);
                if (firstAnalyzable == null || firstAnalyzable.isAfter(yesterday)) {
                    long durationMs = elapsedMs(startNanos);
                    markSucceeded(targetVersion, networkId, null, OffsetDateTime.now(clock), durationMs);
                    results.add(new DeriveResult(targetVersion, networkId, null, null, 0, 0, 0, durationMs));
                } else {
                    results.add(deriveChunked(targetVersion, networkId, firstAnalyzable, yesterday, true, startNanos));
                }
            } catch (RuntimeException exception) {
                markFailed(targetVersion, networkId, OffsetDateTime.now(clock), elapsedMs(startNanos), exception);
                throw exception;
            }
        }
        switchMethodologyAtomically(targetVersion);
        deleteOtherVersions(targetVersion);
        evictCache(null);
        return List.copyOf(results);
    }

    private DeriveResult deriveChunked(
        int version,
        String networkId,
        LocalDate fromDate,
        LocalDate toDate,
        boolean recordStatus,
        long startNanos
    ) {
        int totalEpisodes = 0;
        int totalLineDays = 0;
        int totalStationDays = 0;
        LocalDate chunkStart = fromDate;
        while (!chunkStart.isAfter(toDate)) {
            LocalDate chunkEnd = chunkStart.plusDays(REBUILD_CHUNK_DAYS - 1L);
            if (chunkEnd.isAfter(toDate)) chunkEnd = toDate;
            boolean isFinalChunk = chunkEnd.equals(toDate);
            LocalDate finalChunkStart = chunkStart;
            LocalDate finalChunkEnd = chunkEnd;
            ChunkCounts counts = txTemplate.execute(status ->
                deriveChunkInTransaction(version, networkId, finalChunkStart, finalChunkEnd, isFinalChunk, recordStatus, startNanos)
            );
            if (counts != null) {
                totalEpisodes += counts.episodes();
                totalLineDays += counts.lineDays();
                totalStationDays += counts.stationDays();
            }
            chunkStart = chunkEnd.plusDays(1);
        }
        return new DeriveResult(
            version, networkId, fromDate, toDate,
            totalEpisodes, totalLineDays, totalStationDays, elapsedMs(startNanos)
        );
    }

    private ChunkCounts deriveChunkInTransaction(
        int version,
        String networkId,
        LocalDate fromDate,
        LocalDate toDate,
        boolean isFinalChunk,
        boolean recordStatus,
        long startNanos
    ) {
        acquireNetworkLock(networkId);
        OffsetDateTime derivedAt = OffsetDateTime.now(clock);

        // Load one day before and after so disjoint span boundaries are exact.
        List<ServiceSpan> rawSpans = scheduleCapture.capturedAllSpans(
            networkId, fromDate.minusDays(1), toDate.plusDays(1));
        ChunkComputation computed = computeChunk(version, networkId, fromDate, toDate, rawSpans, derivedAt, null);
        List<LineDayRow> lineDayRows = computed.lineDayRows();
        List<StationDayRow> stationDayRows = computed.stationDayRows();
        List<DerivedEpisode> derivedEpisodes = computed.derivedEpisodes();
        Map<String, TimeRange> stripWindowByLine = computed.stripWindowByLine();
        OffsetDateTime windowStart = computed.windowStart();
        OffsetDateTime windowEnd = computed.windowEnd();

        // Persist line days and station days for [fromDate..toDate].
        MapSqlParameterSource rangeParams = new MapSqlParameterSource()
            .addValue("version", version)
            .addValue("networkId", networkId)
            .addValue("fromDate", fromDate)
            .addValue("toDate", toDate);
        jdbc.update("""
            delete from reliability_line_days
            where methodology_version = :version and network_id = :networkId
              and service_date between :fromDate and :toDate
            """, rangeParams);
        jdbc.update("""
            delete from reliability_station_days
            where methodology_version = :version and network_id = :networkId
              and service_date between :fromDate and :toDate
            """, rangeParams);

        batch("""
            insert into reliability_line_days (
                methodology_version, network_id, line_id, service_date, impact_group,
                scheduled_minutes, observed_minutes, impacted_minutes, weighted_impacted_minutes,
                incident_minutes, derived_at
            ) values (
                :version, :networkId, :lineId, :serviceDate, :impactGroup,
                :scheduledMinutes, :observedMinutes, :impactedMinutes, :weightedImpactedMinutes,
                :incidentMinutes, :derivedAt
            )
            """, lineDayRows.stream().map(row -> (SqlParameterSource) new MapSqlParameterSource()
                .addValue("version", version)
                .addValue("networkId", networkId)
                .addValue("lineId", row.lineId())
                .addValue("serviceDate", row.serviceDate())
                .addValue("impactGroup", row.impactGroup())
                .addValue("scheduledMinutes", row.scheduledMinutes())
                .addValue("observedMinutes", row.observedMinutes())
                .addValue("impactedMinutes", row.impactedMinutes())
                .addValue("weightedImpactedMinutes", row.weightedImpactedMinutes())
                .addValue("incidentMinutes", row.incidentMinutes())
                .addValue("derivedAt", row.derivedAt())).toList());

        batch("""
            insert into reliability_station_days (
                methodology_version, network_id, line_id, station_id, service_date, impact_group,
                scheduled_minutes, observed_minutes, impacted_minutes, weighted_impacted_minutes,
                incident_minutes, derived_at
            ) values (
                :version, :networkId, :lineId, :stationId, :serviceDate, :impactGroup,
                :scheduledMinutes, :observedMinutes, :impactedMinutes, :weightedImpactedMinutes,
                :incidentMinutes, :derivedAt
            )
            """, stationDayRows.stream().map(row -> (SqlParameterSource) new MapSqlParameterSource()
                .addValue("version", version)
                .addValue("networkId", networkId)
                .addValue("lineId", row.lineId())
                .addValue("stationId", row.stationId())
                .addValue("serviceDate", row.serviceDate())
                .addValue("impactGroup", row.impactGroup())
                .addValue("scheduledMinutes", row.scheduledMinutes())
                .addValue("observedMinutes", row.observedMinutes())
                .addValue("impactedMinutes", row.impactedMinutes())
                .addValue("weightedImpactedMinutes", row.weightedImpactedMinutes())
                .addValue("incidentMinutes", row.incidentMinutes())
                .addValue("derivedAt", row.derivedAt())).toList());

        // Reconcile episodes: strip removed occurrences in [stripStart, stripEnd) per line, then upsert.
        Map<String, Set<String>> keepKeysByLine = derivedEpisodes.stream().collect(
            Collectors.groupingBy(
                ep -> ep.episode().lineId(),
                Collectors.mapping(ep -> ep.episode().episodeKey(), Collectors.toSet())
            ));
        for (Map.Entry<String, TimeRange> stripEntry : stripWindowByLine.entrySet()) {
            String lineId = stripEntry.getKey();
            TimeRange strip = stripEntry.getValue();
            Set<String> keepKeys = keepKeysByLine.getOrDefault(lineId, Set.of());
            reconcileRemovedEpisodes(version, networkId, lineId, strip, keepKeys);
        }

        batch("""
            insert into reliability_episodes (
                methodology_version, network_id, episode_key, alert_id, line_id,
                impact_kind, disruption_class, planned, station_share, cause, station_ids,
                opened_at, closed_at, counted, counted_minutes, completed
            ) values (
                :version, :networkId, :episodeKey, :alertId, :lineId,
                :impactKind, :disruptionClass, :planned, :stationShare, :cause, cast(:stationIds as jsonb),
                :openedAt, :closedAt, cast(:counted as tstzmultirange), :countedMinutes, :completed
            )
            on conflict (methodology_version, network_id, episode_key) do update
            set impact_kind = excluded.impact_kind,
                disruption_class = excluded.disruption_class,
                planned = excluded.planned,
                station_share = excluded.station_share,
                cause = excluded.cause,
                station_ids = excluded.station_ids,
                closed_at = case when :isFinalChunk or excluded.completed then excluded.closed_at
                                 else reliability_episodes.closed_at end,
                completed = case when :isFinalChunk or excluded.completed then excluded.completed
                                 else reliability_episodes.completed end,
                counted = (reliability_episodes.counted
                           - tstzmultirange(tstzrange(cast(:stripStart as timestamptz), cast(:stripEnd as timestamptz))))
                          + excluded.counted,
                counted_minutes = coalesce((
                    select round(sum(floor(extract(epoch from upper(piece) - lower(piece)))) / 60.0)
                    from unnest(
                        (reliability_episodes.counted
                         - tstzmultirange(tstzrange(cast(:stripStart as timestamptz), cast(:stripEnd as timestamptz))))
                        + excluded.counted
                    ) piece
                ), 0)::integer
            """, derivedEpisodes.stream().map(ep -> {
                TimeRange strip = stripWindowByLine.getOrDefault(ep.episode().lineId(), new TimeRange(windowStart, windowEnd));
                return (SqlParameterSource) new MapSqlParameterSource()
                    .addValue("version", version)
                    .addValue("networkId", networkId)
                    .addValue("episodeKey", ep.episode().episodeKey())
                    .addValue("alertId", ep.episode().alertId())
                    .addValue("lineId", ep.episode().lineId())
                    .addValue("impactKind", ep.episode().impactKind())
                    .addValue("disruptionClass", ep.disruptionClass())
                    .addValue("planned", ep.planned())
                    .addValue("stationShare", ep.stationShare())
                    .addValue("cause", ep.episode().cause())
                    .addValue("stationIds", ReliabilityEpisodeSource.toJsonArray(ep.episode().stationIds()))
                    .addValue("openedAt", ep.episode().openedAt())
                    .addValue("closedAt", ep.episode().closedAt())
                    .addValue("counted", ReliabilityEpisodeSource.toMultirangeLiteral(ep.countedInWindow()))
                    .addValue("countedMinutes", ep.countedMinutes())
                    .addValue("completed", ep.episode().completed())
                    .addValue("stripStart", strip.start())
                    .addValue("stripEnd", strip.end())
                    .addValue("isFinalChunk", isFinalChunk);
            }).toList());

        if (recordStatus && isFinalChunk) {
            recordSuccessInCurrentTx(version, networkId, toDate, OffsetDateTime.now(clock), elapsedMs(startNanos));
        }
        return new ChunkCounts(derivedEpisodes.size(), lineDayRows.size(), stationDayRows.size());
    }

    /**
     * Computes {@code [fromDate..toDate]}'s episodes and day rows from {@code rawSpans} (which
     * include the day before and, for persisted chunks, the day after) without writing. A
     * non-null {@code cap} ends every span, observation window and episode at that instant, so
     * the current service day is computed as "Today So Far" with the derive job's rules.
     */
    private ChunkComputation computeChunk(
        int version,
        String networkId,
        LocalDate fromDate,
        LocalDate toDate,
        List<ServiceSpan> rawSpans,
        OffsetDateTime derivedAt,
        @Nullable OffsetDateTime cap
    ) {
        List<DisjointSpan> allDisjoint = ReliabilityEpisodeSource.disjointSpans(rawSpans);

        Map<String, Map<LocalDate, TimeRange>> lineSpans = new LinkedHashMap<>();
        Map<String, Map<String, Map<LocalDate, TimeRange>>> stationSpansByLine = new LinkedHashMap<>();
        Map<String, OffsetDateTime> prevLineSpanEnd = new HashMap<>();
        Map<String, OffsetDateTime> nextLineSpanStart = new HashMap<>();

        LocalDate prevDate = fromDate.minusDays(1);
        LocalDate nextDate = toDate.plusDays(1);
        OffsetDateTime minWindowStart = null;
        OffsetDateTime maxWindowEnd = null;

        for (DisjointSpan span : allDisjoint) {
            boolean wholeLine = ReliabilityScheduleCapture.WHOLE_LINE.equals(span.stationId());
            if (span.serviceDate().equals(prevDate)) {
                if (wholeLine) prevLineSpanEnd.put(span.lineId(), span.range().end());
                continue;
            }
            if (span.serviceDate().equals(nextDate)) {
                if (wholeLine) nextLineSpanStart.put(span.lineId(), span.range().start());
                continue;
            }
            if (span.serviceDate().isBefore(fromDate) || span.serviceDate().isAfter(toDate)) continue;
            TimeRange range = cap == null || !span.range().end().isAfter(cap)
                ? span.range()
                : new TimeRange(span.range().start(), cap);
            if (!range.valid()) continue;
            if (wholeLine) {
                lineSpans.computeIfAbsent(span.lineId(), ignored -> new LinkedHashMap<>())
                    .put(span.serviceDate(), range);
            } else {
                stationSpansByLine.computeIfAbsent(span.lineId(), ignored -> new LinkedHashMap<>())
                    .computeIfAbsent(span.stationId(), ignored -> new LinkedHashMap<>())
                    .put(span.serviceDate(), range);
            }
            if (minWindowStart == null || range.start().isBefore(minWindowStart)) {
                minWindowStart = range.start();
            }
            if (maxWindowEnd == null || range.end().isAfter(maxWindowEnd)) {
                maxWindowEnd = range.end();
            }
        }

        OffsetDateTime defaultStart = ReliabilityObservationRollup.dayStart(fromDate);
        OffsetDateTime defaultEnd = ReliabilityObservationRollup.dayStart(toDate.plusDays(1));
        OffsetDateTime windowStart = minWindowStart == null ? defaultStart : earlier(minWindowStart, defaultStart);
        OffsetDateTime windowEnd = maxWindowEnd == null ? defaultEnd : later(maxWindowEnd, defaultEnd);
        if (cap != null && windowEnd.isAfter(cap)) {
            windowEnd = earlier(windowEnd, cap);
        }
        if (!windowStart.isBefore(windowEnd)) {
            return new ChunkComputation(List.of(), List.of(), List.of(), Map.of(), Map.of(), windowStart, windowStart);
        }

        List<TimeRange> observationWindows = observationRollup.observationWindows(networkId, windowStart, windowEnd);
        List<ExtractedEpisode> extracted = observationWindows.isEmpty() || lineSpans.isEmpty()
            ? List.of()
            : episodeSource.extract(networkId, null, windowStart, windowEnd);

        // Compute each line's strip window [stripStart, stripEnd) for episode merges/cleanup.
        Set<String> allLineIds = new LinkedHashSet<>(knownLineIds(networkId));
        allLineIds.addAll(lineSpans.keySet());
        Map<String, TimeRange> stripWindowByLine = new LinkedHashMap<>();
        for (String lineId : allLineIds) {
            OffsetDateTime prevEnd = prevLineSpanEnd.get(lineId);
            OffsetDateTime stripStart = prevEnd != null && prevEnd.isAfter(defaultStart) ? prevEnd : defaultStart;
            OffsetDateTime lastEnd = lineSpans.getOrDefault(lineId, Map.of()).values().stream()
                .map(TimeRange::end)
                .max(OffsetDateTime::compareTo)
                .orElse(defaultEnd);
            OffsetDateTime stripEnd = later(defaultEnd, lastEnd);
            OffsetDateTime nextStart = nextLineSpanStart.get(lineId);
            if (nextStart != null && nextStart.isBefore(stripEnd)) {
                stripEnd = nextStart;
            }
            if (stripEnd.isAfter(stripStart)) {
                stripWindowByLine.put(lineId, new TimeRange(stripStart, stripEnd));
            }
        }

        // Index scheduled stations per (lineId, serviceDate) for v2 station-weighted impact.
        Map<String, Map<LocalDate, Set<String>>> scheduledStationsByLineDate = new HashMap<>();
        for (Map.Entry<String, Map<String, Map<LocalDate, TimeRange>>> lineEntry : stationSpansByLine.entrySet()) {
            String lineId = lineEntry.getKey();
            Map<LocalDate, Set<String>> byDate = scheduledStationsByLineDate
                .computeIfAbsent(lineId, ignored -> new HashMap<>());
            for (Map.Entry<String, Map<LocalDate, TimeRange>> stEntry : lineEntry.getValue().entrySet()) {
                String stationId = stEntry.getKey();
                for (LocalDate serviceDate : stEntry.getValue().keySet()) {
                    byDate.computeIfAbsent(serviceDate, ignored -> new HashSet<>()).add(stationId);
                }
            }
        }

        // Evaluate episodes against observationWindows and line disjoint spans in [fromDate..toDate].
        boolean v2 = version >= METHODOLOGY_V2;
        List<DerivedEpisode> derivedEpisodes = new ArrayList<>();
        Map<String, List<DerivedEpisode>> episodesByLine = new HashMap<>();
        for (ExtractedEpisode episode : extracted) {
            Map<LocalDate, TimeRange> spansForLine = lineSpans.get(episode.lineId());
            if (spansForLine == null || spansForLine.isEmpty()) continue;
            List<TimeRange> lineSpanList = List.copyOf(spansForLine.values());
            List<TimeRange> countedInWindow = ReliabilityIntervalCalculator.intersectAll(
                episode.ranges(), observationWindows, lineSpanList);
            if (countedInWindow.isEmpty()) continue;
            String disruptionClass = ReliabilityEpisodeSource.disruptionClass(episode.impactKind());
            boolean planned = ReliabilityEpisodeSource.isPlanned(episode.impactKind());
            double stationShare = v2
                ? computeEpisodeStationShare(
                    episode.stationIds(),
                    countedInWindow,
                    spansForLine,
                    scheduledStationsByLineDate.getOrDefault(episode.lineId(), Map.of())
                )
                : 1.0;
            DerivedEpisode derived = new DerivedEpisode(
                episode,
                countedInWindow,
                (int) ReliabilityIntervalCalculator.minutes(countedInWindow),
                disruptionClass,
                planned,
                stationShare
            );
            derivedEpisodes.add(derived);
            episodesByLine.computeIfAbsent(episode.lineId(), ignored -> new ArrayList<>()).add(derived);
        }

        // Build daily rows for lines and stations.
        List<LineDayRow> lineDayRows = new ArrayList<>();
        List<StationDayRow> stationDayRows = new ArrayList<>();
        for (Map.Entry<String, Map<LocalDate, TimeRange>> lineEntry : lineSpans.entrySet()) {
            String lineId = lineEntry.getKey();
            List<DerivedEpisode> lineEpisodes = episodesByLine.getOrDefault(lineId, List.of());
            Map<LocalDate, Set<String>> lineScheduledByDate =
                scheduledStationsByLineDate.getOrDefault(lineId, Map.of());
            for (Map.Entry<LocalDate, TimeRange> dayEntry : lineEntry.getValue().entrySet()) {
                LocalDate serviceDate = dayEntry.getKey();
                TimeRange span = dayEntry.getValue();
                List<TimeRange> observedSpan = ReliabilityIntervalCalculator.intersect(List.of(span), observationWindows);
                int observedMinutes = (int) ReliabilityIntervalCalculator.minutes(observedSpan);
                if (observedMinutes <= 0) continue;
                int scheduledMinutes = (int) ReliabilityIntervalCalculator.minutes(List.of(span));
                Set<String> scheduledStations = lineScheduledByDate.getOrDefault(serviceDate, Set.of());
                buildDayRows(
                    v2, lineEpisodes, List.of(span), scheduledStations, false,
                    scheduledMinutes, observedMinutes,
                    (group, scheduled, observed, impacted, weighted, incident) -> lineDayRows.add(
                        new LineDayRow(lineId, serviceDate, group, scheduled, observed, impacted, weighted, incident, derivedAt))
                );
            }

            Map<String, Map<LocalDate, TimeRange>> stationsOnLine = stationSpansByLine.getOrDefault(lineId, Map.of());
            for (Map.Entry<String, Map<LocalDate, TimeRange>> stationEntry : stationsOnLine.entrySet()) {
                String stationId = stationEntry.getKey();
                List<DerivedEpisode> stationEpisodes = lineEpisodes.stream()
                    .filter(ep -> ep.episode().stationIds().contains(stationId))
                    .toList();
                for (Map.Entry<LocalDate, TimeRange> dayEntry : stationEntry.getValue().entrySet()) {
                    LocalDate serviceDate = dayEntry.getKey();
                    TimeRange span = dayEntry.getValue();
                    List<TimeRange> observedSpan = ReliabilityIntervalCalculator.intersect(List.of(span), observationWindows);
                    int observedMinutes = (int) ReliabilityIntervalCalculator.minutes(observedSpan);
                    if (observedMinutes <= 0) continue;
                    int scheduledMinutes = (int) ReliabilityIntervalCalculator.minutes(List.of(span));
                    buildDayRows(
                        v2, stationEpisodes, List.of(span), Set.of(stationId), true,
                        scheduledMinutes, observedMinutes,
                        (group, scheduled, observed, impacted, weighted, incident) -> stationDayRows.add(
                            new StationDayRow(lineId, stationId, serviceDate, group, scheduled, observed, impacted, weighted, incident, derivedAt))
                    );
                }
            }
        }

        return new ChunkComputation(
            List.copyOf(lineDayRows), List.copyOf(stationDayRows), List.copyOf(derivedEpisodes),
            stripWindowByLine, lineSpans, windowStart, windowEnd);
    }

    /**
     * Computes {@code [fromDate..toDate]} for {@code version} up to {@code until} with the derive
     * job's rules, without writing: the range API's "Today So Far" (and yesterday while its
     * service runs or before the nightly derive). Spans come exclusively from captured schedule
     * days.
     */
    public LiveSlice computeLiveSlice(
        int version,
        String networkId,
        LocalDate fromDate,
        LocalDate toDate,
        OffsetDateTime until
    ) {
        if (fromDate.isAfter(toDate)) return LiveSlice.EMPTY;
        List<ServiceSpan> rawSpans = scheduleCapture.capturedAllSpans(networkId, fromDate.minusDays(1), toDate);
        ChunkComputation computed = computeChunk(
            version, networkId, fromDate, toDate, rawSpans, OffsetDateTime.now(clock), until);
        OffsetDateTime activeProbe = until.minusSeconds(1);
        return new LiveSlice(
            computed.lineDayRows().stream().map(row -> new SliceDay(
                row.lineId(), ReliabilityScheduleCapture.WHOLE_LINE, row.serviceDate(), row.impactGroup(),
                row.scheduledMinutes(), row.observedMinutes(), row.impactedMinutes(),
                row.weightedImpactedMinutes(), row.incidentMinutes())).toList(),
            computed.stationDayRows().stream().map(row -> new SliceDay(
                row.lineId(), row.stationId(), row.serviceDate(), row.impactGroup(),
                row.scheduledMinutes(), row.observedMinutes(), row.impactedMinutes(),
                row.weightedImpactedMinutes(), row.incidentMinutes())).toList(),
            computed.derivedEpisodes().stream().map(ep -> new SliceEpisode(
                ep.episode(), ep.countedInWindow(), ep.disruptionClass(), ep.planned(),
                ep.episode().sourceActive()
                    && ReliabilityIntervalCalculator.contains(ep.countedInWindow(), activeProbe))).toList(),
            computed.lineSpans()
        );
    }

    private void reconcileRemovedEpisodes(
        int version,
        String networkId,
        String lineId,
        TimeRange strip,
        Set<String> keepKeys
    ) {
        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("version", version)
            .addValue("networkId", networkId)
            .addValue("lineId", lineId)
            .addValue("stripStart", strip.start())
            .addValue("stripEnd", strip.end());
        String excludeKeep = "";
        if (!keepKeys.isEmpty()) {
            params.addValue("keepKeys", keepKeys);
            excludeKeep = " and episode_key not in (:keepKeys) ";
        }
        // Delete episodes whose entire counted range falls inside the stripped window.
        jdbc.update("""
            delete from reliability_episodes
            where methodology_version = :version
              and network_id = :networkId
              and line_id = :lineId
              and counted && tstzrange(cast(:stripStart as timestamptz), cast(:stripEnd as timestamptz))
              """ + excludeKeep + """
              and isempty(counted - tstzmultirange(tstzrange(cast(:stripStart as timestamptz), cast(:stripEnd as timestamptz))))
            """, params);
        // Shrink episodes that also have counted time outside the stripped window.
        jdbc.update("""
            update reliability_episodes
            set counted = counted - tstzmultirange(tstzrange(cast(:stripStart as timestamptz), cast(:stripEnd as timestamptz))),
                counted_minutes = coalesce((
                    select round(sum(floor(extract(epoch from upper(piece) - lower(piece)))) / 60.0)
                    from unnest(counted - tstzmultirange(tstzrange(cast(:stripStart as timestamptz), cast(:stripEnd as timestamptz)))) piece
                ), 0)::integer
            where methodology_version = :version
              and network_id = :networkId
              and line_id = :lineId
              and counted && tstzrange(cast(:stripStart as timestamptz), cast(:stripEnd as timestamptz))
              """ + excludeKeep, params);
    }

    private interface DayRowSink {
        void accept(
            String impactGroup,
            int scheduledMinutes,
            int observedMinutes,
            int impactedMinutes,
            double weightedImpactedMinutes,
            int incidentMinutes
        );
    }

    private static double computeEpisodeStationShare(
        List<String> stationIds,
        List<TimeRange> countedInWindow,
        Map<LocalDate, TimeRange> lineSpans,
        Map<LocalDate, Set<String>> scheduledByDate
    ) {
        if (stationIds == null || stationIds.isEmpty()) return 1.0;
        Set<String> episodeStations = new HashSet<>(stationIds);
        double weightedSeconds = 0.0;
        long totalSeconds = 0L;
        for (Map.Entry<LocalDate, TimeRange> entry : lineSpans.entrySet()) {
            List<TimeRange> dayRanges = ReliabilityIntervalCalculator.intersect(countedInWindow, List.of(entry.getValue()));
            if (dayRanges.isEmpty()) continue;
            long daySec = ReliabilityIntervalCalculator.seconds(dayRanges);
            if (daySec <= 0) continue;
            Set<String> scheduled = scheduledByDate.getOrDefault(entry.getKey(), Set.of());
            double dayShare;
            if (scheduled.isEmpty()) {
                dayShare = 1.0;
            } else {
                long matched = episodeStations.stream().filter(scheduled::contains).count();
                dayShare = Math.min(1.0, (double) matched / scheduled.size());
            }
            weightedSeconds += daySec * dayShare;
            totalSeconds += daySec;
        }
        if (totalSeconds == 0) return 0.0;
        return Math.max(0.0, Math.min(1.0, weightedSeconds / totalSeconds));
    }

    private static void buildDayRows(
        boolean includeV2,
        List<DerivedEpisode> episodes,
        List<TimeRange> spanList,
        Set<String> scheduledStations,
        boolean singleStationScope,
        int scheduledMinutes,
        int observedMinutes,
        DayRowSink sink
    ) {
        int denominator = singleStationScope ? 1 : scheduledStations.size();
        List<TimeRange> allRanges = new ArrayList<>();
        List<WeightedInterval> allWeighted = new ArrayList<>();
        long allIncidentMinutes = 0;

        Map<String, List<TimeRange>> rangesByKind = new LinkedHashMap<>();
        Map<String, List<WeightedInterval>> weightedByKind = new LinkedHashMap<>();
        Map<String, Long> incidentMinutesByKind = new LinkedHashMap<>();

        Map<String, List<TimeRange>> rangesByClass = new LinkedHashMap<>();
        Map<String, List<WeightedInterval>> weightedByClass = new LinkedHashMap<>();
        Map<String, Long> incidentMinutesByClass = new LinkedHashMap<>();

        for (DerivedEpisode ep : episodes) {
            List<TimeRange> dayRanges = ReliabilityIntervalCalculator.intersect(ep.countedInWindow(), spanList);
            if (dayRanges.isEmpty()) continue;
            long epMinutes = ReliabilityIntervalCalculator.minutes(dayRanges);
            allRanges.addAll(dayRanges);
            allIncidentMinutes += epMinutes;

            WeightedInterval wi = toWeightedInterval(dayRanges, ep.episode().stationIds(), scheduledStations, singleStationScope);
            allWeighted.add(wi);

            String kind = ep.episode().impactKind();
            rangesByKind.computeIfAbsent(kind, ignored -> new ArrayList<>()).addAll(dayRanges);
            weightedByKind.computeIfAbsent(kind, ignored -> new ArrayList<>()).add(wi);
            incidentMinutesByKind.merge(kind, epMinutes, Long::sum);

            if (includeV2) {
                String cls = ep.disruptionClass();
                rangesByClass.computeIfAbsent(cls, ignored -> new ArrayList<>()).addAll(dayRanges);
                weightedByClass.computeIfAbsent(cls, ignored -> new ArrayList<>()).add(wi);
                incidentMinutesByClass.merge(cls, epMinutes, Long::sum);
            }
        }

        int allImpacted = (int) ReliabilityIntervalCalculator.minutes(allRanges);
        int allIncident = (int) Math.max(allImpacted, allIncidentMinutes);
        double allWeightedMinutes = includeV2
            ? clampWeighted(ReliabilityIntervalCalculator.weightedMinutes(allWeighted, denominator), observedMinutes)
            : allImpacted;
        sink.accept("all", scheduledMinutes, observedMinutes, allImpacted, allWeightedMinutes, allIncident);

        if (includeV2) {
            for (Map.Entry<String, List<TimeRange>> classEntry : rangesByClass.entrySet()) {
                String cls = classEntry.getKey();
                int classImpacted = (int) ReliabilityIntervalCalculator.minutes(classEntry.getValue());
                int classIncident = (int) Math.max(classImpacted, incidentMinutesByClass.getOrDefault(cls, 0L));
                double classWeighted = clampWeighted(
                    ReliabilityIntervalCalculator.weightedMinutes(weightedByClass.get(cls), denominator),
                    observedMinutes
                );
                if (classImpacted > 0 || classIncident > 0 || classWeighted > 0.0) {
                    sink.accept(
                        ReliabilityEpisodeSource.classImpactGroup(cls),
                        scheduledMinutes, observedMinutes, classImpacted, classWeighted, classIncident
                    );
                }
            }
        }

        for (Map.Entry<String, List<TimeRange>> kindEntry : rangesByKind.entrySet()) {
            String kind = kindEntry.getKey();
            int kindImpacted = (int) ReliabilityIntervalCalculator.minutes(kindEntry.getValue());
            int kindIncident = (int) Math.max(kindImpacted, incidentMinutesByKind.getOrDefault(kind, 0L));
            double kindWeighted = includeV2
                ? clampWeighted(ReliabilityIntervalCalculator.weightedMinutes(weightedByKind.get(kind), denominator), observedMinutes)
                : kindImpacted;
            if (kindImpacted > 0 || kindIncident > 0 || (includeV2 && kindWeighted > 0.0)) {
                sink.accept(kind, scheduledMinutes, observedMinutes, kindImpacted, kindWeighted, kindIncident);
            }
        }
    }

    static WeightedInterval toWeightedInterval(
        List<TimeRange> dayRanges,
        List<String> episodeStations,
        Set<String> scheduledStations,
        boolean singleStationScope
    ) {
        if (singleStationScope || scheduledStations == null || scheduledStations.isEmpty()
            || episodeStations == null || episodeStations.isEmpty()) {
            return new WeightedInterval(dayRanges, Set.of(), true);
        }
        Set<String> matched = new HashSet<>();
        for (String st : episodeStations) {
            if (scheduledStations.contains(st)) {
                matched.add(st);
            }
        }
        return new WeightedInterval(dayRanges, matched, false);
    }

    static double clampWeighted(double weightedMinutes, long observedMinutes) {
        if (weightedMinutes <= 0.0 || observedMinutes <= 0L) return 0.0;
        return Math.min(observedMinutes, weightedMinutes);
    }

    private void clearVersionForNetwork(int version, String networkId) {
        txTemplate.executeWithoutResult(status -> {
            acquireNetworkLock(networkId);
            MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("version", version)
                .addValue("networkId", networkId);
            jdbc.update("delete from reliability_episodes where methodology_version = :version and network_id = :networkId", params);
            jdbc.update("delete from reliability_line_days where methodology_version = :version and network_id = :networkId", params);
            jdbc.update("delete from reliability_station_days where methodology_version = :version and network_id = :networkId", params);
        });
    }

    private void switchMethodologyAtomically(int targetVersion) {
        txTemplate.executeWithoutResult(status -> {
            jdbc.update("""
                insert into reliability_methodology (id, current_version, switched_at)
                values (1, :targetVersion, :now)
                on conflict (id) do update
                set current_version = excluded.current_version,
                    switched_at = excluded.switched_at
                """, new MapSqlParameterSource()
                    .addValue("targetVersion", targetVersion)
                    .addValue("now", OffsetDateTime.now(clock)));
        });
    }

    private void deleteOtherVersions(int targetVersion) {
        txTemplate.executeWithoutResult(status -> {
            MapSqlParameterSource params = new MapSqlParameterSource("targetVersion", targetVersion);
            jdbc.update("delete from reliability_episodes where methodology_version <> :targetVersion", params);
            jdbc.update("delete from reliability_line_days where methodology_version <> :targetVersion", params);
            jdbc.update("delete from reliability_station_days where methodology_version <> :targetVersion", params);
            jdbc.update("delete from reliability_derivations where methodology_version <> :targetVersion", params);
        });
    }

    private void markRunning(int version, String networkId, OffsetDateTime startedAt) {
        requiresNewTx.executeWithoutResult(status -> jdbc.update("""
            insert into reliability_derivations (
                methodology_version, network_id, status, last_started_at, updated_at
            ) values (
                :version, :networkId, 'running', :startedAt, :startedAt
            )
            on conflict (methodology_version, network_id) do update
            set status = 'running',
                last_started_at = excluded.last_started_at,
                updated_at = excluded.updated_at
            """, new MapSqlParameterSource()
                .addValue("version", version)
                .addValue("networkId", networkId)
                .addValue("startedAt", startedAt)));
    }

    private void markSucceeded(int version, String networkId, LocalDate derivedThrough, OffsetDateTime succeededAt, long durationMs) {
        requiresNewTx.executeWithoutResult(status ->
            recordSuccessInCurrentTx(version, networkId, derivedThrough, succeededAt, durationMs));
    }

    private void recordSuccessInCurrentTx(
        int version,
        String networkId,
        LocalDate derivedThrough,
        OffsetDateTime succeededAt,
        long durationMs
    ) {
        jdbc.update("""
            insert into reliability_derivations (
                methodology_version, network_id, derived_through, status,
                last_succeeded_at, last_duration_ms, consecutive_failures, last_error, updated_at
            ) values (
                :version, :networkId, :derivedThrough, 'success',
                :succeededAt, :durationMs, 0, null, :succeededAt
            )
            on conflict (methodology_version, network_id) do update
            set derived_through = case
                    when excluded.derived_through is null then reliability_derivations.derived_through
                    when reliability_derivations.derived_through is null then excluded.derived_through
                    when excluded.derived_through > reliability_derivations.derived_through then excluded.derived_through
                    else reliability_derivations.derived_through
                end,
                status = 'success',
                last_succeeded_at = excluded.last_succeeded_at,
                last_duration_ms = excluded.last_duration_ms,
                consecutive_failures = 0,
                last_error = null,
                updated_at = excluded.updated_at
            """, new MapSqlParameterSource()
                .addValue("version", version)
                .addValue("networkId", networkId)
                .addValue("derivedThrough", derivedThrough)
                .addValue("succeededAt", succeededAt)
                .addValue("durationMs", durationMs));
    }

    private void markFailed(int version, String networkId, OffsetDateTime failedAt, long durationMs, RuntimeException error) {
        String message = error.getClass().getSimpleName() + (error.getMessage() == null ? "" : ": " + error.getMessage());
        if (message.length() > MAX_ERROR_LENGTH) {
            message = message.substring(0, MAX_ERROR_LENGTH);
        }
        String finalMessage = message;
        try {
            requiresNewTx.executeWithoutResult(status -> jdbc.update("""
                insert into reliability_derivations (
                    methodology_version, network_id, status, last_failed_at,
                    last_duration_ms, consecutive_failures, last_error, updated_at
                ) values (
                    :version, :networkId, 'failed', :failedAt,
                    :durationMs, 1, :lastError, :failedAt
                )
                on conflict (methodology_version, network_id) do update
                set status = 'failed',
                    last_failed_at = excluded.last_failed_at,
                    last_duration_ms = excluded.last_duration_ms,
                    consecutive_failures = reliability_derivations.consecutive_failures + 1,
                    last_error = excluded.last_error,
                    updated_at = excluded.updated_at
                """, new MapSqlParameterSource()
                    .addValue("version", version)
                    .addValue("networkId", networkId)
                    .addValue("failedAt", failedAt)
                    .addValue("durationMs", durationMs)
                    .addValue("lastError", finalMessage)));
        } catch (RuntimeException recordFailure) {
            log.warn("Failed to record reliability derivation failure for {}", networkId, recordFailure);
        }
    }

    private void acquireNetworkLock(String networkId) {
        jdbc.query(
            "select pg_advisory_xact_lock(hashtext('reliability_derive_' || :networkId))",
            new MapSqlParameterSource("networkId", networkId),
            (rs, row) -> null
        );
    }

    private List<String> knownLineIds(String networkId) {
        if ("regional".equals(networkId)) {
            return RegionalNetworkCatalog.routes().stream()
                .map(RegionalNetworkCatalog.Route::id)
                .toList();
        }
        return List.of("line-1", "line-2", "line-4", "line-5", "line-6");
    }

    /** Evicts the dashboard keys and {@code networkId}'s closed ranges (every network's when null). */
    private void evictCache(@Nullable String networkId) {
        if (dashboardCache != null) {
            dashboardCache.evictDashboard();
            dashboardCache.evictClosedReliabilityRanges(networkId);
        }
    }

    private void batch(String sql, List<SqlParameterSource> rows) {
        for (int start = 0; start < rows.size(); start += BATCH_SIZE) {
            jdbc.batchUpdate(sql, rows.subList(start, Math.min(start + BATCH_SIZE, rows.size()))
                .toArray(SqlParameterSource[]::new));
        }
    }

    private static DerivationStatus mapStatus(java.sql.ResultSet rs) throws java.sql.SQLException {
        long duration = rs.getLong("last_duration_ms");
        Long durationMs = rs.wasNull() ? null : duration;
        return new DerivationStatus(
            rs.getInt("methodology_version"),
            rs.getString("network_id"),
            rs.getObject("derived_through", LocalDate.class),
            rs.getString("status"),
            rs.getObject("last_started_at", OffsetDateTime.class),
            rs.getObject("last_succeeded_at", OffsetDateTime.class),
            rs.getObject("last_failed_at", OffsetDateTime.class),
            durationMs,
            rs.getInt("consecutive_failures")
        );
    }

    private static long elapsedMs(long startNanos) {
        return Math.max(0L, (System.nanoTime() - startNanos) / 1_000_000L);
    }

    private static OffsetDateTime earlier(OffsetDateTime first, OffsetDateTime second) {
        return first.isBefore(second) ? first : second;
    }

    private static OffsetDateTime later(OffsetDateTime first, OffsetDateTime second) {
        return first.isAfter(second) ? first : second;
    }

    private record DerivedEpisode(
        ExtractedEpisode episode,
        List<TimeRange> countedInWindow,
        int countedMinutes,
        String disruptionClass,
        boolean planned,
        double stationShare
    ) {}

    private record LineDayRow(
        String lineId,
        LocalDate serviceDate,
        String impactGroup,
        int scheduledMinutes,
        int observedMinutes,
        int impactedMinutes,
        double weightedImpactedMinutes,
        int incidentMinutes,
        OffsetDateTime derivedAt
    ) {}

    private record StationDayRow(
        String lineId,
        String stationId,
        LocalDate serviceDate,
        String impactGroup,
        int scheduledMinutes,
        int observedMinutes,
        int impactedMinutes,
        double weightedImpactedMinutes,
        int incidentMinutes,
        OffsetDateTime derivedAt
    ) {}

    private record ChunkCounts(int episodes, int lineDays, int stationDays) {}

    private record ChunkComputation(
        List<LineDayRow> lineDayRows,
        List<StationDayRow> stationDayRows,
        List<DerivedEpisode> derivedEpisodes,
        Map<String, TimeRange> stripWindowByLine,
        Map<String, Map<LocalDate, TimeRange>> lineSpans,
        OffsetDateTime windowStart,
        OffsetDateTime windowEnd
    ) {}

    /** One line's ({@code stationId} empty) or station's day row, computed but not persisted. */
    public record SliceDay(
        String lineId,
        String stationId,
        LocalDate serviceDate,
        String impactGroup,
        int scheduledMinutes,
        int observedMinutes,
        int impactedMinutes,
        double weightedImpactedMinutes,
        int incidentMinutes
    ) {}

    /** An episode's counted time within the slice; {@code active} when it is counting at the cap. */
    public record SliceEpisode(
        ExtractedEpisode episode,
        List<TimeRange> counted,
        String disruptionClass,
        boolean planned,
        boolean active
    ) {}

    /** {@code lineSpans}: each line's disjoint service span per date, ended at the cap. */
    public record LiveSlice(
        List<SliceDay> lineDays,
        List<SliceDay> stationDays,
        List<SliceEpisode> episodes,
        Map<String, Map<LocalDate, TimeRange>> lineSpans
    ) {
        static final LiveSlice EMPTY = new LiveSlice(List.of(), List.of(), List.of(), Map.of());
    }
}
