package com.calebhabesh.linewatch.observability;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.health.ReliabilityHealthController;
import com.calebhabesh.linewatch.reliability.ReliabilityDerivationService;
import com.calebhabesh.linewatch.reliability.ReliabilityDerivationService.DerivationStatus;
import com.calebhabesh.linewatch.reliability.ReliabilityDerivationService.MethodologyState;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

class ReliabilityHealthMetricsTest {
    private static final Instant NOON_TORONTO = Instant.parse("2026-11-24T17:00:00Z");

    private ReliabilityHealthMetrics metrics(
        ReliabilityDerivationService derivation,
        boolean enabled,
        Instant now
    ) {
        ReliabilityHealthController controller = new ReliabilityHealthController(
            derivation, enabled, Clock.fixed(now, ZoneOffset.UTC));
        ReliabilityHealthMetrics metrics = new ReliabilityHealthMetrics(controller);
        metrics.bindTo(new SimpleMeterRegistry());
        return metrics;
    }

    @Test
    void reportsWorstNetworkAndMethodologyVersion() {
        ReliabilityDerivationService derivation = mock(ReliabilityDerivationService.class);
        OffsetDateTime switched = OffsetDateTime.parse("2026-11-24T05:00:00Z");
        when(derivation.methodologyState()).thenReturn(new MethodologyState(2, switched));
        when(derivation.derivationStatuses(2)).thenReturn(List.of(
            new DerivationStatus(2, "ttc", LocalDate.parse("2026-11-23"), "success",
                switched, switched.plusSeconds(1), null, 450L, 0),
            new DerivationStatus(2, "regional", LocalDate.parse("2026-11-22"), "failed",
                switched, switched, switched.plusHours(1), 1250L, 2)
        ));

        ReliabilityHealthMetrics metrics = metrics(derivation, true, NOON_TORONTO);
        assertThat(metrics.consecutiveFailures()).isEqualTo(2.0);
        assertThat(metrics.stale()).isEqualTo(0.0); // failing takes precedence over stale on regional
        assertThat(metrics.lastDurationSeconds()).isEqualTo(1.25);
        assertThat(metrics.methodologyVersion()).isEqualTo(2.0);
    }

    @Test
    void reportsStaleWhenBehindAfterMorningCutoff() {
        ReliabilityDerivationService derivation = mock(ReliabilityDerivationService.class);
        OffsetDateTime switched = OffsetDateTime.parse("2026-11-23T09:30:00Z");
        when(derivation.methodologyState()).thenReturn(new MethodologyState(2, switched));
        when(derivation.derivationStatuses(2)).thenReturn(List.of(
            new DerivationStatus(2, "ttc", LocalDate.parse("2026-11-23"), "success",
                switched, switched.plusSeconds(1), null, 300L, 0),
            new DerivationStatus(2, "regional", LocalDate.parse("2026-11-22"), "success",
                switched, switched.plusSeconds(1), null, 200L, 0)
        ));

        assertThat(metrics(derivation, true, NOON_TORONTO).stale()).isEqualTo(1.0);
        assertThat(metrics(derivation, true, Instant.parse("2026-11-24T08:00:00Z")).stale()).isEqualTo(0.0);
    }

    @Test
    void readsNaNForDerivationGaugesWhenDisabledAndBeforeFirstRun() {
        ReliabilityDerivationService derivation = mock(ReliabilityDerivationService.class);
        when(derivation.methodologyState()).thenReturn(new MethodologyState(2, null));
        when(derivation.derivationStatuses(2)).thenReturn(List.of());

        ReliabilityHealthMetrics disabled = metrics(derivation, false, NOON_TORONTO);
        assertThat(disabled.consecutiveFailures()).isNaN();
        assertThat(disabled.stale()).isNaN();
        assertThat(disabled.lastDurationSeconds()).isNaN();
        assertThat(disabled.methodologyVersion()).isEqualTo(2.0);

        ReliabilityHealthMetrics pending = metrics(derivation, true, NOON_TORONTO);
        assertThat(pending.consecutiveFailures()).isEqualTo(0.0);
        assertThat(pending.stale()).isEqualTo(0.0);
        assertThat(pending.lastDurationSeconds()).isNaN();
    }
}
