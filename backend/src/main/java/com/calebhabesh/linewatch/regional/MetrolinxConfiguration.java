package com.calebhabesh.linewatch.regional;

import java.net.http.HttpClient;
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
    @Qualifier("regionalScheduleHttpClient")
    HttpClient regionalScheduleHttpClient(RegionalArrivalProperties properties) {
        return HttpClient.newBuilder()
            .connectTimeout(properties.getScheduleConnectTimeout())
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();
    }
}
