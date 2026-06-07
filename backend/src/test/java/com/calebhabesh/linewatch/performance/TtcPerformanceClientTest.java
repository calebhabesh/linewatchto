package com.calebhabesh.linewatch.performance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class TtcPerformanceClientTest {
    private MockRestServiceServer server;
    private TtcPerformanceClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        TtcPerformanceProperties properties = new TtcPerformanceProperties();
        properties.setUrl(URI.create("https://www.ttc.ca/"));
        client = new TtcPerformanceClient(
            builder.build(),
            properties,
            new TtcPerformanceParser(),
            Clock.fixed(Instant.parse("2026-06-07T12:00:00Z"), ZoneOffset.UTC)
        );
    }

    @Test
    void fetchesAndParsesHomepageMetrics() throws Exception {
        String html = new String(
            getClass().getResourceAsStream("/fixtures/ttc-performance-homepage.html").readAllBytes(),
            StandardCharsets.UTF_8
        );
        server.expect(requestTo("https://www.ttc.ca/"))
            .andRespond(withSuccess(html, MediaType.TEXT_HTML));

        TtcPerformanceResponses.SnapshotResponse snapshot = client.fetch();

        assertThat(snapshot.status()).isEqualTo("available");
        assertThat(snapshot.metrics()).hasSize(8);
        assertThat(snapshot.fetchedAt()).isEqualTo("2026-06-07T12:00Z");
        server.verify();
    }

    @Test
    void wrapsUpstreamFailures() {
        server.expect(requestTo("https://www.ttc.ca/"))
            .andRespond(withServerError());

        assertThatThrownBy(client::fetch)
            .isInstanceOf(TtcPerformanceClient.TtcPerformanceClientException.class)
            .hasMessageContaining("TTC.ca performance metrics");
    }
}
