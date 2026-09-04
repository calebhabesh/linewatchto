package com.calebhabesh.linewatch.health;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.ingestion.AlertIngestionProperties;
import com.calebhabesh.linewatch.ingestion.IngestionRunStore;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class TtcFeedAvailabilityServiceTest {
    private static final Clock CLOCK = Clock.fixed(
        Instant.parse("2026-06-01T12:00:00Z"),
        ZoneOffset.UTC
    );

    @Test
    void summarizesThirtyTorontoDaysWithAvailabilityAndCoverageKeptSeparate() {
        IngestionRunStore store = mock(IngestionRunStore.class);
        when(store.findFirstSourceFetchAt()).thenReturn(Optional.of(
            OffsetDateTime.parse("2026-05-31T04:00:00Z")
        ));
        when(store.sourceFetchDailyCounts(any(), any())).thenReturn(List.of(
            new IngestionRunStore.SourceFetchDailyCount(LocalDate.parse("2026-05-31"), 719, 1, 720),
            new IngestionRunStore.SourceFetchDailyCount(LocalDate.parse("2026-06-01"), 200, 40, 240)
        ));

        TtcFeedAvailabilityService.TtcFeedAvailability summary =
            new TtcFeedAvailabilityService(store, new AlertIngestionProperties(), CLOCK).summarize();

        assertThat(summary.periodDays()).isEqualTo(30);
        assertThat(summary.availabilityPercentage()).isEqualTo(95.73);
        assertThat(summary.monitoringCoveragePercentage()).isEqualTo(100.0);
        assertThat(summary.totalChecks()).isEqualTo(960);
        assertThat(summary.buckets()).hasSize(30);
        assertThat(summary.buckets().get(27).status()).isEqualTo("unknown");
        assertThat(summary.buckets().get(28).status()).isEqualTo("degraded");
        assertThat(summary.buckets().get(29).status()).isEqualTo("down");
    }

    @Test
    void doesNotPresentMissingChecksAsSuccessfulAvailability() {
        IngestionRunStore store = mock(IngestionRunStore.class);
        when(store.findFirstSourceFetchAt()).thenReturn(Optional.empty());
        when(store.sourceFetchDailyCounts(any(), any())).thenReturn(List.of());

        TtcFeedAvailabilityService.TtcFeedAvailability summary =
            new TtcFeedAvailabilityService(store, new AlertIngestionProperties(), CLOCK).summarize();

        assertThat(summary.availabilityPercentage()).isNull();
        assertThat(summary.monitoringCoveragePercentage()).isZero();
        assertThat(summary.buckets()).allMatch(bucket -> bucket.status().equals("unknown"));
    }
}
