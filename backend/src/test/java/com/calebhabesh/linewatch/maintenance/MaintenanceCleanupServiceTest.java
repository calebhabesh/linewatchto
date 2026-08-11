package com.calebhabesh.linewatch.maintenance;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class MaintenanceCleanupServiceTest {
    private static final Clock CLOCK = Clock.fixed(
        Instant.parse("2026-07-08T12:00:00Z"),
        ZoneOffset.UTC
    );

    private final MaintenanceCleanupStore store = mock(MaintenanceCleanupStore.class);
    private final MaintenanceCleanupProperties properties = new MaintenanceCleanupProperties();
    private final MaintenanceCleanupService service =
        new MaintenanceCleanupService(store, properties, CLOCK);

    @Test
    void prunesOperationalDataWithConservativeDefaults() {
        service.cleanup();

        OffsetDateTime cutoff = OffsetDateTime.parse("2026-04-09T12:00:00Z");
        verify(store).deleteExpiredDemoAccounts(OffsetDateTime.parse("2026-07-08T12:00:00Z"));
        verify(store).deleteOldInactiveGtfsImports(1);
        verify(store).deleteOldIngestionRuns(cutoff);
        verify(store).deleteOldInactiveAlertSourceRecords(cutoff);
        verify(store).deleteOldInactiveMetrolinxAlertSourceRecords(cutoff);
        verify(store).deleteOldInactiveMetrolinxOperationalSourceRecords(cutoff);
        verifyNoMoreInteractions(store);
    }

    @Test
    void disabledCleanupDoesNothing() {
        properties.setEnabled(false);

        service.cleanup();

        verifyNoInteractions(store);
    }

    @Test
    void usesConfiguredRetentionAndInactiveGtfsBackupCount() {
        properties.setIngestionRunRetention(Duration.ofDays(30));
        properties.setAlertSourceRecordRetention(Duration.ofDays(14));
        properties.setRetainInactiveGtfsImports(2);

        service.cleanup();

        verify(store).deleteOldInactiveGtfsImports(2);
        verify(store).deleteOldIngestionRuns(OffsetDateTime.parse("2026-06-08T12:00:00Z"));
        verify(store).deleteOldInactiveAlertSourceRecords(OffsetDateTime.parse("2026-06-24T12:00:00Z"));
        verify(store).deleteOldInactiveMetrolinxAlertSourceRecords(OffsetDateTime.parse("2026-06-24T12:00:00Z"));
        verify(store).deleteOldInactiveMetrolinxOperationalSourceRecords(OffsetDateTime.parse("2026-06-24T12:00:00Z"));
    }

    @Test
    void fallsBackToDefaultRetentionWhenConfiguredRetentionIsInvalid() {
        properties.setIngestionRunRetention(null);
        properties.setAlertSourceRecordRetention(Duration.ofDays(-1));

        service.cleanup();

        OffsetDateTime defaultCutoff = OffsetDateTime.parse("2026-04-09T12:00:00Z");
        verify(store).deleteOldIngestionRuns(defaultCutoff);
        verify(store).deleteOldInactiveAlertSourceRecords(defaultCutoff);
        verify(store).deleteOldInactiveMetrolinxAlertSourceRecords(defaultCutoff);
        verify(store).deleteOldInactiveMetrolinxOperationalSourceRecords(defaultCutoff);
    }
}
