package com.calebhabesh.linewatch.reliability;

import com.calebhabesh.linewatch.account.ClientAddressResolver;
import com.calebhabesh.linewatch.cache.DashboardCacheProperties;
import com.calebhabesh.linewatch.cache.DashboardCacheService;
import com.calebhabesh.linewatch.performance.TtcPerformanceHistoryRepository;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.AvailabilityResponse;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.CancellationsResponse;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.EpisodesResponse;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.ErrorResponse;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.ExportFile;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.HotspotsResponse;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.OnTimeResponse;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.PatternsResponse;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.SeriesResponse;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.SummaryResponse;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.TtcDelayLogResponse;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.TtcPerformanceHistoryResponse;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.TtcPerformancePoint;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.TtcPerformanceSeries;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.core.type.TypeReference;

/**
 * Plan 17 A7/A9/A10/D8 range API. Every range endpoint takes {@code network=ttc|regional},
 * inclusive Toronto service dates {@code from} and {@code to}, and optional {@code line} and
 * {@code station}. Closed ranges (ending before yesterday) are cached for hours in Redis and
 * emit {@code Cache-Control: public, max-age=300, s-maxage=21600, stale-while-revalidate=3600}
 * for edge caching (D8); open ranges reaching yesterday or today use a short 30 s edge TTL;
 * exports stay strictly {@code no-store}.
 */
@RestController
@RequestMapping("/api/reliability")
public class ReliabilityRangeController {
    static final String CACHE_CLOSED = "public, max-age=300, s-maxage=21600, stale-while-revalidate=3600";
    static final String CACHE_OPEN = "public, max-age=15, s-maxage=30, stale-while-revalidate=30";
    static final String CACHE_AVAILABILITY = "public, max-age=60, s-maxage=900, stale-while-revalidate=300";
    static final String CACHE_CONTEXT = "public, max-age=300, s-maxage=3600, stale-while-revalidate=600";

    private static final TypeReference<AvailabilityResponse> AVAILABILITY = new TypeReference<>() {};
    private static final TypeReference<SummaryResponse> SUMMARY = new TypeReference<>() {};
    private static final TypeReference<SeriesResponse> SERIES = new TypeReference<>() {};
    private static final TypeReference<PatternsResponse> PATTERNS = new TypeReference<>() {};
    private static final TypeReference<HotspotsResponse> HOTSPOTS = new TypeReference<>() {};
    private static final TypeReference<EpisodesResponse> EPISODES = new TypeReference<>() {};
    private static final TypeReference<CancellationsResponse> CANCELLATIONS = new TypeReference<>() {};
    private static final TypeReference<OnTimeResponse> ON_TIME = new TypeReference<>() {};
    private static final TypeReference<TtcDelayLogResponse> TTC_DELAY_LOG = new TypeReference<>() {};
    private static final TypeReference<TtcPerformanceHistoryResponse> TTC_PERFORMANCE = new TypeReference<>() {};
    private static final MediaType CSV = new MediaType("text", "csv", StandardCharsets.UTF_8);

    private final ReliabilityRangeService service;
    private final DashboardCacheService cache;
    private final DashboardCacheProperties cacheProperties;
    private final ReliabilityRangeProperties rangeProperties;
    private final ReliabilityRangeRateLimiter rateLimiter;
    private final ClientAddressResolver clientAddressResolver;
    private final RegionalTripObservationService onTimeService;
    private final TtcOfficialDelayLogService ttcDelayLogService;
    private final TtcPerformanceHistoryRepository ttcPerformanceHistoryRepository;

    @Autowired
    public ReliabilityRangeController(
        ReliabilityRangeService service,
        DashboardCacheService cache,
        DashboardCacheProperties cacheProperties,
        ReliabilityRangeProperties rangeProperties,
        ReliabilityRangeRateLimiter rateLimiter,
        ClientAddressResolver clientAddressResolver,
        RegionalTripObservationService onTimeService,
        TtcOfficialDelayLogService ttcDelayLogService,
        TtcPerformanceHistoryRepository ttcPerformanceHistoryRepository
    ) {
        this.service = service;
        this.cache = cache;
        this.cacheProperties = cacheProperties;
        this.rangeProperties = rangeProperties;
        this.rateLimiter = rateLimiter;
        this.clientAddressResolver = clientAddressResolver;
        this.onTimeService = onTimeService;
        this.ttcDelayLogService = ttcDelayLogService;
        this.ttcPerformanceHistoryRepository = ttcPerformanceHistoryRepository;
    }

    public ReliabilityRangeController(
        ReliabilityRangeService service,
        DashboardCacheService cache,
        DashboardCacheProperties cacheProperties,
        ReliabilityRangeProperties rangeProperties,
        ReliabilityRangeRateLimiter rateLimiter,
        ClientAddressResolver clientAddressResolver
    ) {
        this(service, cache, cacheProperties, rangeProperties, rateLimiter, clientAddressResolver, null, null, null);
    }

