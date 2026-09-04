package com.calebhabesh.linewatch.health;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.regional.MetrolinxProperties;
import com.calebhabesh.linewatch.regional.RegionalIngestionRunStore;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class RegionalFeedAvailabilityServiceTest {
    private static final Clock CLOCK = Clock.fixed(
        Instant.parse("2026-06-01T12:00:00Z"),
        ZoneOffset.UTC
    );

    @Test
    void summarizesOnlyRequiredMetrolinxSourceChecksAcrossThirtyTorontoDays() {
        RegionalIngestionRunStore store = mock(RegionalIngestionRunStore.class);
        when(store.findFirstRequiredSourceFetchAt()).thenReturn(Optional.of(
            OffsetDateTime.parse("2026-05-31T04:00:00Z")
        ));
        when(store.requiredSourceFetchDailyCounts(any(), any())).thenReturn(List.of(
            new RegionalIngestionRunStore.SourceFetchDailyCount(LocalDate.parse("2026-05-31"), 1438, 2, 1440),
            new RegionalIngestionRunStore.SourceFetchDailyCount(LocalDate.parse("2026-06-01"), 400, 80, 480)
        ));

        var summary = new RegionalFeedAvailabilityService(
            store, new MetrolinxProperties(), CLOCK
        ).summarize();

        assertThat(summary.periodDays()).isEqualTo(30);
        assertThat(summary.availabilityPercentage()).isEqualTo(95.73);
        assertThat(summary.monitoringCoveragePercentage()).isEqualTo(100.0);
        assertThat(summary.totalChecks()).isEqualTo(1920);
        assertThat(summary.buckets()).hasSize(30);
        assertThat(summary.buckets().get(27).status()).isEqualTo("unknown");
        assertThat(summary.buckets().get(28).status()).isEqualTo("degraded");
        assertThat(summary.buckets().get(29).status()).isEqualTo("down");
    }

    @Test
    void treatsMissingRegionalObservationsAsUnmonitoredInsteadOfAvailable() {
        RegionalIngestionRunStore store = mock(RegionalIngestionRunStore.class);
        when(store.findFirstRequiredSourceFetchAt()).thenReturn(Optional.empty());
        when(store.requiredSourceFetchDailyCounts(any(), any())).thenReturn(List.of());

        var summary = new RegionalFeedAvailabilityService(
            store, new MetrolinxProperties(), CLOCK
        ).summarize();

        assertThat(summary.availabilityPercentage()).isNull();
        assertThat(summary.monitoringCoveragePercentage()).isZero();
        assertThat(summary.buckets()).allMatch(bucket -> bucket.status().equals("unknown"));
    }
}
