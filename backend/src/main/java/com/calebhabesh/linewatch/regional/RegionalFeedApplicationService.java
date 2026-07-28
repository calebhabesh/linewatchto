package com.calebhabesh.linewatch.regional;

import com.calebhabesh.linewatch.ingestion.FeedApplicationCounts;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RegionalFeedApplicationService {
    private final RegionalAlertStore store;
    private final Clock clock;

    public RegionalFeedApplicationService(RegionalAlertStore store, Clock clock) {
        this.store = store;
        this.clock = clock;
    }

    @Transactional
    public FeedApplicationCounts apply(MetrolinxFeed feed, List<RegionalNormalizedAlert> alerts) {
        OffsetDateTime now = OffsetDateTime.now(clock);
        feed.records().forEach(record -> store.upsertSource(record, now));
        alerts.forEach(alert -> store.upsertAlert(alert, now));

        Map<String, Set<String>> sourceIds = store.sourceIdsBySystem(feed);
        for (Map.Entry<String, Boolean> source : feed.completeSources().entrySet()) {
            if (!Boolean.TRUE.equals(source.getValue())) continue;
            String sourceSystem = source.getKey();
            store.deactivateMissingSources(sourceSystem, sourceIds.getOrDefault(sourceSystem, Set.of()));
            Set<String> activeAlertIds = alerts.stream()
                .filter(alert -> sourceSystem.equals(alert.sourceSystem()))
                .map(RegionalNormalizedAlert::id)
                .collect(Collectors.toSet());
            store.deactivateMissingAlerts(sourceSystem, activeAlertIds, now);
        }

        long normalizedSourceCount = alerts.stream()
            .map(alert -> alert.sourceSystem() + ":" + alert.sourceId())
            .distinct()
            .count();
        return new FeedApplicationCounts(
            feed.records().size(),
            feed.records().size(),
            alerts.size(),
            Math.max(0, feed.records().size() - (int) normalizedSourceCount)
        );
    }
}
