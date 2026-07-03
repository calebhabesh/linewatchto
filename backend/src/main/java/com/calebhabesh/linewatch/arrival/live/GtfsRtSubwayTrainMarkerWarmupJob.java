package com.calebhabesh.linewatch.arrival.live;

import com.calebhabesh.linewatch.arrival.ArrivalProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class GtfsRtSubwayTrainMarkerWarmupJob {
    private static final Logger log = LoggerFactory.getLogger(GtfsRtSubwayTrainMarkerWarmupJob.class);

    private final ArrivalProperties properties;
    private final GtfsRtSubwayTrainMarkerService markerService;

    public GtfsRtSubwayTrainMarkerWarmupJob(
        ArrivalProperties properties,
        GtfsRtSubwayTrainMarkerService markerService
    ) {
        this.properties = properties;
        this.markerService = markerService;
    }

    @Scheduled(
        initialDelayString = "${linewatch.arrivals.train-marker-warmup-initial-delay:PT20S}",
        fixedDelayString = "${linewatch.arrivals.train-marker-warmup-fixed-delay:PT5M}"
    )
    public void warm() {
        if (properties.getProvider() != ArrivalProperties.ProviderMode.LIVE) {
            return;
        }
        try {
            markerService.warmSegmentWeights();
        } catch (Exception exception) {
            log.warn("Failed to warm TTC GTFS-RT train marker segment weights", exception);
        }
    }
}
