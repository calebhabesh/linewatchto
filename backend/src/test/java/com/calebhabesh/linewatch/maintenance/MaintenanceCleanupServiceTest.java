package com.calebhabesh.linewatch.maintenance;

import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.reliability.ReliabilityScheduleCapture;
import com.calebhabesh.linewatch.reliability.ReliabilityScheduleCapture.ScheduleSource;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

class MaintenanceCleanupServiceTest {
    private static final Clock CLOCK = Clock.fixed(
        Instant.parse("2026-07-08T12:00:00Z"),
        ZoneOffset.UTC
    );

    private final MaintenanceCleanupStore store = mock(MaintenanceCleanupStore.class);
    private final MaintenanceCleanupProperties properties = new MaintenanceCleanupProperties();
    private final ReliabilityScheduleCapture scheduleCapture = mock(ReliabilityScheduleCapture.class);
    private final MaintenanceCleanupService service =
        new MaintenanceCleanupService(store, properties, scheduleCapture, CLOCK);

    @Test
    void capturesEveryScheduleSourceBeforeDeletingOldGtfsImports() {
        service.cleanup();

        InOrder order = inOrder(scheduleCapture, store);
        order.verify(scheduleCapture).capture(ScheduleSource.TTC);
        order.verify(store).deleteOldInactiveGtfsImports(1);
        verify(scheduleCapture).capture(ScheduleSource.GO);
        verify(scheduleCapture).capture(ScheduleSource.UP);
    }

    @Test
    void failedTtcCaptureKeepsOldGtfsImportsAndTheRestOfCleanup() {
        doThrow(new IllegalStateException("capture failed")).when(scheduleCapture).capture(ScheduleSource.TTC);

        service.cleanup();

        verify(store, never()).deleteOldInactiveGtfsImports(anyInt());
        verify(scheduleCapture).capture(ScheduleSource.GO);
        verify(scheduleCapture).capture(ScheduleSource.UP);
        verify(store).deleteOldIngestionRuns(OffsetDateTime.parse("2026-04-09T12:00:00Z"));
    }

    @Test
    void failedRegionalCaptureStillDeletesOldTtcImports() {
        doThrow(new IllegalStateException("capture failed")).when(scheduleCapture).capture(ScheduleSource.GO);

        service.cleanup();

        verify(scheduleCapture).capture(ScheduleSource.UP);
        verify(store).deleteOldInactiveGtfsImports(1);
    }

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
        verify(store).deleteOldRegionalAlertExtractions(cutoff);
        verifyNoMoreInteractions(store);
    }

    @Test
    void disabledCleanupDoesNothing() {
        properties.setEnabled(false);

        service.cleanup();

        verifyNoInteractions(store, scheduleCapture);
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
        verify(store).deleteOldRegionalAlertExtractions(OffsetDateTime.parse("2026-06-24T12:00:00Z"));
    }

    @Test
    void refreshesPlannerStatisticsAfterDeletingGtfsImports() {
        when(store.deleteOldInactiveGtfsImports(1)).thenReturn(2);

        service.cleanup();

        verify(store).refreshGtfsPlannerStatistics();
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
        verify(store).deleteOldRegionalAlertExtractions(defaultCutoff);
    }
}
