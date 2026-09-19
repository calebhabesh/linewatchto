package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.ingestion.FeedApplicationCounts;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

class RegionalFeedApplicationServiceTest {
    private static final OffsetDateTime NOW = OffsetDateTime.parse("2026-07-30T16:00:00Z");
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-07-30T16:00:00Z"), ZoneOffset.UTC);

    @Test
    void stagesOperationalCollectionsSeparatelyAndDeactivatesOnlyCompleteSnapshots() {
        RegionalAlertStore alertStore = mock(RegionalAlertStore.class);
        RegionalOperationalSourceStore operationalStore = mock(RegionalOperationalSourceStore.class);
        RegionalFeedApplicationService service = new RegionalFeedApplicationService(alertStore, operationalStore, CLOCK);
        MetrolinxFetchedRecord alertRecord = new MetrolinxFetchedRecord(
            MetrolinxSourceSystem.GO_SERVICE_ALERTS, "M1", "{\"Code\":\"M1\"}"
        );
        MetrolinxFetchedRecord exceptionRecord = new MetrolinxFetchedRecord(
            MetrolinxSourceSystem.GO_TRAIN_EXCEPTIONS, "EX-1", "{\"TripNumber\":\"EX-1\"}"
        );
        MetrolinxFetchedRecord tripUpdateRecord = new MetrolinxFetchedRecord(
            MetrolinxSourceSystem.GO_GTFS_TRIP_UPDATES, "TU-1", "{\"id\":\"TU-1\"}"
        );
        RegionalNormalizedAlert alert = new RegionalNormalizedAlert(
            "regional-go-M1-ki", MetrolinxSourceSystem.GO_SERVICE_ALERTS, "M1", "regional-ki", "delay",
            "Kitchener delay", "Delayed", "service-disruption", NOW, null, NOW, List.of(), List.of(), ""
        );
        RegionalAlertClassification classification = new RegionalAlertClassification(
            "go-1",
            List.of(new RegionalAlertClassification.SourceReference(
                MetrolinxSourceSystem.GO_SERVICE_ALERTS, "M1"
            )),
            List.of("regional-ki"), List.of(), "current", "delay", null, "unknown", null, null, null,
            "Kitchener delay", "Delayed", null, null, "unknown", null, null, NOW,
            List.of(), List.of(), Map.of(), Map.of(), ""
        );
        MetrolinxFeed feed = new MetrolinxFeed(
            NOW,
            List.of(alertRecord, exceptionRecord, tripUpdateRecord),
            Map.of(
                MetrolinxSourceSystem.GO_SERVICE_ALERTS, true,
                MetrolinxSourceSystem.GO_TRAIN_EXCEPTIONS, true,
                MetrolinxSourceSystem.GO_GTFS_TRIP_UPDATES, false
            )
        );
        when(alertStore.sourceIdsBySystem(feed)).thenReturn(Map.of(
            MetrolinxSourceSystem.GO_SERVICE_ALERTS, Set.of("M1"),
            MetrolinxSourceSystem.GO_TRAIN_EXCEPTIONS, Set.of("EX-1"),
            MetrolinxSourceSystem.GO_GTFS_TRIP_UPDATES, Set.of("TU-1")
        ));

        FeedApplicationCounts counts = service.apply(feed, List.of(alert), List.of(classification));

        verify(alertStore).upsertSource(alertRecord, NOW);
        verify(alertStore).updateSourceClassification(classification.sources().getFirst(), classification);
        verify(operationalStore).upsertAll(List.of(exceptionRecord, tripUpdateRecord), NOW);
        verify(alertStore).deactivateMissingSources(MetrolinxSourceSystem.GO_SERVICE_ALERTS, Set.of("M1"));
        verify(operationalStore).deactivateMissing(MetrolinxSourceSystem.GO_TRAIN_EXCEPTIONS, Set.of("EX-1"));
        verify(operationalStore, never()).deactivateMissing(MetrolinxSourceSystem.GO_GTFS_TRIP_UPDATES, Set.of("TU-1"));
        assertThat(counts).isEqualTo(new FeedApplicationCounts(3, 3, 1, 2));
    }

    @Test
    void revisionRemovesObsoleteImpactsButFailedSupplementalCollectionKeepsLastGoodRows() {
        RegionalAlertStore alertStore = mock(RegionalAlertStore.class);
        RegionalFeedApplicationService service = new RegionalFeedApplicationService(
            alertStore, mock(RegionalOperationalSourceStore.class), CLOCK);
        MetrolinxFetchedRecord revised = new MetrolinxFetchedRecord(
            MetrolinxSourceSystem.GO_SERVICE_ALERTS, "M1", "{\"Code\":\"M1\"}");
        MetrolinxFeed feed = new MetrolinxFeed(NOW, List.of(revised), Map.of(
            MetrolinxSourceSystem.GO_SERVICE_ALERTS, true,
            MetrolinxSourceSystem.GO_GTFS_ALERTS, false));
        when(alertStore.sourceIdsBySystem(feed)).thenReturn(Map.of(
            MetrolinxSourceSystem.GO_SERVICE_ALERTS, Set.of("M1")));

        service.apply(feed, List.of(), List.of());

        verify(alertStore).deactivateMissingAlerts(MetrolinxSourceSystem.GO_SERVICE_ALERTS, Set.of(), NOW);
        verify(alertStore, never()).deactivateMissingAlerts(
            MetrolinxSourceSystem.GO_GTFS_ALERTS, Set.of(), NOW);
    }
}
