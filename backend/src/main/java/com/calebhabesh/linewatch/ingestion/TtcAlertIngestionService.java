package com.calebhabesh.linewatch.ingestion;

import com.calebhabesh.linewatch.cache.DashboardCacheService;
import org.springframework.stereotype.Service;

@Service
public class TtcAlertIngestionService {
    private final TtcAlertClient client;
    private final TtcAlertFeedApplicationService applicationService;
    private final IngestionRunService runService;
    private final DashboardCacheService cache;

    public TtcAlertIngestionService(
        TtcAlertClient client,
        TtcAlertFeedApplicationService applicationService,
        IngestionRunService runService,
        DashboardCacheService cache
    ) {
        this.client = client;
        this.applicationService = applicationService;
        this.runService = runService;
        this.cache = cache;
    }

    public void ingestNow() {
        long runId = runService.start();
        try {
            TtcAlertFeed feed = client.fetch();
            FeedApplicationCounts counts = applicationService.apply(feed);
            runService.succeed(
                runId,
                counts,
                TtcAlertTimes.sourceWallTimeToInstant(feed.lastUpdated())
            );
            cache.evictDashboard();
        } catch (RuntimeException exception) {
            runService.fail(runId, exception);
            throw exception;
        }
    }
}
