package com.calebhabesh.linewatch.streetcarposition;

import java.net.URI;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class TtcVehiclePositionClient {
    private final RestClient restClient;

    public TtcVehiclePositionClient(@Qualifier("arrivalRestClient") RestClient restClient) {
        this.restClient = restClient;
    }

    public String fetch(URI uri) {
        return restClient.get().uri(uri).retrieve().body(String.class);
    }
}
