package com.calebhabesh.linewatch.regional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(prefix = "linewatch.ingestion.metrolinx", name = "enabled", havingValue = "true")
public class MetrolinxPollingJob {
    private static final Logger log = LoggerFactory.getLogger(MetrolinxPollingJob.class);
    private final MetrolinxIngestionService service;

    public MetrolinxPollingJob(MetrolinxIngestionService service) { this.service = service; }

    @Scheduled(
        initialDelayString = "${linewatch.ingestion.metrolinx.initial-delay:PT5S}",
        fixedDelayString = "${linewatch.ingestion.metrolinx.fixed-delay:PT2M}"
    )
    public void poll() {
        try {
            service.ingestNow();
        } catch (RuntimeException exception) {
            // Client exceptions intentionally omit the key-bearing request URI.
            log.error("Metrolinx regional alert ingestion failed: {}", exception.getMessage());
        }
    }
}
