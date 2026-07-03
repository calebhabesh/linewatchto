package com.calebhabesh.linewatch.arrival.live;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import com.calebhabesh.linewatch.arrival.ArrivalProperties;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

class GtfsRtSubwayTrainMarkerWarmupJobTest {

    private final ArrivalProperties properties = new ArrivalProperties();
    private final GtfsRtSubwayTrainMarkerService markerService = mock(GtfsRtSubwayTrainMarkerService.class);
    private final GtfsRtSubwayTrainMarkerWarmupJob job = new GtfsRtSubwayTrainMarkerWarmupJob(properties, markerService);

    @Test
    void warmsSegmentWeightsWhenLiveProviderIsEnabled() {
        properties.setProvider(ArrivalProperties.ProviderMode.LIVE);

        job.warm();

        verify(markerService).warmSegmentWeights();
    }

    @Test
    void skipsWarmupWhenLiveProviderIsDisabled() {
        properties.setProvider(ArrivalProperties.ProviderMode.SCHEDULED);

        job.warm();

        verify(markerService, never()).warmSegmentWeights();
    }

    @Test
    void containsWarmupFailuresAtSchedulerBoundary() {
        properties.setProvider(ArrivalProperties.ProviderMode.LIVE);
        Logger logger = (Logger) LoggerFactory.getLogger(GtfsRtSubwayTrainMarkerWarmupJob.class);
        Level previousLevel = logger.getLevel();
        doThrow(new IllegalStateException("database unavailable")).when(markerService).warmSegmentWeights();

        try {
            logger.setLevel(Level.OFF);
            assertThatCode(job::warm).doesNotThrowAnyException();
        } finally {
            logger.setLevel(previousLevel);
        }

        verify(markerService).warmSegmentWeights();
    }
}
