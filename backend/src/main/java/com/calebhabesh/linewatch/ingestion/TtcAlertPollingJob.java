package com.calebhabesh.linewatch.ingestion;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(
    prefix = "linewatch.ingestion.alerts",
    name = "enabled",
    havingValue = "true"
)
public class TtcAlertPollingJob {
    private static final Logger log = LoggerFactory.getLogger(TtcAlertPollingJob.class);

    private final TtcAlertIngestionService service;

    public TtcAlertPollingJob(TtcAlertIngestionService service) {
        this.service = service;
    }

    @Scheduled(fixedDelayString = "${linewatch.ingestion.alerts.fixed-delay:PT2M}")
    public void poll() {
        try {
            service.ingestNow();
        } catch (RuntimeException exception) {
            log.error("TTC alert ingestion failed", exception);
        }
    }
}
