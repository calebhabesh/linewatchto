package com.calebhabesh.linewatch.ingestion;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class TtcAlertIngestionServiceTest {
    private final TtcAlertClient client = mock(TtcAlertClient.class);
    private final TtcAlertFeedApplicationService applicationService =
        mock(TtcAlertFeedApplicationService.class);
    private final IngestionRunService runService = mock(IngestionRunService.class);
    private final TtcAlertFeed feed = new TtcAlertFeed(
        OffsetDateTime.parse("2026-06-01T11:55:00Z"),
        List.of(),
        List.of()
    );
    private final FeedApplicationCounts counts = new FeedApplicationCounts(0, 0, 0, 0);

    private TtcAlertIngestionService service;

    @BeforeEach
    void setUp() {
        service = new TtcAlertIngestionService(client, applicationService, runService);
    }

    @Test
    void successfulPollFetchesAppliesAndCompletesRun() {
        when(runService.start()).thenReturn(42L);
        when(client.fetch()).thenReturn(feed);
        when(applicationService.apply(feed)).thenReturn(counts);

        service.ingestNow();

        verify(runService).succeed(42L, counts, feed.lastUpdated());
        verify(runService, never()).fail(anyLong(), any());
    }

    @Test
    void failedPollRecordsFailureAndRethrowsWithoutApplyingEmptyFeed() {
        TtcAlertClientException failure = new TtcAlertClientException("offline");
        when(runService.start()).thenReturn(42L);
        when(client.fetch()).thenThrow(failure);

        assertThatThrownBy(service::ingestNow)
            .isSameAs(failure);

        verify(applicationService, never()).apply(any());
        verify(runService).fail(eq(42L), any(TtcAlertClientException.class));
    }
}
