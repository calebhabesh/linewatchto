package com.calebhabesh.linewatch.reliability;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.cache.DashboardCacheProperties;
import com.calebhabesh.linewatch.cache.DashboardCacheService;
import com.fasterxml.jackson.core.type.TypeReference;
import java.time.Duration;
import java.util.function.Supplier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ReliabilityControllerTest {
    private final ReliabilityService service = mock(ReliabilityService.class);
    private final DashboardCacheService cache = mock(DashboardCacheService.class);
    private final DashboardCacheProperties cacheProperties = new DashboardCacheProperties();
    private final ReliabilityController controller = new ReliabilityController(
        service,
        cache,
        cacheProperties
    );

    @BeforeEach
    @SuppressWarnings("unchecked")
    void passCacheMissesThroughToTheService() {
        when(cache.getOrCompute(
            any(String.class),
            any(TypeReference.class),
            any(Duration.class),
            any(Supplier.class)
        )).thenAnswer(invocation -> ((Supplier<?>) invocation.getArgument(3)).get());
    }

    @Test
    void cachesLineReliabilityByNormalizedNetworkForOneMinute() {
        ReliabilityResponses.ReliabilityResponse response = mock(ReliabilityResponses.ReliabilityResponse.class);
        when(service.lines("regional")).thenReturn(response);

        Object result = controller.lines("REGIONAL");

        assertThat(result).isSameAs(response);
        verify(cache).getOrCompute(
            eq("reliability:lines:regional"),
            any(TypeReference.class),
            eq(Duration.ofMinutes(1)),
            any(Supplier.class)
        );
        verify(service).lines("regional");
    }

    @Test
    void normalizesUnknownLineNetworkRequestsIntoTheTtcCacheKey() {
        ReliabilityResponses.ReliabilityResponse response = mock(ReliabilityResponses.ReliabilityResponse.class);
        when(service.lines("ttc")).thenReturn(response);

        assertThat(controller.lines("unknown")).isSameAs(response);

        verify(cache).getOrCompute(
            eq("reliability:lines:ttc"),
            any(TypeReference.class),
            eq(Duration.ofMinutes(1)),
            any(Supplier.class)
        );
    }

    @Test
    void cachesStationReliabilityByNormalizedNetworkAndStationId() {
        ReliabilityResponses.ReliabilityResponse response = mock(ReliabilityResponses.ReliabilityResponse.class);
        when(service.station("ttc", "bloor-yonge")).thenReturn(response);

        Object result = controller.station(" Bloor-Yonge ", "TTC");

        assertThat(result).isSameAs(response);
        verify(cache).getOrCompute(
            eq("reliability:station:ttc:bloor-yonge"),
            any(TypeReference.class),
            eq(Duration.ofMinutes(1)),
            any(Supplier.class)
        );
        verify(service).station("ttc", "bloor-yonge");
    }

    @Test
    void usesConfiguredReliabilityTtl() {
        cacheProperties.setReliabilityTtl(Duration.ofSeconds(45));
        ReliabilityResponses.ReliabilityResponse response = mock(ReliabilityResponses.ReliabilityResponse.class);
        when(service.lines("ttc")).thenReturn(response);

        assertThat(controller.lines("ttc")).isSameAs(response);

        verify(cache).getOrCompute(
            eq("reliability:lines:ttc"),
            any(TypeReference.class),
            eq(Duration.ofSeconds(45)),
            any(Supplier.class)
        );
    }

    @Test
    @SuppressWarnings("unchecked")
    void returnsARedisHitWithoutRunningTheReliabilityAggregation() {
        ReliabilityResponses.ReliabilityResponse cached = mock(ReliabilityResponses.ReliabilityResponse.class);
        when(cache.getOrCompute(
            eq("reliability:lines:ttc"),
            any(TypeReference.class),
            eq(Duration.ofMinutes(1)),
            any(Supplier.class)
        )).thenReturn(cached);

        assertThat(controller.lines("ttc")).isSameAs(cached);

        verifyNoInteractions(service);
    }
}
