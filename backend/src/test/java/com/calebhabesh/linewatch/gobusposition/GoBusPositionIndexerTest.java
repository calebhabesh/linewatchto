package com.calebhabesh.linewatch.gobusposition;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class GoBusPositionIndexerTest {
    static final String FEED = """
        {"header":{"incrementality":"FULL_DATASET","timestamp":1793736000},
         "entity":[
          {"id":"20261103-41-41481","vehicle":{
            "trip":{"trip_id":"20261103-41-41481","route_id":"09261126-41","direction_id":1,
                    "start_time":"14:25:00","start_date":"20261103"},
            "vehicle":{"id":"2551","label":"41 - Hamilton GO"},
            "position":{"latitude":43.2565651,"longitude":-79.8746643,"bearing":0.0,"speed":0.0},
            "stop_id":"01007","current_status":"INCOMING_AT","timestamp":1793735980}},
          {"id":"train","vehicle":{
            "trip":{"trip_id":"20261103-LW-1234","route_id":"09261126-LW"},
            "vehicle":{"id":"0600"},
            "position":{"latitude":43.64,"longitude":-79.38},
            "stop_id":"UN","timestamp":1793735990}},
          {"id":"no-trip","vehicle":{"trip":{"route_id":"09261126-27"},
            "position":{"latitude":43.7,"longitude":-79.5},"timestamp":1793735990}},
          {"id":"no-position","vehicle":{"trip":{"trip_id":"t2","route_id":"09261126-27"},
            "position":{"latitude":0,"longitude":0},"timestamp":1793735990}},
          {"id":"no-time","vehicle":{"trip":{"trip_id":"t3","route_id":"09261126-27"},
            "position":{"latitude":43.7,"longitude":-79.5}}}
         ]}
        """;

    @Test
    void keepsGoBusesAndLeavesTrainsToTheTrainMarkers() {
        GoBusPositionSnapshot snapshot = new GoBusPositionIndexer().index(JsonMapper.builder().build().readTree(FEED));

        assertThat(snapshot.sourceUpdatedAt()).isEqualTo(OffsetDateTime.parse("2026-11-03T20:00:00Z"));
        assertThat(snapshot.buses()).singleElement().satisfies(bus -> {
            assertThat(bus.vehicleId()).isEqualTo("2551");
            assertThat(bus.tripId()).isEqualTo("20261103-41-41481");
            assertThat(bus.route()).isEqualTo("41");
            assertThat(bus.destination()).isEqualTo("Hamilton GO");
            assertThat(bus.nextStopCode()).isEqualTo("01007");
            assertThat(bus.reportedAt()).isEqualTo(OffsetDateTime.parse("2026-11-03T19:59:40Z"));
            // 14:25 Toronto (EST) on Nov 3.
            assertThat(bus.startsAt()).isEqualTo(OffsetDateTime.parse("2026-11-03T19:25:00Z"));
        });
        assertThat(snapshot.omitted()).isEqualTo(new GoBusPositionSnapshot.Omitted(1, 1, 1));
    }

    @Test
    void readsRouteNumbersAndNotRailCodes() {
        assertThat(GoBusPositionIndexer.busRoute("09261126-41")).isEqualTo("41");
        assertThat(GoBusPositionIndexer.busRoute("09261126-96B")).isEqualTo("96B");
        assertThat(GoBusPositionIndexer.busRoute("09261126-LE")).isNull();
        assertThat(GoBusPositionIndexer.busRoute("")).isNull();
    }

    @Test
    void tripTimesPastMidnightCountFromTheServiceDate() {
        // 25:10 on the Nov 3 service is 1:10 AM Nov 4 in Toronto.
        assertThat(GoBusPositionIndexer.scheduledStart("20261103", "25:10:00"))
            .isEqualTo(OffsetDateTime.parse("2026-11-04T06:10:00Z"));
        assertThat(GoBusPositionIndexer.scheduledStart("", "10:00:00")).isNull();
        assertThat(GoBusPositionIndexer.scheduledStart("20261103", "")).isNull();
    }

    @Test
    void destinationComesFromTheVehicleLabel() {
        assertThat(GoBusPositionIndexer.destination("56 - DC Oshawa GO", "56")).isEqualTo("DC Oshawa GO");
        assertThat(GoBusPositionIndexer.destination("Union Station", "56")).isEqualTo("Union Station");
        assertThat(GoBusPositionIndexer.destination("", "56")).isNull();
    }
}
