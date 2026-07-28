package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class MetrolinxVehiclePositionClientTest {
    private MockRestServiceServer server;
    private MetrolinxVehiclePositionClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        MetrolinxProperties properties = new MetrolinxProperties();
        properties.setBaseUrl(URI.create("https://api.example.test/OpenDataAPI/"));
        properties.setApiKey("secret");
        client = new MetrolinxVehiclePositionClient(builder.build(), new ObjectMapper(), properties);
    }

    @Test
    void mapsFreshGoVehicleToAdjacentSchematicSegment() {
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/Gtfs/Feed/VehiclePosition?key=secret"))
            .andRespond(withSuccess("""
                {"header":{"gtfs_realtime_version":"2.0","incrementality":"FULL_DATASET","timestamp":1785268043},
                 "entity":[{"id":"go-3775","vehicle":{"trip":{"trip_id":"3775","route_id":"KI","direction_id":0},
                   "vehicle":{"id":"cab-3775"},"current_status":"IN_TRANSIT_TO","stop_id":"WE","timestamp":1785268040}}]}
                """, MediaType.APPLICATION_JSON));

        RegionalTrainMarkerFeed feed = client.fetchGo();

        assertThat(feed.sourceUpdatedAt()).isEqualTo(OffsetDateTime.parse("2026-07-28T19:47:23Z"));
        assertThat(feed.markers()).singleElement().satisfies(marker -> {
            assertThat(marker.lineId()).isEqualTo("regional-ki");
            assertThat(marker.segmentId()).isEqualTo("segment-ki-mount-dennis-weston");
            assertThat(marker.fromStationId()).isEqualTo("mount-dennis");
            assertThat(marker.nextStationId()).isEqualTo("weston");
            assertThat(marker.direction()).isEqualTo("Outbound");
            assertThat(marker.progress()).isEqualTo(0.5);
            assertThat(marker.vehicleId()).isEqualTo("cab-3775");
        });
        server.verify();
    }

    @Test
    void dropsVehiclesWhoseReportedStopCannotBeMapped() {
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/UP/Gtfs/Feed/VehiclePosition?key=secret"))
            .andRespond(withSuccess("""
                {"header":{"incrementality":"FULL_DATASET","timestamp":1785268043},
                 "entity":[{"id":"up-1","vehicle":{"trip":{"trip_id":"up-1","route_id":"UP"},"stop_id":"unknown"}}]}
                """, MediaType.APPLICATION_JSON));

        assertThat(client.fetchUp().markers()).isEmpty();
        server.verify();
    }
}
