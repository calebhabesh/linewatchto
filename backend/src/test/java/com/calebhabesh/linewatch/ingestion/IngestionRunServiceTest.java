package com.calebhabesh.linewatch.ingestion;

import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class IngestionRunServiceTest {
    private static final Clock CLOCK = Clock.fixed(
        Instant.parse("2026-06-01T12:00:00Z"),
        ZoneOffset.UTC
    );
    private static final OffsetDateTime NOW = OffsetDateTime.now(CLOCK);

    private final IngestionRunStore store = mock(IngestionRunStore.class);
    private IngestionRunService service;

    @BeforeEach
    void setUp() {
        service = new IngestionRunService(store, CLOCK);
    }

    @Test
    void startsAlertRunWithClockTimestamp() {
        when(store.createRunning(NOW)).thenReturn(42L);

        assertThat(service.start()).isEqualTo(42L);
    }

    @Test
    void recordsSuccessfulCountsAndSourceFeedTimestamp() {
        FeedApplicationCounts counts = new FeedApplicationCounts(44, 44, 12, 3);
        OffsetDateTime feedUpdatedAt = OffsetDateTime.parse("2026-06-01T11:59:00Z");

        service.succeed(42L, counts, feedUpdatedAt);

        verify(store).markSuccess(
            42L,
            NOW,
            counts,
            feedUpdatedAt,
            TtcSubwayClosureSnapshot.unavailable()
        );
    }

    @Test
    void boundsPersistedFailureMessage() {
        service.fail(42L, new IllegalStateException("x".repeat(4000)));

        verify(store).markFailed(eq(42L), eq(NOW), argThat(message -> message.length() == 1000));
    }

    @Test
    void usesExceptionTypeWhenFailureHasNoMessage() {
        service.fail(42L, new IllegalStateException());

        verify(store).markFailed(42L, NOW, "IllegalStateException");
    }

    @Test
    void recordsSourceFetchOutcomeSeparatelyFromRunStatus() {
        service.recordSourceFetch(42L, TtcSourceFetchStatus.HTTP_ERROR, 503, 8123);

        verify(store).recordSourceFetch(42L, TtcSourceFetchStatus.HTTP_ERROR, 503, 8123);
    }
}
