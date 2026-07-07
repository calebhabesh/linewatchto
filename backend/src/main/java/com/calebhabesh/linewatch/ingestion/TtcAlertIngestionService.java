package com.calebhabesh.linewatch.ingestion;

import com.calebhabesh.linewatch.cache.DashboardCacheService;
import java.time.OffsetDateTime;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;

@Service
public class TtcAlertIngestionService {
    private final TtcAlertClient client;
    private final TtcAlertFeedApplicationService applicationService;
    private final IngestionRunService runService;
    private final DashboardCacheService cache;
    private final ApplicationEventPublisher eventPublisher;

    public TtcAlertIngestionService(
        TtcAlertClient client,
        TtcAlertFeedApplicationService applicationService,
        IngestionRunService runService,
        DashboardCacheService cache,
        ApplicationEventPublisher eventPublisher
    ) {
        this.client = client;
        this.applicationService = applicationService;
        this.runService = runService;
        this.cache = cache;
        this.eventPublisher = eventPublisher;
    }

    public void ingestNow() {
        long runId = runService.start();
        try {
            TtcAlertFeed feed = client.fetch();
            FeedApplicationCounts counts = applicationService.apply(feed);
            OffsetDateTime sourceUpdatedAt = TtcAlertTimes.sourceWallTimeToInstant(feed.lastUpdated());
            runService.succeed(
                runId,
                counts,
                sourceUpdatedAt
            );
            cache.evictDashboard();
            eventPublisher.publishEvent(new TtcAlertIngestionSucceededEvent(runId, sourceUpdatedAt));
        } catch (RuntimeException exception) {
            runService.fail(runId, exception);
            throw exception;
        }
    }
}
