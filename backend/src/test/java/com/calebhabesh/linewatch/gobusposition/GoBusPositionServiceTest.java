package com.calebhabesh.linewatch.gobusposition;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.regional.MetrolinxClientException;
import com.calebhabesh.linewatch.regional.MetrolinxGoVehiclePositionSnapshots;
import com.calebhabesh.linewatch.streetcarposition.BusPositionResponses.Bounds;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class GoBusPositionServiceTest {
    // Feed at 15:00 Toronto (20:00Z); service clock moved per test.
    private static final long FEED_AT = 1793736000;

    private final Instant[] now = {Instant.ofEpochSecond(FEED_AT + 5)};
    private final Clock clock = new Clock() {
        @Override public ZoneOffset getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now[0]; }
    };
    private final MetrolinxGoVehiclePositionSnapshots feeds = mock(MetrolinxGoVehiclePositionSnapshots.class);
    private final GoBusPositionIndexer indexer = org.mockito.Mockito.spy(new GoBusPositionIndexer());
    private GoBusPositionProperties properties;
    private GoBusPositionService service;

    @BeforeEach
    void setUp() {
        properties = new GoBusPositionProperties();
        properties.setEnabled(true);
        service = new GoBusPositionService(properties, feeds, indexer, clock);
    }

    private static JsonNode feed(String entities) {
        return JsonMapper.builder().build().readTree("""
            {"header":{"incrementality":"FULL_DATASET","timestamp":%d},"entity":[%s]}
            """.formatted(FEED_AT, entities));
    }

    private static String bus(String vehicleId, String route, double lat, double lon, long reportedAt, String startTime) {
        return """
            {"id":"%1$s","vehicle":{"trip":{"trip_id":"20261103-%2$s-%1$s","route_id":"09261126-%2$s",
              "start_time":"%6$s","start_date":"20261103"},
              "vehicle":{"id":"%1$s","label":"%2$s - Union Station Bus Terminal"},
              "position":{"latitude":%3$s,"longitude":%4$s,"bearing":0.0},
              "stop_id":"02300","timestamp":%5$d}}
            """.formatted(vehicleId, route, lat, lon, reportedAt, startTime);
    }

    @Test
    void disabledReadsNothing() {
        properties.setEnabled(false);

        assertThat(service.positions(null).state()).isEqualTo("disabled");
        verify(feeds, never()).go();
    }

    @Test
    void servesBusesOnStartedTripsWithTheirAgeAndStaleState() {
        when(feeds.go()).thenReturn(feed(String.join(",",
            bus("2551", "41", 43.65, -79.38, FEED_AT - 20, "14:30:00"),
            bus("2552", "41", 43.65, -79.38, FEED_AT - 400, "14:00:00"),     // 405 s: stale
            bus("2553", "41", 43.65, -79.38, FEED_AT - 1000, "13:00:00"),    // over 15 min: dropped
            bus("2554", "56", 43.65, -79.38, FEED_AT - 30, "15:25:00")))); // not started: hidden

        var response = service.positions(null);

        assertThat(response.state()).isEqualTo("live");
        assertThat(response.networkId()).isEqualTo("regional");
        assertThat(response.vehicleStaleAfterSeconds()).isEqualTo(300);
        assertThat(response.vehicleMaxAgeSeconds()).isEqualTo(900);
        assertThat(response.vehicles()).extracting(GoBusPositionResponses.Vehicle::vehicleId)
            .containsExactly("2551", "2552");
        assertThat(response.vehicles().get(0).ageSeconds()).isEqualTo(25);
        assertThat(response.vehicles().get(0).stale()).isFalse();
        assertThat(response.vehicles().get(0).destination()).isEqualTo("Union Station Bus Terminal");
        assertThat(response.vehicles().get(0).nextStopCode()).isEqualTo("02300");
        assertThat(response.vehicles().get(1).stale()).isTrue();
    }

    @Test
    void keepsOnlyBusesInTheRequestedArea() {
        when(feeds.go()).thenReturn(feed(String.join(",",
            bus("2551", "41", 43.65, -79.38, FEED_AT - 20, "14:30:00"),
            bus("2560", "41", 43.25, -79.87, FEED_AT - 20, "14:30:00"))));

        assertThat(service.positions(new Bounds(-79.5, 43.6, -79.3, 43.7)).vehicles())
            .extracting(GoBusPositionResponses.Vehicle::vehicleId).containsExactly("2551");
    }

    @Test
    void anOldFeedMarksEveryBusStale() {
        when(feeds.go()).thenReturn(feed(bus("2551", "41", 43.65, -79.38, FEED_AT - 20, "14:30:00")));
        now[0] = Instant.ofEpochSecond(FEED_AT + 150);

        var response = service.positions(null);

        assertThat(response.state()).isEqualTo("stale");
        assertThat(response.vehicles()).singleElement().satisfies(bus -> assertThat(bus.stale()).isTrue());
    }

    @Test
    void aFailedReadIsUnavailable() {
        when(feeds.go()).thenThrow(new MetrolinxClientException("Unable to fetch (HTTP 503)"));

        var response = service.positions(null);

        assertThat(response.state()).isEqualTo("unavailable");
        assertThat(response.vehicles()).isEmpty();
    }

    @Test
    void indexesEachSharedReadOnce() {
        JsonNode read = feed(bus("2551", "41", 43.65, -79.38, FEED_AT - 20, "14:30:00"));
        when(feeds.go()).thenReturn(read);

        service.positions(null);
        service.positions(new Bounds(-79.5, 43.6, -79.3, 43.7));

        verify(indexer, times(1)).index(read);
    }
}
