package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

class MetrolinxAlertNormalizerTest {
    private static final Clock CLOCK = Clock.fixed(
        Instant.parse("2026-07-28T18:15:00Z"),
        ZoneOffset.UTC
    );
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final MetrolinxAlertNormalizer normalizer = new MetrolinxAlertNormalizer(CLOCK);

    @Test
    void filtersBusMessagesAndMapsGtRailAlertsToKitchenerSegments() throws Exception {
        MetrolinxFetchedRecord rail = serviceAlert("""
            {
              "Code":"LW-SCENARIO-KI-ADJUSTMENT",
              "Status":"UPD",
              "PostedDateTime":"2026-07-28 05:01:00",
              "SubjectEnglish":"Kitchener line service adjustment",
              "BodyEnglish":"Trips are operating five minutes later than usual from 15:30 to 18:45.",
              "Category":"Service Disruption",
              "SubCategory":"Modified Trip",
              "Lines":[{"Code":"GT"}],
              "Stops":[{"Code":"BL"},{"Code":"MD"},{"Code":"WE"}]
            }
            """);
        MetrolinxFetchedRecord bus = serviceAlert("""
            {
              "Code":"M0000520098",
              "PostedDateTime":"2026-07-28 05:01:00",
              "SubjectEnglish":"Route 31 detour",
              "BodyEnglish":"A bus stop is temporarily closed.",
              "Category":"Service Disruption",
              "SubCategory":"Modified Trip - Bus Detour",
              "Lines":[{"Code":"31"}],
              "Stops":[]
            }
            """);

        List<RegionalNormalizedAlert> alerts = normalizer.normalize(
            new MetrolinxFeed(
                OffsetDateTime.parse("2026-07-28T18:12:32Z"),
                List.of(rail, bus),
                java.util.Map.of(
                    MetrolinxSourceSystem.GO_SERVICE_ALERTS, true,
                    MetrolinxSourceSystem.UP_GTFS_ALERTS, true
                )
            )
        );

        assertThat(alerts).singleElement().satisfies(alert -> {
            assertThat(alert.sourceSystem()).isEqualTo(MetrolinxSourceSystem.GO_SERVICE_ALERTS);
            assertThat(alert.lineId()).isEqualTo("regional-ki");
            assertThat(alert.impactKind()).isEqualTo("delay");
            assertThat(alert.description()).isEqualTo(
                "Trips are operating five minutes later than usual from 3:30 PM to 6:45 PM."
            );
            assertThat(alert.stationIds()).containsExactly("bloor", "mount-dennis", "weston");
            assertThat(alert.affectedSegmentIds()).containsExactly(
                "segment-ki-bloor-mount-dennis",
                "segment-ki-mount-dennis-weston"
            );
        });
    }

    @Test
    void normalizesDedicatedUpFeedAndSuppressesExpiredEntities() throws Exception {
        MetrolinxFetchedRecord active = upAlert("up-active", """
            {
              "id":"up-active",
              "is_deleted":false,
              "alert":{
                "active_period":[{"start":1785261600,"end":1785265200}],
                "cause":"TECHNICAL_PROBLEM",
                "effect":"NO_SERVICE",
                "header_text":{"translation":[{"text":"UP Express service suspended","language":"en"}]},
                "description_text":{"translation":[{"text":"No service between Weston and Pearson.","language":"en"}]},
                "informed_entity":[{"stop_id":"WE"},{"stop_id":"PA"}]
              }
            }
            """);
        MetrolinxFetchedRecord expired = upAlert("up-expired", """
            {
              "id":"up-expired",
              "is_deleted":false,
              "alert":{
                "active_period":[{"start":1785250000,"end":1785251000}],
                "effect":"SIGNIFICANT_DELAYS",
                "header_text":{"translation":[{"text":"Old delay","language":"en"}]},
                "description_text":{"translation":[{"text":"Expired.","language":"en"}]},
                "informed_entity":[]
              }
            }
            """);

        List<RegionalNormalizedAlert> alerts = normalizer.normalize(new MetrolinxFeed(
            OffsetDateTime.parse("2026-07-28T18:12:32Z"),
            List.of(active, expired),
            java.util.Map.of(MetrolinxSourceSystem.UP_GTFS_ALERTS, true)
        ));

        assertThat(alerts).singleElement().satisfies(alert -> {
            assertThat(alert.lineId()).isEqualTo("regional-up");
            assertThat(alert.impactKind()).isEqualTo("suspension");
            assertThat(alert.stationIds()).containsExactly("weston", "pearson-airport");
            assertThat(alert.affectedSegmentIds()).containsExactly(
                "segment-up-weston-pearson-airport"
            );
        });
    }

    @Test
    void mapsFutureUpAlertsToPlannedChanges() throws Exception {
        MetrolinxFetchedRecord future = upAlert("up-future", """
            {
              "id":"up-future",
              "is_deleted":false,
              "alert":{
                "active_period":[{"start":1785348000,"end":1785355200}],
                "cause":"CONSTRUCTION",
                "effect":"MODIFIED_SERVICE",
                "header_text":{"translation":[{"text":"Planned UP service change","language":"en"}]},
                "description_text":{"translation":[{"text":"Service changes tomorrow.","language":"en"}]},
                "informed_entity":[]
              }
            }
            """);

        assertThat(normalizer.normalize(new MetrolinxFeed(
            OffsetDateTime.parse("2026-07-28T18:12:32Z"),
            List.of(future),
            java.util.Map.of(MetrolinxSourceSystem.UP_GTFS_ALERTS, true)
        ))).singleElement().extracting(RegionalNormalizedAlert::impactKind).isEqualTo("planned-closure");
    }

    private MetrolinxFetchedRecord serviceAlert(String json) throws Exception {
        return new MetrolinxFetchedRecord(
            MetrolinxSourceSystem.GO_SERVICE_ALERTS,
            objectMapper.readTree(json).path("Code").asText(),
            json
        );
    }

    private MetrolinxFetchedRecord upAlert(String id, String json) {
        return new MetrolinxFetchedRecord(MetrolinxSourceSystem.UP_GTFS_ALERTS, id, json);
    }
}
