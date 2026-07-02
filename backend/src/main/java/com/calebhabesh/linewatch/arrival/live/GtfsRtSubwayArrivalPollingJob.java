package com.calebhabesh.linewatch.arrival.live;

import com.calebhabesh.linewatch.arrival.ArrivalProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class GtfsRtSubwayArrivalPollingJob {
    private static final Logger log = LoggerFactory.getLogger(GtfsRtSubwayArrivalPollingJob.class);

    private final ArrivalProperties properties;
    private final GtfsRtSubwayArrivalRefreshService refreshService;

    public GtfsRtSubwayArrivalPollingJob(
        ArrivalProperties properties,
        GtfsRtSubwayArrivalRefreshService refreshService
    ) {
        this.properties = properties;
        this.refreshService = refreshService;
    }

    @Scheduled(
        initialDelayString = "${linewatch.arrivals.live-gtfs-rt-initial-delay:PT10S}",
        fixedDelayString = "${linewatch.arrivals.live-gtfs-rt-fixed-delay:PT30S}"
    )
    public void refresh() {
        if (properties.getProvider() != ArrivalProperties.ProviderMode.LIVE) {
            return;
        }
        try {
            GtfsRtSubwayArrivalSnapshot snapshot = refreshService.refresh();
            log.debug(
                "Indexed {} TTC GTFS-RT subway arrivals from feed timestamp {}",
                snapshot.arrivals().size(),
                snapshot.feedCreatedAt()
            );
        } catch (Exception exception) {
            log.warn("Failed to refresh TTC GTFS-RT subway trip updates", exception);
        }
    }
}
