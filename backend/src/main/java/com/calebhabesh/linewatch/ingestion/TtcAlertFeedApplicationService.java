package com.calebhabesh.linewatch.ingestion;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TtcAlertFeedApplicationService {
    private final TtcAlertStore store;
    private final TtcAlertNormalizer normalizer;
    private final Clock clock;

    public TtcAlertFeedApplicationService(
        TtcAlertStore store,
        TtcAlertNormalizer normalizer,
        Clock clock
    ) {
        this.store = store;
        this.normalizer = normalizer;
        this.clock = clock;
    }

    @Transactional
    public FeedApplicationCounts apply(TtcAlertFeed feed) {
        OffsetDateTime now = OffsetDateTime.now(clock);
        Set<String> seenSourceKeys = new HashSet<>();
        Set<String> seenAlertSourceIds = new HashSet<>();
        Set<String> seenOutageSourceIds = new HashSet<>();
        int normalized = 0;
        int unmatched = 0;

        for (TtcFetchedRecord fetched : feed.routes()) {
            seenSourceKeys.add(store.upsertSource("routes", fetched, now));
            NormalizationResult<NormalizedRouteAlert> result =
                normalizer.normalizeRoute(fetched);
            if (result.shouldPersist()) {
                NormalizedRouteAlert alert = result.projection().orElseThrow();
                store.upsertRouteAlert(alert, now);
                seenAlertSourceIds.add(alert.sourceId());
                normalized++;
            }
            if (result.countsAsUnmatched()) {
                unmatched++;
            }
        }

        for (TtcFetchedRecord fetched : feed.accessibility()) {
            seenSourceKeys.add(store.upsertSource("accessibility", fetched, now));
            NormalizationResult<NormalizedAccessibilityOutage> result =
                normalizer.normalizeAccessibility(fetched);
            if (result.shouldPersist()) {
                NormalizedAccessibilityOutage outage = result.projection().orElseThrow();
                store.upsertAccessibilityOutage(outage, now);
                seenOutageSourceIds.add(outage.sourceId());
                normalized++;
            }
            if (result.countsAsUnmatched()) {
                unmatched++;
            }
        }

        store.deactivateMissingSources(seenSourceKeys);
        store.deactivateMissingAlerts(seenAlertSourceIds, now);
        store.deactivateMissingAccessibilityOutages(seenOutageSourceIds, now);

        return new FeedApplicationCounts(
            feed.fetchedCount(),
            seenSourceKeys.size(),
            normalized,
            unmatched
        );
    }
}
