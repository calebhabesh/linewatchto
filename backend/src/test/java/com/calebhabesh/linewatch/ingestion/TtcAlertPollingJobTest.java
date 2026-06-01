package com.calebhabesh.linewatch.ingestion;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

class TtcAlertPollingJobTest {

    @Test
    void containsIngestionFailureAtSchedulerBoundary() {
        TtcAlertIngestionService service = mock(TtcAlertIngestionService.class);
        TtcAlertPollingJob job = new TtcAlertPollingJob(service);
        Logger logger = (Logger) LoggerFactory.getLogger(TtcAlertPollingJob.class);
        Level previousLevel = logger.getLevel();
        doThrow(new TtcAlertClientException("offline")).when(service).ingestNow();

        try {
            logger.setLevel(Level.OFF);
            assertThatCode(job::poll).doesNotThrowAnyException();
        } finally {
            logger.setLevel(previousLevel);
        }

        verify(service).ingestNow();
    }
}
