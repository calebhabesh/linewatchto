package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class MetrolinxArrivalClientTest {
    private static final String KEY = "test-secret-key";
    private MockRestServiceServer server;
    private MetrolinxArrivalClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        MetrolinxProperties properties = new MetrolinxProperties();
        properties.setBaseUrl(URI.create("https://api.example.test/OpenDataAPI/"));
        properties.setApiKey(KEY);
        client = new MetrolinxArrivalClient(
            builder.build(),
            new ObjectMapper().findAndRegisterModules(),
            properties,
            new MetrolinxUpTripUpdateParser()
        );
    }

    @Test
    void normalizesTrainOnlyGoNextServiceRows() {
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/Stop/NextService/UN?key=" + KEY))
            .andRespond(withSuccess("""
                {"Metadata":{"TimeStamp":"2026-07-28 15:47:43","ErrorCode":"200","ErrorMessage":"OK"},
                 "NextService":{"Lines":[
                   {"StopCode":"UN","LineCode":"GT","LineName":"Kitchener","ServiceType":"T",
                    "DirectionName":"GT - Kitchener GO","ScheduledDepartureTime":"2026-07-28 16:22:00",
                    "ComputedDepartureTime":"2026-07-28 16:25:00","ScheduledPlatform":"9","ActualPlatform":"11",
                    "TripNumber":"3775","UpdateTime":"2026-07-28 15:46:40"},
                   {"StopCode":"UN","LineCode":"31","LineName":"Georgetown","ServiceType":"B",
                    "DirectionName":"31 - Guelph","ComputedDepartureTime":"2026-07-28 16:10:00"}
                 ]}}
                """, MediaType.APPLICATION_JSON));

        RegionalArrivalFeed feed = client.fetchGoNextService("UN");

        assertThat(feed.sourceUpdatedAt()).isEqualTo(OffsetDateTime.parse("2026-07-28T15:47:43-04:00"));
        assertThat(feed.arrivals()).singleElement().satisfies(arrival -> {
            assertThat(arrival.lineId()).isEqualTo("regional-ki");
            assertThat(arrival.direction()).isEqualTo("Kitchener GO");
            assertThat(arrival.platform()).isEqualTo("11");
            assertThat(arrival.tripNumber()).isEqualTo("3775");
        });
        server.verify();
    }

    @Test
    void normalizesCoachCountsForUnambiguousInServiceTrips() {
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/ServiceataGlance/Trains/All?key=" + KEY))
            .andRespond(withSuccess("""
                {"Metadata":{"TimeStamp":"2026-07-28 15:47:43","ErrorCode":"200","ErrorMessage":"OK"},
                 "Trips":{"Trip":[
                   {"Cars":"12","TripNumber":"3775"},
                   {"Cars":"6","TripNumber":"6313"},
                   {"Cars":"unknown","TripNumber":"6315"},
                   {"Cars":"10","TripNumber":"6919"},
                   {"Cars":"12","TripNumber":"6919"}
                 ]}}
                """, MediaType.APPLICATION_JSON));

        GoTrainCoachCountFeed feed = client.fetchGoTrainCoachCounts();

        assertThat(feed.sourceUpdatedAt()).isEqualTo(OffsetDateTime.parse("2026-07-28T15:47:43-04:00"));
        assertThat(feed.coachCountsByTripNumber()).containsExactlyInAnyOrderEntriesOf(
            java.util.Map.of("3775", 12, "6313", 6)
        );
        server.verify();
    }

    @Test
    void normalizesGoBusRowsWithOptionalPublishedBayAndScheduledFallback() {
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/Stop/NextService/BE?key=" + KEY))
            .andRespond(withSuccess("""
                {"Metadata":{"TimeStamp":"2026-07-28 15:47:43","ErrorCode":"200"},
                 "NextService":{"Lines":[
                   {"StopCode":"BE","LineCode":"30","LineName":"Bramalea / Kitchener","ServiceType":"B",
                    "DirectionName":"30 - Kitchener GO","ScheduledDepartureTime":"2026-07-28 16:10:00",
                    "ComputedDepartureTime":"2026-07-28 16:12:00","ScheduledPlatform":"4","ActualPlatform":"5",
                    "TripNumber":"3001"},
                   {"StopCode":"BE","LineCode":"31","LineName":"Georgetown","ServiceType":"B",
                    "DirectionName":"31 - Guelph","ScheduledDepartureTime":"2026-07-28 16:20:00"},
                   {"StopCode":"BE","LineCode":"KI","ServiceType":"T",
                    "DirectionName":"KI - Kitchener","ComputedDepartureTime":"2026-07-28 16:30:00"}
                 ]}}
                """, MediaType.APPLICATION_JSON));

        var feed = client.fetchGoBusNextService("bramalea", "BE");

        assertThat(feed.arrivals()).hasSize(2);
        assertThat(feed.arrivals().getFirst()).satisfies(arrival -> {
            assertThat(arrival.stationId()).isEqualTo("bramalea");
            assertThat(arrival.route()).isEqualTo("30");
            assertThat(arrival.destination()).isEqualTo("Kitchener GO");
            assertThat(arrival.bayPlatform()).isEqualTo("5");
            assertThat(arrival.status()).isEqualTo("live");
        });
        assertThat(feed.arrivals().getLast()).satisfies(arrival -> {
            assertThat(arrival.route()).isEqualTo("31");
            assertThat(arrival.status()).isEqualTo("scheduled");
            assertThat(arrival.bayPlatform()).isEmpty();
        });
        server.verify();
    }

    @Test
    void normalizesUpGtfsRealtimeDeparturesForRequestedStop() {
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/UP/Gtfs/Feed/TripUpdates?key=" + KEY))
            .andRespond(withSuccess("""
                {"header":{"gtfs_realtime_version":"2.0","incrementality":"FULL_DATASET","timestamp":1785268043},
                 "entity":[{"id":"20260728-4323","trip_update":{
                   "trip":{"trip_id":"20260728-4323","route_id":"UP","direction_id":0},
                   "vehicle":{"label":"UP - Pearson Airport"},
                   "stop_time_update":[
                     {"stop_id":"BL","departure":{"delay":58,"time":1785268438}},
                     {"stop_id":"PA","departure":{"delay":58,"time":1785269638}}
                   ]}}]}
                """, MediaType.APPLICATION_JSON));

        RegionalArrivalFeed feed = client.fetchUpTripUpdates("BL");

        assertThat(feed.sourceUpdatedAt()).isEqualTo(OffsetDateTime.parse("2026-07-28T19:47:23Z"));
        assertThat(feed.arrivals()).singleElement().satisfies(arrival -> {
            assertThat(arrival.lineId()).isEqualTo("regional-up");
            assertThat(arrival.direction()).isEqualTo("Pearson Airport");
            assertThat(arrival.tripNumber()).isEqualTo("20260728-4323");
            assertThat(arrival.predictedAt()).isEqualTo(OffsetDateTime.parse("2026-07-28T19:53:58Z"));
            assertThat(arrival.scheduledAt()).isEqualTo(OffsetDateTime.parse("2026-07-28T19:53:00Z"));
        });
        server.verify();
    }

    @Test
    void derivesUnionDestinationFromUpDirectionOneWhenVehicleLabelIsMissing() {
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/UP/Gtfs/Feed/TripUpdates?key=" + KEY))
            .andRespond(withSuccess("""
                {"header":{"gtfs_realtime_version":"2.0","incrementality":"FULL_DATASET","timestamp":1785268043},
                 "entity":[{"id":"20260728-4322","trip_update":{
                   "trip":{"trip_id":"20260728-4322","route_id":"UP","direction_id":1},
                   "stop_time_update":[
                     {"stop_id":"PA","departure":{"delay":0,"time":1785268438}}
                   ]}}]}
                """, MediaType.APPLICATION_JSON));

        RegionalArrivalFeed feed = client.fetchUpTripUpdates("PA");

        assertThat(feed.arrivals()).singleElement().satisfies(arrival ->
            assertThat(arrival.direction()).isEqualTo("Union Station")
        );
        server.verify();
    }

    @Test
    void handlesNoContentForTrainNextServiceGracefully() {
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/Stop/NextService/AD?key=" + KEY))
            .andRespond(withSuccess("""
                {"Metadata":{"TimeStamp":"2026-08-18 19:46:51","ErrorCode":"204","ErrorMessage":"No Content"},
                 "NextService":null}
                """, MediaType.APPLICATION_JSON));

        RegionalArrivalFeed feed = client.fetchGoNextService("AD");

        assertThat(feed.sourceUpdatedAt()).isEqualTo(OffsetDateTime.parse("2026-08-18T19:46:51-04:00"));
        assertThat(feed.arrivals()).isEmpty();
        server.verify();
    }

    @Test
    void resolvesMultipleStationBusStopCodesAndToleratesNoContent() {
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/Stop/NextService/08049?key=" + KEY))
            .andRespond(withSuccess("""
                {"Metadata":{"TimeStamp":"2026-08-18 19:47:04","ErrorCode":"200","ErrorMessage":"OK"},
                 "NextService":{"Lines":[
                   {"StopCode":"08049","LineCode":"68","LineName":"Barrie / Newmarket","ServiceType":"B",
                    "DirectionName":"68F - Hwy. 407 Bus Term","ScheduledDepartureTime":"2026-08-18 20:55:00",
                    "ComputedDepartureTime":"2026-08-18 20:55:00","ScheduledPlatform":"7","ActualPlatform":"",
                    "TripNumber":"68852"}
                 ]}}
                """, MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://api.example.test/OpenDataAPI/api/V1/Stop/NextService/AD?key=" + KEY))
            .andRespond(withSuccess("""
                {"Metadata":{"TimeStamp":"2026-08-18 19:46:51","ErrorCode":"204","ErrorMessage":"No Content"},
                 "NextService":null}
                """, MediaType.APPLICATION_JSON));

        var feed = client.fetchGoBusNextService("allandale-waterfront", List.of("08049", "AD"));

        assertThat(feed.sourceUpdatedAt()).isEqualTo(OffsetDateTime.parse("2026-08-18T19:47:04-04:00"));
        assertThat(feed.arrivals()).singleElement().satisfies(arrival -> {
            assertThat(arrival.stationId()).isEqualTo("allandale-waterfront");
            assertThat(arrival.route()).isEqualTo("68");
            assertThat(arrival.destination()).isEqualTo("Hwy. 407 Bus Term");
            assertThat(arrival.bayPlatform()).isEqualTo("7");
            assertThat(arrival.status()).isEqualTo("live");
        });
        server.verify();
    }
}
