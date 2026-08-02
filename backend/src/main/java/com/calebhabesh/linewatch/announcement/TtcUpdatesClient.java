package com.calebhabesh.linewatch.announcement;

import java.util.List;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class TtcUpdatesClient {
    private final RestClient restClient;
    private final TtcUpdatesProperties properties;
    private final TtcUpdatesParser parser;

    public TtcUpdatesClient(
        @Qualifier("ttcUpdatesRestClient") RestClient restClient,
        TtcUpdatesProperties properties,
        TtcUpdatesParser parser
    ) {
        this.restClient = restClient;
        this.properties = properties;
        this.parser = parser;
    }

    public List<TtcAnnouncementResponses.Detail> fetch() {
        String html = restClient.get()
            .uri(properties.getUrl())
            .retrieve()
            .body(String.class);
        return parser.parse(html, properties.getUrl(), properties.getMaxEntries());
    }
}
