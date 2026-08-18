package com.calebhabesh.linewatch.station;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

class StationControllerTest {

    @Test
    void stationsReturnsSummaries() {
        StationService service = new StubStationService();
        StationController controller = new StationController(service);

        StationResponses.StationListResponse response = controller.stations();

        assertThat(response.generatedAt()).isEqualTo("seeded-demo");
        assertThat(response.stations()).hasSize(1);
        assertThat(response.stations().getFirst().id()).isEqualTo("union");
        assertThat(response.stations().getFirst().hasActiveImpact()).isTrue();
        assertThat(response.stations().getFirst().accessOutageCounts().elevator()).isZero();
        assertThat(response.stations().getFirst().accessOutageCounts().escalator()).isZero();
    }

    @Test
    void stationReturnsDetailForKnownStation() {
        StationService service = new StubStationService();
        StationController controller = new StationController(service);

        ResponseEntity<StationResponses.StationDetailResponse> response = controller.station("union");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().id()).isEqualTo("union");
        assertThat(response.getBody().dataMode()).isEqualTo("seeded-demo");
        assertThat(response.getBody().arrivalsSource()).isEqualTo("Demo estimates");
        assertThat(response.getBody().disclaimer()).contains("Arrivals are demo placeholders");
    }

    @Test
    void stationReturnsNotFoundForUnknownStation() {
        StationService service = new StubStationService();
        StationController controller = new StationController(service);

        ResponseEntity<StationResponses.StationDetailResponse> response = controller.station("missing");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(response.getBody()).isNull();
    }

    private static final class StubStationService extends StationService {
        StubStationService() {
            super(null, null, null, null, null, null, null, null, null);
        }

        @Override
        public StationResponses.StationListResponse stationSummaries() {
            return new StationResponses.StationListResponse(
                "seeded-demo",
                List.of(new StationResponses.StationSummaryResponse(
                    "union",
                    "Union",
                    4311,
                    3597,
                    true,
                    List.of("line-1"),
                    true,
                    "normal",
                    new StationResponses.StationAccessOutageCountsResponse(0, 0),
                    true,
                    true,
                    true,
                    false
                ))
            );
        }

        @Override
        public StationResponses.StationListResponse stationSummaries(
            Boolean wheelchair,
            Boolean elevator,
            Boolean washroom,
            Boolean parking,
            String lineId,
            String query
        ) {
            return stationSummaries();
        }

        @Override
        public StationResponses.StationDetailResponse stationDetail(String id) {
            if (!id.equals("union")) {
                throw new StationNotFoundException(id);
            }

            return new StationResponses.StationDetailResponse(
                "union",
                "Union",
                4311,
                3597,
                true,
                List.of(new StationResponses.StationLineResponse(
                    "line-1",
                    "1",
                    "Yonge-University",
                    "#F8C300",
                    "Northbound / Southbound",
                    true,
                    true
                )),
                new StationResponses.StationAccessResponse(
                    "normal",
                    "No station access advisories in demo data.",
                    "Fixture seed",
                    List.of()
                ),
                List.of(new StationResponses.StationImpactResponse(
                    "impact-union-weekend",
                    "planned-closure",
                    "planned",
                    "Weekend signal upgrades",
                    "Planned work affects Line 1 north of Eglinton. Union remains open.",
                    "Fixture seed",
                    null,
                    "Planned TTC closure fixture"
                )),
                List.of(new StationResponses.StationArrivalResponse(
                    "line-1",
                    "Northbound",
                    2,
                    null,
                    "2 min",
                    "Demo estimates",
                    "demo"
                )),
                "Demo estimates",
                new StationResponses.StationArrivalContextResponse(
                    false,
                    "Schedule active",
                    "No active service impacts linked to this station.",
                    "normal",
                    "LineWatchTO"
                ),
                "seeded-demo",
                "Station details use seeded backend data. Arrivals are demo placeholders, not live TTC predictions.",
                true,
                false
            );
        }
    }
}
