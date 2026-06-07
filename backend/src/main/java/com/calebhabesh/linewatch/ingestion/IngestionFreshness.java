package com.calebhabesh.linewatch.ingestion;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Optional;
import org.springframework.stereotype.Component;

@Component
public class IngestionFreshness {
    private final IngestionRunStore store;
    private final AlertIngestionProperties properties;
    private final Clock clock;

    public IngestionFreshness(
        IngestionRunStore store,
        AlertIngestionProperties properties,
        Clock clock
    ) {
        this.store = store;
        this.properties = properties;
        this.clock = clock;
    }

    public boolean isDashboardFresh() {
        return isFresh(store.findLatest());
    }

    public boolean isFresh(Optional<IngestionRunSnapshot> latestRun) {
        if (latestRun.isEmpty()) {
            return false;
        }

        IngestionRunSnapshot run = latestRun.orElseThrow();
        if (!"success".equalsIgnoreCase(run.status()) || run.completedAt() == null) {
            return false;
        }

        Duration maxAge = properties.getMaxDashboardAge();
        if (maxAge == null || maxAge.isNegative() || maxAge.isZero()) {
            return true;
        }

        OffsetDateTime oldestFreshCompletion = OffsetDateTime.now(clock).minus(maxAge);
        return !run.completedAt().isBefore(oldestFreshCompletion);
    }

    public Optional<Duration> remainingFreshness(Optional<IngestionRunSnapshot> latestRun) {
        if (latestRun.isEmpty()) {
            return Optional.empty();
        }
        IngestionRunSnapshot run = latestRun.orElseThrow();
        if (!"success".equalsIgnoreCase(run.status()) || run.completedAt() == null) {
            return Optional.empty();
        }
        Duration maxAge = properties.getMaxDashboardAge();
        if (maxAge == null || maxAge.isNegative() || maxAge.isZero()) {
            return Optional.of(Duration.ofMinutes(5));
        }
        OffsetDateTime expiresAt = run.completedAt().plus(maxAge);
        Duration remaining = Duration.between(OffsetDateTime.now(clock), expiresAt);
        if (remaining.isNegative() || remaining.isZero()) {
            return Optional.empty();
        }
        return Optional.of(remaining);
    }
}
