package com.calebhabesh.linewatch.ingestion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class TtcAlertClientTest {
    private MockRestServiceServer server;
    private TtcAlertClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        AlertIngestionProperties properties = new AlertIngestionProperties();
        properties.setUrl(URI.create("https://alerts.ttc.ca/api/alerts/live-alerts"));
        client = new TtcAlertClient(
            builder.build(),
            new ObjectMapper().findAndRegisterModules(),
            properties
        );
    }

    @Test
    void fetchParsesRouteAndAccessibilityRecordsWhilePreservingRawJson() throws Exception {
        String body = new String(
            getClass().getResourceAsStream("/fixtures/ttc-synthetic-alerts.json").readAllBytes(),
            StandardCharsets.UTF_8
        );
        server.expect(requestTo("https://alerts.ttc.ca/api/alerts/live-alerts"))
            .andRespond(withSuccess(body, MediaType.APPLICATION_JSON));

        TtcAlertFeed feed = client.fetch();

        assertThat(feed.routes()).hasSize(2);
        assertThat(feed.accessibility()).hasSize(2);
        assertThat(feed.routes().getFirst().record().id()).isEqualTo("synthetic-planned-line-1");
        assertThat(feed.routes().getFirst().rawPayload())
            .contains("\"id\":\"synthetic-planned-line-1\"")
            .doesNotContain("futureUnknownField");
        assertThat(feed.accessibility().getFirst().record().elevatorCode()).isEqualTo("TEST-E1");
        server.verify();
    }

    @Test
    void fetchRejectsMalformedEnvelope() {
        server.expect(requestTo("https://alerts.ttc.ca/api/alerts/live-alerts"))
            .andRespond(withSuccess("{\"routes\":{}}", MediaType.APPLICATION_JSON));

        assertThatThrownBy(client::fetch)
            .isInstanceOf(TtcAlertClientException.class)
            .hasMessageContaining("routes");
    }

    @Test
    void fetchWrapsUpstreamHttpFailure() {
        server.expect(requestTo("https://alerts.ttc.ca/api/alerts/live-alerts"))
            .andRespond(withServerError());

        assertThatThrownBy(client::fetch)
            .isInstanceOf(TtcAlertClientException.class)
            .hasMessageContaining("TTC Live Alerts");
    }
}
