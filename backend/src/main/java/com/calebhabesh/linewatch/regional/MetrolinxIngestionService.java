package com.calebhabesh.linewatch.regional;

import com.calebhabesh.linewatch.cache.DashboardCacheService;
import com.calebhabesh.linewatch.ingestion.FeedApplicationCounts;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class MetrolinxIngestionService {
    private final MetrolinxApiClient client;
    private final MetrolinxAlertNormalizer normalizer;
    private final RegionalFeedApplicationService applicationService;
    private final RegionalIngestionRunService runService;
    private final DashboardCacheService cache;

    public MetrolinxIngestionService(
        MetrolinxApiClient client,
        MetrolinxAlertNormalizer normalizer,
        RegionalFeedApplicationService applicationService,
        RegionalIngestionRunService runService,
        DashboardCacheService cache
    ) {
        this.client = client;
        this.normalizer = normalizer;
        this.applicationService = applicationService;
        this.runService = runService;
        this.cache = cache;
    }

    public FeedApplicationCounts ingestNow() {
        long runId = runService.start();
        try {
            MetrolinxFeed feed = client.fetchAlerts();
            List<RegionalNormalizedAlert> alerts = normalizer.normalize(feed);
            FeedApplicationCounts counts = applicationService.apply(feed, alerts);
            runService.succeed(runId, counts, feed.sourceUpdatedAt());
            cache.evictDashboard();
            return counts;
        } catch (RuntimeException exception) {
            runService.fail(runId, exception);
            throw exception;
        }
    }

}
