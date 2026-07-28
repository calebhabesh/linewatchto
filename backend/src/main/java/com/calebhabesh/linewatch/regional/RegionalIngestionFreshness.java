package com.calebhabesh.linewatch.regional;

import com.calebhabesh.linewatch.ingestion.IngestionRunSnapshot;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Optional;
import org.springframework.stereotype.Component;

@Component
public class RegionalIngestionFreshness {
    private final RegionalIngestionRunStore runStore;
    private final MetrolinxProperties properties;
    private final Clock clock;

    public RegionalIngestionFreshness(RegionalIngestionRunStore runStore, MetrolinxProperties properties, Clock clock) {
        this.runStore = runStore;
        this.properties = properties;
        this.clock = clock;
    }

    public boolean isFresh() {
        return remainingFreshness(runStore.findLatest()).isPresent();
    }

    public Optional<Duration> remainingFreshness(Optional<IngestionRunSnapshot> snapshot) {
        if (!properties.isEnabled() || !properties.isConfigured() || snapshot.isEmpty()) return Optional.empty();
        IngestionRunSnapshot run = snapshot.get();
        if (!"success".equals(run.status()) || run.completedAt() == null) return Optional.empty();
        Duration age = Duration.between(run.completedAt(), OffsetDateTime.now(clock));
        Duration remaining = properties.getMaxDashboardAge().minus(age);
        return remaining.isNegative() || remaining.isZero() ? Optional.empty() : Optional.of(remaining);
    }
}
