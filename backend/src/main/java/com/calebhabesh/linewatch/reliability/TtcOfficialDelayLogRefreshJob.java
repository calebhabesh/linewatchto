package com.calebhabesh.linewatch.reliability;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Plan 17 A10 (D6): daily refresh job for Open Data Toronto's TTC official subway delay log.
 */
@Component
public class TtcOfficialDelayLogRefreshJob {
    private static final Logger log = LoggerFactory.getLogger(TtcOfficialDelayLogRefreshJob.class);

    private final ReliabilitySourcesProperties properties;
    private final TtcOfficialDelayLogService service;

    public TtcOfficialDelayLogRefreshJob(
        ReliabilitySourcesProperties properties,
        TtcOfficialDelayLogService service
    ) {
        this.properties = properties;
        this.service = service;
    }

    @Scheduled(
        initialDelayString = "${linewatch.reliability.sources.ttc-delay-log.initial-delay:PT90S}",
        fixedDelayString = "${linewatch.reliability.sources.ttc-delay-log.fixed-delay:PT24H}"
    )
    public void refresh() {
        if (!properties.getTtcDelayLog().isEnabled()) return;
        try {
            service.refreshIfUpdated();
        } catch (Exception e) {
            log.warn("Failed to refresh TTC official delay log: {}", e.getMessage());
        }
    }
}
