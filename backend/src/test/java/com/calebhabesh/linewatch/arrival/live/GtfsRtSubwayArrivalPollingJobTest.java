package com.calebhabesh.linewatch.arrival.live;

import static org.assertj.core.api.Assertions.assertThat;

import com.calebhabesh.linewatch.arrival.ArrivalProperties;
import java.lang.reflect.Method;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.scheduling.annotation.Scheduled;

class GtfsRtSubwayArrivalPollingJobTest {
    @Test
    void defaultsLiveGtfsRtPollingToFiveSeconds() throws NoSuchMethodException {
        ArrivalProperties properties = new ArrivalProperties();
        Method refresh = GtfsRtSubwayArrivalPollingJob.class.getDeclaredMethod("refresh");
        Scheduled scheduled = refresh.getAnnotation(Scheduled.class);

        assertThat(properties.getLiveGtfsRtFixedDelay()).isEqualTo(Duration.ofSeconds(5));
        assertThat(scheduled.fixedDelayString())
            .isEqualTo("${linewatch.arrivals.live-gtfs-rt-fixed-delay:PT5S}");
    }
}
