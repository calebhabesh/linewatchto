package com.calebhabesh.linewatch.alert;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.cache.DashboardCacheProperties;
import com.calebhabesh.linewatch.cache.DashboardCacheService;
import com.fasterxml.jackson.core.type.TypeReference;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.function.Supplier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class AlertHistoryControllerTest {
    private final AlertHistoryService alertHistoryService = mock(AlertHistoryService.class);
    private final DashboardCacheService cache = mock(DashboardCacheService.class);
    private final DashboardCacheProperties cacheProperties = new DashboardCacheProperties();
    private final AlertHistoryController controller = new AlertHistoryController(
        alertHistoryService,
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
    void returnsAlertHistory() {
        AlertHistoryResponses.AlertHistoryResponse history =
            new AlertHistoryResponses.AlertHistoryResponse(
                OffsetDateTime.parse("2026-06-23T12:30:00-04:00"),
                "today",
                OffsetDateTime.parse("2026-06-23T00:00:00-04:00"),
                OffsetDateTime.parse("2026-06-23T12:30:00-04:00"),
                List.of()
            );
        when(alertHistoryService.history("regional", "today", 5_000)).thenReturn(history);

        Object response = controller.getAlertHistory("regional", "today", 5_000);

        assertThat(response).isEqualTo(history);
        verify(cache).getOrCompute(
            eq("alert-history:regional:today:5000"),
            any(TypeReference.class),
            eq(Duration.ofMinutes(1)),
            any(Supplier.class)
        );
    }

    @Test
    void normalizesEquivalentRequestsIntoOneCacheKey() {
        AlertHistoryResponses.AlertHistoryResponse history =
            new AlertHistoryResponses.AlertHistoryResponse(
                OffsetDateTime.parse("2026-06-23T12:30:00-04:00"),
                "30d",
                OffsetDateTime.parse("2026-05-24T12:30:00-04:00"),
                OffsetDateTime.parse("2026-06-23T12:30:00-04:00"),
                List.of()
            );
        when(alertHistoryService.history("ttc", "30d", 5_000)).thenReturn(history);

        Object response = controller.getAlertHistory("unknown", "month", 10_000);

        assertThat(response).isEqualTo(history);
        verify(cache).getOrCompute(
            eq("alert-history:ttc:30d:5000"),
            any(TypeReference.class),
            eq(Duration.ofMinutes(1)),
            any(Supplier.class)
        );
    }
}
