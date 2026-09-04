package com.calebhabesh.linewatch.ingestion;

import com.calebhabesh.linewatch.cache.DashboardCacheService;
import java.time.OffsetDateTime;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;

@Service
public class TtcAlertIngestionService {
    private final TtcAlertClient client;
    private final TtcSubwayClosureClient subwayClosureClient;
    private final TtcAlertFeedApplicationService applicationService;
    private final IngestionRunService runService;
    private final DashboardCacheService cache;
    private final ApplicationEventPublisher eventPublisher;

    public TtcAlertIngestionService(
        TtcAlertClient client,
        TtcSubwayClosureClient subwayClosureClient,
        TtcAlertFeedApplicationService applicationService,
        IngestionRunService runService,
        DashboardCacheService cache,
        ApplicationEventPublisher eventPublisher
    ) {
        this.client = client;
        this.subwayClosureClient = subwayClosureClient;
        this.applicationService = applicationService;
        this.runService = runService;
        this.cache = cache;
        this.eventPublisher = eventPublisher;
    }

    public void ingestNow() {
        long runId = runService.start();
        long fetchStartedAt = System.nanoTime();
        try {
            TtcAlertFeed feed;
            try {
                feed = client.fetch();
            } catch (TtcAlertClientException exception) {
                runService.recordSourceFetch(
                    runId,
                    exception.fetchStatus(),
                    exception.httpStatus(),
                    elapsedMillis(fetchStartedAt)
                );
                throw exception;
            }
            runService.recordSourceFetch(
                runId,
                TtcSourceFetchStatus.SUCCESS,
                null,
                elapsedMillis(fetchStartedAt)
            );
            TtcSubwayClosureSnapshot subwayClosures = subwayClosureClient.fetch();
            FeedApplicationCounts counts = applicationService.apply(feed, subwayClosures);
            OffsetDateTime sourceUpdatedAt = TtcAlertTimes.sourceWallTimeToInstant(feed.lastUpdated());
            runService.succeed(
                runId,
                counts,
                sourceUpdatedAt,
                subwayClosures
            );
            cache.evictDashboard();
            eventPublisher.publishEvent(new TtcAlertIngestionSucceededEvent(runId, sourceUpdatedAt));
        } catch (RuntimeException exception) {
            runService.fail(runId, exception);
            throw exception;
        }
    }

    private long elapsedMillis(long startedAtNanos) {
        return Math.max(0, (System.nanoTime() - startedAtNanos) / 1_000_000);
    }
}
