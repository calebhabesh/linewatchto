package com.calebhabesh.linewatch.surfacearrival;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;

class TtcSurfaceTripUpdateParserTest {
    private final TtcSurfaceTripUpdateParser parser = new TtcSurfaceTripUpdateParser();

    @Test
    void parsesPredictionsAndDropsSkippedStopsAndCanceledTrips() {
        TtcSurfaceTripUpdateParser.Feed feed = parser.parse("""
            header { timestamp: 1786712400 }
            entity { id: "one" trip_update {
              trip { trip_id: "504_1" route_id: "504" }
              stop_time_update { stop_id: "3737" arrival { delay: 60 time: 1786712700 } }
              stop_time_update { stop_id: "3738" schedule_relationship: SKIPPED arrival { time: 1786712800 } }
            } }
            entity { id: "two" trip_update {
              trip { trip_id: "29_1" route_id: "29" schedule_relationship: CANCELED }
              stop_time_update { stop_id: "1" arrival { time: 1786712800 } }
            } }
            """);

        assertThat(feed.sourceUpdatedAt()).isEqualTo(OffsetDateTime.parse("2026-08-14T13:00:00Z"));
        assertThat(feed.trips()).singleElement().satisfies(trip -> {
            assertThat(trip.tripId()).isEqualTo("504_1");
            assertThat(trip.stops()).singleElement().satisfies(stop -> {
                assertThat(stop.stopId()).isEqualTo("3737");
                assertThat(stop.event().scheduledAt()).isEqualTo(stop.event().predictedAt().minusMinutes(1));
            });
        });
    }
}
