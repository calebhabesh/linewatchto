package com.calebhabesh.linewatch.regional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(prefix = "linewatch.ingestion.metrolinx.extraction", name = "enabled", havingValue = "true")
public class RegionalAlertExtractionJob {
    private static final Logger log = LoggerFactory.getLogger(RegionalAlertExtractionJob.class);
    private final RegionalAlertExtractionService service;

    public RegionalAlertExtractionJob(RegionalAlertExtractionService service, RegionalAlertExtractionProperties properties) {
        this.service = service;
        if (!properties.isActive()) {
            log.warn("Metrolinx notice extraction is enabled but has no API key or model; it stays off");
        } else {
            log.info("Metrolinx notice extraction is on: model {}, {} mode, at most {} requests a day",
                properties.getModel(), properties.getMode().name().toLowerCase(java.util.Locale.ROOT),
                properties.getDailyRequestBudget());
        }
    }

    @Scheduled(
        initialDelayString = "${linewatch.ingestion.metrolinx.extraction.initial-delay:PT30S}",
        fixedDelayString = "${linewatch.ingestion.metrolinx.extraction.fixed-delay:PT1M}"
    )
    public void run() {
        try {
            service.processDue();
        } catch (RuntimeException exception) {
            // Client failures carry only a short code; the key travels in a header, never a message.
            log.error("Metrolinx notice extraction run failed: {}", exception.getClass().getSimpleName());
        }
    }
}