    @GetMapping("/availability")
    public ResponseEntity<AvailabilityResponse> availability(@RequestParam(required = false) String network) {
        String networkId = ReliabilityRangeRequest.parseNetwork(network);
        String key = "reliability:v" + service.currentMethodologyVersion() + ":availability:" + networkId;
        AvailabilityResponse body = cache.getOrComputeClosedReliability(
            networkId, key, AVAILABILITY, rangeProperties.getAvailabilityTtl(), () -> service.availability(networkId));
        return ResponseEntity.ok()
            .header(HttpHeaders.CACHE_CONTROL, CACHE_AVAILABILITY)
            .body(body);
    }

    @GetMapping("/summary")
    public ResponseEntity<SummaryResponse> summary(
        @RequestParam(required = false) String network,
        @RequestParam(required = false) String from,
        @RequestParam(required = false) String to,
        @RequestParam(required = false) String line,
        @RequestParam(required = false) String station,
        HttpServletRequest http
    ) {
        ReliabilityRangeRequest request = parse(network, from, to, line, station);
        return cachedResponse(request, "summary", "", SUMMARY, () -> service.summary(request), http);
    }

    @GetMapping("/series")
    public ResponseEntity<SeriesResponse> series(
        @RequestParam(required = false) String network,
        @RequestParam(required = false) String from,
        @RequestParam(required = false) String to,
        @RequestParam(required = false) String line,
        @RequestParam(required = false) String station,
        @RequestParam(required = false) String granularity,
        @RequestParam(required = false) String byLine,
        HttpServletRequest http
    ) {
        ReliabilityRangeRequest request = parse(network, from, to, line, station);
        String unit = ReliabilityRangeService.parseGranularity(granularity);
        boolean includeLines = ReliabilityRangeService.parseByLine(byLine);
        ReliabilityRangeService.requireBucketCount(request.from(), request.to(), unit);
        String params = "granularity=" + unit + (includeLines ? ";byLine=true" : "");
        return cachedResponse(request, "series", params, SERIES, () -> service.series(request, unit, includeLines), http);
    }

    @GetMapping("/patterns")
    public ResponseEntity<PatternsResponse> patterns(
        @RequestParam(required = false) String network,
        @RequestParam(required = false) String from,
        @RequestParam(required = false) String to,
        @RequestParam(required = false) String line,
        @RequestParam(required = false) String station,
        HttpServletRequest http
    ) {
        ReliabilityRangeRequest request = parse(network, from, to, line, station);
        return cachedResponse(request, "patterns", "", PATTERNS, () -> service.patterns(request), http);
    }

    @GetMapping("/hotspots")
    public ResponseEntity<HotspotsResponse> hotspots(
        @RequestParam(required = false) String network,
        @RequestParam(required = false) String from,
        @RequestParam(required = false) String to,
        @RequestParam(required = false) String line,
        @RequestParam(required = false) String station,
        @RequestParam(required = false) String sort,
        @RequestParam(required = false) String limit,
        @RequestParam(name = "class", required = false) String disruptionClass,
        HttpServletRequest http
    ) {
        ReliabilityRangeRequest request = parse(network, from, to, line, station);
        String normalizedSort = ReliabilityRangeService.parseHotspotSort(sort);
        String normalizedClass = ReliabilityRangeService.parseDisruptionClass(disruptionClass);
        int normalizedLimit = ReliabilityRangeRequest.parseInt(
            "limit", limit, ReliabilityRangeService.DEFAULT_HOTSPOTS, 1, ReliabilityRangeService.MAX_HOTSPOTS);
        return cachedResponse(request, "hotspots",
            "class=" + (normalizedClass == null ? "-" : normalizedClass) + ";sort=" + normalizedSort + ";limit=" + normalizedLimit,
            HOTSPOTS, () -> service.hotspots(request, normalizedSort, normalizedLimit, normalizedClass), http);
    }

