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
    void mapsVersionedGoRailRouteIdToInboundAdjacentSchematicSegmentAndRejectsBusRoute() {
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/Gtfs/Feed/VehiclePosition?key=secret"))
            .andRespond(withSuccess("""
                {"header":{"gtfs_realtime_version":"2.0","incrementality":"FULL_DATASET","timestamp":1785268043},
                 "entity":[
                   {"id":"go-3775","vehicle":{"trip":{"trip_id":"3775","route_id":"06260926-KI","direction_id":0},
                     "vehicle":{"id":"cab-3775"},"current_status":"IN_TRANSIT_TO","stop_id":"WE","timestamp":1785268040}},
                   {"id":"go-bus-31","vehicle":{"trip":{"trip_id":"bus-31","route_id":"06260926-31","direction_id":0},
                     "vehicle":{"id":"bus-31"},"current_status":"IN_TRANSIT_TO","stop_id":"WE","timestamp":1785268040}}
                 ]}
                """, MediaType.APPLICATION_JSON));

        RegionalTrainMarkerFeed feed = client.fetchGo();

        assertThat(feed.sourceUpdatedAt()).isEqualTo(OffsetDateTime.parse("2026-07-28T19:47:23Z"));
        assertThat(feed.markers()).singleElement().satisfies(marker -> {
            assertThat(marker.lineId()).isEqualTo("regional-ki");
            assertThat(marker.segmentId()).isEqualTo("segment-ki-weston-etobicoke-north");
            assertThat(marker.fromStationId()).isEqualTo("etobicoke-north");
            assertThat(marker.nextStationId()).isEqualTo("weston");
            assertThat(marker.direction()).isEqualTo("Inbound");
            assertThat(marker.travelDirection()).isEqualTo("reverse");
            assertThat(marker.progress()).isEqualTo(0.5);
            assertThat(marker.vehicleId()).isEqualTo("cab-3775");
        });
        server.verify();
    }

    @Test
    void mapsOutboundMiltonVehicleTowardOuterTerminus() {
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/Gtfs/Feed/VehiclePosition?key=secret"))
            .andRespond(withSuccess("""
                {"header":{"incrementality":"FULL_DATASET","timestamp":1785268043},
                 "entity":[
                   {"id":"mi-201","vehicle":{"trip":{"trip_id":"201","route_id":"MI","direction_id":1},
                     "vehicle":{"id":"cab-201"},"current_status":"IN_TRANSIT_TO","stop_id":"SR","timestamp":1785268040}}
                 ]}
                """, MediaType.APPLICATION_JSON));

        RegionalTrainMarkerFeed feed = client.fetchGo();

        assertThat(feed.markers()).singleElement().satisfies(marker -> {
            assertThat(marker.lineId()).isEqualTo("regional-mi");
            assertThat(marker.segmentId()).isEqualTo("segment-mi-erindale-streetsville");
            assertThat(marker.fromStationId()).isEqualTo("erindale");
            assertThat(marker.nextStationId()).isEqualTo("streetsville");
            assertThat(marker.direction()).isEqualTo("Outbound");
            assertThat(marker.travelDirection()).isEqualTo("forward");
        });
        server.verify();
    }

    @Test
    void mapsInboundLakeshoreEastVehicleTowardUnion() {
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/Gtfs/Feed/VehiclePosition?key=secret"))
            .andRespond(withSuccess("""
                {"header":{"incrementality":"FULL_DATASET","timestamp":1785268043},
                 "entity":[
                   {"id":"le-901","vehicle":{"trip":{"trip_id":"901","route_id":"LE","direction_id":1},
                     "vehicle":{"id":"cab-901"},"current_status":"IN_TRANSIT_TO","stop_id":"SC","timestamp":1785268040}}
                 ]}
                """, MediaType.APPLICATION_JSON));

        RegionalTrainMarkerFeed feed = client.fetchGo();

        assertThat(feed.markers()).singleElement().satisfies(marker -> {
            assertThat(marker.lineId()).isEqualTo("regional-le");
            assertThat(marker.segmentId()).isEqualTo("segment-le-scarborough-eglinton");
            assertThat(marker.fromStationId()).isEqualTo("eglinton");
            assertThat(marker.nextStationId()).isEqualTo("scarborough");
            assertThat(marker.direction()).isEqualTo("Inbound");
            assertThat(marker.travelDirection()).isEqualTo("reverse");
        });
        server.verify();
    }

    @Test
    void mapsInboundLakeshoreWestVehicleFromConfederationTowardWestHarbour() {
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/Gtfs/Feed/VehiclePosition?key=secret"))
            .andRespond(withSuccess("""
                {"header":{"incrementality":"FULL_DATASET","timestamp":1785268043},
                 "entity":[
                   {"id":"lw-1201","vehicle":{"trip":{"trip_id":"1201","route_id":"LW","direction_id":0},
                     "vehicle":{"id":"cab-1201"},"current_status":"IN_TRANSIT_TO","stop_id":"WR","timestamp":1785268040}}
                 ]}
                """, MediaType.APPLICATION_JSON));

        RegionalTrainMarkerFeed feed = client.fetchGo();

        assertThat(feed.markers()).singleElement().satisfies(marker -> {
            assertThat(marker.lineId()).isEqualTo("regional-lw");
            assertThat(marker.segmentId()).isEqualTo("segment-lw-west-harbour-confederation");
            assertThat(marker.fromStationId()).isEqualTo("confederation");
            assertThat(marker.nextStationId()).isEqualTo("west-harbour");
            assertThat(marker.direction()).isEqualTo("Inbound");
            assertThat(marker.travelDirection()).isEqualTo("reverse");
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
