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
    private final RegionalTripChangeService tripChangeService;
    private final DashboardCacheService cache;
    private final RegionalAlertExtractionService extractionService;

    public MetrolinxIngestionService(
        MetrolinxApiClient client,
        MetrolinxAlertNormalizer normalizer,
        RegionalFeedApplicationService applicationService,
        RegionalIngestionRunService runService,
        RegionalTripChangeService tripChangeService,
        DashboardCacheService cache,
        RegionalAlertExtractionService extractionService
    ) {
        this.client = client;
        this.normalizer = normalizer;
        this.applicationService = applicationService;
        this.runService = runService;
        this.tripChangeService = tripChangeService;
        this.cache = cache;
        this.extractionService = extractionService;
    }

    public FeedApplicationCounts ingestNow() {
        long runId = runService.start();
        try {
            MetrolinxFeed feed;
            try {
                feed = client.fetchAlerts();
                runService.recordSourceStatuses(runId, feed);
            } catch (MetrolinxClientException exception) {
                runService.recordSourceOutcomes(runId, exception.sourceOutcomes());
                throw exception;
            }
            List<RegionalAlertClassification> classifications = normalizer.classify(feed);
            // Optional model readings: new notice text is read now (within a short budget) so the
            // first stored version and any push use it; otherwise the deterministic result stands.
            extractionService.observe(classifications);
            extractionService.readNew(classifications);
            classifications = extractionService.refine(classifications);
            List<RegionalNormalizedAlert> alerts = normalizer.normalize(feed, classifications);
            FeedApplicationCounts counts = applicationService.apply(feed, alerts, classifications);
            tripChangeService.recordCurrentCancellations();
            runService.succeed(runId, counts, feed);
            cache.evictDashboard();
            return counts;
        } catch (RuntimeException exception) {
            runService.fail(runId, exception);
            throw exception;
        }
    }

}
