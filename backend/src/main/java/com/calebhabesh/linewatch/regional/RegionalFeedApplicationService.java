package com.calebhabesh.linewatch.regional;

import com.calebhabesh.linewatch.ingestion.FeedApplicationCounts;
import com.calebhabesh.linewatch.ingestion.IngestionRecordIsolation;
import com.calebhabesh.linewatch.ingestion.IngestionSavepoints;
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
    private final RegionalOperationalSourceStore operationalStore;
    private final Clock clock;
    private final IngestionSavepoints savepoints;

    public RegionalFeedApplicationService(
        RegionalAlertStore store,
        RegionalOperationalSourceStore operationalStore,
        Clock clock,
        IngestionSavepoints savepoints
    ) {
        this.store = store;
        this.operationalStore = operationalStore;
        this.clock = clock;
        this.savepoints = savepoints;
    }

    @Transactional
    public FeedApplicationCounts apply(MetrolinxFeed feed, List<RegionalNormalizedAlert> alerts) {
        return apply(feed, alerts, List.of());
    }

    @Transactional
    public FeedApplicationCounts apply(
        MetrolinxFeed feed,
        List<RegionalNormalizedAlert> alerts,
        List<RegionalAlertClassification> classifications
    ) {
        OffsetDateTime now = OffsetDateTime.now(clock);
        // One malformed Metrolinx record is set aside instead of rolling back every GO/UP refresh.
        // Its last-good rows stay active: the seen source IDs come from the feed and the active
        // alert IDs from the normalized list, whether or not the write succeeded.
        IngestionRecordIsolation isolation = new IngestionRecordIsolation("Metrolinx", savepoints);
        List<MetrolinxFetchedRecord> operationalRecords = feed.records().stream()
            .filter(record -> MetrolinxSourceSystem.isOperational(record.sourceSystem()))
            .toList();
        try {
            // Fast path: one batch (about 200 trip updates and exceptions per poll).
            savepoints.run(() -> operationalStore.upsertAll(operationalRecords, now));
        } catch (RuntimeException batchFailure) {
            // The batch was undone; retry record by record so only the bad one is set aside.
            for (MetrolinxFetchedRecord record : operationalRecords) {
                isolation.run("operational source", record.sourceSystem() + ":" + record.sourceId(),
                    () -> operationalStore.upsertAll(List.of(record), now));
            }
        }
        for (MetrolinxFetchedRecord record : feed.records()) {
            if (!MetrolinxSourceSystem.isOperational(record.sourceSystem())) {
                isolation.run("source record", record.sourceSystem() + ":" + record.sourceId(),
                    () -> store.upsertSource(record, now));
            }
        }
        classifications.forEach(classification -> classification.sources().forEach(source ->
            isolation.run("source classification", source.key(),
                () -> store.updateSourceClassification(source, classification))
        ));
        int persistedAlerts = 0;
        for (RegionalNormalizedAlert alert : alerts) {
            if (isolation.run("alert", alert.id(), () -> store.upsertAlert(alert, now))) {
                persistedAlerts++;
            }
        }
        isolation.failIfTooMany(Math.max(feed.records().size(), alerts.size()));

        Map<String, Set<String>> sourceIds = store.sourceIdsBySystem(feed);
        for (Map.Entry<String, Boolean> source : feed.completeSources().entrySet()) {
            if (!Boolean.TRUE.equals(source.getValue())) continue;
            String sourceSystem = source.getKey();
            if (MetrolinxSourceSystem.isOperational(sourceSystem)) {
                operationalStore.deactivateMissing(sourceSystem, sourceIds.getOrDefault(sourceSystem, Set.of()));
            } else {
                store.deactivateMissingSources(sourceSystem, sourceIds.getOrDefault(sourceSystem, Set.of()));
                Set<String> activeAlertIds = alerts.stream()
                    .filter(alert -> sourceSystem.equals(alert.sourceSystem()))
                    .map(RegionalNormalizedAlert::id)
                    .collect(Collectors.toSet());
                store.deactivateMissingAlerts(sourceSystem, activeAlertIds, now);
            }
        }

        long normalizedSourceCount = alerts.stream()
            .map(alert -> alert.sourceSystem() + ":" + alert.sourceId())
            .distinct()
            .count();
        return new FeedApplicationCounts(
            feed.records().size(),
            feed.records().size(),
            persistedAlerts,
            Math.max(0, feed.records().size() - (int) normalizedSourceCount),
            isolation.quarantined()
        );
    }
}
