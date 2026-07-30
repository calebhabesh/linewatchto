package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withNoContent;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class MetrolinxApiClientTest {
    private static final String KEY = "test-secret-key";
    private MockRestServiceServer server;
    private MetrolinxApiClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        MetrolinxProperties properties = new MetrolinxProperties();
        properties.setBaseUrl(URI.create("https://api.example.test/OpenDataAPI/"));
        properties.setApiKey(KEY);
        client = new MetrolinxApiClient(
            builder.build(),
            new ObjectMapper().findAndRegisterModules(),
            properties
        );
    }

    @Test
    void fetchesEveryRelevantGoAndUpAlertAndOperationalCollectionWithBackendOnlyKey() {
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/ServiceUpdate/ServiceAlert/All?key=" + KEY))
            .andRespond(withSuccess("""
                {"Metadata":{"TimeStamp":"2026-07-28 14:12:32","ErrorCode":"200","ErrorMessage":"OK"},
                 "Messages":{"Message":[{"Code":"M1","Category":"Service Disruption"}]}}
                """, MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/ServiceUpdate/InformationAlert/All?key=" + KEY))
            .andRespond(withSuccess("""
                {"Metadata":{"TimeStamp":"2026-07-28 14:12:33","ErrorCode":"200","ErrorMessage":"OK"},
                 "Messages":{"Message":[{"Code":"I1","Category":"Information"}]}}
                """, MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/ServiceUpdate/MarketingAlert/All?key=" + KEY))
            .andRespond(withSuccess("""
                {"Metadata":{"TimeStamp":"2026-07-28 14:12:34","ErrorCode":"200","ErrorMessage":"OK"},
                 "Messages":{"Message":[{"Code":"MK1","Category":"Marketing"}]}}
                """, MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/Gtfs/Feed/Alerts?key=" + KEY))
            .andRespond(withSuccess("""
                {"header":{"gtfs_realtime_version":"2.0","incrementality":"FULL_DATASET","timestamp":1785262351},
                 "entity":[{"id":"GO-GTFS-1","is_deleted":false,"alert":{}}]}
                """, MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/ServiceUpdate/Exceptions/Train?key=" + KEY))
            .andRespond(withSuccess("""
                {"Metadata":{"TimeStamp":"2026-07-28 14:12:35","ErrorCode":"200","ErrorMessage":"OK"},
                 "Trip":[{"TripNumber":"EX-1","IsCancelled":"true","Stop":[]}]}
                """, MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/Gtfs/Feed/TripUpdates?key=" + KEY))
            .andRespond(withSuccess("""
                {"header":{"gtfs_realtime_version":"2.0","incrementality":"FULL_DATASET","timestamp":1785262352},
                 "entity":[{"id":"GO-TRIP-1","trip_update":{"trip":{"trip_id":"TRIP-1"}}}]}
                """, MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/UP/Gtfs/Feed/Alerts?key=" + KEY))
            .andRespond(withSuccess("""
                {"header":{"gtfs_realtime_version":"2.0","incrementality":"FULL_DATASET","timestamp":1785262352},
                 "entity":[{"id":"UP1","is_deleted":false,"alert":{}}]}
                """, MediaType.APPLICATION_JSON));

        MetrolinxFeed feed = client.fetchAlerts();

        assertThat(feed.records()).extracting(MetrolinxFetchedRecord::sourceSystem)
            .containsExactly(
                MetrolinxSourceSystem.GO_SERVICE_ALERTS,
                MetrolinxSourceSystem.GO_INFORMATION_ALERTS,
                MetrolinxSourceSystem.GO_MARKETING_ALERTS,
                MetrolinxSourceSystem.GO_GTFS_ALERTS,
                MetrolinxSourceSystem.GO_TRAIN_EXCEPTIONS,
                MetrolinxSourceSystem.GO_GTFS_TRIP_UPDATES,
                MetrolinxSourceSystem.UP_GTFS_ALERTS
            );
        assertThat(feed.records()).extracting(MetrolinxFetchedRecord::sourceId)
            .containsExactly("M1", "I1", "MK1", "GO-GTFS-1", "EX-1", "GO-TRIP-1", "UP1");
        assertThat(feed.completeSources())
            .containsEntry(MetrolinxSourceSystem.GO_SERVICE_ALERTS, true)
            .containsEntry(MetrolinxSourceSystem.GO_INFORMATION_ALERTS, true)
            .containsEntry(MetrolinxSourceSystem.GO_MARKETING_ALERTS, true)
            .containsEntry(MetrolinxSourceSystem.GO_GTFS_ALERTS, true)
            .containsEntry(MetrolinxSourceSystem.GO_TRAIN_EXCEPTIONS, true)
            .containsEntry(MetrolinxSourceSystem.GO_GTFS_TRIP_UPDATES, true)
            .containsEntry(MetrolinxSourceSystem.UP_GTFS_ALERTS, true);
        assertThat(feed.sourceUpdatedAts())
            .containsEntry(
                MetrolinxSourceSystem.GO_TRAIN_EXCEPTIONS,
                java.time.OffsetDateTime.parse("2026-07-28T14:12:35-04:00")
            )
            .containsEntry(
                MetrolinxSourceSystem.GO_GTFS_TRIP_UPDATES,
                java.time.OffsetDateTime.parse("2026-07-28T18:12:32Z")
            );
        server.verify();
    }

    @Test
    void sanitizesUpstreamFailuresSoTheApiKeyIsNotLeaked() {
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/ServiceUpdate/ServiceAlert/All?key=" + KEY))
            .andRespond(withServerError());

        assertThatThrownBy(client::fetchAlerts)
            .isInstanceOf(MetrolinxClientException.class)
            .hasMessage("Unable to fetch Metrolinx GO service alerts")
            .hasMessageNotContaining(KEY)
            .hasNoCause();
    }

    @Test
    void continuesWhenASupplementalAlertCollectionIsUnavailable() {
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/ServiceUpdate/ServiceAlert/All?key=" + KEY))
            .andRespond(withSuccess(restAlerts("M1"), MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/ServiceUpdate/InformationAlert/All?key=" + KEY))
            .andRespond(withSuccess(restAlerts("I1"), MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/ServiceUpdate/MarketingAlert/All?key=" + KEY))
            .andRespond(withSuccess("""
                {"Metadata":{"TimeStamp":"2026-07-28 14:12:34","ErrorCode":"401","ErrorMessage":"Capability unavailable"},
                 "Messages":{"Message":[]}}
                """, MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/Gtfs/Feed/Alerts?key=" + KEY))
            .andRespond(withSuccess(gtfsAlerts("GO-GTFS-1"), MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/ServiceUpdate/Exceptions/Train?key=" + KEY))
            .andRespond(withServerError());
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/Gtfs/Feed/TripUpdates?key=" + KEY))
            .andRespond(withSuccess(gtfsTripUpdates("GO-TRIP-1"), MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/UP/Gtfs/Feed/Alerts?key=" + KEY))
            .andRespond(withSuccess(gtfsAlerts("UP1"), MediaType.APPLICATION_JSON));

        MetrolinxFeed feed = client.fetchAlerts();

        assertThat(feed.records()).extracting(MetrolinxFetchedRecord::sourceId)
            .containsExactly("M1", "I1", "GO-GTFS-1", "GO-TRIP-1", "UP1");
        assertThat(feed.completeSources())
            .containsEntry(MetrolinxSourceSystem.GO_MARKETING_ALERTS, false)
            .containsEntry(MetrolinxSourceSystem.GO_INFORMATION_ALERTS, true)
            .containsEntry(MetrolinxSourceSystem.GO_GTFS_ALERTS, true)
            .containsEntry(MetrolinxSourceSystem.GO_TRAIN_EXCEPTIONS, false)
            .containsEntry(MetrolinxSourceSystem.GO_GTFS_TRIP_UPDATES, true);
        server.verify();
    }

    @Test
    void treatsMetrolinxNoContentAsACompleteEmptyRestCollection() {
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/ServiceUpdate/ServiceAlert/All?key=" + KEY))
            .andRespond(withSuccess(restAlerts("M1"), MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/ServiceUpdate/InformationAlert/All?key=" + KEY))
            .andRespond(withSuccess(restAlerts("I1"), MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/ServiceUpdate/MarketingAlert/All?key=" + KEY))
            .andRespond(withNoContent());
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/Gtfs/Feed/Alerts?key=" + KEY))
            .andRespond(withSuccess(gtfsAlerts("GO-GTFS-1"), MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/ServiceUpdate/Exceptions/Train?key=" + KEY))
            .andRespond(withNoContent());
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/Gtfs/Feed/TripUpdates?key=" + KEY))
            .andRespond(withSuccess(gtfsTripUpdates("GO-TRIP-1"), MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/UP/Gtfs/Feed/Alerts?key=" + KEY))
            .andRespond(withSuccess(gtfsAlerts("UP1"), MediaType.APPLICATION_JSON));

        MetrolinxFeed feed = client.fetchAlerts();

        assertThat(feed.records()).extracting(MetrolinxFetchedRecord::sourceId)
            .containsExactly("M1", "I1", "GO-GTFS-1", "GO-TRIP-1", "UP1");
        assertThat(feed.completeSources())
            .containsEntry(MetrolinxSourceSystem.GO_MARKETING_ALERTS, true)
            .containsEntry(MetrolinxSourceSystem.GO_TRAIN_EXCEPTIONS, true);
        server.verify();
    }

    @Test
    void acceptsSingletonTrainExceptionAndUsesTripIdWhenGtfsEntityIdIsMissing() {
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/ServiceUpdate/ServiceAlert/All?key=" + KEY))
            .andRespond(withSuccess(restAlerts("M1"), MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/ServiceUpdate/InformationAlert/All?key=" + KEY))
            .andRespond(withSuccess(restAlerts("I1"), MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/ServiceUpdate/MarketingAlert/All?key=" + KEY))
            .andRespond(withSuccess(noContent(), MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/Gtfs/Feed/Alerts?key=" + KEY))
            .andRespond(withSuccess(gtfsAlerts("GO-GTFS-1"), MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/ServiceUpdate/Exceptions/Train?key=" + KEY))
            .andRespond(withSuccess("""
                {"Metadata":{"TimeStamp":"2026-07-30 10:22:21","ErrorCode":"200","ErrorMessage":"OK"},
                 "Trips":{"Trip":{"TripNumber":"EX-SINGLE","IsCancelled":"false","IsOverride":"true","Stop":[]}}}
                """, MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/Gtfs/Feed/TripUpdates?key=" + KEY))
            .andRespond(withSuccess("""
                {"header":{"gtfs_realtime_version":"2.0","incrementality":"FULL_DATASET","timestamp":1785262352},
                 "entity":[{"trip_update":{"trip":{"trip_id":"TRIP-FALLBACK"}}}]}
                """, MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/UP/Gtfs/Feed/Alerts?key=" + KEY))
            .andRespond(withSuccess(gtfsAlerts("UP1"), MediaType.APPLICATION_JSON));

        MetrolinxFeed feed = client.fetchAlerts();

        assertThat(feed.records()).extracting(MetrolinxFetchedRecord::sourceId)
            .contains("EX-SINGLE", "TRIP-FALLBACK");
        server.verify();
    }

    private String restAlerts(String id) {
        return """
            {"Metadata":{"TimeStamp":"2026-07-28 14:12:32","ErrorCode":"200","ErrorMessage":"OK"},
             "Messages":{"Message":[{"Code":"%s"}]}}
            """.formatted(id);
    }

    private String gtfsAlerts(String id) {
        return """
            {"header":{"gtfs_realtime_version":"2.0","incrementality":"FULL_DATASET","timestamp":1785262352},
             "entity":[{"id":"%s","is_deleted":false,"alert":{}}]}
            """.formatted(id);
    }

    private String gtfsTripUpdates(String id) {
        return """
            {"header":{"gtfs_realtime_version":"2.0","incrementality":"FULL_DATASET","timestamp":1785262352},
             "entity":[{"id":"%s","trip_update":{"trip":{"trip_id":"TRIP-1"}}}]}
            """.formatted(id);
    }

    private String noContent() {
        return """
            {"Metadata":{"TimeStamp":"2026-07-30 10:22:21","ErrorCode":"204","ErrorMessage":"No Content"},
             "Messages":{"Message":null}}
            """;
    }
}
