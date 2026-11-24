package com.calebhabesh.linewatch.reliability;

import com.calebhabesh.linewatch.account.ClientAddressResolver;
import com.calebhabesh.linewatch.cache.DashboardCacheProperties;
import com.calebhabesh.linewatch.cache.DashboardCacheService;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.AvailabilityResponse;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.CancellationsResponse;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.EpisodesResponse;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.ErrorResponse;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.ExportFile;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.HotspotsResponse;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.PatternsResponse;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.SeriesResponse;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.SummaryResponse;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.util.function.Supplier;
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
 * Plan 17 A7 range API. Every range endpoint takes {@code network=ttc|regional}, inclusive
 * Toronto service dates {@code from} and {@code to}, and optional {@code line} and
 * {@code station}. Ranges ending before yesterday are cached for hours and evicted by the
 * nightly derive; ranges reaching yesterday or today keep the dashboard's one-minute TTL and
 * ingestion eviction. Cache misses and exports count against a per-client limit.
 */
@RestController
@RequestMapping("/api/reliability")
public class ReliabilityRangeController {
    private static final TypeReference<AvailabilityResponse> AVAILABILITY = new TypeReference<>() {};
    private static final TypeReference<SummaryResponse> SUMMARY = new TypeReference<>() {};
    private static final TypeReference<SeriesResponse> SERIES = new TypeReference<>() {};
    private static final TypeReference<PatternsResponse> PATTERNS = new TypeReference<>() {};
    private static final TypeReference<HotspotsResponse> HOTSPOTS = new TypeReference<>() {};
    private static final TypeReference<EpisodesResponse> EPISODES = new TypeReference<>() {};
    private static final TypeReference<CancellationsResponse> CANCELLATIONS = new TypeReference<>() {};
    private static final MediaType CSV = new MediaType("text", "csv", StandardCharsets.UTF_8);

    private final ReliabilityRangeService service;
    private final DashboardCacheService cache;
    private final DashboardCacheProperties cacheProperties;
    private final ReliabilityRangeProperties rangeProperties;
    private final ReliabilityRangeRateLimiter rateLimiter;
    private final ClientAddressResolver clientAddressResolver;

    public ReliabilityRangeController(
        ReliabilityRangeService service,
        DashboardCacheService cache,
        DashboardCacheProperties cacheProperties,
        ReliabilityRangeProperties rangeProperties,
        ReliabilityRangeRateLimiter rateLimiter,
        ClientAddressResolver clientAddressResolver
    ) {
        this.service = service;
        this.cache = cache;
        this.cacheProperties = cacheProperties;
        this.rangeProperties = rangeProperties;
        this.rateLimiter = rateLimiter;
        this.clientAddressResolver = clientAddressResolver;
    }

    @GetMapping("/availability")
    public AvailabilityResponse availability(@RequestParam(required = false) String network) {
        String networkId = ReliabilityRangeRequest.parseNetwork(network);
        String key = "reliability:v" + service.currentMethodologyVersion() + ":availability:" + networkId;
        return cache.getOrComputeClosedReliability(
            networkId, key, AVAILABILITY, rangeProperties.getAvailabilityTtl(), () -> service.availability(networkId));
    }

    @GetMapping("/summary")
    public SummaryResponse summary(
        @RequestParam(required = false) String network,
        @RequestParam(required = false) String from,
        @RequestParam(required = false) String to,
        @RequestParam(required = false) String line,
        @RequestParam(required = false) String station,
        HttpServletRequest http
    ) {
        ReliabilityRangeRequest request = parse(network, from, to, line, station);
        return cached(request, "summary", "", SUMMARY, () -> service.summary(request), http);
    }

    @GetMapping("/series")
    public SeriesResponse series(
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
        return cached(request, "series", params, SERIES, () -> service.series(request, unit, includeLines), http);
    }

    @GetMapping("/patterns")
    public PatternsResponse patterns(
        @RequestParam(required = false) String network,
        @RequestParam(required = false) String from,
        @RequestParam(required = false) String to,
        @RequestParam(required = false) String line,
        @RequestParam(required = false) String station,
        HttpServletRequest http
    ) {
        ReliabilityRangeRequest request = parse(network, from, to, line, station);
        return cached(request, "patterns", "", PATTERNS, () -> service.patterns(request), http);
    }

    @GetMapping("/hotspots")
    public HotspotsResponse hotspots(
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
        return cached(request, "hotspots",
            "class=" + (normalizedClass == null ? "-" : normalizedClass) + ";sort=" + normalizedSort + ";limit=" + normalizedLimit,
            HOTSPOTS, () -> service.hotspots(request, normalizedSort, normalizedLimit, normalizedClass), http);
    }

    @GetMapping("/episodes")
    public EpisodesResponse episodes(
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
        return cached(request, "episodes", params, EPISODES,
            () -> service.episodes(request, normalizedCursor, normalizedLimit, filter), http);
    }

    @GetMapping("/cancellations")
    public CancellationsResponse cancellations(
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
        return cached(request, "cancellations", "granularity=" + unit, CANCELLATIONS,
            () -> service.cancellations(request, unit), http);
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
            .body(new ErrorResponse(exception.getError(), exception.getMessage()));
    }

    private ReliabilityRangeRequest parse(String network, String from, String to, String line, String station) {
        return ReliabilityRangeRequest.parse(network, from, to, line, station, service.today());
    }

    /**
     * Keys are {@code reliability:v{version}:{endpoint}:{network}:{from}:{to}:{line}:{station}:{params}},
     * so a methodology switch never serves the old version's numbers.
     */
    private <T> T cached(
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
        return closed
            ? cache.getOrComputeClosedReliability(request.networkId(), key, type, rangeProperties.getClosedRangeTtl(), limited)
            : cache.getOrCompute(key, type, cacheProperties.getReliabilityTtl(), limited);
    }
}
