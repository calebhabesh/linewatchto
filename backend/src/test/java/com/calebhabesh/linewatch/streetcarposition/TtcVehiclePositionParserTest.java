package com.calebhabesh.linewatch.streetcarposition;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;

class TtcVehiclePositionParserTest {
    private final TtcVehiclePositionParser parser = new TtcVehiclePositionParser();

    static final String FEED = """
        header {
          gtfs_realtime_version: "2.0"
          incrementality: FULL_DATASET
          timestamp: 1793656593
        }
        entity {
          id: "1"
          vehicle {
            trip {
              trip_id: "trip-504"
              schedule_relationship: SCHEDULED
              route_id: "504"
            }
            position {
              latitude: 43.6445
              longitude: -79.3990
              bearing: 73.0
              speed: 4.5
            }
            current_stop_sequence: 12
            current_status: INCOMING_AT
            timestamp: 1793656566
            stop_id: "s-spadina"
            vehicle {
              id: "4508"
            }
            occupancy_status: FEW_SEATS_AVAILABLE
          }
        }
        entity {
          id: "2"
          vehicle {
            position {
              latitude: 43.66
              longitude: -79.35
            }
            timestamp: 1793656500
            vehicle {
              id: "4520"
            }
          }
        }
        """;

    @Test
    void readsPositionTripStopAndVehicleNumberFromTheTextFeed() {
        TtcVehiclePositionParser.Feed feed = parser.parse(FEED);

        assertThat(feed.sourceUpdatedAt()).isEqualTo(OffsetDateTime.parse("2026-11-02T21:56:33Z"));
        assertThat(feed.vehicles()).hasSize(2);
        assertThat(feed.vehicles().getFirst()).satisfies(vehicle -> {
            assertThat(vehicle.vehicleId()).isEqualTo("4508");
            assertThat(vehicle.tripId()).isEqualTo("trip-504");
            assertThat(vehicle.routeId()).isEqualTo("504");
            assertThat(vehicle.latitude()).isEqualTo(43.6445);
            assertThat(vehicle.longitude()).isEqualTo(-79.399);
            assertThat(vehicle.bearing()).isEqualTo(73.0);
            assertThat(vehicle.reportedAt()).isEqualTo(OffsetDateTime.parse("2026-11-02T21:56:06Z"));
            assertThat(vehicle.stopId()).isEqualTo("s-spadina");
            assertThat(vehicle.currentStatus()).isEqualTo("INCOMING_AT");
        });
        // A yard move: no trip, so nothing says what it is.
        assertThat(feed.vehicles().get(1)).satisfies(vehicle -> {
            assertThat(vehicle.tripId()).isNull();
            assertThat(vehicle.bearing()).isNull();
            assertThat(vehicle.vehicleId()).isEqualTo("4520");
        });
    }

    @Test
    void rejectsFeedsWithoutAHeaderTimestampOrCutShort() {
        assertThatThrownBy(() -> parser.parse("entity {\n  id: \"1\"\n}\n"))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> parser.parse(FEED.substring(0, FEED.length() - 4)))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> parser.parse(""))
            .isInstanceOf(IllegalArgumentException.class);
    }
}
