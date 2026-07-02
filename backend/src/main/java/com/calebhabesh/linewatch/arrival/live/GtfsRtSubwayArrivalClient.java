package com.calebhabesh.linewatch.arrival.live;

import com.calebhabesh.linewatch.arrival.ArrivalProperties;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class GtfsRtSubwayArrivalClient {
    private final RestClient restClient;
    private final ArrivalProperties properties;

    public GtfsRtSubwayArrivalClient(
        @Qualifier("arrivalRestClient") RestClient restClient,
        ArrivalProperties properties
    ) {
        this.restClient = restClient;
        this.properties = properties;
    }

    public String fetchTripUpdatesText() {
        return restClient.get()
            .uri(properties.getLiveGtfsRtUrl())
            .retrieve()
            .body(String.class);
    }
}
