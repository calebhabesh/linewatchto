package com.calebhabesh.linewatch.stationnotice;

import java.net.URI;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class TtcStationNoticeClient {
    private final RestClient restClient;
    private final TtcStationNoticeMonitorProperties properties;

    public TtcStationNoticeClient(
        @Qualifier("ttcStationNoticeRestClient") RestClient restClient,
        TtcStationNoticeMonitorProperties properties
    ) {
        this.restClient = restClient;
        this.properties = properties;
    }

    public String fetch(URI uri) {
        String body = restClient.get().uri(uri).retrieve().body(String.class);
        if (body == null) {
            throw new IllegalStateException("TTC station notice source returned an empty response");
        }
        if (body.length() > properties.getMaxResponseCharacters()) {
            throw new IllegalStateException("TTC station notice source exceeded the configured response limit");
        }
        return body;
    }
}
