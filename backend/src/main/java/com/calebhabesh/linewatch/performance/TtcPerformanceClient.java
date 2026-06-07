package com.calebhabesh.linewatch.performance;

import java.time.Clock;
import java.time.OffsetDateTime;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class TtcPerformanceClient {
    private final RestClient ttcPerformanceRestClient;
    private final TtcPerformanceProperties properties;
    private final TtcPerformanceParser parser;
    private final Clock clock;

    public TtcPerformanceClient(
        RestClient ttcPerformanceRestClient,
        TtcPerformanceProperties properties,
        TtcPerformanceParser parser,
        Clock clock
    ) {
        this.ttcPerformanceRestClient = ttcPerformanceRestClient;
        this.properties = properties;
        this.parser = parser;
        this.clock = clock;
    }

    public TtcPerformanceResponses.SnapshotResponse fetch() {
        try {
            String body = ttcPerformanceRestClient.get()
                .uri(properties.getUrl())
                .retrieve()
                .body(String.class);
            return parser.parse(body, properties.getUrl().toString(), OffsetDateTime.now(clock));
        } catch (TtcPerformanceClientException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new TtcPerformanceClientException("Unable to fetch TTC.ca performance metrics", exception);
        }
    }

    public static class TtcPerformanceClientException extends RuntimeException {
        public TtcPerformanceClientException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
