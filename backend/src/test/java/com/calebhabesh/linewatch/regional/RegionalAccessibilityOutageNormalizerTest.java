package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;

class RegionalAccessibilityOutageNormalizerTest {
    private final RegionalAccessibilityOutageNormalizer normalizer = new RegionalAccessibilityOutageNormalizer();

    @Test
    void mapsVerifiedAmenityOutageToReviewedRailStationAndCorridor() {
        var records = List.of(source("""
            {
              "Code":"LW-SCENARIO-AG-ELEVATOR",
              "SubjectEnglish":"Elevator out of service",
              "BodyEnglish":"Synthetic scenario: the station elevator is unavailable.",
              "Category":"Amenity",
              "SubCategory":"Elevator-Escalator Disruption",
              "PostedDateTime":"2026-07-27 08:50:33",
              "Lines":[{"Code":"ST"}],
              "Stops":[{"Code":"AG"}]
            }
            """));

        assertThat(normalizer.normalize(records)).singleElement().satisfies(outage -> {
            assertThat(outage.id()).isEqualTo("regional-accessibility-lw-scenario-ag-elevator");
            assertThat(outage.assetType()).isEqualTo("elevator");
            assertThat(outage.stationIds()).containsExactly("agincourt");
            assertThat(outage.lineIds()).containsExactly("regional-st");
            assertThat(outage.restoration()).isFalse();
        });
    }

    @Test
    void retainsRestorationAsLifecycleSignalAndDropsBusOnlyAmenity() {
        var records = List.of(
            source("""
                {
                  "Code":"M0000508874",
                  "SubjectEnglish":"Elevator back in service",
                  "BodyEnglish":"The elevator has returned to service.",
                  "Category":"Amenity",
                  "SubCategory":"Elevator-Escalator Disruption",
                  "PostedDateTime":"2026-07-28 10:00:00",
                  "Lines":[{"Code":"LW"}],
                  "Stops":[{"Code":"EX"}]
                }
                """),
            source("""
                {
                  "Code":"M0000519270",
                  "SubjectEnglish":"Elevator out of service",
                  "BodyEnglish":"The elevator at a bus terminal is out of service.",
                  "Category":"Amenity",
                  "SubCategory":"Elevator-Escalator Disruption",
                  "PostedDateTime":"2026-07-28 09:00:00",
                  "Lines":[{"Code":"19"}],
                  "Stops":[{"Code":"00736"}]
                }
                """)
        );

        assertThat(normalizer.normalize(records)).singleElement().satisfies(outage -> {
            assertThat(outage.stationIds()).containsExactly("exhibition");
            assertThat(outage.restoration()).isTrue();
        });
    }

    @Test
    void supportsScheduledElevatorMaintenanceWithoutInventingAnEscalator() {
        var records = List.of(source("""
            {
              "Code":"LW-SCENARIO-UN-MAINTENANCE",
              "SubjectEnglish":"Elevator Maintenance Notice - York Concourse",
              "BodyEnglish":"Synthetic scenario: a Union elevator is unavailable for a test maintenance window.",
              "Category":"Amenity",
              "SubCategory":"Elevator-Escalator Disruption",
              "PostedDateTime":"2026-07-26 00:01:59",
              "Lines":[{"Code":"BR"},{"Code":"GT"},{"Code":"LE"},{"Code":"LW"},{"Code":"MI"},{"Code":"RH"},{"Code":"ST"}],
              "Stops":[{"Code":"UN"}]
            }
            """));

        assertThat(normalizer.normalize(records)).singleElement().satisfies(outage -> {
            assertThat(outage.assetType()).isEqualTo("elevator");
            assertThat(outage.stationIds()).containsExactly("union");
            assertThat(outage.lineIds()).hasSize(7);
        });
    }

    private RegionalAccessibilityOutageReadRepository.SourceRecord source(String payload) {
        return new RegionalAccessibilityOutageReadRepository.SourceRecord(
            payload.contains("LW-SCENARIO-AG-ELEVATOR") ? "LW-SCENARIO-AG-ELEVATOR"
                : payload.contains("M0000508874") ? "M0000508874"
                : payload.contains("M0000519270") ? "M0000519270"
                : "LW-SCENARIO-UN-MAINTENANCE",
            payload,
            OffsetDateTime.parse("2026-07-28T15:00:00Z")
        );
    }
}
