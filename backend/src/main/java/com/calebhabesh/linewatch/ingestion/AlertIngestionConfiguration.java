package com.calebhabesh.linewatch.ingestion;

import java.time.Clock;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration
@EnableConfigurationProperties(AlertIngestionProperties.class)
public class AlertIngestionConfiguration {

    @Bean
    RestClient ttcAlertRestClient(
        RestClient.Builder builder,
        AlertIngestionProperties properties
    ) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) properties.getConnectTimeout().toMillis());
        factory.setReadTimeout((int) properties.getReadTimeout().toMillis());
        return builder.requestFactory(factory).build();
    }

    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }
}
