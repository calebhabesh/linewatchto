package com.calebhabesh.linewatch.stationnotice;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration
@EnableConfigurationProperties(TtcStationNoticeMonitorProperties.class)
public class TtcStationNoticeMonitorConfiguration {
    @Bean
    RestClient ttcStationNoticeRestClient(
        RestClient.Builder builder,
        TtcStationNoticeMonitorProperties properties
    ) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) properties.getConnectTimeout().toMillis());
        factory.setReadTimeout((int) properties.getReadTimeout().toMillis());
        return builder.requestFactory(factory)
            .defaultHeader("User-Agent", "LineWatchTO-station-notice-monitor/1.0 (+https://linewatchto.ca)")
            .defaultHeader("Accept", "text/html,application/xhtml+xml,application/xml,text/xml")
            .build();
    }
}
