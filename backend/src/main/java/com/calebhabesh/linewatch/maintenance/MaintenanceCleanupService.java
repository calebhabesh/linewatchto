package com.calebhabesh.linewatch.maintenance;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class MaintenanceCleanupService {
    private static final Logger log = LoggerFactory.getLogger(MaintenanceCleanupService.class);
    private static final Duration DEFAULT_RETENTION = Duration.ofDays(90);

    private final MaintenanceCleanupStore store;
    private final MaintenanceCleanupProperties properties;
    private final Clock clock;

    public MaintenanceCleanupService(
        MaintenanceCleanupStore store,
        MaintenanceCleanupProperties properties,
        Clock clock
    ) {
        this.store = store;
        this.properties = properties;
        this.clock = clock;
    }

    public CleanupResult cleanup() {
        if (!properties.isEnabled()) {
            return new CleanupResult(0, 0, 0, 0);
        }
        OffsetDateTime now = OffsetDateTime.now(clock);
        int demoAccountsDeleted = store.deleteExpiredDemoAccounts(now);
        int gtfsImportsDeleted =
            store.deleteOldInactiveGtfsImports(properties.getRetainInactiveGtfsImports());
        int ingestionRunsDeleted =
            store.deleteOldIngestionRuns(now.minus(retention(properties.getIngestionRunRetention())));
        OffsetDateTime alertSourceCutoff = now.minus(retention(properties.getAlertSourceRecordRetention()));
        int alertSourceRecordsDeleted =
            store.deleteOldInactiveAlertSourceRecords(alertSourceCutoff)
                + store.deleteOldInactiveMetrolinxAlertSourceRecords(alertSourceCutoff)
                + store.deleteOldInactiveMetrolinxOperationalSourceRecords(alertSourceCutoff);
        CleanupResult result = new CleanupResult(
            demoAccountsDeleted,
            gtfsImportsDeleted,
            ingestionRunsDeleted,
            alertSourceRecordsDeleted
        );
        if (result.totalDeleted() > 0) {
            log.info(
                "Maintenance cleanup removed demoAccounts={} gtfsImports={} ingestionRuns={} alertSourceRecords={}",
                result.demoAccountsDeleted(),
                result.gtfsImportsDeleted(),
                result.ingestionRunsDeleted(),
                result.alertSourceRecordsDeleted()
            );
        }
        return result;
    }

    private Duration retention(Duration retention) {
        if (retention == null || retention.isZero() || retention.isNegative()) {
            return DEFAULT_RETENTION;
        }
        return retention;
    }

    public record CleanupResult(
        int demoAccountsDeleted,
        int gtfsImportsDeleted,
        int ingestionRunsDeleted,
        int alertSourceRecordsDeleted
    ) {
        int totalDeleted() {
            return demoAccountsDeleted + gtfsImportsDeleted + ingestionRunsDeleted + alertSourceRecordsDeleted;
        }
    }
}
