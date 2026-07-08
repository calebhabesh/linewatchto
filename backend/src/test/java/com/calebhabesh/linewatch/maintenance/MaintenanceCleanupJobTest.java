package com.calebhabesh.linewatch.maintenance;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

class MaintenanceCleanupJobTest {

    @Test
    void containsCleanupFailureAtSchedulerBoundary() {
        MaintenanceCleanupService service = mock(MaintenanceCleanupService.class);
        MaintenanceCleanupJob job = new MaintenanceCleanupJob(service);
        Logger logger = (Logger) LoggerFactory.getLogger(MaintenanceCleanupJob.class);
        Level previousLevel = logger.getLevel();
        doThrow(new RuntimeException("database unavailable")).when(service).cleanup();

        try {
            logger.setLevel(Level.OFF);
            assertThatCode(job::cleanup).doesNotThrowAnyException();
        } finally {
            logger.setLevel(previousLevel);
        }

        verify(service).cleanup();
    }
}
