package com.calebhabesh.linewatch.regional;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import com.calebhabesh.linewatch.ingestion.FeedApplicationCounts;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class RegionalIngestionRunServiceTest {
    @Test
    void recordsAggregateAndPerCollectionCoverageInTheSameSuccessfulRun() {
        RegionalIngestionRunStore store = mock(RegionalIngestionRunStore.class);
        Clock clock = Clock.fixed(Instant.parse("2026-07-30T16:00:00Z"), ZoneOffset.UTC);
        RegionalIngestionRunService service = new RegionalIngestionRunService(store, clock);
        FeedApplicationCounts counts = new FeedApplicationCounts(4, 4, 1, 3);
        OffsetDateTime sourceUpdatedAt = OffsetDateTime.parse("2026-07-30T15:59:00Z");
        MetrolinxFeed feed = new MetrolinxFeed(
            sourceUpdatedAt,
            List.of(new MetrolinxFetchedRecord(MetrolinxSourceSystem.GO_TRAIN_EXCEPTIONS, "EX-1", "{}")),
            Map.of(MetrolinxSourceSystem.GO_TRAIN_EXCEPTIONS, true)
        );

        service.succeed(42, counts, feed);

        verify(store).markSuccess(42, OffsetDateTime.parse("2026-07-30T16:00:00Z"), counts, sourceUpdatedAt);
        verify(store).replaceSourceStatuses(42, feed);
    }
}
