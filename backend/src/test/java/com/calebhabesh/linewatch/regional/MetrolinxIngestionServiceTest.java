package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.cache.DashboardCacheService;
import com.calebhabesh.linewatch.ingestion.FeedApplicationCounts;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class MetrolinxIngestionServiceTest {
    private final MetrolinxApiClient client = mock(MetrolinxApiClient.class);
    private final MetrolinxAlertNormalizer normalizer = mock(MetrolinxAlertNormalizer.class);
    private final RegionalFeedApplicationService applicationService = mock(RegionalFeedApplicationService.class);
    private final RegionalIngestionRunService runService = mock(RegionalIngestionRunService.class);
    private final RegionalTripChangeService tripChangeService = mock(RegionalTripChangeService.class);
    private final DashboardCacheService cache = mock(DashboardCacheService.class);
    private final MetrolinxIngestionService service = new MetrolinxIngestionService(
        client, normalizer, applicationService, runService, tripChangeService, cache
    );

    @Test
    void preservesSuccessfulSourceChecksWhenDownstreamProcessingFails() {
        MetrolinxFeed feed = new MetrolinxFeed(
            OffsetDateTime.parse("2026-09-03T20:00:00Z"),
            List.of(),
            Map.of(
                MetrolinxSourceSystem.GO_SERVICE_ALERTS, true,
                MetrolinxSourceSystem.UP_GTFS_ALERTS, true
            )
        );
        IllegalStateException failure = new IllegalStateException("database unavailable");
        when(runService.start()).thenReturn(42L);
        when(client.fetchAlerts()).thenReturn(feed);
        when(normalizer.classify(feed)).thenThrow(failure);

        assertThatThrownBy(service::ingestNow).isSameAs(failure);

        verify(runService).recordSourceStatuses(42L, feed);
        verify(runService).fail(42L, failure);
        verify(runService, never()).recordSourceOutcomes(anyLong(), any());
    }

    @Test
    void preservesPartialRequiredSourceOutcomesWhenMetrolinxFetchingFails() {
        Map<String, Boolean> outcomes = Map.of(
            MetrolinxSourceSystem.GO_SERVICE_ALERTS, true,
            MetrolinxSourceSystem.UP_GTFS_ALERTS, false
        );
        MetrolinxClientException failure = new MetrolinxClientException("UP unavailable", outcomes);
        when(runService.start()).thenReturn(42L);
        when(client.fetchAlerts()).thenThrow(failure);

        assertThatThrownBy(service::ingestNow).isSameAs(failure);

        verify(runService).recordSourceOutcomes(42L, outcomes);
        verify(runService).fail(42L, failure);
        verify(applicationService, never()).apply(any(), any(), any());
    }
}
