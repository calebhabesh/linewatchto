package com.calebhabesh.linewatch.performance;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration
@EnableConfigurationProperties(TtcPerformanceProperties.class)
public class TtcPerformanceConfiguration {
    @Bean
    RestClient ttcPerformanceRestClient(
        RestClient.Builder builder,
        TtcPerformanceProperties properties
    ) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) properties.getConnectTimeout().toMillis());
        factory.setReadTimeout((int) properties.getReadTimeout().toMillis());
        return builder.requestFactory(factory).build();
    }
}
