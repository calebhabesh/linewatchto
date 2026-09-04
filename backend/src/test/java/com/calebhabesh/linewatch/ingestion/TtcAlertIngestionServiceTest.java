package com.calebhabesh.linewatch.ingestion;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

class TtcAlertIngestionServiceTest {
    private final TtcAlertClient client = mock(TtcAlertClient.class);
    private final TtcSubwayClosureClient subwayClosureClient = mock(TtcSubwayClosureClient.class);
    private final TtcAlertFeedApplicationService applicationService =
        mock(TtcAlertFeedApplicationService.class);
    private final IngestionRunService runService = mock(IngestionRunService.class);
    private final com.calebhabesh.linewatch.cache.DashboardCacheService cache = mock(com.calebhabesh.linewatch.cache.DashboardCacheService.class);
    private final ApplicationEventPublisher eventPublisher = mock(ApplicationEventPublisher.class);
    private final TtcAlertFeed feed = new TtcAlertFeed(
        OffsetDateTime.parse("2026-06-01T11:55:00Z"),
        List.of(),
        List.of()
    );
    private final FeedApplicationCounts counts = new FeedApplicationCounts(0, 0, 0, 0);

    private TtcAlertIngestionService service;

    @BeforeEach
    void setUp() {
        service = new TtcAlertIngestionService(
            client,
            subwayClosureClient,
            applicationService,
            runService,
            cache,
            eventPublisher
        );
    }

    @Test
    void successfulPollFetchesAppliesAndCompletesRun() {
        when(runService.start()).thenReturn(42L);
        when(client.fetch()).thenReturn(feed);
        TtcSubwayClosureSnapshot subwayClosures = TtcSubwayClosureSnapshot.unavailable();
        when(subwayClosureClient.fetch()).thenReturn(subwayClosures);
        when(applicationService.apply(feed, subwayClosures)).thenReturn(counts);

        service.ingestNow();

        verify(runService).succeed(
            42L,
            counts,
            OffsetDateTime.parse("2026-06-01T15:55:00Z"),
            subwayClosures
        );
        verify(runService).recordSourceFetch(eq(42L), eq(TtcSourceFetchStatus.SUCCESS), isNull(), anyLong());
        verify(runService, never()).fail(anyLong(), any());
        verify(cache).evictDashboard();
        verify(eventPublisher).publishEvent(any(TtcAlertIngestionSucceededEvent.class));
    }

    @Test
    void failedPollRecordsFailureAndRethrowsWithoutApplyingEmptyFeed() {
        TtcAlertClientException failure = new TtcAlertClientException(
            "offline", null, TtcSourceFetchStatus.TIMEOUT, null
        );
        when(runService.start()).thenReturn(42L);
        when(client.fetch()).thenThrow(failure);

        assertThatThrownBy(service::ingestNow)
            .isSameAs(failure);

        verify(applicationService, never()).apply(any());
        verify(applicationService, never()).apply(any(), any());
        verify(runService).fail(eq(42L), any(TtcAlertClientException.class));
        verify(runService).recordSourceFetch(eq(42L), eq(TtcSourceFetchStatus.TIMEOUT), isNull(), anyLong());
        verify(cache, never()).evictDashboard();
        verify(eventPublisher, never()).publishEvent(any());
    }

    @Test
    void downstreamFailureDoesNotTurnSuccessfulSourceFetchIntoTtcDowntime() {
        IllegalStateException failure = new IllegalStateException("database unavailable");
        when(runService.start()).thenReturn(42L);
        when(client.fetch()).thenReturn(feed);
        when(subwayClosureClient.fetch()).thenReturn(TtcSubwayClosureSnapshot.unavailable());
        when(applicationService.apply(any(), any())).thenThrow(failure);

        assertThatThrownBy(service::ingestNow).isSameAs(failure);

        verify(runService).recordSourceFetch(eq(42L), eq(TtcSourceFetchStatus.SUCCESS), isNull(), anyLong());
        verify(runService).fail(42L, failure);
    }
}
