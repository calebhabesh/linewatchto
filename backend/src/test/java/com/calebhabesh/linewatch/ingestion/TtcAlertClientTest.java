package com.calebhabesh.linewatch.ingestion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.calebhabesh.linewatch.surface.GtfsRtServiceAlertTextParser;
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
        properties.setSurfaceGtfsRtEnabled(false);
        client = new TtcAlertClient(
            builder.build(),
            new ObjectMapper().findAndRegisterModules(),
            properties,
            new GtfsRtServiceAlertTextParser()
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
    void fetchDoesNotRequestGtfsRtSupplementByDefault() throws Exception {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer defaultServer = MockRestServiceServer.bindTo(builder).build();
        AlertIngestionProperties properties = new AlertIngestionProperties();
        properties.setUrl(URI.create("https://alerts.ttc.ca/api/alerts/live-alerts"));
        properties.setSurfaceGtfsRtUrl(URI.create("https://gtfsrt.ttc.ca/alerts/all?format=text"));
        TtcAlertClient defaultClient = new TtcAlertClient(
            builder.build(),
            new ObjectMapper().findAndRegisterModules(),
            properties,
            new GtfsRtServiceAlertTextParser()
        );

        String body = new String(
            getClass().getResourceAsStream("/fixtures/ttc-synthetic-alerts.json").readAllBytes(),
            StandardCharsets.UTF_8
        );
        defaultServer.expect(requestTo("https://alerts.ttc.ca/api/alerts/live-alerts"))
            .andRespond(withSuccess(body, MediaType.APPLICATION_JSON));

        TtcAlertFeed feed = defaultClient.fetch();

        assertThat(feed.routes()).hasSize(2);
        assertThat(feed.routes())
            .noneSatisfy(route -> assertThat(route.record().id()).startsWith("gtfsrt-"));
        defaultServer.verify();
    }


    @Test
    void fetchAppendsGtfsRtSurfaceServiceAlertsWhenConfigured() throws Exception {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer gtfsServer = MockRestServiceServer.bindTo(builder).build();
        AlertIngestionProperties properties = new AlertIngestionProperties();
        properties.setUrl(URI.create("https://alerts.ttc.ca/api/alerts/live-alerts"));
        properties.setSurfaceGtfsRtEnabled(true);
        properties.setSurfaceGtfsRtUrl(URI.create("https://gtfsrt.ttc.ca/alerts/all?format=text"));
        TtcAlertClient gtfsClient = new TtcAlertClient(
            builder.build(),
            new ObjectMapper().findAndRegisterModules(),
            properties,
            new GtfsRtServiceAlertTextParser()
        );

        String body = new String(
            getClass().getResourceAsStream("/fixtures/ttc-synthetic-alerts.json").readAllBytes(),
            StandardCharsets.UTF_8
        );
        String gtfsText = """
            header { gtfs_realtime_version: "2.0" incrementality: FULL_DATASET timestamp: 1781031643 }
            entity {
              id: "100"
              alert {
                active_period { start: 1773547200 end: 1804221000 }
                informed_entity { route_id: "88" }
                effect: MODIFIED_SERVICE
                header_text { translation { text: "88 South Leaside - Route change, due to Ontario Line construction" language: "en" } }
              }
            }
            """;
        gtfsServer.expect(requestTo("https://alerts.ttc.ca/api/alerts/live-alerts"))
            .andRespond(withSuccess(body, MediaType.APPLICATION_JSON));
        gtfsServer.expect(requestTo("https://gtfsrt.ttc.ca/alerts/all?format=text"))
            .andRespond(withSuccess(gtfsText, MediaType.TEXT_PLAIN));

        TtcAlertFeed feed = gtfsClient.fetch();

        assertThat(feed.routes()).hasSize(3);
        assertThat(feed.routes())
            .anySatisfy(route -> assertThat(route.record().id()).isEqualTo("gtfsrt-100"));
        gtfsServer.verify();
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

    @Test
    void fetchParsesTimestampsWithoutTimezoneOffset() {
        String body = """
            {
              "total": 1,
              "lastUpdated": "2026-06-06T21:45:09.4957689",
              "routes": [
                {
                  "id": "70001",
                  "alertType": "Planned",
                  "lastUpdated": "2026-06-06T21:45:09.4957689",
                  "activePeriod": {
                    "start": "2026-06-06T21:40:00.123",
                    "end": "2026-06-06T22:30:00"
                  },
                  "route": "1",
                  "routeType": "Subway",
                  "title": "Short delay",
                  "effect": "SIGNIFICANT_DELAYS",
                  "childAlerts": [
                    {
                      "id": "70002",
                      "startTime": "2026-06-06T21:45:00",
                      "endTime": "2026-06-06T21:50:00"
                    }
                  ]
                }
              ],
              "accessibility": []
            }
            """;
        server.expect(requestTo("https://alerts.ttc.ca/api/alerts/live-alerts"))
            .andRespond(withSuccess(body, MediaType.APPLICATION_JSON));

        TtcAlertFeed feed = client.fetch();

        assertThat(feed.lastUpdated()).isEqualTo(java.time.LocalDateTime.parse("2026-06-06T21:45:09.4957689").atZone(java.time.ZoneId.of("America/Toronto")).toOffsetDateTime());
        TtcAlertRecord route = feed.routes().getFirst().record();
        assertThat(route.lastUpdated()).isEqualTo(java.time.LocalDateTime.parse("2026-06-06T21:45:09.4957689").atZone(java.time.ZoneId.of("America/Toronto")).toOffsetDateTime());
        assertThat(route.activePeriod().start()).isEqualTo(java.time.LocalDateTime.parse("2026-06-06T21:40:00.123").atZone(java.time.ZoneId.of("America/Toronto")).toOffsetDateTime());
        assertThat(route.activePeriod().end()).isEqualTo(java.time.LocalDateTime.parse("2026-06-06T22:30:00").atZone(java.time.ZoneId.of("America/Toronto")).toOffsetDateTime());
        assertThat(route.childAlerts().getFirst().startTime()).isEqualTo(java.time.LocalDateTime.parse("2026-06-06T21:45:00").atZone(java.time.ZoneId.of("America/Toronto")).toOffsetDateTime());
        assertThat(route.childAlerts().getFirst().endTime()).isEqualTo(java.time.LocalDateTime.parse("2026-06-06T21:50:00").atZone(java.time.ZoneId.of("America/Toronto")).toOffsetDateTime());
        server.verify();
    }
}
