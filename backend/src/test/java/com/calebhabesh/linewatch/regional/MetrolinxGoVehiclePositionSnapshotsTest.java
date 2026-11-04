package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.ExpectedCount.times;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class MetrolinxGoVehiclePositionSnapshotsTest {
    private static final String URL = "https://api.example.test/OpenDataAPI/api/V1/Gtfs/Feed/VehiclePosition?key=secret";
    private static final String FEED = """
        {"header":{"incrementality":"FULL_DATASET","timestamp":1793750000},"entity":[]}
        """;

    private final Instant[] now = {Instant.ofEpochSecond(1793750000)};
    private final Clock clock = new Clock() {
        @Override public ZoneOffset getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now[0]; }
    };

    private MetrolinxGoVehiclePositionSnapshots snapshots(RestClient.Builder builder) {
        MetrolinxProperties properties = new MetrolinxProperties();
        properties.setBaseUrl(URI.create("https://api.example.test/OpenDataAPI/"));
        properties.setApiKey("secret");
        properties.setFetchRetryDelay(Duration.ZERO);
        var fetcher = new MetrolinxFeedFetcher(builder.build(), JsonMapper.builder().findAndAddModules().build(),
            properties, clock);
        return new MetrolinxGoVehiclePositionSnapshots(fetcher, clock);
    }

    @Test
    void oneReadServesEveryCallerWithinTheCachePeriod() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(once(), requestTo(URL)).andRespond(withSuccess(FEED, MediaType.APPLICATION_JSON));
        var shared = snapshots(builder);

        JsonNode first = shared.go();
        now[0] = now[0].plusSeconds(9);
        assertThat(shared.go()).isSameAs(first);
        server.verify();
    }

    @Test
    void aFailedReadKeepsTheLastGoodReadWhileItIsRecent() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(once(), requestTo(URL)).andRespond(withSuccess(FEED, MediaType.APPLICATION_JSON));
        // Two failed refreshes, three attempts each.
        server.expect(times(6), requestTo(URL)).andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));
        var shared = snapshots(builder);

        JsonNode first = shared.go();
        now[0] = now[0].plusSeconds(15);
        assertThat(shared.go()).isSameAs(first);
        now[0] = now[0].plusSeconds(5);
        assertThat(shared.go()).isSameAs(first);   // still in the retry wait: no request
        now[0] = now[0].plusSeconds(150);
        assertThatThrownBy(shared::go).isInstanceOf(MetrolinxClientException.class);
        server.verify();
    }

    @Test
    void trainMarkersAndGoBusPositionsShareOneRead() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).ignoreExpectOrder(true).build();
        server.expect(once(), requestTo(URL)).andRespond(withSuccess("""
            {"header":{"incrementality":"FULL_DATASET","timestamp":1793750000},"entity":[
             {"id":"b","vehicle":{"trip":{"trip_id":"20261103-41-1","route_id":"09261126-41",
               "start_time":"00:00:00","start_date":"20261103"},"vehicle":{"id":"2551","label":"41 - Hamilton GO"},
               "position":{"latitude":43.26,"longitude":-79.87},"stop_id":"01007","timestamp":1793749990}}]}
            """, MediaType.APPLICATION_JSON));
        server.expect(once(), requestTo("https://api.example.test/OpenDataAPI/api/V1/Gtfs/Feed/TripUpdates?key=secret"))
            .andRespond(withSuccess(FEED, MediaType.APPLICATION_JSON));
        var shared = snapshots(builder);
        var fetcher = new MetrolinxFeedFetcher(RestClient.builder().build(), JsonMapper.builder().build(),
            new MetrolinxProperties(), clock);
        var trains = new MetrolinxVehiclePositionClient(fetcher, shared,
            new MetrolinxTripUpdateSnapshots(snapshotFetcher(builder), new MetrolinxUpTripUpdateParser(), clock),
            RegionalLinkTravelTimes.NONE);
        var busProperties = new com.calebhabesh.linewatch.gobusposition.GoBusPositionProperties();
        busProperties.setEnabled(true);
        var buses = new com.calebhabesh.linewatch.gobusposition.GoBusPositionService(busProperties, shared,
            new com.calebhabesh.linewatch.gobusposition.GoBusPositionIndexer(), clock);

        assertThat(trains.fetchGo().markers()).isEmpty();   // the bus is not a train
        assertThat(buses.positions(null).vehicles()).singleElement()
            .satisfies(bus -> assertThat(bus.vehicleId()).isEqualTo("2551"));
        server.verify();
    }

    private MetrolinxFeedFetcher snapshotFetcher(RestClient.Builder builder) {
        MetrolinxProperties properties = new MetrolinxProperties();
        properties.setBaseUrl(URI.create("https://api.example.test/OpenDataAPI/"));
        properties.setApiKey("secret");
        properties.setFetchRetryDelay(Duration.ZERO);
        return new MetrolinxFeedFetcher(builder.build(), JsonMapper.builder().findAndAddModules().build(), properties, clock);
    }
}
