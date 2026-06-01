package com.calebhabesh.linewatch.ingestion;

import org.springframework.stereotype.Service;

@Service
public class TtcAlertIngestionService {
    private final TtcAlertClient client;
    private final TtcAlertFeedApplicationService applicationService;
    private final IngestionRunService runService;

    public TtcAlertIngestionService(
        TtcAlertClient client,
        TtcAlertFeedApplicationService applicationService,
        IngestionRunService runService
    ) {
        this.client = client;
        this.applicationService = applicationService;
        this.runService = runService;
    }

    public void ingestNow() {
        long runId = runService.start();
        try {
            TtcAlertFeed feed = client.fetch();
            FeedApplicationCounts counts = applicationService.apply(feed);
            runService.succeed(runId, counts, feed.lastUpdated());
        } catch (RuntimeException exception) {
            runService.fail(runId, exception);
            throw exception;
        }
    }
}
