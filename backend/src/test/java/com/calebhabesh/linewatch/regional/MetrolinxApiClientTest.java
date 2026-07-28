package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
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
    void fetchesGoAndUpFullDatasetsWithBackendOnlyKey() {
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/ServiceUpdate/ServiceAlert/All?key=" + KEY))
            .andRespond(withSuccess("""
                {"Metadata":{"TimeStamp":"2026-07-28 14:12:32","ErrorCode":"200","ErrorMessage":"OK"},
                 "Messages":{"Message":[{"Code":"M1","Category":"Service Disruption"}]}}
                """, MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/UP/Gtfs/Feed/Alerts?key=" + KEY))
            .andRespond(withSuccess("""
                {"header":{"gtfs_realtime_version":"2.0","incrementality":"FULL_DATASET","timestamp":1785262352},
                 "entity":[{"id":"UP1","is_deleted":false,"alert":{}}]}
                """, MediaType.APPLICATION_JSON));

        MetrolinxFeed feed = client.fetchAlerts();

        assertThat(feed.records()).extracting(MetrolinxFetchedRecord::sourceSystem)
            .containsExactly(MetrolinxSourceSystem.GO_SERVICE_ALERTS, MetrolinxSourceSystem.UP_GTFS_ALERTS);
        assertThat(feed.records()).extracting(MetrolinxFetchedRecord::sourceId)
            .containsExactly("M1", "UP1");
        assertThat(feed.completeSources()).containsEntry(MetrolinxSourceSystem.GO_SERVICE_ALERTS, true)
            .containsEntry(MetrolinxSourceSystem.UP_GTFS_ALERTS, true);
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
}
