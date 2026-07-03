package com.calebhabesh.linewatch.arrival.live;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.groups.Tuple.tuple;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class GtfsRtSubwayTripUpdateTextParserTest {
    private final GtfsRtSubwayTripUpdateTextParser parser = new GtfsRtSubwayTripUpdateTextParser();

    @Test
    void parsesSupportedSubwayTripUpdatesWithStationArrivalTimes() {
        String body = """
            header {
              gtfs_realtime_version: "2.0"
              incrementality: FULL_DATASET
              timestamp: 1782987933
            }
            entity {
              id: "subway-126789|East"
              trip_update {
                trip {
                  trip_id: "126789"
                  route_id: "2"
                  schedule_relationship: SCHEDULED
                }
                stop_time_update {
                  stop_id: "13756"
                  stop_sequence: 18
                  arrival {
                    time: 1782988036
                  }
                  departure {
                    time: 1782988051
                  }
                  schedule_relationship: SCHEDULED
                }
                stop_time_update {
                  stop_id: "13753"
                  stop_sequence: 19
                  departure {
                    time: 1782988096
                  }
                  schedule_relationship: SCHEDULED
                }
                stop_time_update {
                  stop_id: "13752"
                  stop_sequence: 20
                  arrival {
                    time: 1782988156
                  }
                  schedule_relationship: SKIPPED
                }
                vehicle {
                  id: "232"
                  label: "232"
                }
              }
            }
            entity {
              id: "surface-504|East"
              trip_update {
                trip {
                  trip_id: "surface"
                  route_id: "504"
                }
                stop_time_update {
                  stop_id: "surface-stop"
                  arrival {
                    time: 1782988036
                  }
                }
              }
            }
            """;

        GtfsRtSubwayTripUpdateFeed feed = parser.parse(body);

        assertThat(feed.feedCreatedAt()).isEqualTo(epoch(1782987933));
        assertThat(feed.trips()).hasSize(1);
        GtfsRtSubwayTripUpdate trip = feed.trips().getFirst();
        assertThat(trip.entityId()).isEqualTo("subway-126789|East");
        assertThat(trip.tripId()).isEqualTo("126789");
        assertThat(trip.vehicleId()).isEqualTo("232");
        assertThat(trip.routeId()).isEqualTo("2");
        assertThat(trip.lineId()).isEqualTo("line-2");
        assertThat(trip.direction()).isEqualTo("Eastbound");
        assertThat(trip.stopUpdates())
            .extracting(
                GtfsRtSubwayStopTimeUpdate::stopId,
                GtfsRtSubwayStopTimeUpdate::stopSequence,
                GtfsRtSubwayStopTimeUpdate::arrivalAt,
                GtfsRtSubwayStopTimeUpdate::departureAt,
                GtfsRtSubwayStopTimeUpdate::predictedAt
            )
            .containsExactly(
                tuple("13756", 18, epoch(1782988036), epoch(1782988051), epoch(1782988036)),
                tuple("13753", 19, null, epoch(1782988096), epoch(1782988096))
            );
    }

    private OffsetDateTime epoch(long epochSeconds) {
        return OffsetDateTime.ofInstant(Instant.ofEpochSecond(epochSeconds), ZoneOffset.UTC);
    }
}
