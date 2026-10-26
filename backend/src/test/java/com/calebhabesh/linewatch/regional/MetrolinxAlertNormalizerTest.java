package com.calebhabesh.linewatch.regional;

import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.assertThat;

import tools.jackson.databind.ObjectMapper;
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
    private final ObjectMapper objectMapper = JsonMapper.builder().findAndAddModules().build();
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
            assertThat(alert.impactKind()).isEqualTo("advisory");
            assertThat(alert.description()).isEqualTo(
                "Timing not verified. Trips are operating five minutes later than usual from 3:30 PM to 6:45 PM."
            );
            assertThat(alert.stationIds()).containsExactly("bloor", "mount-dennis", "weston");
            assertThat(alert.affectedSegmentIds()).isEmpty();
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
            assertThat(RegionalAlertProjection.at(alert, CLOCK.instant()).impactKind()).isEqualTo("suspension");
            assertThat(alert.stationIds()).containsExactly("weston", "pearson-airport");
            assertThat(alert.affectedSegmentIds()).containsExactly(
                "segment-up-weston-pearson-airport"
            );
        });
    }

    @Test
    void correlatesRouteWideUpBusReplacementPublishedAsServiceAndGtfsAlerts() throws Exception {
        MetrolinxFetchedRecord rest = serviceAlert("""
            {
              "Code":"M0000522063",
              "PostedDateTime":"2026-08-14 00:00:56",
              "SubjectEnglish":"Service Adjustments from Aug. 15-16",
              "BodyEnglish":"Starting late-evening tonight, and throughout the weekend, GO buses replace UP Express trains for planned construction. On Saturday, Aug. 15 and Sunday, Aug. 16, GO buses will run direct between Pearson Airport Terminal 1 and Union Station Bus Terminal. Learn more.",
              "Category":"Disruptions",
              "SubCategory":"Broadcast Message",
              "Lines":[{"Code":"UP"}],
              "Stops":[]
            }
            """);
        MetrolinxFetchedRecord gtfs = upAlert("522063", """
            {
              "id":"522063",
              "is_deleted":false,
              "alert":{
                "active_period":[{"start":1786680000,"end":1786939200}],
                "cause":"CONSTRUCTION",
                "effect":"MODIFIED_SERVICE",
                "header_text":{"translation":[{"text":"Service Adjustments from Aug. 15-16","language":"en"}]},
                "description_text":{"translation":[{"text":"Starting late-evening tonight, and throughout the weekend, GO buses replace UP Express trains for planned construction. On Saturday, Aug. 15 and Sunday, Aug. 16, GO buses will run direct between Pearson Airport Terminal 1 and Union Station Bus Terminal. Learn more.","language":"en"}]},
                "informed_entity":[{"route_id":"UP","agency_id":"UPExpress","route_type":2}]
              }
            }
            """);
        MetrolinxFeed feed = feed(gtfs, rest);
        MetrolinxAlertNormalizer augustFourteenth = new MetrolinxAlertNormalizer(Clock.fixed(
            Instant.parse("2026-08-14T16:00:00Z"), ZoneOffset.UTC
        ));

        assertThat(augustFourteenth.classify(feed)).singleElement().satisfies(classification -> {
            assertThat(classification.canonicalEventId()).isEqualTo("up-522063");
            assertThat(classification.sources())
                .extracting(RegionalAlertClassification.SourceReference::sourceSystem)
                .containsExactly(MetrolinxSourceSystem.GO_SERVICE_ALERTS, MetrolinxSourceSystem.UP_GTFS_ALERTS);
            assertThat(classification.lineIds()).containsExactly("regional-up");
            assertThat(classification.timing()).isEqualTo("planned");
            assertThat(classification.serviceEffect()).isEqualTo("no-service");
            assertThat(classification.scope()).isEqualTo("corridor");
            assertThat(classification.cause()).isEqualTo("construction");
            assertThat(classification.replacementService()).isEqualTo("go-bus");
            assertThat(classification.stationIds()).isEmpty();
            assertThat(classification.spanStationIds()).containsExactly("pearson-airport", "union");
            assertThat(classification.activePeriodBasis()).isEqualTo("text-date-range");
            assertThat(classification.activePeriodStart())
                .isEqualTo(OffsetDateTime.parse("2026-08-15T00:00:00-04:00"));
            assertThat(classification.activePeriodEnd())
                .isEqualTo(OffsetDateTime.parse("2026-08-17T00:00:00-04:00"));
        });
        assertThat(augustFourteenth.normalize(feed)).filteredOn(alert -> !"advisory".equals(alert.impactKind()))
            .singleElement().satisfies(alert -> {
            assertThat(alert.sourceSystem()).isEqualTo(MetrolinxSourceSystem.GO_SERVICE_ALERTS);
            assertThat(alert.lineId()).isEqualTo("regional-up");
            assertThat(alert.impactKind()).isEqualTo("planned-closure");
            assertThat(alert.replacementService()).isEqualTo("go-bus");
            assertThat(alert.stationIds()).isEmpty();
            assertThat(alert.affectedSegmentIds()).containsExactly(
                "segment-up-union-bloor",
                "segment-up-bloor-mount-dennis",
                "segment-up-mount-dennis-weston",
                "segment-up-weston-pearson-airport"
            );
        });
        assertThat(augustFourteenth.normalize(feed)).filteredOn(alert -> "advisory".equals(alert.impactKind()))
            .singleElement().satisfies(alert -> assertThat(alert.affectedSegmentIds()).isEmpty());
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
            .extracting(alert -> RegionalAlertProjection.at(alert, Instant.parse("2026-07-29T20:00:00Z")).impactKind())
            .isEqualTo("suspension");
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
            assertThat(classification.timing()).isEqualTo("unknown");
            assertThat(classification.serviceEffect()).isEqualTo("delay");
            assertThat(classification.operatingChange()).isEqualTo("reduced-speed");
            assertThat(classification.scope()).isEqualTo("segment-span");
            assertThat(classification.spanStationIds()).containsExactly("kitchener", "stratford");
            assertThat(classification.maximumDelayMinutes()).isEqualTo(20);
        });
        assertThat(normalizer.normalize(feed)).singleElement().satisfies(alert -> {
            assertThat(alert.impactKind()).isEqualTo("advisory");
            assertThat(alert.maximumDelayMinutes()).isEqualTo(20);
            assertThat(alert.stationIds()).containsExactly("kitchener", "stratford");
            assertThat(alert.affectedSegmentIds()).isEmpty();
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
            assertThat(alert.affectedSegmentIds()).isEmpty();
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
            .extracting(alert -> RegionalAlertProjection.at(alert, Instant.parse("2026-08-15T16:00:00Z")).impactKind())
            .isEqualTo("suspension");

        MetrolinxAlertNormalizer afterClosure = new MetrolinxAlertNormalizer(Clock.fixed(
            Instant.parse("2026-08-17T04:00:00Z"), ZoneOffset.UTC
        ));
        assertThat(afterClosure.normalize(feed)).isEmpty();
    }

    @Test
    void timetableAnnouncementsDoNotInventSegmentsOrCurrentDelays() throws Exception {
        for (String route : List.of("BR", "ST", "LW", "LE")) {
            String description = route.equals("BR")
                ? "Weekday service will be adjusted. The train from Allandale Waterfront GO to Union Station will not run. The train from Union Station to Aurora GO will not run."
                : "Weekday and weekend train service will be adjusted. Trains from Mount Joy to Union Station will not run. New trains from Union Station to Old Elm GO.";
            MetrolinxFetchedRecord rest = serviceAlert("""
                {"Code":"M0000524295","SubjectEnglish":"Service changes start Sept. 8",
                 "BodyEnglish":%s,"SubCategory":"Train Delay","Lines":[{"Code":"%s"}],"Stops":[]}
                """.formatted(objectMapper.writeValueAsString(description), route));
            MetrolinxFetchedRecord gtfs = new MetrolinxFetchedRecord(
                MetrolinxSourceSystem.GO_GTFS_ALERTS, "524295", """
                {"id":"524295","alert":{"effect":"SIGNIFICANT_DELAYS",
                 "header_text":{"translation":[{"language":"en","text":"Service changes start Sept. 8"}]},
                 "description_text":{"translation":[{"language":"en","text":%s}]},
                 "informed_entity":[{"route_id":"09261126-%s"}]}}
                """.formatted(objectMapper.writeValueAsString(description), route));
            for (MetrolinxFeed input : List.of(feed(rest), feed(gtfs), feed(rest, gtfs))) {
                assertThat(normalizer.classify(input)).singleElement().satisfies(event -> {
                    assertThat(event.serviceEffect()).isEqualTo("service-adjustment");
                    assertThat(event.scope()).isEqualTo("corridor");
                    assertThat(event.spanStationIds()).isEmpty();
                });
                assertThat(normalizer.normalize(input)).isEmpty();
            }
        }
    }

    @Test
    void holidaySchedulesStayInformationalDespiteOtherCorridorsHavingNoService() throws Exception {
        String title = "We are running on a Saturday schedule on September 7 for Labour Day";
        String description = "There will be no GO train service on Richmond Hill or Milton lines."
            + "GO bus service will also be running on a Saturday schedule.";
        MetrolinxFetchedRecord rest = serviceAlert("""
            {"Code":"M0000525000","SubjectEnglish":%s,"BodyEnglish":%s,
             "SubCategory":"Train Delay","Lines":[{"Code":"LE"}],"Stops":[]}
            """.formatted(objectMapper.writeValueAsString(title), objectMapper.writeValueAsString(description)));
        MetrolinxFetchedRecord gtfs = new MetrolinxFetchedRecord(
            MetrolinxSourceSystem.GO_GTFS_ALERTS, "525000", """
            {"id":"525000","alert":{"effect":"NO_SERVICE",
             "header_text":{"translation":[{"language":"en","text":%s}]},
             "description_text":{"translation":[{"language":"en","text":%s}]},
             "informed_entity":[{"route_id":"202609-LE"}]}}
            """.formatted(objectMapper.writeValueAsString(title), objectMapper.writeValueAsString(description)));
        for (MetrolinxFeed input : List.of(feed(rest), feed(gtfs), feed(rest, gtfs))) {
            assertThat(normalizer.classify(input)).singleElement().satisfies(event -> {
                assertThat(event.serviceEffect()).isEqualTo("service-adjustment");
                assertThat(event.lineIds()).containsExactly("regional-le");
                assertThat(event.spanStationIds()).isEmpty();
            });
            assertThat(normalizer.normalize(input)).isEmpty();
        }
    }

    @Test
    void closureMentioningReplacementBusScheduleStillProducesAnOverlay() throws Exception {
        var input = feed(serviceAlert("""
            {"Code":"M0000525001","SubjectEnglish":"Lakeshore East planned closure September 7",
             "BodyEnglish":"No GO train service on the Lakeshore East line. Replacement buses are running on a Saturday schedule.",
             "Lines":[{"Code":"LE"}],"Stops":[]}
            """));
        assertThat(normalizer.normalize(input)).singleElement().satisfies(alert -> {
            assertThat(alert.impactKind()).isEqualTo("advisory");
            assertThat(alert.lineId()).isEqualTo("regional-le");
            assertThat(alert.affectedSegmentIds()).isEmpty();
        });
    }

    @Test
    void keepsSeptemberWeekendClosureSeparateFromMondayScheduleAndEarlierUncertainStart() throws Exception {
        MetrolinxFetchedRecord notice = serviceAlert("""
            {"Code":"M0000528001","PostedDateTime":"2026-09-18 09:00:00",
             "SubjectEnglish":"UP Express closure September 19–20",
             "BodyEnglish":"Starting late-evening tonight, GO buses replace UP Express trains. No train service on the UP Express line September 19–20. On Monday September 21, the timetable will be adjusted.",
             "Lines":[{"Code":"UP"}],"Stops":[]}
            """);
        MetrolinxFeed input = feed(notice);
        var classified = normalizer.classify(input).getFirst();
        assertThat(classified.impacts()).extracting(RegionalAlertClassification.Impact::serviceEffect)
            .contains("no-service", "service-adjustment");
        assertThat(classified.impacts()).filteredOn(impact -> "late-evening".equals(impact.id()))
            .singleElement().satisfies(impact -> {
                assertThat(impact.start()).isNull();
                assertThat(impact.uncertainty()).contains("exact time unknown");
            });
        assertThat(normalizer.normalize(input)).filteredOn(alert -> "planned-closure".equals(alert.impactKind()))
            .singleElement().satisfies(alert -> {
                assertThat(alert.activePeriodStart()).isEqualTo(OffsetDateTime.parse("2026-09-19T00:00:00-04:00"));
                assertThat(alert.activePeriodEnd()).isEqualTo(OffsetDateTime.parse("2026-09-21T00:00:00-04:00"));
                assertThat(RegionalAlertProjection.at(alert, Instant.parse("2026-09-18T20:00:00Z")).impactKind())
                    .isEqualTo("planned-closure");
                assertThat(RegionalAlertProjection.at(alert, Instant.parse("2026-09-19T04:00:00Z")).impactKind())
                    .isEqualTo("suspension");
                assertThat(RegionalAlertProjection.at(alert, Instant.parse("2026-09-21T04:00:00Z"))).isNull();
            });
    }

    @Test
    void preservesTwoBarriePeriodsAndOnlyClosesTheExplicitlyDisruptedSpan() throws Exception {
        MetrolinxFetchedRecord notice = new MetrolinxFetchedRecord(
            MetrolinxSourceSystem.GO_GTFS_ALERTS, "two-periods", """
            {"id":"two-periods","alert":{
             "active_period":[
                {"start":1791028800,"end":1791050400},
                {"start":1791115200,"end":1791136800}],
             "effect":"NO_SERVICE",
             "header_text":{"translation":[{"language":"en","text":"Barrie closure"}]},
             "description_text":{"translation":[{"language":"en","text":"No train service between Union Station and Downsview Park GO. Trains run between Aurora GO and Downsview Park GO."}]},
             "informed_entity":[{"route_id":"BR"}]}}
            """);
        List<RegionalNormalizedAlert> alerts = normalizer.normalize(feed(notice));
        assertThat(alerts).hasSize(2);
        assertThat(alerts).allSatisfy(alert -> {
            assertThat(alert.stationIds()).containsExactly("union", "downsview-park");
            assertThat(alert.affectedSegmentIds()).doesNotContain("segment-br-downsview-park-rutherford");
        });
        assertThat(alerts.stream().map(alert -> RegionalAlertProjection.at(alert,
            Instant.parse("2026-10-03T15:00:00Z"))).filter(java.util.Objects::nonNull)
            .map(RegionalNormalizedAlert::impactKind)).containsExactlyInAnyOrder("suspension", "planned-closure");
        assertThat(alerts.stream().map(alert -> RegionalAlertProjection.at(alert,
            Instant.parse("2026-10-03T23:00:00Z"))).filter(java.util.Objects::nonNull)
            .map(RegionalNormalizedAlert::impactKind)).doesNotContain("suspension");
    }

    @Test
    void dateOnlyWindowUsesTorontoMidnightAcrossFallDstAndMissingContextStaysUnknown() {
        var parsed = RegionalAlertTextDateParser.ranges("October 31–November 1", OffsetDateTime.parse("2026-10-30T12:00:00-04:00"));
        assertThat(parsed).singleElement().satisfies(range -> {
            assertThat(range.start()).isEqualTo(OffsetDateTime.parse("2026-10-31T00:00:00-04:00"));
            assertThat(range.endExclusive()).isEqualTo(OffsetDateTime.parse("2026-11-02T00:00:00-05:00"));
        });
        assertThat(RegionalAlertTextDateParser.ranges("October 31–November 1", null)).isEmpty();
    }

    @Test
    void partialStructuredTimingRetainsKnownStartWithoutAClosureOverlay() {
        MetrolinxFetchedRecord notice = upAlert("partial-start", """
            {"id":"partial-start","alert":{
             "active_period":[{"start":1785348000}],"effect":"NO_SERVICE",
             "header_text":{"translation":[{"language":"en","text":"UP service notice"}]},
             "description_text":{"translation":[{"language":"en","text":"No train service between Weston and Pearson."}]},
             "informed_entity":[{"stop_id":"WE"},{"stop_id":"PA"}]}}
            """);
        assertThat(normalizer.normalize(feed(notice))).singleElement().satisfies(alert -> {
            assertThat(alert.impactKind()).isEqualTo("advisory");
            assertThat(alert.activePeriodStart()).isEqualTo(OffsetDateTime.parse("2026-07-29T18:00:00Z"));
            assertThat(alert.activePeriodEnd()).isNull();
            assertThat(alert.affectedSegmentIds()).isEmpty();
        });
    }

    @Test
    void constructionStationClosuresUseCanonicalPlannedAndActiveWindows() throws Exception {
        for (String wording : List.of("No GO train service", "No GO Transit service")) {
            var notice = new MetrolinxFetchedRecord(MetrolinxSourceSystem.GO_INFORMATION_ALERTS, "construction-station", """
                {"Code":"construction-station", "PostedDateTime":"2026-09-28 04:41:00",
                 "SubjectEnglish":"Kitchener Line Service Adjustments Oct. 3-4",
                 "BodyEnglish":"%s at this station due to planned construction. Sign up for On the GO alerts.",
                 "Category":"Service Disruption", "SubCategory":"E-Ticket.",
                 "Lines":[], "Stops":[{"Code":"BL"}]}
                """.formatted(wording));
            assertThat(normalizer.normalize(feed(notice))).singleElement().satisfies(alert -> {
                assertThat(alert.impactKind()).isEqualTo("planned-closure");
                assertThat(alert.stationIds()).containsExactly("bloor");
                assertThat(alert.affectedSegmentIds()).isEmpty();
                assertThat(RegionalAlertProjection.at(alert, Instant.parse("2026-10-03T03:59:59Z"))
                    .impactKind()).isEqualTo("planned-closure");
                assertThat(RegionalAlertProjection.at(alert, Instant.parse("2026-10-03T04:00:00Z"))
                    .impactKind()).isEqualTo("suspension");
                assertThat(RegionalAlertProjection.at(alert, Instant.parse("2026-10-05T04:00:00Z")))
                    .isNull();
            });
        }
    }

    @Test
    void untaggedConstructionAdjustmentsAndAmbiguousStationsDoNotInventClosures() throws Exception {
        for (String title : List.of("Kitchener Line Service Adjustments Oct. 3-4", "Service Adjustments Oct. 3-4")) {
            var notice = serviceAlert("""
                {"Code":"adjustment", "PostedDateTime":"2026-09-28 04:41:00",
                 "SubjectEnglish":"%s",
                 "BodyEnglish":"GO train service is adjusted due to planned construction.",
                 "Lines":[], "Stops":[{"Code":"BL"}]}
                """.formatted(title));
            assertThat(normalizer.normalize(feed(notice))).isEmpty();
        }
        var bus = serviceAlert("""
            {"Code":"bus", "PostedDateTime":"2026-09-28 04:41:00",
             "SubjectEnglish":"Kitchener Line Service Adjustments Oct. 3-4",
             "BodyEnglish":"No GO Transit service at this station due to planned construction.",
             "Lines":[{"Code":"30"}], "Stops":[{"Code":"BL"}]}
            """);
        assertThat(normalizer.normalize(feed(bus))).isEmpty();
        var ambiguous = serviceAlert(bus.rawPayload()
            .replace("Kitchener Line Service", "Service").replace("{\"Code\":\"30\"}", ""));
        assertThat(normalizer.normalize(feed(ambiguous))).isEmpty();
    }

    @Test
    void finalNoticeReportingResolvedServiceIsNotACurrentImpact() throws Exception {
        var resolved = incidentNotice("LW-RESOLVED", "Final - Lakeshore West - Signal issue",
            "The signal issue between Oakville GO and Bronte GO has been resolved and trains have resumed regular service.");

        assertThat(normalizer.normalize(feed(resolved))).isEmpty();
        assertThat(normalizer.classify(feed(resolved))).singleElement()
            .satisfies(event -> assertThat(event.serviceEffect()).isEqualTo("service-resumed"));
    }

    @Test
    void resolvedTitleStatusesCompleteTheIncident() throws Exception {
        for (String title : List.of(
            "Final update - Lakeshore West - Signal issue",
            "Lakeshore West - Signal Issue Resolved",
            "Final update - Lakeshore West - Regular service resumes"
        )) {
            var resolved = incidentNotice("LW-" + title.length(), title,
                "The signal issue between Oakville GO and Bronte GO has been repaired. No further delays are expected.");
            assertThat(normalizer.normalize(feed(resolved))).as(title).isEmpty();
        }
    }

    @Test
    void finalNoticeWithResidualDelaysBecomesAnAdvisoryWithoutAnOverlay() throws Exception {
        var recovering = incidentNotice("LW-RECOVERING", "Final - Lakeshore West - Signal issue",
            "The signal issue between Oakville GO and Bronte GO has been repaired. "
                + "There may be residual delays as we return to full service.");

        assertThat(normalizer.normalize(feed(recovering))).singleElement().satisfies(alert -> {
            assertThat(alert.impactKind()).isEqualTo("advisory");
            assertThat(alert.description()).startsWith("Residual delays possible. The signal issue");
            assertThat(alert.affectedSegmentIds()).isEmpty();
        });
    }

    @Test
    void finalNoticeThatStillDescribesAnImpactKeepsItsClassification() throws Exception {
        String ongoing = "The signal issue between Oakville GO and Bronte GO has been resolved. "
            + "Trains will continue to operate at reduced speeds with delays of up to 15 minutes.";
        var finalNotice = incidentNotice("LW-FINAL", "Final - Lakeshore West - Signal issue", ongoing);
        var updateNotice = incidentNotice("LW-UPDATE", "Update 2 - Lakeshore West - Signal issue", ongoing);

        assertThat(normalizer.normalize(feed(finalNotice))).extracting(RegionalNormalizedAlert::impactKind)
            .isNotEmpty()
            .isEqualTo(normalizer.normalize(feed(updateNotice)).stream().map(RegionalNormalizedAlert::impactKind).toList());
    }

    @Test
    void resolutionWordingWithoutAnExplicitTitleStatusIsNotACompletion() throws Exception {
        var update = incidentNotice("LW-PARTIAL", "Update 1 - Lakeshore West - Signal issue",
            "The signal issue at Oakville GO has been resolved; trains west of Bronte GO are delayed up to 20 minutes.");

        assertThat(normalizer.classify(feed(update))).singleElement()
            .satisfies(event -> assertThat(event.serviceEffect()).isNotIn("service-resumed", "service-recovering"));
    }

    @Test
    void mergesLineAdvisoryWithItsStationInformationRepost() throws Exception {
        // Reposts can also differ in letter case ("Service adjustments" / "service adjustments").
        var stationRepost = weekendAdvisory(MetrolinxSourceSystem.GO_INFORMATION_ALERTS, "M0000530060",
            STOUFFVILLE_TITLE.replace("Service", "service"), "AG", "KE", "MK");
        var lineNotice = weekendAdvisory(MetrolinxSourceSystem.GO_SERVICE_ALERTS, "M0000530377",
            STOUFFVILLE_TITLE);

        for (MetrolinxFeed feed : List.of(feed(stationRepost, lineNotice), feed(lineNotice, stationRepost))) {
            assertThat(normalizer.classify(feed)).singleElement().satisfies(event -> {
                // The line notice supplies the content by source priority, while the event keeps the
                // earlier repost's lower ID so a later higher-priority copy is not a new event.
                assertThat(event.canonicalEventId()).isEqualTo("go-530060");
                assertThat(event.title()).isEqualTo(STOUFFVILLE_TITLE);
                assertThat(event.sources()).extracting(RegionalAlertClassification.SourceReference::sourceId)
                    .containsExactly("M0000530377", "M0000530060");
            });
            assertThat(normalizer.normalize(feed))
                .filteredOn(alert -> "planned-closure".equals(alert.impactKind()))
                .extracting(RegionalNormalizedAlert::id)
                .containsExactly("regional-go-530060-st");
        }
    }

    @Test
    void mergesIdenticalNoticesFromOneSourceUnderTheLowestNoticeId() throws Exception {
        var later = weekendAdvisory(MetrolinxSourceSystem.GO_SERVICE_ALERTS, "M0000529157", STOUFFVILLE_TITLE);
        var earlier = weekendAdvisory(MetrolinxSourceSystem.GO_SERVICE_ALERTS, "M0000529156", STOUFFVILLE_TITLE);

        assertThat(normalizer.classify(feed(later, earlier))).singleElement()
            .satisfies(event -> assertThat(event.canonicalEventId()).isEqualTo("go-529156"));
    }

    @Test
    void keepsFollowUpNoticesOtherLinesAndOtherStationsSeparate() throws Exception {
        var original = weekendAdvisory(MetrolinxSourceSystem.GO_SERVICE_ALERTS, "M0000530377", STOUFFVILLE_TITLE);
        var update = weekendAdvisory(MetrolinxSourceSystem.GO_SERVICE_ALERTS, "M0000530380",
            "Update: " + STOUFFVILLE_TITLE);
        var otherLine = lineAdvisory(MetrolinxSourceSystem.GO_SERVICE_ALERTS, "M0000530381", "LE",
            STOUFFVILLE_TITLE);
        var agincourtRepost = weekendAdvisory(MetrolinxSourceSystem.GO_INFORMATION_ALERTS, "M0000530390",
            STOUFFVILLE_TITLE, "AG");
        var kennedyRepost = weekendAdvisory(MetrolinxSourceSystem.GO_INFORMATION_ALERTS, "M0000530391",
            STOUFFVILLE_TITLE, "KE");

        assertThat(normalizer.classify(feed(update, otherLine, agincourtRepost, kennedyRepost)))
            .extracting(RegionalAlertClassification::canonicalEventId)
            .containsExactly("go-530380", "go-530381", "go-530390", "go-530391");
        assertThat(normalizer.classify(feed(original, update)))
            .extracting(RegionalAlertClassification::canonicalEventId)
            .containsExactly("go-530377", "go-530380");
    }

    @Test
    void mergesRepostThatRepeatsTheTitleAndDropsTheFinalStop() throws Exception {
        var lineNotice = goNotice(MetrolinxSourceSystem.GO_INFORMATION_ALERTS, "M0000528122", LAKESHORE_TITLE,
            LAKESHORE_BODY + ".", "Information");
        var repost = goNotice(MetrolinxSourceSystem.GO_SERVICE_ALERTS, "M0000531107", LAKESHORE_TITLE,
            LAKESHORE_TITLE + " " + LAKESHORE_BODY, "Information");

        assertThat(normalizer.classify(feed(lineNotice, repost))).singleElement().satisfies(event -> {
            assertThat(event.canonicalEventId()).isEqualTo("go-528122");
            assertThat(event.description()).isEqualTo(LAKESHORE_BODY);
        });
    }

    @Test
    void foldsStationClosureListsIntoTheLineNoticeThatCoversThem() throws Exception {
        var lineNotice = goNotice(MetrolinxSourceSystem.GO_SERVICE_ALERTS, "M0000528122", LAKESHORE_TITLE,
            LAKESHORE_BODY, "Information");
        var stationList = goNotice(MetrolinxSourceSystem.GO_INFORMATION_ALERTS, "M0000528100",
            LAKESHORE_TITLE.replace("service", "Service"),
            "There is no GO train service at this station due to planned construction.", "E-Ticket",
            "CL", "OA", "BU");
        var outsideSpan = goNotice(MetrolinxSourceSystem.GO_INFORMATION_ALERTS, "M0000528102", LAKESHORE_TITLE,
            "There is no GO train service at this station due to planned construction.", "E-Ticket", "WR");
        var otherTitle = goNotice(MetrolinxSourceSystem.GO_INFORMATION_ALERTS, "M0000528103",
            "Aug. 8-9: Station parking changes",
            "There is no GO train service at this station due to planned construction.", "E-Ticket", "OA");

        var events = normalizer.classify(feed(lineNotice, stationList, outsideSpan, otherTitle));

        assertThat(events).extracting(RegionalAlertClassification::canonicalEventId)
            .containsExactly("go-528122", "go-528102", "go-528103");
        assertThat(events.getFirst().sources()).extracting(RegionalAlertClassification.SourceReference::sourceId)
            .containsExactly("M0000528122", "M0000528100");
        assertThat(events.getFirst().description()).isEqualTo(LAKESHORE_BODY);
    }

    @Test
    void foldsATopRedBannerIntoTheNoticeItRestates() throws Exception {
        var lineNotice = goNotice(MetrolinxSourceSystem.GO_SERVICE_ALERTS, "M0000528122", LAKESHORE_TITLE,
            LAKESHORE_BODY, "Information");
        var banner = goNotice(MetrolinxSourceSystem.GO_SERVICE_ALERTS, "M0000528641",
            "This weekend, service will be adjusted on Lakeshore West due to planned construction.",
            "On Saturday, Aug. 8 and Sunday, Aug. 9, there will be no GO train service between Aldershot GO "
                + "and Union Station. Please plan ahead.", "Top Red Banner");
        var otherSpanBanner = goNotice(MetrolinxSourceSystem.GO_SERVICE_ALERTS, "M0000528642",
            "This weekend, service will be adjusted on Lakeshore West due to planned construction.",
            "On Saturday, Aug. 8 and Sunday, Aug. 9, there will be no GO train service between Burlington GO "
                + "and Hamilton GO. Please plan ahead.", "Top Red Banner");

        // Banners take their window from the paired GTFS record, which starts when the banner is posted.
        var bannerWindow = bannerPeriod("528641");
        var otherBannerWindow = bannerPeriod("528642");

        assertThat(normalizer.classify(feed(banner, bannerWindow, lineNotice, otherSpanBanner, otherBannerWindow)))
            .extracting(RegionalAlertClassification::canonicalEventId)
            .containsExactly("go-528122", "go-528642");
        assertThat(normalizer.classify(feed(banner, lineNotice)))
            .as("a banner without a known window is not folded")
            .hasSize(2);

        var extraStationBanner = goNotice(MetrolinxSourceSystem.GO_SERVICE_ALERTS, "M0000528643",
            "This weekend, service will be adjusted on Lakeshore West due to planned construction.",
            "On Saturday, Aug. 8 and Sunday, Aug. 9, there will be no GO train service between Aldershot GO "
                + "and Union Station. There will be no GO Transit service at Exhibition GO.", "Top Red Banner");
        var replacementBanner = goNotice(MetrolinxSourceSystem.GO_SERVICE_ALERTS, "M0000528644",
            "This weekend, service will be adjusted on Lakeshore West due to planned construction.",
            "On Saturday, Aug. 8 and Sunday, Aug. 9, there will be no GO train service between Aldershot GO "
                + "and Union Station. GO buses will replace train service.", "Top Red Banner");
        assertThat(normalizer.classify(feed(lineNotice, extraStationBanner, bannerPeriod("528643"))))
            .as("a banner naming a station its notice does not is not folded")
            .hasSize(2);
        assertThat(normalizer.classify(feed(lineNotice, replacementBanner, bannerPeriod("528644"))))
            .as("a banner stating a replacement service its notice does not is not folded")
            .hasSize(2);
    }

    @Test
    void recordsWhyEachNoticeWasConsolidated() throws Exception {
        var lineNotice = goNotice(MetrolinxSourceSystem.GO_SERVICE_ALERTS, "M0000528122", LAKESHORE_TITLE,
            LAKESHORE_BODY, "Information");
        var repost = goNotice(MetrolinxSourceSystem.GO_SERVICE_ALERTS, "M0000531107", LAKESHORE_TITLE,
            LAKESHORE_TITLE + " " + LAKESHORE_BODY, "Information");
        var stationList = goNotice(MetrolinxSourceSystem.GO_INFORMATION_ALERTS, "M0000528100", LAKESHORE_TITLE,
            "There is no GO train service at this station due to planned construction.", "E-Ticket",
            "CL", "OA", "BU");
        var banner = goNotice(MetrolinxSourceSystem.GO_SERVICE_ALERTS, "M0000528641",
            "This weekend, service will be adjusted on Lakeshore West due to planned construction.",
            "On Saturday, Aug. 8 and Sunday, Aug. 9, there will be no GO train service between Aldershot GO "
                + "and Union Station. Please plan ahead.", "Top Red Banner");

        var result = normalizer.consolidate(feed(lineNotice, repost, stationList, banner, bannerPeriod("528641")));

        assertThat(result.events()).extracting(RegionalAlertClassification::canonicalEventId)
            .containsExactly("go-528122");
        assertThat(result.merges()).containsExactly(
            new MetrolinxNoticeConsolidator.Merge("go-528122", "go-531107",
                MetrolinxNoticeConsolidator.MergeReason.REPUBLISHED),
            new MetrolinxNoticeConsolidator.Merge("go-528122", "go-528100",
                MetrolinxNoticeConsolidator.MergeReason.STATION_LIST),
            new MetrolinxNoticeConsolidator.Merge("go-528122", "go-528641",
                MetrolinxNoticeConsolidator.MergeReason.BANNER));
        assertThat(result.nearDuplicates()).isEmpty();
    }

    @Test
    void reportsDifferentlyWordedNoticesForOneEventWithoutMergingThem() throws Exception {
        var lineNotice = goNotice(MetrolinxSourceSystem.GO_SERVICE_ALERTS, "M0000528122", LAKESHORE_TITLE,
            LAKESHORE_BODY, "Information");
        var reworded = goNotice(MetrolinxSourceSystem.GO_SERVICE_ALERTS, "M0000528130",
            "Aug. 8-9: Weekend construction on Lakeshore West",
            "On Saturday, Aug. 8 and Sunday, Aug. 9, there will be no GO train service between Oakville GO "
                + "and Union Station.", "Information");
        var elsewhere = goNotice(MetrolinxSourceSystem.GO_SERVICE_ALERTS, "M0000528131",
            "Aug. 8-9: Weekend construction near Niagara",
            "On Saturday, Aug. 8 and Sunday, Aug. 9, there will be no GO train service between "
                + "St. Catharines GO and Niagara Falls GO.", "Information");

        var result = normalizer.consolidate(feed(lineNotice, reworded, elsewhere));

        assertThat(result.events()).hasSize(3);
        assertThat(result.nearDuplicates()).containsExactly(
            new MetrolinxNoticeConsolidator.NearDuplicate("go-528122", "go-528130"));
    }

    @Test
    void stationClosureListsMarkStationsWithoutClosingTheTrackBetweenThem() throws Exception {
        var stationList = goNotice(MetrolinxSourceSystem.GO_INFORMATION_ALERTS, "M0000528100",
            "Aug. 8-9: Station closures",
            "There is no GO train service at this station due to planned construction.", "E-Ticket",
            "CL", "OA", "BU");
        var betweenTwoStops = goNotice(MetrolinxSourceSystem.GO_INFORMATION_ALERTS, "M0000528110",
            "Aug. 8-9: Lakeshore West disruption",
            "There is no GO train service between these stations due to planned construction.", "E-Ticket",
            "CL", "BU");

        assertThat(normalizer.normalize(feed(stationList, betweenTwoStops)))
            .filteredOn(alert -> "planned-closure".equals(alert.impactKind()))
            .satisfiesExactly(
                closures -> {
                    assertThat(closures.stationIds()).containsExactly("clarkson", "oakville", "burlington");
                    assertThat(closures.affectedSegmentIds()).isEmpty();
                },
                span -> {
                    assertThat(span.stationIds()).containsExactly("clarkson", "burlington");
                    assertThat(span.affectedSegmentIds()).isNotEmpty();
                });
    }

    @Test
    void noTrainServiceOnANamedRouteClosesTheWholeRoute() throws Exception {
        var notice = lineAdvisory(MetrolinxSourceSystem.GO_INFORMATION_ALERTS, "M0000530068", "LE",
            "Aug. 8-9: Service adjustments", "DA", "SC");
        var record = new MetrolinxFetchedRecord(notice.sourceSystem(), notice.sourceId(), notice.rawPayload()
            .replaceAll("\"BodyEnglish\":\"[^\"]*\"", "\"BodyEnglish\":\"On Saturday, Aug. 8 and Sunday, Aug. 9, "
                + "there will be no GO train service on Lakeshore East. GO buses will replace train service. There "
                + "will be no GO Transit service at Scarborough or Danforth GO.\""));

        assertThat(normalizer.classify(feed(record))).singleElement()
            .satisfies(event -> assertThat(event.scope()).isEqualTo("corridor"));
    }

    private MetrolinxFetchedRecord bannerPeriod(String id) {
        return new MetrolinxFetchedRecord(MetrolinxSourceSystem.GO_GTFS_ALERTS, id, """
            {"id":"%s","alert":{"active_period":[{"start":1786183200}],
             "informed_entity":[{"route_id":"09261126-LW","agency_id":"GO"}]}}
            """.formatted(id));
    }

    private static final String LAKESHORE_TITLE = "Aug. 8-9: Lakeshore West service adjustments";
    private static final String LAKESHORE_BODY = "On Saturday, Aug. 8 and Sunday, Aug. 9, GO trains will run between "
        + "Niagara Falls and Aldershot GO. There will be no GO train service between Aldershot GO and Union Station. "
        + "GO buses will run between West Harbour GO and Union Station Bus Terminal";

    private MetrolinxFetchedRecord goNotice(
        String sourceSystem, String code, String title, String body, String subcategory, String... stops
    ) throws Exception {
        String json = objectMapper.writeValueAsString(java.util.Map.of(
            "Code", code,
            "Status", "INIT",
            "PostedDateTime", "2026-07-28 09:00:00",
            "SubjectEnglish", title,
            "BodyEnglish", body,
            "Category", "General Information",
            "SubCategory", subcategory,
            "Lines", List.of(java.util.Map.of("Code", "LW")),
            "Stops", java.util.Arrays.stream(stops).map(stop -> java.util.Map.of("Code", stop)).toList()
        ));
        return new MetrolinxFetchedRecord(sourceSystem, code, json);
    }

    private static final String STOUFFVILLE_TITLE = "Aug. 8-9: Service adjustments";

    private MetrolinxFetchedRecord weekendAdvisory(String sourceSystem, String code, String title, String... stops)
        throws Exception {
        return lineAdvisory(sourceSystem, code, "ST", title, stops);
    }

    private MetrolinxFetchedRecord lineAdvisory(
        String sourceSystem, String code, String line, String title, String... stops
    ) throws Exception {
        String json = objectMapper.writeValueAsString(java.util.Map.of(
            "Code", code,
            "Status", "INIT",
            "PostedDateTime", "2026-07-28 09:00:00",
            "SubjectEnglish", title,
            "BodyEnglish", "On Saturday, Aug. 8 and Sunday, Aug. 9, planned construction is taking place on the "
                + "Stouffville line. There will be no GO train service on the Stouffville line. GO buses will "
                + "replace trains. There will be no GO Transit service at Milliken, Agincourt, and Kennedy GO.",
            "Category", "Service Disruption",
            "SubCategory", "Information",
            "Lines", List.of(java.util.Map.of("Code", line)),
            "Stops", java.util.Arrays.stream(stops).map(stop -> java.util.Map.of("Code", stop)).toList()
        ));
        return new MetrolinxFetchedRecord(sourceSystem, code, json);
    }

    private MetrolinxFetchedRecord incidentNotice(String code, String title, String body) throws Exception {
        return serviceAlert(objectMapper.writeValueAsString(java.util.Map.of(
            "Code", code,
            "Status", "UPD",
            "PostedDateTime", "2026-07-28 13:50:00",
            "SubjectEnglish", title,
            "BodyEnglish", body,
            "Category", "Service Disruption",
            "SubCategory", "Delay",
            "Lines", List.of(java.util.Map.of("Code", "LW")),
            "Stops", List.of()
        )));
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
