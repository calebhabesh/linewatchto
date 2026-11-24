package com.calebhabesh.linewatch.reliability;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Plan 17 A10 (D5): scheduled poller that derives GO/UP trip observations into
 * {@code regional_trip_observations} through the shared {@code MetrolinxTripUpdateSnapshots}.
 */
@Component
@EnableConfigurationProperties(ReliabilitySourcesProperties.class)
public class RegionalTripObservationPollingJob {
    private final ReliabilitySourcesProperties properties;
    private final RegionalTripObservationService service;

    public RegionalTripObservationPollingJob(
        ReliabilitySourcesProperties properties,
        RegionalTripObservationService service
    ) {
        this.properties = properties;
        this.service = service;
    }

    @Scheduled(
        initialDelayString = "${linewatch.reliability.sources.regional-otp.initial-delay:PT45S}",
        fixedDelayString = "${linewatch.reliability.sources.regional-otp.fixed-delay:PT60S}"
    )
    public void poll() {
        if (!properties.getRegionalOtp().isEnabled()) return;
        service.pollOnce();
    }
}
