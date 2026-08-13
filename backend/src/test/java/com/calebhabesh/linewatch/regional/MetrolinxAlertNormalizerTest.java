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
    void keepsVagueFutureUpChangesOutOfTheClosureBucket() throws Exception {
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

        MetrolinxFeed feed = new MetrolinxFeed(
            OffsetDateTime.parse("2026-07-28T18:12:32Z"),
            List.of(future),
            java.util.Map.of(MetrolinxSourceSystem.UP_GTFS_ALERTS, true)
        );

        assertThat(normalizer.classify(feed)).singleElement().satisfies(classification -> {
            assertThat(classification.timing()).isEqualTo("planned");
            assertThat(classification.serviceEffect()).isEqualTo("service-adjustment");
            assertThat(classification.cause()).isEqualTo("construction");
            assertThat(classification.scope()).isEqualTo("unknown");
        });
        assertThat(normalizer.normalize(feed)).isEmpty();
    }

    @Test
    void correlatesBarrieRestAndGtfsRecordsAndTreatsStopsAsReplacementContext() throws Exception {
        MetrolinxFetchedRecord rest = new MetrolinxFetchedRecord(
            MetrolinxSourceSystem.GO_INFORMATION_ALERTS,
            "M0000521190",
            """
                {
                  "Code":"M0000521190",
                  "PostedDateTime":"2026-07-28 10:00:00",
                  "SubjectEnglish":"Barrie weekend service adjustment",
                  "BodyEnglish":"No GO train service on the Barrie line due to planned construction. GO buses replace trains at Rutherford, Maple, King City, Aurora, Newmarket, East Gwillimbury, Bradford, Barrie South and Allandale Waterfront. Buses will not serve Union Station or Downsview Park GO.",
                  "Category":"General Information",
                  "SubCategory":"E-Ticket",
                  "Lines":[{"Code":"BR"}],
                  "Stops":[{"Code":"RU"},{"Code":"MP"},{"Code":"KC"},{"Code":"AU"},{"Code":"NE"},{"Code":"EA"},{"Code":"BD"},{"Code":"BA"},{"Code":"AD"}]
                }
                """
        );
        MetrolinxFetchedRecord gtfs = new MetrolinxFetchedRecord(
            MetrolinxSourceSystem.GO_GTFS_ALERTS,
            "521190",
            """
                {
                  "id":"521190",
                  "alert":{
                    "active_period":[{"start":1785348000,"end":1785434400}],
                    "cause":"CONSTRUCTION",
                    "effect":"OTHER_EFFECT",
                    "header_text":{"translation":[{"text":"Barrie service change","language":"en"}]},
                    "description_text":{"translation":[{"text":"No GO train service on the Barrie line.","language":"en"}]},
                    "informed_entity":[{"stop_id":"RU"},{"stop_id":"AD"}]
                  }
                }
                """
        );
        MetrolinxFeed feed = feed(rest, gtfs);

        assertThat(normalizer.classify(feed)).singleElement().satisfies(classification -> {
            assertThat(classification.canonicalEventId()).isEqualTo("go-521190");
            assertThat(classification.sources()).extracting(RegionalAlertClassification.SourceReference::sourceSystem)
                .containsExactly(MetrolinxSourceSystem.GO_INFORMATION_ALERTS, MetrolinxSourceSystem.GO_GTFS_ALERTS);
            assertThat(classification.timing()).isEqualTo("planned");
            assertThat(classification.serviceEffect()).isEqualTo("no-service");
            assertThat(classification.scope()).isEqualTo("corridor");
            assertThat(classification.cause()).isEqualTo("construction");
            assertThat(classification.replacementService()).isEqualTo("go-bus");
            assertThat(classification.stationRoles())
                .containsEntry("rutherford", "replacement-served")
                .containsEntry("union", "replacement-excluded")
                .containsEntry("downsview-park", "replacement-excluded");
            assertThat(classification.fieldSources().get("activePeriod"))
                .containsExactly(MetrolinxSourceSystem.GO_GTFS_ALERTS + ":521190");
        });
        assertThat(normalizer.normalize(feed)).singleElement().satisfies(alert -> {
            assertThat(alert.impactKind()).isEqualTo("planned-closure");
            assertThat(alert.stationIds()).isEmpty();
            assertThat(alert.affectedSegmentIds()).hasSize(10);
        });

        MetrolinxAlertNormalizer activeWindowNormalizer = new MetrolinxAlertNormalizer(Clock.fixed(
            Instant.parse("2026-07-29T20:00:00Z"), ZoneOffset.UTC
        ));
        assertThat(activeWindowNormalizer.normalize(feed)).singleElement()
            .extracting(RegionalNormalizedAlert::impactKind).isEqualTo("suspension");
    }

    @Test
    void bucketsReducedSpeedDelayAndExtractsTextSpanAndMaximumDelay() throws Exception {
        MetrolinxFetchedRecord record = serviceAlert("""
            {
              "Code":"M0000522000",
              "PostedDateTime":"2026-07-28 12:00:00",
              "SubjectEnglish":"Reduced speeds on the Kitchener line",
              "BodyEnglish":"Trains are operating at reduced speeds between Kitchener GO and Stratford GO. Delays of up to 20 minutes.",
              "Category":"Service Disruption",
              "SubCategory":"Modified Trip",
              "Lines":[{"Code":"GT"}],
              "Stops":[]
            }
            """);
        MetrolinxFeed feed = feed(record);

        assertThat(normalizer.classify(feed)).singleElement().satisfies(classification -> {
            assertThat(classification.timing()).isEqualTo("current");
            assertThat(classification.serviceEffect()).isEqualTo("delay");
            assertThat(classification.operatingChange()).isEqualTo("reduced-speed");
            assertThat(classification.scope()).isEqualTo("segment-span");
            assertThat(classification.spanStationIds()).containsExactly("kitchener", "stratford");
            assertThat(classification.maximumDelayMinutes()).isEqualTo(20);
        });
        assertThat(normalizer.normalize(feed)).singleElement().satisfies(alert -> {
            assertThat(alert.impactKind()).isEqualTo("delay");
            assertThat(alert.stationIds()).containsExactly("kitchener", "stratford");
            assertThat(alert.affectedSegmentIds()).containsExactly("segment-ki-kitchener-stratford");
        });
    }

    @Test
    void keepsASingleTrainCancellationOutOfDelayStatusAndTopologyOverlays() throws Exception {
        MetrolinxFetchedRecord record = serviceAlert("""
            {
              "Code":"M0000522196",
              "PostedDateTime":"2026-07-28 15:31:22",
              "SubjectEnglish":"Train cancelled - Union Station 17:35 - Appleby GO 18:29",
              "BodyEnglish":"The Union Station 17:35 - Appleby GO 18:29 train has been cancelled due to crew constraints. Please consider the following train options: By GO train: Union Station 17:53 - West Harbour GO 19:15. Subscribe to On the GO alerts and receive customized, real-time alerts for schedule changes, construction updates and more.",
              "Category":"Service Disruption",
              "SubCategory":"Train Cancellation",
              "Lines":[{"Code":"LW"}],
              "Stops":[{"Code":"EX"},{"Code":"MI"},{"Code":"LO"},{"Code":"PO"},{"Code":"CL"},{"Code":"OA"},{"Code":"BO"},{"Code":"AP"}],
              "Trips":[{"TripNumber":"1327"}]
            }
            """);
        MetrolinxFeed feed = feed(record);

        assertThat(normalizer.classify(feed)).singleElement().satisfies(classification -> {
            assertThat(classification.serviceEffect()).isEqualTo("trip-cancellation");
            assertThat(classification.operatingChange()).isEqualTo("cancelled-trip");
            assertThat(classification.scope()).isEqualTo("scheduled-trip");
            assertThat(classification.tripNumbers()).containsExactly("1327");
            assertThat(classification.stationIds()).contains("appleby");
            assertThat(classification.spanStationIds()).isEmpty();
            assertThat(classification.cause()).isEqualTo("crew constraints");
            assertThat(classification.description())
                .doesNotContain("Subscribe to On the GO alerts")
                .doesNotContain("construction updates");
        });
        assertThat(normalizer.normalize(feed)).isEmpty();
    }

    @Test
    void structuredTrainCancellationWinsOverAGroupedNoServiceEffect() throws Exception {
        MetrolinxFetchedRecord riderAlert = serviceAlert("""
            {
              "Code":"M0000522229",
              "PostedDateTime":"2026-07-28 15:31:22",
              "SubjectEnglish":"Train cancelled - Union Station 17:12 - Old Elm GO 18:24",
              "BodyEnglish":"The Union Station 17:12 train has been cancelled.",
              "Category":"Service Disruption",
              "SubCategory":"Train Cancellation",
              "Lines":[{"Code":"ST"}],
              "Stops":[{"Code":"UN"},{"Code":"LI"}],
              "Trips":[{"TripNumber":"6712"}]
            }
            """);
        MetrolinxFetchedRecord correlatedGtfs = new MetrolinxFetchedRecord(
            MetrolinxSourceSystem.GO_GTFS_ALERTS,
            "522229",
            """
                {
                  "id":"522229",
                  "alert":{
                    "effect":"NO_SERVICE",
                    "header_text":{"translation":[{"text":"Train cancellation","language":"en"}]},
                    "description_text":{"translation":[{"text":"This scheduled train will not operate.","language":"en"}]},
                    "informed_entity":[{"route_id":"ST"}]
                  }
                }
                """
        );
        MetrolinxFeed feed = feed(riderAlert, correlatedGtfs);

        assertThat(normalizer.classify(feed)).singleElement().satisfies(classification -> {
            assertThat(classification.serviceEffect()).isEqualTo("trip-cancellation");
            assertThat(classification.scope()).isEqualTo("scheduled-trip");
            assertThat(classification.tripNumbers()).containsExactly("6712");
        });
        assertThat(normalizer.normalize(feed)).isEmpty();
    }

    @Test
    void doesNotConfuseUnionvilleWithUnionWhenExtractingAStouffvilleAlertSpan() throws Exception {
        MetrolinxFetchedRecord record = serviceAlert("""
            {
              "Code":"M0000522001",
              "PostedDateTime":"2026-07-28 08:18:00",
              "SubjectEnglish":"Stouffville Line - Railway Crossing Issue",
              "BodyEnglish":"There is a railway crossing issue between Centennial GO and Unionville GO. All trains travelling through the area are estimated to arrive at their destination 5 to 10 minutes later than usual.",
              "Category":"Service Disruption",
              "SubCategory":"Construction",
              "Lines":[{"Code":"ST"}],
              "Stops":[]
            }
            """);
        MetrolinxFeed feed = feed(record);

        assertThat(normalizer.classify(feed)).singleElement().satisfies(classification -> {
            assertThat(classification.scope()).isEqualTo("segment-span");
            assertThat(classification.spanStationIds()).containsExactly("stouffville", "unionville");
            assertThat(classification.spanStationIds()).doesNotContain("union");
        });
        assertThat(normalizer.normalize(feed)).singleElement().satisfies(alert -> {
            assertThat(alert.stationIds()).containsExactly("stouffville", "unionville");
            assertThat(alert.affectedSegmentIds()).containsExactly(
                "segment-st-unionville-centennial",
                "segment-st-centennial-markham",
                "segment-st-markham-mount-joy",
                "segment-st-mount-joy-stouffville"
            );
        });
    }

    @Test
    void bucketsVaguePlannedLakeshoreAdjustmentWithoutInventingAClosure() throws Exception {
        MetrolinxFetchedRecord record = new MetrolinxFetchedRecord(
            MetrolinxSourceSystem.GO_INFORMATION_ALERTS,
            "M0000523000",
            """
                {
                  "Code":"M0000523000",
                  "SubjectEnglish":"Lakeshore West service adjusted this weekend",
                  "BodyEnglish":"Service adjusted at Oakville and Bronte due to planned construction.",
                  "Category":"General Information",
                  "Lines":[{"Code":"LW"}],
                  "Stops":[{"Code":"OA"},{"Code":"BO"}]
                }
                """
        );
        MetrolinxFeed feed = feed(record);

        assertThat(normalizer.classify(feed)).singleElement().satisfies(classification -> {
            assertThat(classification.timing()).isEqualTo("planned");
            assertThat(classification.serviceEffect()).isEqualTo("service-adjustment");
            assertThat(classification.scope()).isEqualTo("listed-stations");
            assertThat(classification.stationIds()).containsExactly("oakville", "bronte");
        });
        assertThat(normalizer.normalize(feed)).isEmpty();
    }

    @Test
    void explicitServiceDatesOverrideAContradictoryGtfsNoticeVisibilityPeriod() {
        MetrolinxFetchedRecord rest = new MetrolinxFetchedRecord(
            MetrolinxSourceSystem.GO_INFORMATION_ALERTS,
            "M0000521190",
            """
                {
                  "Code":"M0000521190",
                  "PostedDateTime":"2026-08-07 00:01:43",
                  "SubjectEnglish":"Barrie line service adjustments Aug. 15- 16",
                  "BodyEnglish":"No GO train service on the Barrie line due to planned construction. GO buses replace trains at all stations except Downsview Park GO and Union Station.",
                  "Category":"General Information",
                  "Lines":[{"Code":"BR"}],
                  "Stops":[{"Code":"RU"},{"Code":"AD"}]
                }
                """
        );
        MetrolinxFetchedRecord gtfs = new MetrolinxFetchedRecord(
            MetrolinxSourceSystem.GO_GTFS_ALERTS,
            "521190",
            """
                {
                  "id":"521190",
                  "alert":{
                    "active_period":[{"start":1786075260,"end":1786310233}],
                    "effect":"OTHER_EFFECT",
                    "header_text":{"translation":[{"text":"Barrie line service adjustments Aug. 15- 16","language":"en"}]},
                    "description_text":{"translation":[{"text":"No GO train service on the Barrie line due to planned construction.","language":"en"}]},
                    "informed_entity":[{"stop_id":"RU"},{"stop_id":"AD"}]
                  }
                }
                """
        );
        MetrolinxFeed feed = feed(rest, gtfs);
        MetrolinxAlertNormalizer augustEighth = new MetrolinxAlertNormalizer(Clock.fixed(
            Instant.parse("2026-08-08T16:00:00Z"), ZoneOffset.UTC
        ));

        assertThat(augustEighth.classify(feed)).singleElement().satisfies(classification -> {
            assertThat(classification.timing()).isEqualTo("planned");
            assertThat(classification.activePeriodBasis()).isEqualTo("text-date-range");
            assertThat(classification.activePeriodStart())
                .isEqualTo(OffsetDateTime.parse("2026-08-15T00:00:00-04:00"));
            assertThat(classification.activePeriodEnd())
                .isEqualTo(OffsetDateTime.parse("2026-08-17T00:00:00-04:00"));
            assertThat(classification.sourceActivePeriodStart())
                .isEqualTo(OffsetDateTime.parse("2026-08-07T04:01:00Z"));
            assertThat(classification.sourceActivePeriodEnd())
                .isEqualTo(OffsetDateTime.parse("2026-08-09T21:17:13Z"));
            assertThat(classification.fieldSources()).containsKey("serviceDateRange");
        });
        assertThat(augustEighth.normalize(feed)).singleElement()
            .extracting(RegionalNormalizedAlert::impactKind).isEqualTo("planned-closure");

        MetrolinxAlertNormalizer duringClosure = new MetrolinxAlertNormalizer(Clock.fixed(
            Instant.parse("2026-08-15T16:00:00Z"), ZoneOffset.UTC
        ));
        assertThat(duringClosure.normalize(feed)).singleElement()
            .extracting(RegionalNormalizedAlert::impactKind).isEqualTo("suspension");

        MetrolinxAlertNormalizer afterClosure = new MetrolinxAlertNormalizer(Clock.fixed(
            Instant.parse("2026-08-17T04:00:00Z"), ZoneOffset.UTC
        ));
        assertThat(afterClosure.normalize(feed)).isEmpty();
    }

    private MetrolinxFeed feed(MetrolinxFetchedRecord... records) {
        return new MetrolinxFeed(
            OffsetDateTime.parse("2026-07-28T18:12:32Z"),
            List.of(records),
            java.util.Map.of()
        );
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
