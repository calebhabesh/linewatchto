package com.calebhabesh.linewatch.surfacearrival;

import java.net.URI;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class TtcSurfaceArrivalClient {
    private final RestClient restClient;

    public TtcSurfaceArrivalClient(@Qualifier("arrivalRestClient") RestClient restClient) {
        this.restClient = restClient;
    }

    public String fetch(URI uri) {
        return restClient.get().uri(uri).retrieve().body(String.class);
    }
}
