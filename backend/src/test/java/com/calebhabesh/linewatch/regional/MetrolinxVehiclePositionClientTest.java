package com.calebhabesh.linewatch.regional;

import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.ExpectedCount.times;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class MetrolinxVehiclePositionClientTest {
    private MockRestServiceServer server;
    private MetrolinxVehiclePositionClient client;
    private MetrolinxTripUpdateSnapshots snapshots;
    private MetrolinxFeedFetcher fetcher;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        // GO lookups also read the GO trip-update snapshot; order between the
        // two feeds is not part of the contract.
        server = MockRestServiceServer.bindTo(builder).ignoreExpectOrder(true).build();
        MetrolinxProperties properties = new MetrolinxProperties();
        properties.setBaseUrl(URI.create("https://api.example.test/OpenDataAPI/"));
        properties.setApiKey("secret");
        properties.setFetchRetryDelay(Duration.ZERO);
        Clock clock = Clock.fixed(Instant.ofEpochSecond(1785268043), ZoneOffset.UTC);
        fetcher = new MetrolinxFeedFetcher(builder.build(), JsonMapper.builder().findAndAddModules().build(), properties, clock);
        snapshots = new MetrolinxTripUpdateSnapshots(fetcher, new MetrolinxUpTripUpdateParser(), clock);
        client = new MetrolinxVehiclePositionClient(fetcher, snapshots, RegionalLinkTravelTimes.NONE);
    }

    // An eastbound UP train that has left Bloor: the TripUpdate no longer lists
    // Bloor and Union is 420 s away. Clock is 1785268043; vehicle seen at ...040.
    private static final String UP_VP_LEFT_BLOOR = """
        {"header":{"incrementality":"FULL_DATASET","timestamp":1785268043},
         "entity":[{"id":"up-4026","vehicle":{"trip":{"trip_id":"4026","route_id":"UP"},
           "vehicle":{"id":"cab-4026"},"current_status":"IN_TRANSIT_TO","stop_id":"UN","timestamp":1785268040}}]}
        """;
    private static final String UP_TU_LEFT_BLOOR = """
        {"header":{"incrementality":"FULL_DATASET","timestamp":1785268043},
         "entity":[{"id":"20260728-4026","trip_update":{
           "trip":{"trip_id":"20260728-4026","route_id":"UP"},
           "vehicle":{"id":"cab-4026","label":"UP - Union Station"},
           "stop_time_update":[
             {"stop_id":"UN","arrival":{"time":1785268460}}
           ]}}]}
        """;

    @Test
    void timesALinkFromTheTimetableOnceTheFeedDropsThePreviousStop() {
        client = new MetrolinxVehiclePositionClient(fetcher, snapshots, (lineId, from, to) ->
            "regional-up".equals(lineId) && "bloor".equals(from) && "union".equals(to)
                ? java.util.OptionalInt.of(540) : java.util.OptionalInt.empty());
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/UP/Gtfs/Feed/VehiclePosition?key=secret"))
            .andRespond(withSuccess(UP_VP_LEFT_BLOOR, MediaType.APPLICATION_JSON));
        expectUpTripUpdates(UP_TU_LEFT_BLOOR);

        assertThat(client.fetchUp().markers()).singleElement().satisfies(marker -> {
            assertThat(marker.segmentId()).isEqualTo("segment-up-union-bloor");
            assertThat(marker.fromStationId()).isEqualTo("bloor");
            assertThat(marker.nextStationId()).isEqualTo("union");
            assertThat(marker.timed()).isTrue();
            assertThat(marker.segmentTravelSeconds()).isEqualTo(540);
            // 420 s of a 540 s link remain, so it is two ninths of the way to Union.
            assertThat(marker.progress()).isCloseTo(120 / 540.0, org.assertj.core.data.Offset.offset(1e-9));
        });
        server.verify();
    }

    @Test
    void neverDrawsATrainAtAStationItHasAlreadyLeft() {
        // No timetable time: the 300 s fallback is shorter than the 420 s left,
        // which used to park the marker on Bloor while Bloor's tiles had no train.
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/UP/Gtfs/Feed/VehiclePosition?key=secret"))
            .andRespond(withSuccess(UP_VP_LEFT_BLOOR, MediaType.APPLICATION_JSON));
        expectUpTripUpdates(UP_TU_LEFT_BLOOR);

        assertThat(client.fetchUp().markers()).singleElement().satisfies(marker -> {
            assertThat(marker.timed()).isTrue();
            assertThat(marker.moving()).isTrue();
            assertThat(marker.progress()).isEqualTo(MetrolinxVehiclePositionClient.MIN_DEPARTED_PROGRESS);
        });
        server.verify();
    }

    @Test
    void prefersTheTripsOwnDepartureOverTheTimetableLinkTime() {
        client = new MetrolinxVehiclePositionClient(fetcher, snapshots, (lineId, from, to) -> java.util.OptionalInt.of(900));
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/Gtfs/Feed/VehiclePosition?key=secret"))
            .andRespond(withSuccess(GO_VP_TO_WESTON, MediaType.APPLICATION_JSON));
        expectGoTripUpdates("""
            {"header":{"incrementality":"FULL_DATASET","timestamp":1785268043},
             "entity":[{"id":"t-3775","trip_update":{"trip":{"trip_id":"3775","route_id":"KI"},
               "stop_time_update":[
                 {"stop_id":"ET","departure":{"time":1785267900}},
                 {"stop_id":"WE","arrival":{"time":1785268100}}
               ]}}]}
            """);

        assertThat(client.fetchGo().markers()).singleElement()
            .satisfies(marker -> assertThat(marker.segmentTravelSeconds()).isEqualTo(200));
        server.verify();
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

        expectGoTripUpdates(EMPTY_TRIP_UPDATES);
        RegionalTrainMarkerFeed feed = client.fetchGo();

        assertThat(feed.sourceUpdatedAt()).isEqualTo(OffsetDateTime.parse("2026-07-28T19:47:23Z"));
        assertThat(feed.markers()).singleElement().satisfies(marker -> {
            assertThat(marker.lineId()).isEqualTo("regional-ki");
            assertThat(marker.segmentId()).isEqualTo("segment-ki-weston-etobicoke-north");
            assertThat(marker.fromStationId()).isEqualTo("etobicoke-north");
            assertThat(marker.nextStationId()).isEqualTo("weston");
            assertThat(marker.direction()).isEqualTo("Eastbound");
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

        expectGoTripUpdates(EMPTY_TRIP_UPDATES);
        RegionalTrainMarkerFeed feed = client.fetchGo();

        assertThat(feed.markers()).singleElement().satisfies(marker -> {
            assertThat(marker.lineId()).isEqualTo("regional-mi");
            assertThat(marker.segmentId()).isEqualTo("segment-mi-erindale-streetsville");
            assertThat(marker.fromStationId()).isEqualTo("erindale");
            assertThat(marker.nextStationId()).isEqualTo("streetsville");
            assertThat(marker.direction()).isEqualTo("Westbound");
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

        expectGoTripUpdates(EMPTY_TRIP_UPDATES);
        RegionalTrainMarkerFeed feed = client.fetchGo();

        assertThat(feed.markers()).singleElement().satisfies(marker -> {
            assertThat(marker.lineId()).isEqualTo("regional-le");
            assertThat(marker.segmentId()).isEqualTo("segment-le-scarborough-eglinton");
            assertThat(marker.fromStationId()).isEqualTo("eglinton");
            assertThat(marker.nextStationId()).isEqualTo("scarborough");
            assertThat(marker.direction()).isEqualTo("Westbound");
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

        expectGoTripUpdates(EMPTY_TRIP_UPDATES);
        RegionalTrainMarkerFeed feed = client.fetchGo();

        assertThat(feed.markers()).singleElement().satisfies(marker -> {
            assertThat(marker.lineId()).isEqualTo("regional-lw");
            assertThat(marker.segmentId()).isEqualTo("segment-lw-west-harbour-confederation");
            assertThat(marker.fromStationId()).isEqualTo("confederation");
            assertThat(marker.nextStationId()).isEqualTo("west-harbour");
            assertThat(marker.direction()).isEqualTo("Eastbound");
            assertThat(marker.travelDirection()).isEqualTo("reverse");
        });
        server.verify();
    }

    @Test
    void mapsMatchedUnionBoundUpTripTowardUnionEvenWhenDirectionIdDisagrees() {
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/UP/Gtfs/Feed/VehiclePosition?key=secret"))
            .andRespond(withSuccess("""
                {"header":{"incrementality":"FULL_DATASET","timestamp":1785268043},
                 "entity":[
                   {"id":"up-4322","vehicle":{"trip":{"trip_id":"4322","route_id":"UP","direction_id":0},
                     "vehicle":{"id":"cab-4322"},"current_status":"IN_TRANSIT_TO","stop_id":"WE","timestamp":1785268040}}
                 ]}
                """, MediaType.APPLICATION_JSON));
        expectUpTripUpdates("""
            {"header":{"incrementality":"FULL_DATASET","timestamp":1785268043},
             "entity":[{"id":"20260728-4322","trip_update":{
               "trip":{"trip_id":"20260728-4322","route_id":"UP","direction_id":0},
               "vehicle":{"id":"cab-4322","label":"UP - Union Station"},
               "stop_time_update":[
                 {"stop_id":"PA","departure":{"time":1785267800}},
                 {"stop_id":"WE","departure":{"time":1785268100}}
               ]}}]}
            """);

        RegionalTrainMarkerFeed feed = client.fetchUp();

        assertThat(feed.markers()).singleElement().satisfies(marker -> {
            assertThat(marker.lineId()).isEqualTo("regional-up");
            assertThat(marker.segmentId()).isEqualTo("segment-up-weston-pearson-airport");
            assertThat(marker.fromStationId()).isEqualTo("pearson-airport");
            assertThat(marker.nextStationId()).isEqualTo("weston");
            assertThat(marker.direction()).isEqualTo("Eastbound");
            assertThat(marker.travelDirection()).isEqualTo("reverse");
            assertThat(marker.tripId()).isEqualTo("20260728-4322");
            assertThat(marker.predictedAt()).isEqualTo(OffsetDateTime.parse("2026-07-28T19:48:20Z"));
            assertThat(marker.progress()).isEqualTo(0.8);
        });
        server.verify();
    }

    @Test
    void mapsDirectionZeroUpVehicleWestboundTowardPearsonAtMountDennis() {
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/UP/Gtfs/Feed/VehiclePosition?key=secret"))
            .andRespond(withSuccess("""
                {"header":{"incrementality":"FULL_DATASET","timestamp":1785268043},
                 "entity":[
                   {"id":"up-4323","vehicle":{"trip":{"trip_id":"4323","route_id":"UP","direction_id":0},
                     "vehicle":{"id":"cab-4323"},"current_status":"IN_TRANSIT_TO","stop_id":"MD","timestamp":1785268040}}
                 ]}
                """, MediaType.APPLICATION_JSON));
        expectUpTripUpdates("""
            {"header":{"incrementality":"FULL_DATASET","timestamp":1785268043},
             "entity":[{"id":"20260728-4323","trip_update":{
               "trip":{"trip_id":"20260728-4323","route_id":"UP","direction_id":0},
               "vehicle":{"id":"cab-4323","label":"UP - Pearson Airport"},
               "stop_time_update":[
                 {"stop_id":"BL","departure":{"time":1785267860}},
                 {"stop_id":"MD","departure":{"time":1785268160}}
               ]}}]}
            """);

        RegionalTrainMarkerFeed feed = client.fetchUp();

        assertThat(feed.markers()).singleElement().satisfies(marker -> {
            assertThat(marker.lineId()).isEqualTo("regional-up");
            assertThat(marker.segmentId()).isEqualTo("segment-up-bloor-mount-dennis");
            assertThat(marker.fromStationId()).isEqualTo("bloor");
            assertThat(marker.nextStationId()).isEqualTo("mount-dennis");
            assertThat(marker.direction()).isEqualTo("Westbound");
            assertThat(marker.travelDirection()).isEqualTo("forward");
            assertThat(marker.predictedAt()).isEqualTo(OffsetDateTime.parse("2026-07-28T19:49:20Z"));
            assertThat(marker.progress()).isEqualTo(0.6);
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
        expectUpTripUpdates("""
            {"header":{"incrementality":"FULL_DATASET","timestamp":1785268043},
             "entity":[{"id":"up-1","trip_update":{
               "trip":{"trip_id":"up-1","route_id":"UP","direction_id":0},
               "vehicle":{"label":"UP - Pearson Airport"},
               "stop_time_update":[{"stop_id":"PA","departure":{"time":1785268160}}]}}]}
            """);

        assertThat(client.fetchUp().markers()).isEmpty();
        server.verify();
    }

    @Test
    void usesMatchedTripUpdateDirectionWhenVehiclePositionDirectionIsMissing() {
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/UP/Gtfs/Feed/VehiclePosition?key=secret"))
            .andRespond(withSuccess("""
                {"header":{"incrementality":"FULL_DATASET","timestamp":1785268043},
                 "entity":[
                   {"id":"up-unknown","vehicle":{"trip":{"trip_id":"unknown","route_id":"UP"},
                     "current_status":"IN_TRANSIT_TO","stop_id":"MD","timestamp":1785268040}}
                 ]}
                """, MediaType.APPLICATION_JSON));
        expectUpTripUpdates("""
            {"header":{"incrementality":"FULL_DATASET","timestamp":1785268043},
             "entity":[{"id":"unknown","trip_update":{
               "trip":{"trip_id":"unknown","route_id":"UP","direction_id":0},
               "vehicle":{"label":"UP - Pearson Airport"},
               "stop_time_update":[
                 {"stop_id":"BL","departure":{"time":1785267860}},
                 {"stop_id":"MD","departure":{"time":1785268160}}
               ]}}]}
            """);

        assertThat(client.fetchUp().markers()).singleElement().satisfies(marker -> {
            assertThat(marker.direction()).isEqualTo("Westbound");
            assertThat(marker.fromStationId()).isEqualTo("bloor");
            assertThat(marker.nextStationId()).isEqualTo("mount-dennis");
        });
        server.verify();
    }

    @Test
    void dropsUpVehicleWhenTripUpdateDirectionEvidenceConflicts() {
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/UP/Gtfs/Feed/VehiclePosition?key=secret"))
            .andRespond(withSuccess("""
                {"header":{"incrementality":"FULL_DATASET","timestamp":1785268043},
                 "entity":[
                   {"id":"up-conflict","vehicle":{"trip":{"trip_id":"conflict","route_id":"UP","direction_id":1},
                     "current_status":"IN_TRANSIT_TO","stop_id":"WE","timestamp":1785268040}}
                 ]}
                """, MediaType.APPLICATION_JSON));
        expectUpTripUpdates("""
            {"header":{"incrementality":"FULL_DATASET","timestamp":1785268043},
             "entity":[{"id":"conflict","trip_update":{
               "trip":{"trip_id":"conflict","route_id":"UP","direction_id":1},
               "vehicle":{"label":"UP - Pearson Airport"},
               "stop_time_update":[
                 {"stop_id":"PA","departure":{"time":1785267800}},
                 {"stop_id":"WE","departure":{"time":1785268100}}
               ]}}]}
            """);

        assertThat(client.fetchUp().markers()).isEmpty();
        server.verify();
    }

    private static final String GO_VP_TO_WESTON = """
        {"header":{"incrementality":"FULL_DATASET","timestamp":1785268043},
         "entity":[{"id":"go-3775","vehicle":{"trip":{"trip_id":"3775","route_id":"KI","direction_id":0},
           "vehicle":{"id":"cab-3775"},"current_status":"IN_TRANSIT_TO","stop_id":"WE","timestamp":1785268040}}]}
        """;

    @Test
    void timesGoMarkerFromItsPredictedArrivalAtTheNextStation() {
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/Gtfs/Feed/VehiclePosition?key=secret"))
            .andRespond(withSuccess(GO_VP_TO_WESTON, MediaType.APPLICATION_JSON));
        // Left Etobicoke North 140 s ago, reaches Weston in 60 s (it departs later).
        expectGoTripUpdates("""
            {"header":{"incrementality":"FULL_DATASET","timestamp":1785268043},
             "entity":[{"id":"t-3775","trip_update":{"trip":{"trip_id":"3775","route_id":"KI"},
               "stop_time_update":[
                 {"stop_id":"ET","departure":{"time":1785267900}},
                 {"stop_id":"WE","arrival":{"time":1785268100},"departure":{"time":1785268160}}
               ]}}]}
            """);

        assertThat(client.fetchGo().markers()).singleElement().satisfies(marker -> {
            assertThat(marker.segmentId()).isEqualTo("segment-ki-weston-etobicoke-north");
            assertThat(marker.timed()).isTrue();
            assertThat(marker.moving()).isTrue();
            assertThat(marker.segmentTravelSeconds()).isEqualTo(200);
            assertThat(marker.predictedAt()).isEqualTo(OffsetDateTime.parse("2026-07-28T19:48:20Z"));
            assertThat(marker.progress()).isEqualTo(0.7);
        });
        server.verify();
    }

    @Test
    void holdsATrainThatHasNotLeftAtTheStationItIsLeaving() {
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/Gtfs/Feed/VehiclePosition?key=secret"))
            .andRespond(withSuccess(GO_VP_TO_WESTON, MediaType.APPLICATION_JSON));
        expectGoTripUpdates("""
            {"header":{"incrementality":"FULL_DATASET","timestamp":1785268043},
             "entity":[{"id":"t-3775","trip_update":{"trip":{"trip_id":"3775","route_id":"KI"},
               "stop_time_update":[
                 {"stop_id":"ET","departure":{"time":1785268300}},
                 {"stop_id":"WE","arrival":{"time":1785268500}}
               ]}}]}
            """);

        assertThat(client.fetchGo().markers()).singleElement().satisfies(marker -> {
            assertThat(marker.timed()).isTrue();
            assertThat(marker.progress()).isZero();
        });
        server.verify();
    }

    @Test
    void keepsAGoMarkerAtItsStatusPlacementWhenTripUpdatesAreUnavailable() {
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/Gtfs/Feed/VehiclePosition?key=secret"))
            .andRespond(withSuccess(GO_VP_TO_WESTON, MediaType.APPLICATION_JSON));
        server.expect(times(3), requestTo("https://api.example.test/OpenDataAPI/api/V1/Gtfs/Feed/TripUpdates?key=secret"))
            .andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));

        assertThat(client.fetchGo().markers()).singleElement().satisfies(marker -> {
            assertThat(marker.timed()).isFalse();
            assertThat(marker.progress()).isEqualTo(0.5);
        });
        server.verify();
    }

    @Test
    void keepsAnUpTrainStoppedAtAStationWhoseStopHasLeftTheTripUpdate() {
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/UP/Gtfs/Feed/VehiclePosition?key=secret"))
            .andRespond(withSuccess("""
                {"header":{"incrementality":"FULL_DATASET","timestamp":1785268043},
                 "entity":[{"id":"up-4322","vehicle":{"trip":{"trip_id":"4322","route_id":"UP"},
                   "vehicle":{"id":"cab-4322"},"current_status":"STOPPED_AT","stop_id":"WE","timestamp":1785268040}}]}
                """, MediaType.APPLICATION_JSON));
        expectUpTripUpdates("""
            {"header":{"incrementality":"FULL_DATASET","timestamp":1785268043},
             "entity":[{"id":"20260728-4322","trip_update":{
               "trip":{"trip_id":"20260728-4322","route_id":"UP"},
               "vehicle":{"id":"cab-4322","label":"UP - Union Station"},
               "stop_time_update":[
                 {"stop_id":"MD","arrival":{"time":1785268300}},
                 {"stop_id":"UN","arrival":{"time":1785268900}}
               ]}}]}
            """);

        assertThat(client.fetchUp().markers()).singleElement().satisfies(marker -> {
            assertThat(marker.nextStationId()).isEqualTo("weston");
            assertThat(marker.moving()).isFalse();
            assertThat(marker.progress()).isEqualTo(0.98);
        });
        server.verify();
    }

    @Test
    void showsAnUpTrainWaitingAtUnionAtThePlatformInsteadOfDropping() {
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/UP/Gtfs/Feed/VehiclePosition?key=secret"))
            .andRespond(withSuccess("""
                {"header":{"incrementality":"FULL_DATASET","timestamp":1785268043},
                 "entity":[{"id":"up-4401","vehicle":{"trip":{"trip_id":"4401","route_id":"UP"},
                   "vehicle":{"id":"cab-4401"},"current_status":"STOPPED_AT","stop_id":"UN","timestamp":1785268040}}]}
                """, MediaType.APPLICATION_JSON));
        expectUpTripUpdates("""
            {"header":{"incrementality":"FULL_DATASET","timestamp":1785268043},
             "entity":[{"id":"20260728-4401","trip_update":{
               "trip":{"trip_id":"20260728-4401","route_id":"UP"},
               "vehicle":{"id":"cab-4401","label":"UP - Pearson Airport"},
               "stop_time_update":[
                 {"stop_id":"UN","departure":{"time":1785268200}},
                 {"stop_id":"BL","arrival":{"time":1785268500}}
               ]}}]}
            """);

        assertThat(client.fetchUp().markers()).singleElement().satisfies(marker -> {
            assertThat(marker.segmentId()).isEqualTo("segment-up-union-bloor");
            assertThat(marker.fromStationId()).isEqualTo("union");
            assertThat(marker.nextStationId()).isEqualTo("bloor");
            assertThat(marker.direction()).isEqualTo("Westbound");
            assertThat(marker.moving()).isFalse();
            assertThat(marker.progress()).isZero();
        });
        server.verify();
    }

    @Test
    void stationArrivalsAndMarkersShareOneUpTripUpdateSnapshot() {
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/UP/Gtfs/Feed/VehiclePosition?key=secret"))
            .andRespond(withSuccess("""
                {"header":{"incrementality":"FULL_DATASET","timestamp":1785268043},
                 "entity":[{"id":"up-4322","vehicle":{"trip":{"trip_id":"4322","route_id":"UP"},
                   "vehicle":{"id":"cab-4322"},"current_status":"IN_TRANSIT_TO","stop_id":"WE","timestamp":1785268040}}]}
                """, MediaType.APPLICATION_JSON));
        server.expect(once(), requestTo("https://api.example.test/OpenDataAPI/api/V1/UP/Gtfs/Feed/TripUpdates?key=secret"))
            .andRespond(withSuccess("""
                {"header":{"incrementality":"FULL_DATASET","timestamp":1785268043},
                 "entity":[{"id":"20260728-4322","trip_update":{
                   "trip":{"trip_id":"20260728-4322","route_id":"UP"},
                   "vehicle":{"id":"cab-4322","label":"UP - Union Station"},
                   "stop_time_update":[
                     {"stop_id":"PA","departure":{"time":1785267800}},
                     {"stop_id":"WE","arrival":{"time":1785268090},"departure":{"time":1785268100}}
                   ]}}]}
                """, MediaType.APPLICATION_JSON));
        MetrolinxArrivalClient arrivals = new MetrolinxArrivalClient(fetcher, snapshots);

        RegionalTrainMarkerRecord marker = client.fetchUp().markers().getFirst();
        RegionalArrivalFeed westonArrivals = arrivals.fetchUpTripUpdates("WE");

        // The marker heads for the station's arrival; the tile shows its departure.
        assertThat(marker.predictedAt()).isEqualTo(OffsetDateTime.parse("2026-07-28T19:48:10Z"));
        assertThat(westonArrivals.arrivals()).singleElement()
            .satisfies(arrival -> assertThat(arrival.predictedAt()).isEqualTo(OffsetDateTime.parse("2026-07-28T19:48:20Z")));
        server.verify();
    }

    @Test
    void retriesAFailedFeedRequestAndReportsOnlyASafeReason() {
        server.expect(times(3), requestTo("https://api.example.test/OpenDataAPI/api/V1/UP/Gtfs/Feed/VehiclePosition?key=secret"))
            .andRespond(withStatus(HttpStatus.BAD_GATEWAY));

        assertThatThrownBy(() -> client.fetchUp())
            .isInstanceOf(MetrolinxClientException.class)
            .hasMessageContaining("HTTP 502")
            .hasMessageNotContaining("secret")
            .hasMessageNotContaining("api.example.test");
        server.verify();
    }

    @Test
    void retriesTheGatewaysIntermittentUnauthorizedResponse() {
        // Metrolinx rejects about one request in three with a fast 401 for a
        // valid key; the next attempt goes through.
        server.expect(once(), requestTo("https://api.example.test/OpenDataAPI/api/V1/Gtfs/Feed/VehiclePosition?key=secret"))
            .andRespond(withStatus(HttpStatus.UNAUTHORIZED));
        server.expect(once(), requestTo("https://api.example.test/OpenDataAPI/api/V1/Gtfs/Feed/VehiclePosition?key=secret"))
            .andRespond(withSuccess(GO_VP_TO_WESTON, MediaType.APPLICATION_JSON));
        expectGoTripUpdates(EMPTY_TRIP_UPDATES);

        assertThat(client.fetchGo().markers()).hasSize(1);
        server.verify();
    }

    @Test
    void servesTheLastGoodTripUpdateSnapshotThroughABriefFailure() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer local = MockRestServiceServer.bindTo(builder).build();
        MetrolinxProperties properties = new MetrolinxProperties();
        properties.setBaseUrl(URI.create("https://api.example.test/OpenDataAPI/"));
        properties.setApiKey("secret");
        properties.setFetchRetryDelay(Duration.ZERO);
        Instant[] now = { Instant.ofEpochSecond(1785268043) };
        Clock clock = new Clock() {
            @Override public ZoneOffset getZone() { return ZoneOffset.UTC; }
            @Override public Clock withZone(java.time.ZoneId zone) { return this; }
            @Override public Instant instant() { return now[0]; }
        };
        var fetcher = new MetrolinxFeedFetcher(builder.build(), JsonMapper.builder().findAndAddModules().build(), properties, clock);
        var shared = new MetrolinxTripUpdateSnapshots(fetcher, new MetrolinxUpTripUpdateParser(), clock);
        String url = "https://api.example.test/OpenDataAPI/api/V1/UP/Gtfs/Feed/TripUpdates?key=secret";
        local.expect(once(), requestTo(url)).andRespond(withSuccess("""
            {"header":{"incrementality":"FULL_DATASET","timestamp":1785268043},"entity":[]}
            """, MediaType.APPLICATION_JSON));
        // Two failed refreshes (three attempts each).
        local.expect(times(6), requestTo(url)).andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));

        UpTripUpdateFeed first = shared.up();
        now[0] = now[0].plusSeconds(5);
        assertThat(shared.up()).isSameAs(first);   // still cached, no request
        now[0] = now[0].plusSeconds(10);
        assertThat(shared.up()).isSameAs(first);   // fetch failed: last good, 15 s old
        now[0] = now[0].plusSeconds(150);
        assertThatThrownBy(shared::up).isInstanceOf(MetrolinxClientException.class); // too old to serve
        local.verify();
    }

    private static final String EMPTY_TRIP_UPDATES = """
        {"header":{"incrementality":"FULL_DATASET","timestamp":1785268043},"entity":[]}
        """;

    private void expectGoTripUpdates(String body) {
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/Gtfs/Feed/TripUpdates?key=secret"))
            .andRespond(withSuccess(body, MediaType.APPLICATION_JSON));
    }

    private void expectUpTripUpdates(String body) {
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/UP/Gtfs/Feed/TripUpdates?key=secret"))
            .andRespond(withSuccess(body, MediaType.APPLICATION_JSON));
    }
}