    @GetMapping("/episodes")
    public ResponseEntity<EpisodesResponse> episodes(
        @RequestParam(required = false) String network,
        @RequestParam(required = false) String from,
        @RequestParam(required = false) String to,
        @RequestParam(required = false) String line,
        @RequestParam(required = false) String station,
        @RequestParam(required = false) String cursor,
        @RequestParam(required = false) String limit,
        @RequestParam(name = "class", required = false) String disruptionClass,
        @RequestParam(required = false) String kind,
        @RequestParam(required = false) String cause,
        @RequestParam(required = false) String planned,
        @RequestParam(required = false) String completed,
        @RequestParam(required = false) String minMinutes,
        @RequestParam(required = false) String maxMinutes,
        @RequestParam(required = false) String dayOfWeek,
        @RequestParam(required = false) String hour,
        @RequestParam(required = false) String sort,
        HttpServletRequest http
    ) {
        ReliabilityRangeRequest request = parse(network, from, to, line, station);
        int normalizedLimit = ReliabilityRangeRequest.parseInt(
            "limit", limit, ReliabilityRangeService.DEFAULT_EPISODES, 1, ReliabilityRangeService.MAX_EPISODES);
        ReliabilityRangeService.EpisodeFilter filter = ReliabilityRangeService.parseEpisodeFilter(
            disruptionClass, kind, cause, planned, completed, minMinutes, maxMinutes, dayOfWeek, hour, sort);
        ReliabilityRangeService.decodeCursor(cursor, filter.sort());
        String normalizedCursor = cursor == null || cursor.isBlank() ? "" : cursor.trim();
        String params = "limit=" + normalizedLimit + ";cursor=" + normalizedCursor + filter.cacheKeySuffix();
        return cachedResponse(request, "episodes", params, EPISODES,
            () -> service.episodes(request, normalizedCursor, normalizedLimit, filter), http);
    }

    @GetMapping("/cancellations")
    public ResponseEntity<CancellationsResponse> cancellations(
        @RequestParam(required = false) String network,
        @RequestParam(required = false) String from,
        @RequestParam(required = false) String to,
        @RequestParam(required = false) String line,
        @RequestParam(required = false) String station,
        @RequestParam(required = false) String granularity,
        HttpServletRequest http
    ) {
        ReliabilityRangeRequest request = parse(network, from, to, line, station);
        String unit = ReliabilityRangeService.parseGranularity(granularity);
        ReliabilityRangeService.requireBucketCount(request.from(), request.to(), unit);
        return cachedResponse(request, "cancellations", "granularity=" + unit, CANCELLATIONS,
            () -> service.cancellations(request, unit), http);
    }

    /** Plan 17 A10 (D5): GO & UP rail on-time performance from derived trip observations. */
    @GetMapping("/on-time")
    public ResponseEntity<OnTimeResponse> onTime(
        @RequestParam(required = false) String from,
        @RequestParam(required = false) String to,
        @RequestParam(required = false) String line,
        @RequestParam(required = false) String granularity,
        HttpServletRequest http
    ) {
        ReliabilityRangeRequest request = parse("regional", from, to, line, null);
        String unit = ReliabilityRangeService.parseGranularity(granularity);
        ReliabilityRangeService.requireBucketCount(request.from(), request.to(), unit);
        if (onTimeService == null) {
            throw ReliabilityRangeException.badRequest("unavailable", "GO/UP on-time performance is unavailable.");
        }
        return cachedResponse(request, "on-time", "granularity=" + unit, ON_TIME,
            () -> onTimeService.onTime(request.from(), request.to(), request.lineId(), unit), http);
    }

    /** Plan 17 A10 (D6): Open Data Toronto TTC official subway delay log (separate from observed minutes). */
    @GetMapping("/ttc-delay-log")
    public ResponseEntity<TtcDelayLogResponse> ttcDelayLog(
        @RequestParam(required = false) String from,
        @RequestParam(required = false) String to,
        @RequestParam(required = false) String line,
        @RequestParam(required = false) String granularity,
        HttpServletRequest http
    ) {
        ReliabilityRangeRequest request = parse("ttc", from, to, line, null);
        String unit = ReliabilityRangeService.parseGranularity(granularity);
        ReliabilityRangeService.requireBucketCount(request.from(), request.to(), unit);
        if (ttcDelayLogService == null) {
            throw ReliabilityRangeException.badRequest("unavailable", "TTC Delay Log is unavailable.");
        }
        String key = "reliability:a10:ttc-delay-log:" + request.keyPart() + ":granularity=" + unit;
        String client = clientAddressResolver.clientAddress(http);
        TtcDelayLogResponse body = cache.getOrComputeClosedReliability(
            "ttc", key, TTC_DELAY_LOG, rangeProperties.getClosedRangeTtl(),
            () -> {
                rateLimiter.requireComputation(client);
                return ttcDelayLogService.delayLog(request.from(), request.to(), request.lineId(), unit);
            });
        return ResponseEntity.ok()
            .header(HttpHeaders.CACHE_CONTROL, CACHE_CONTEXT)
            .body(body);
    }

