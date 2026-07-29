package com.calebhabesh.linewatch.regional;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration
@EnableConfigurationProperties({MetrolinxProperties.class, RegionalArrivalProperties.class, RegionalTrainMarkerProperties.class})
public class MetrolinxConfiguration {
    @Bean
    RestClient metrolinxRestClient(RestClient.Builder builder, MetrolinxProperties properties) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) properties.getConnectTimeout().toMillis());
        factory.setReadTimeout((int) properties.getReadTimeout().toMillis());
        return builder.requestFactory(factory).build();
    }

    @Bean
    @Qualifier("regionalScheduleRestClient")
    RestClient regionalScheduleRestClient(
        RestClient.Builder builder,
        RegionalArrivalProperties properties
    ) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) properties.getScheduleConnectTimeout().toMillis());
        factory.setReadTimeout((int) properties.getScheduleReadTimeout().toMillis());

        return builder.requestFactory(factory).build();
    }
}
