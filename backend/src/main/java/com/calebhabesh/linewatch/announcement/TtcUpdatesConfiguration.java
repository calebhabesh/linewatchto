package com.calebhabesh.linewatch.announcement;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration
@EnableConfigurationProperties(TtcUpdatesProperties.class)
public class TtcUpdatesConfiguration {
    @Bean
    RestClient ttcUpdatesRestClient(RestClient.Builder builder, TtcUpdatesProperties properties) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) properties.getConnectTimeout().toMillis());
        factory.setReadTimeout((int) properties.getReadTimeout().toMillis());
        return builder.requestFactory(factory)
            .defaultHeader("User-Agent", "LineWatchTO/1.0 (+https://linewatch.ca)")
            .defaultHeader("Accept", "text/html,application/xhtml+xml")
            .build();
    }
}
