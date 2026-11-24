package com.calebhabesh.linewatch.health;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.reliability.ReliabilityDerivationService;
import com.calebhabesh.linewatch.reliability.ReliabilityDerivationService.DerivationStatus;
import com.calebhabesh.linewatch.reliability.ReliabilityDerivationService.MethodologyState;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

class ReliabilityHealthControllerTest {
    private static final Instant NOON_TORONTO = Instant.parse("2026-11-24T17:00:00Z");
    private static final Instant EARLY_MORNING_TORONTO = Instant.parse("2026-11-24T08:00:00Z"); // 03:00 EST

    @Test
    void reportsOkWithAllowlistedFieldsOnlyWhenBothNetworksAreCurrent() throws Exception {
        ReliabilityDerivationService service = mock(ReliabilityDerivationService.class);
        OffsetDateTime switched = OffsetDateTime.parse("2026-11-24T05:00:00Z");
        when(service.methodologyState()).thenReturn(new MethodologyState(1, switched));
        when(service.derivationStatuses(1)).thenReturn(List.of(
            new DerivationStatus(1, "ttc", LocalDate.parse("2026-11-23"), "success",
                switched, switched.plusSeconds(2), null, 1800L, 0),
            new DerivationStatus(1, "regional", LocalDate.parse("2026-11-23"), "success",
                switched, switched.plusSeconds(3), null, 2100L, 0)
        ));

        ReliabilityHealthController controller = new ReliabilityHealthController(
            service, true, Clock.fixed(NOON_TORONTO, ZoneOffset.UTC));
        ReliabilityHealthController.Response response = controller.health();

        assertThat(response.status()).isEqualTo("ok");
        assertThat(response.methodologyVersion()).isEqualTo(1);
        assertThat(response.derivationEnabled()).isTrue();
        assertThat(response.networks()).extracting(ReliabilityHealthController.NetworkStatus::state)
            .containsExactly("ok", "ok");

        String json = new ObjectMapper().writeValueAsString(response);
        assertThat(json).doesNotContain("lastError", "last_error", "errorMessage", "exception");
    }

    @Test
    void reportsFailingAndStaleStatesRespectingTheMorningCutoff() {
        ReliabilityDerivationService service = mock(ReliabilityDerivationService.class);
        OffsetDateTime time = OffsetDateTime.parse("2026-11-23T09:30:00Z");
        when(service.methodologyState()).thenReturn(new MethodologyState(1, time));
        when(service.derivationStatuses(1)).thenReturn(List.of(
            new DerivationStatus(1, "ttc", LocalDate.parse("2026-11-22"), "success",
                time, time.plusSeconds(1), null, 900L, 0),
            new DerivationStatus(1, "regional", LocalDate.parse("2026-11-22"), "success",
                time, time.plusSeconds(1), null, 800L, 0)
        ));

        // At 03:00 Toronto (before 05:30 cutoff), derivedThrough = Nov 22 (today - 2) is still current.
        ReliabilityHealthController earlyController = new ReliabilityHealthController(
            service, true, Clock.fixed(EARLY_MORNING_TORONTO, ZoneOffset.UTC));
        assertThat(earlyController.health().status()).isEqualTo("ok");

        // At 12:00 Toronto (after 05:30 cutoff), derivedThrough = Nov 22 is stale.
        ReliabilityHealthController noonController = new ReliabilityHealthController(
            service, true, Clock.fixed(NOON_TORONTO, ZoneOffset.UTC));
        assertThat(noonController.health().status()).isEqualTo("stale");

        // A failed run marks overall health as failing.
        when(service.derivationStatuses(1)).thenReturn(List.of(
            new DerivationStatus(1, "ttc", LocalDate.parse("2026-11-23"), "success",
                time, time.plusSeconds(1), null, 900L, 0),
            new DerivationStatus(1, "regional", LocalDate.parse("2026-11-22"), "failed",
                time, time, time.plusHours(1), 50L, 2)
        ));
        ReliabilityHealthController.Response failing = noonController.health();
        assertThat(failing.status()).isEqualTo("failing");
        assertThat(failing.networks().get(1).state()).isEqualTo("failing");
        assertThat(failing.networks().get(1).consecutiveFailures()).isEqualTo(2);
    }

    @Test
    void reportsPendingWhenNeverRunAndDisabledWhenFlagIsOff() {
        ReliabilityDerivationService service = mock(ReliabilityDerivationService.class);
        when(service.methodologyState()).thenReturn(new MethodologyState(1, null));
        when(service.derivationStatuses(1)).thenReturn(List.of());

        ReliabilityHealthController pending = new ReliabilityHealthController(
            service, true, Clock.fixed(NOON_TORONTO, ZoneOffset.UTC));
        assertThat(pending.health().status()).isEqualTo("pending");

        ReliabilityHealthController disabled = new ReliabilityHealthController(
            service, false, Clock.fixed(NOON_TORONTO, ZoneOffset.UTC));
        assertThat(disabled.health().status()).isEqualTo("disabled");
    }
}
