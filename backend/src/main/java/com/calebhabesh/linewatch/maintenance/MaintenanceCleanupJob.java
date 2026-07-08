package com.calebhabesh.linewatch.maintenance;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(
    prefix = "linewatch.maintenance.cleanup",
    name = "enabled",
    havingValue = "true",
    matchIfMissing = true
)
public class MaintenanceCleanupJob {
    private static final Logger log = LoggerFactory.getLogger(MaintenanceCleanupJob.class);

    private final MaintenanceCleanupService service;

    public MaintenanceCleanupJob(MaintenanceCleanupService service) {
        this.service = service;
    }

    @Scheduled(
        initialDelayString = "${linewatch.maintenance.cleanup.initial-delay:PT10M}",
        fixedDelayString = "${linewatch.maintenance.cleanup.fixed-delay:PT24H}"
    )
    public void cleanup() {
        try {
            service.cleanup();
        } catch (RuntimeException exception) {
            log.error("LineWatch maintenance cleanup failed", exception);
        }
    }
}
