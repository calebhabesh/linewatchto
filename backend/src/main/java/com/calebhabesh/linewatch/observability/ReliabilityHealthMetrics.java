package com.calebhabesh.linewatch.observability;

import com.calebhabesh.linewatch.health.ReliabilityHealthController;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.binder.MeterBinder;
import java.util.OptionalDouble;
import java.util.function.ToDoubleFunction;
import org.springframework.stereotype.Component;

/**
 * Gauges for the reliability read-model derivation (plan 17 A5/A11), read from the same state as
 * {@code /api/health/reliability}. Each is unlabelled and takes the worst network (Grafana Cloud
 * Adaptive Metrics aggregates labels away); the health endpoint names the network. Derivation
 * gauges read NaN while scheduled derivation is disabled so alerts do not fire when turned off.
 */
@Component
public class ReliabilityHealthMetrics implements MeterBinder {
    private final ReliabilityHealthController health;

    public ReliabilityHealthMetrics(ReliabilityHealthController health) {
        this.health = health;
    }

    @Override
    public void bindTo(MeterRegistry registry) {
        Gauge.builder(
                "linewatch_reliability_derivation_consecutive_failures",
                this,
                ReliabilityHealthMetrics::consecutiveFailures
            )
            .description("Most consecutive failed reliability derivation runs of any network (NaN when disabled)")
            .register(registry);
        Gauge.builder(
                "linewatch_reliability_derivation_stale",
                this,
                ReliabilityHealthMetrics::stale
            )
            .description("1 when any network's reliability derivation is behind the latest completed service date (NaN when disabled)")
            .register(registry);
        Gauge.builder(
                "linewatch_reliability_derivation_last_duration_seconds",
                this,
                ReliabilityHealthMetrics::lastDurationSeconds
            )
            .description("Longest last reliability derivation duration in seconds across networks (NaN when disabled or never run)")
            .register(registry);
        Gauge.builder(
                "linewatch_reliability_methodology_version",
                this,
                ReliabilityHealthMetrics::methodologyVersion
            )
            .description("Active reliability analytics methodology version")
            .register(registry);
    }

    double consecutiveFailures() {
        ReliabilityHealthController.Response response = health.health();
        if (!response.derivationEnabled()) return Double.NaN;
        return worst(response, ReliabilityHealthController.NetworkStatus::consecutiveFailures);
    }

    double stale() {
        ReliabilityHealthController.Response response = health.health();
        if (!response.derivationEnabled()) return Double.NaN;
        return worst(response, network -> "stale".equals(network.state()) ? 1.0 : 0.0);
    }

    double lastDurationSeconds() {
        ReliabilityHealthController.Response response = health.health();
        if (!response.derivationEnabled()) return Double.NaN;
        return worst(response, network -> network.lastDurationMs() == null ? Double.NaN : network.lastDurationMs() / 1000.0);
    }

    double methodologyVersion() {
        return health.health().methodologyVersion();
    }

    private double worst(
        ReliabilityHealthController.Response response,
        ToDoubleFunction<ReliabilityHealthController.NetworkStatus> value
    ) {
        OptionalDouble result = response.networks().stream()
            .mapToDouble(value)
            .filter(v -> !Double.isNaN(v))
            .max();
        return result.orElse(Double.NaN);
    }
}
