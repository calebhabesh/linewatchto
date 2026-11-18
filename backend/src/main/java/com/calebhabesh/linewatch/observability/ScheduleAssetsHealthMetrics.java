package com.calebhabesh.linewatch.observability;

import com.calebhabesh.linewatch.health.ScheduleAssetsHealthController;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.binder.MeterBinder;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.OptionalDouble;
import java.util.function.ToDoubleFunction;
import org.springframework.stereotype.Component;

/**
 * Gauges for the schedule-assets service (plan 16), read from the same state as
 * /api/health/schedule-assets. Each is unlabelled and takes the worst network (Grafana Cloud
 * Adaptive Metrics aggregates labels away); the health endpoint names the network. Gauges read
 * NaN while no schedule-assets volume or manifest is present, so a release-only install never
 * alerts. On Nov. 17-18, 2026 the GO generator failed every check on a two-period feed for
 * hours, with the published GO files ending Nov. 27, and nothing alerted.
 */
@Component
public class ScheduleAssetsHealthMetrics implements MeterBinder {
    private static final ZoneId TORONTO_ZONE = ZoneId.of("America/Toronto");

    private final ScheduleAssetsHealthController health;
    private final Clock clock;

    public ScheduleAssetsHealthMetrics(ScheduleAssetsHealthController health, Clock clock) {
        this.health = health;
        this.clock = clock;
    }

    @Override
    public void bindTo(MeterRegistry registry) {
        Gauge.builder("linewatch_schedule_assets_consecutive_failures", this, ScheduleAssetsHealthMetrics::consecutiveFailures)
            .description("Most consecutive failed schedule-assets checks of any network (NaN without a volume)")
            .register(registry);
        Gauge.builder("linewatch_schedule_assets_stale", this, ScheduleAssetsHealthMetrics::stale)
            .description("1 when a schedule-assets network has had no successful check for three intervals (NaN without a volume)")
            .register(registry);
        Gauge.builder("linewatch_schedule_assets_feed_days_remaining", this, ScheduleAssetsHealthMetrics::feedDaysRemaining)
            .description("Days until the soonest-ending published schedule-assets feed ends (NaN without a volume)")
            .register(registry);
    }

    private List<ScheduleAssetsHealthController.Network> networks() {
        return health.health().networks();
    }

    double consecutiveFailures() {
        return worst(network -> network.consecutiveFailures(), true);
    }

    double stale() {
        return worst(network -> "stale".equals(network.state()) ? 1.0 : 0.0, true);
    }

    double feedDaysRemaining() {
        LocalDate today = LocalDate.now(clock.withZone(TORONTO_ZONE));
        return worst(network -> {
            if (network.feedEndDate() == null) return Double.NaN;
            try {
                return ChronoUnit.DAYS.between(today, LocalDate.parse(network.feedEndDate()));
            } catch (DateTimeParseException exception) {
                return Double.NaN;
            }
        }, false);
    }

    /** The highest (or lowest) value over the networks, ignoring NaN; NaN when there is none. */
    private double worst(ToDoubleFunction<ScheduleAssetsHealthController.Network> value, boolean highest) {
        var values = networks().stream().mapToDouble(value).filter(v -> !Double.isNaN(v));
        OptionalDouble result = highest ? values.max() : values.min();
        return result.orElse(Double.NaN);
    }
}