    /** Plan 17 A10: stored TTC.ca official performance readings over time. */
    @GetMapping("/ttc-performance")
    public ResponseEntity<TtcPerformanceHistoryResponse> ttcPerformance(
        @RequestParam(required = false) String from,
        @RequestParam(required = false) String to,
        HttpServletRequest http
    ) {
        ReliabilityRangeRequest request = parse("ttc", from, to, null, null);
        if (ttcPerformanceHistoryRepository == null) {
            throw ReliabilityRangeException.badRequest("unavailable", "TTC performance history is unavailable.");
        }
        String key = "reliability:a10:ttc-performance:" + request.keyPart();
        String client = clientAddressResolver.clientAddress(http);
        TtcPerformanceHistoryResponse body = cache.getOrCompute(
            key, TTC_PERFORMANCE, cacheProperties.getReliabilityTtl(),
            () -> {
                rateLimiter.requireComputation(client);
                Map<String, List<TtcPerformanceHistoryRepository.ReadingRow>> grouped =
                    ttcPerformanceHistoryRepository.readingsByMetric(request.from(), request.to());
                List<TtcPerformanceSeries> series = new ArrayList<>();
                for (Map.Entry<String, List<TtcPerformanceHistoryRepository.ReadingRow>> entry : grouped.entrySet()) {
                    List<TtcPerformanceHistoryRepository.ReadingRow> rows = entry.getValue();
                    TtcPerformanceHistoryRepository.ReadingRow latest = rows.getLast();
                    List<TtcPerformancePoint> points = rows.stream()
                        .map(r -> new TtcPerformancePoint(r.readingDate(), r.percentage(), r.valueLabel(), r.updatedLabel()))
                        .toList();
                    series.add(new TtcPerformanceSeries(
                        entry.getKey(), latest.label(), latest.category(), latest.target(), points));
                }
                String msg = series.isEmpty()
                    ? "No stored TTC.ca performance readings recorded in this range yet."
                    : "Stored daily TTC.ca official performance readings; separate from LineWatchTO-observed disruptions.";
                return new TtcPerformanceHistoryResponse(
                    "ttc", request.from(), request.to(), "TTC.ca", series, msg);
            });
        return ResponseEntity.ok()
            .header(HttpHeaders.CACHE_CONTROL, CACHE_CONTEXT)
            .body(body);
    }

    @GetMapping("/export")
    public ResponseEntity<String> export(
        @RequestParam(required = false) String network,
        @RequestParam(required = false) String from,
        @RequestParam(required = false) String to,
        @RequestParam(required = false) String line,
        @RequestParam(required = false) String station,
        HttpServletRequest http
    ) {
        ReliabilityRangeRequest request = parse(network, from, to, line, station);
        rateLimiter.requireExport(clientAddressResolver.clientAddress(http));
        ExportFile file = service.export(request);
        return ResponseEntity.ok()
            .contentType(CSV)
            .header(HttpHeaders.CONTENT_DISPOSITION,
                ContentDisposition.attachment().filename(file.filename()).build().toString())
            .header(HttpHeaders.CACHE_CONTROL, "no-store")
            .body(file.csv());
    }

    @ExceptionHandler(ReliabilityRangeException.class)
    public ResponseEntity<ErrorResponse> handleRangeException(ReliabilityRangeException exception) {
        return ResponseEntity.status(exception.getStatus())
            .header(HttpHeaders.CACHE_CONTROL, "no-store")
            .body(new ErrorResponse(exception.getError(), exception.getMessage()));
    }

    private ReliabilityRangeRequest parse(String network, String from, String to, String line, String station) {
        return ReliabilityRangeRequest.parse(network, from, to, line, station, service.today());
    }

    /**
     * Keys are {@code reliability:v{version}:{endpoint}:{network}:{from}:{to}:{line}:{station}:{params}},
     * so a methodology switch never serves the old version's numbers. Closed ranges emit
     * {@link #CACHE_CLOSED} (6 h edge TTL) for D8 edge caching; open ranges emit {@link #CACHE_OPEN}.
     */
    private <T> ResponseEntity<T> cachedResponse(
        ReliabilityRangeRequest request,
        String endpoint,
        String params,
        TypeReference<T> type,
        Supplier<T> compute,
        HttpServletRequest http
    ) {
        String key = "reliability:v" + service.currentMethodologyVersion() + ":" + endpoint + ":"
            + request.keyPart() + ":" + params;
        String client = clientAddressResolver.clientAddress(http);
        Supplier<T> limited = () -> {
            rateLimiter.requireComputation(client);
            return compute.get();
        };
        boolean closed = request.to().isBefore(service.today().minusDays(1));
        T body = closed
            ? cache.getOrComputeClosedReliability(request.networkId(), key, type, rangeProperties.getClosedRangeTtl(), limited)
            : cache.getOrCompute(key, type, cacheProperties.getReliabilityTtl(), limited);
        return ResponseEntity.ok()
            .header(HttpHeaders.CACHE_CONTROL, closed ? CACHE_CLOSED : CACHE_OPEN)
            .body(body);
    }
}
