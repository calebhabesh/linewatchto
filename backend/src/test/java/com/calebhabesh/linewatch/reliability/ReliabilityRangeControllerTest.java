package com.calebhabesh.linewatch.reliability;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.calebhabesh.linewatch.account.ClientAddressResolver;
import com.calebhabesh.linewatch.account.TrustedProxyProperties;
import com.calebhabesh.linewatch.cache.DashboardCacheProperties;
import com.calebhabesh.linewatch.cache.DashboardCacheService;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.ExportFile;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.RangeInfo;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.SeriesResponse;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.function.Supplier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import tools.jackson.core.type.TypeReference;

class ReliabilityRangeControllerTest {
    private static final LocalDate TODAY = LocalDate.parse("2026-11-24");

    private final ReliabilityRangeService service = mock(ReliabilityRangeService.class);
    private final DashboardCacheService cache = mock(DashboardCacheService.class);
    private final ReliabilityRangeProperties properties = new ReliabilityRangeProperties();
    private final ReliabilityRangeRateLimiter limiter = new ReliabilityRangeRateLimiter(
        properties, Clock.fixed(Instant.parse("2026-11-24T17:00:00Z"), ZoneOffset.UTC));
    private MockMvc mvc;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        when(service.today()).thenReturn(TODAY);
        when(service.currentMethodologyVersion()).thenReturn(2);
        when(cache.getOrCompute(anyString(), any(TypeReference.class), any(Duration.class), any(Supplier.class)))
            .thenAnswer(invocation -> ((Supplier<?>) invocation.getArgument(3)).get());
        when(cache.getOrComputeClosedReliability(anyString(), anyString(), any(TypeReference.class), any(Duration.class), any(Supplier.class)))
            .thenAnswer(invocation -> ((Supplier<?>) invocation.getArgument(4)).get());
        mvc = MockMvcBuilders.standaloneSetup(new ReliabilityRangeController(
            service, cache, new DashboardCacheProperties(), properties, limiter,
            new ClientAddressResolver(new TrustedProxyProperties()))).build();
    }

    @Test
    void invalidInputsAreBadRequestsInTheErrorShapeAndNeverReachTheCache() throws Exception {
        mvc.perform(get("/api/reliability/summary").param("network", "ttc").param("from", "2026-11-31").param("to", "2026-11-24"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("invalid_date"))
            .andExpect(jsonPath("$.message").value("from must be a date as YYYY-MM-DD."));
        mvc.perform(get("/api/reliability/summary").param("from", "2026-11-20").param("to", "2026-11-25"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("invalid_range"));
        mvc.perform(get("/api/reliability/series").param("from", "2024-01-01").param("to", "2026-11-24"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("too_many_buckets"));
        mvc.perform(get("/api/reliability/hotspots").param("from", "2026-11-01").param("to", "2026-11-24").param("limit", "101"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("invalid_limit"));
        mvc.perform(get("/api/reliability/hotspots").param("from", "2026-11-01").param("to", "2026-11-24").param("class", "closure"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("invalid_class"));
        mvc.perform(get("/api/reliability/episodes").param("from", "2026-11-01").param("to", "2026-11-24").param("cursor", "%%%"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("invalid_cursor"));
        mvc.perform(get("/api/reliability/episodes").param("from", "2026-11-01").param("to", "2026-11-24").param("kind", "advisory"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("invalid_kind"));
        mvc.perform(get("/api/reliability/episodes").param("from", "2026-11-01").param("to", "2026-11-24").param("dayOfWeek", "9"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("invalid_day_of_week"));
        mvc.perform(get("/api/reliability/series").param("from", "2026-11-01").param("to", "2026-11-24").param("byLine", "maybe"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("invalid_by_line"));
        mvc.perform(get("/api/reliability/cancellations").param("network", "regional").param("from", "2024-01-01").param("to", "2026-11-24"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("too_many_buckets"));
        mvc.perform(get("/api/reliability/availability").param("network", "subway"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("invalid_network"));
        verify(cache, never()).getOrCompute(anyString(), any(TypeReference.class), any(Duration.class), any(Supplier.class));
    }

    @Test
    void unknownLinesAndStationsFromTheServiceAreBadRequests() throws Exception {
        when(service.summary(any())).thenThrow(
            ReliabilityRangeException.badRequest("invalid_station", "Unknown station for this network."));
        mvc.perform(get("/api/reliability/summary").param("from", "2026-11-01").param("to", "2026-11-24").param("station", "nowhere"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("invalid_station"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void closedRangesUseTheNightlyEvictedCacheAndOpenRangesTheOneMinuteDashboardCache() throws Exception {
        when(service.series(any(), eq("week"), eq(false))).thenReturn(series());
        mvc.perform(get("/api/reliability/series").param("network", "regional").param("from", "2026-10-01")
                .param("to", "2026-11-22").param("granularity", "WEEK").param("line", "Regional-LW"))
            .andExpect(status().isOk());
        verify(cache).getOrComputeClosedReliability(
            eq("regional"),
            eq("reliability:v2:series:regional:2026-10-01:2026-11-22:regional-lw:-:granularity=week"),
            any(TypeReference.class), eq(Duration.ofHours(6)), any(Supplier.class));

        mvc.perform(get("/api/reliability/series").param("network", "regional").param("from", "2026-10-01")
                .param("to", "2026-11-23").param("granularity", "week"))
            .andExpect(status().isOk());
        verify(cache).getOrCompute(
            eq("reliability:v2:series:regional:2026-10-01:2026-11-23:-:-:granularity=week"),
            any(TypeReference.class), eq(Duration.ofMinutes(1)), any(Supplier.class));

        when(service.series(any(), eq("day"), eq(true))).thenReturn(series());
        mvc.perform(get("/api/reliability/series").param("network", "ttc").param("from", "2026-11-01")
                .param("to", "2026-11-20").param("granularity", "day").param("byLine", "true"))
            .andExpect(status().isOk());
        verify(cache).getOrComputeClosedReliability(
            eq("ttc"),
            eq("reliability:v2:series:ttc:2026-11-01:2026-11-20:-:-:granularity=day;byLine=true"),
            any(TypeReference.class), eq(Duration.ofHours(6)), any(Supplier.class));

        when(service.episodes(any(), eq(""), eq(50), any())).thenReturn(null);
        mvc.perform(get("/api/reliability/episodes").param("network", "ttc").param("from", "2026-11-01")
                .param("to", "2026-11-20").param("class", "slow-zone").param("sort", "longest"))
            .andExpect(status().isOk());
        verify(cache).getOrComputeClosedReliability(
            eq("ttc"),
            eq("reliability:v2:episodes:ttc:2026-11-01:2026-11-20:-:-:limit=50;cursor=;class=slow-zone;sort=longest"),
            any(TypeReference.class), eq(Duration.ofHours(6)), any(Supplier.class));

        when(service.cancellations(any(), eq("day"))).thenReturn(null);
        mvc.perform(get("/api/reliability/cancellations").param("network", "regional").param("from", "2026-11-01")
                .param("to", "2026-11-20").param("granularity", "day"))
            .andExpect(status().isOk());
        verify(cache).getOrComputeClosedReliability(
            eq("regional"),
            eq("reliability:v2:cancellations:regional:2026-11-01:2026-11-20:-:-:granularity=day"),
            any(TypeReference.class), eq(Duration.ofHours(6)), any(Supplier.class));
    }

    @Test
    void exportIsAnAttachedCsvAndIsRateLimitedPerClient() throws Exception {
        properties.getRateLimit().setMaxExports(2);
        when(service.export(any())).thenReturn(new ExportFile(
            "linewatchto-reliability-ttc-2026-11-01-to-2026-11-24.csv", "service_date,line_id\r\n2026-11-01,line-1\r\n", 1));
        for (int attempt = 0; attempt < 2; attempt++) {
            mvc.perform(get("/api/reliability/export").param("from", "2026-11-01").param("to", "2026-11-24"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "text/csv;charset=UTF-8"))
                .andExpect(header().string("Content-Disposition",
                    "attachment; filename=\"linewatchto-reliability-ttc-2026-11-01-to-2026-11-24.csv\""))
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(content().string("service_date,line_id\r\n2026-11-01,line-1\r\n"));
        }
        mvc.perform(get("/api/reliability/export").param("from", "2026-11-01").param("to", "2026-11-24"))
            .andExpect(status().isTooManyRequests())
            .andExpect(jsonPath("$.error").value("rate_limited"));
    }

    @Test
    void cacheMissesCountAgainstTheComputationLimit() throws Exception {
        properties.getRateLimit().setMaxComputations(1);
        when(service.hotspots(any(), anyString(), anyInt(), any())).thenReturn(null);
        mvc.perform(get("/api/reliability/hotspots").param("from", "2026-11-01").param("to", "2026-11-24"))
            .andExpect(status().isOk());
        mvc.perform(get("/api/reliability/hotspots").param("from", "2026-11-01").param("to", "2026-11-24"))
            .andExpect(status().isTooManyRequests())
            .andExpect(jsonPath("$.error").value("rate_limited"));
    }

    private static SeriesResponse series() {
        RangeInfo info = new RangeInfo(LocalDate.parse("2026-10-01"), LocalDate.parse("2026-11-22"),
            LocalDate.parse("2026-11-01"), LocalDate.parse("2026-11-22"), 22, true, "History starts 2026-11-01.",
            LocalDate.parse("2026-11-01"), false);
        return new SeriesResponse("regional", 2, info, "week", "line", "regional-lw", null, List.of(), "");
    }
}
