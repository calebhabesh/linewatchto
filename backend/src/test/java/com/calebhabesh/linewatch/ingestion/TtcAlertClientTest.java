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
        assertThat(feed.siteWideAnnouncements()).hasSize(1);
        assertThat(feed.siteWideAnnouncements().getFirst().record().id()).isEqualTo("site-70100");
        assertThat(feed.siteWideAnnouncements().getFirst().record().customHeaderText())
            .isEqualTo("A station entrance is temporarily closed due to construction.");
        assertThat(feed.generalAnnouncements()).hasSize(1);
        assertThat(feed.generalAnnouncements().getFirst().record().title()).isEqualTo("Fare system update");
        assertThat(feed.fetchedCount()).isEqualTo(6);
        server.verify();
    }

    @Test
    void fetchDoesNotRequestGtfsRtSupplementWhenDisabled() throws Exception {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer defaultServer = MockRestServiceServer.bindTo(builder).build();
        AlertIngestionProperties properties = new AlertIngestionProperties();
        properties.setUrl(URI.create("https://alerts.ttc.ca/api/alerts/live-alerts"));
        properties.setSurfaceGtfsRtEnabled(false);
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
    void fetchRequestsDefaultBusAndStreetcarGtfsRtFeedsWhenSurfaceSupplementIsEnabled() throws Exception {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer gtfsServer = MockRestServiceServer.bindTo(builder).build();
        AlertIngestionProperties properties = new AlertIngestionProperties();
        properties.setUrl(URI.create("https://alerts.ttc.ca/api/alerts/live-alerts"));
        properties.setSurfaceGtfsRtEnabled(true);
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
        String busText = """
            header { gtfs_realtime_version: "2.0" incrementality: FULL_DATASET timestamp: 1781031643 }
            entity {
              id: "bus-88"
              alert {
                active_period { start: 1773547200 end: 1804221000 }
                informed_entity { route_id: "88" }
                effect: MODIFIED_SERVICE
                header_text { translation { text: "88 South Leaside - Route change, due to Ontario Line construction" language: "en" } }
              }
            }
            """;
        String streetcarText = """
            header { gtfs_realtime_version: "2.0" incrementality: FULL_DATASET timestamp: 1781031644 }
            entity {
              id: "streetcar-509"
              alert {
                active_period { start: 1780804800 end: 1785470400 }
                informed_entity { route_id: "509" }
                effect: MODIFIED_SERVICE
                header_text { translation { text: "509 Harbourfront - Service change, due to event traffic" language: "en" } }
              }
            }
            """;

        gtfsServer.expect(requestTo("https://alerts.ttc.ca/api/alerts/live-alerts"))
            .andRespond(withSuccess(body, MediaType.APPLICATION_JSON));
        gtfsServer.expect(requestTo("https://gtfsrt.ttc.ca/alerts/bus?format=text"))
            .andRespond(withSuccess(busText, MediaType.TEXT_PLAIN));
        gtfsServer.expect(requestTo("https://gtfsrt.ttc.ca/alerts/streetcar?format=text"))
            .andRespond(withSuccess(streetcarText, MediaType.TEXT_PLAIN));

        TtcAlertFeed feed = gtfsClient.fetch();

        assertThat(feed.routes()).hasSize(4);
        assertThat(feed.routes())
            .anySatisfy(route -> assertThat(route.record().id()).isEqualTo("gtfsrt-bus-88"))
            .anySatisfy(route -> assertThat(route.record().id()).isEqualTo("gtfsrt-streetcar-509"));
        gtfsServer.verify();
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
    void fetchFiltersRapidTransitRecordsFromGtfsRtSurfaceSupplement() throws Exception {
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
              id: "line-2-alert"
              alert {
                active_period { start: 1781885880 }
                informed_entity { route_id: "2" }
                effect: NO_SERVICE
                header_text { translation { text: "Line 2 Bloor-Danforth: No service between Jane and Islington stations." language: "en" } }
              }
            }
            entity {
              id: "bus-88"
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

        assertThat(feed.routes())
            .noneSatisfy(route -> assertThat(route.record().id()).isEqualTo("gtfsrt-line-2-alert"))
            .anySatisfy(route -> assertThat(route.record().id()).isEqualTo("gtfsrt-bus-88"));
        gtfsServer.verify();
    }

    @Test
    void fetchRejectsMalformedEnvelope() {
        server.expect(requestTo("https://alerts.ttc.ca/api/alerts/live-alerts"))
            .andRespond(withSuccess("{\"routes\":{}}", MediaType.APPLICATION_JSON));

        assertThatThrownBy(client::fetch)
            .isInstanceOfSatisfying(TtcAlertClientException.class, exception ->
                assertThat(exception.fetchStatus()).isEqualTo(TtcSourceFetchStatus.INVALID_RESPONSE)
            )
            .hasMessageContaining("routes");
    }

    @Test
    void fetchWrapsUpstreamHttpFailure() {
        server.expect(requestTo("https://alerts.ttc.ca/api/alerts/live-alerts"))
            .andRespond(withServerError());

        assertThatThrownBy(client::fetch)
            .isInstanceOfSatisfying(TtcAlertClientException.class, exception -> {
                assertThat(exception.fetchStatus()).isEqualTo(TtcSourceFetchStatus.HTTP_ERROR);
                assertThat(exception.httpStatus()).isEqualTo(500);
            })
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
