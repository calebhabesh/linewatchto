package com.calebhabesh.linewatch.health;

import com.calebhabesh.linewatch.arrival.schedule.GtfsServiceTime;
import com.calebhabesh.linewatch.reliability.ReliabilityDerivationService;
import com.calebhabesh.linewatch.reliability.ReliabilityDerivationService.DerivationStatus;
import com.calebhabesh.linewatch.reliability.ReliabilityDerivationService.MethodologyState;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Public health of the reliability read-model derivation (plan 17 A5).
 * Allowlisted fields only: status, methodology version, derived-through date, timings and
 * failure counts; internal error text stays in {@code reliability_derivations.last_error}.
 */
@RestController
@RequestMapping("/api/health/reliability")
public class ReliabilityHealthController {
    private static final List<String> NETWORKS = List.of("ttc", "regional");
    private static final LocalTime STALE_AFTER_CUTOFF = LocalTime.of(5, 30);

    private final ReliabilityDerivationService derivationService;
    private final boolean derivationEnabled;
    private final Clock clock;

    public ReliabilityHealthController(
        ReliabilityDerivationService derivationService,
        @Value("${linewatch.reliability.derivation.enabled:true}") boolean derivationEnabled,
        Clock clock
    ) {
        this.derivationService = derivationService;
        this.derivationEnabled = derivationEnabled;
        this.clock = clock;
    }

    @GetMapping
    public Response health() {
        MethodologyState methodology = derivationService.methodologyState();
        Map<String, DerivationStatus> byNetwork = derivationService.derivationStatuses(methodology.currentVersion())
            .stream()
            .collect(Collectors.toMap(DerivationStatus::networkId, Function.identity(), (first, second) -> first));

        ZonedDateTime nowToronto = ZonedDateTime.now(clock.withZone(GtfsServiceTime.TORONTO));
        LocalDate expectedThrough = nowToronto.toLocalTime().isBefore(STALE_AFTER_CUTOFF)
            ? nowToronto.toLocalDate().minusDays(2)
            : nowToronto.toLocalDate().minusDays(1);

        List<NetworkStatus> networks = new ArrayList<>();
        for (String networkId : NETWORKS) {
            DerivationStatus stored = byNetwork.get(networkId);
            if (stored == null) {
                networks.add(new NetworkStatus(
                    networkId,
                    derivationEnabled ? "pending" : "disabled",
                    "never-run",
                    null, null, null, null, null, 0
                ));
                continue;
            }
            boolean stale = derivationEnabled
                && stored.derivedThrough() != null
                && stored.derivedThrough().isBefore(expectedThrough);
            String state = !derivationEnabled ? "disabled"
                : "failed".equals(stored.status()) ? "failing"
                : stale ? "stale"
                : "running".equals(stored.status()) ? "running"
                : stored.lastSucceededAt() == null ? "pending"
                : "ok";
            networks.add(new NetworkStatus(
                networkId,
                state,
                stored.status(),
                stored.derivedThrough(),
                stored.lastStartedAt(),
                stored.lastSucceededAt(),
                stored.lastFailedAt(),
                stored.lastDurationMs(),
                stored.consecutiveFailures()
            ));
        }

        String overall = !derivationEnabled ? "disabled"
            : networks.stream().map(NetworkStatus::state).anyMatch("failing"::equals) ? "failing"
            : networks.stream().map(NetworkStatus::state).anyMatch("stale"::equals) ? "stale"
            : networks.stream().map(NetworkStatus::state).allMatch("ok"::equals) ? "ok"
            : "pending";
        String message = switch (overall) {
            case "ok" -> "Reliability derived read model is current for both networks.";
            case "failing" -> "The latest reliability derivation failed for a network; reads keep the last derived days.";
            case "stale" -> "Reliability derivation is behind the latest completed service date.";
            case "disabled" -> "Scheduled reliability derivation is disabled.";
            default -> "Waiting for the first reliability derivation to complete.";
        };
        return new Response(
            overall,
            methodology.currentVersion(),
            methodology.switchedAt(),
            derivationEnabled,
            List.copyOf(networks),
            message
        );
    }

    public record Response(
        String status,
        int methodologyVersion,
        OffsetDateTime switchedAt,
        boolean derivationEnabled,
        List<NetworkStatus> networks,
        String message
    ) {}

    public record NetworkStatus(
        String network,
        String state,
        String lastRunStatus,
        LocalDate derivedThrough,
        OffsetDateTime lastStartedAt,
        OffsetDateTime lastSucceededAt,
        OffsetDateTime lastFailedAt,
        Long lastDurationMs,
        int consecutiveFailures
    ) {}
}
