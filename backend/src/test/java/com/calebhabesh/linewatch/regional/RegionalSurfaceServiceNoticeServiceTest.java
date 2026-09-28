package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.any;

import com.calebhabesh.linewatch.surface.SurfaceServiceNoticeResponses.SurfaceServiceNoticesResponse;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class RegionalSurfaceServiceNoticeServiceTest {
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-07-30T14:00:00Z"), ZoneOffset.UTC);

    @Mock private RegionalSurfaceServiceNoticeReadRepository repository;
    @Mock private RegionalIngestionFreshness freshness;
    @Mock private MetrolinxProperties properties;

    @Test
    void completeCollectionDoesNotTruncateRouteFiltersAtOneHundredNotices() {
        when(freshness.isFresh()).thenReturn(true);
        when(properties.getMaxDashboardAge()).thenReturn(java.time.Duration.ofMinutes(10));
        when(repository.findActiveRecords(any())).thenReturn(java.util.stream.IntStream.range(0, 120)
            .mapToObj(index -> record(MetrolinxSourceSystem.GO_INFORMATION_ALERTS, "notice-" + index,
                "{\"Code\":\"notice-" + index + "\",\"SubjectEnglish\":\"Station information\",\"Lines\":[{\"Code\":\"BR\"}]}"))
            .toList());
        assertThat(service().getSurfaceNotices(null, null, null).notices()).hasSize(120);
        assertThat(service().getSurfaceNotices(null, null, 10).notices()).hasSize(10);
    }

    @Test
    void exposesFreshInformationAndMarketingCollectionsAsSearchableNotices() {
        when(freshness.isFresh()).thenReturn(true);
        when(properties.getMaxDashboardAge()).thenReturn(java.time.Duration.ofMinutes(10));
        when(repository.findActiveRecords(any())).thenReturn(List.of(
            record(MetrolinxSourceSystem.GO_INFORMATION_ALERTS, "M0000508515", """
                {"Code":"M0000508515","PostedDateTime":"2026-07-28 09:00:00",
                 "SubjectEnglish":"Platform construction underway",
                 "BodyEnglish":"Use the temporary platform from 06:30 to 15:30.",
                 "Category":"General Information","SubCategory":"Station General Information",
                 "Lines":[{"Code":"MI"}],"Stops":[{"Name":"Cooksville GO","Code":"CO"}]}
                """),
            record(MetrolinxSourceSystem.GO_MARKETING_ALERTS, "M0000520000", """
                {"Code":"M0000520000","PostedDateTime":"2026-07-29 10:00:00",
                 "SubjectEnglish":"Weekend service information","BodyEnglish":"Plan ahead for weekend travel.",
                 "Category":"Marketing","Lines":[{"Code":"LW"}],"Stops":[]}
                """),
            record(MetrolinxSourceSystem.GO_INFORMATION_ALERTS, "M0000520001", """
                {"Code":"M0000520001","PostedDateTime":"2026-07-29 11:00:00",
                 "SubjectEnglish":"Old Cummer station notice","BodyEnglish":"Use the south entrance.",
                 "Category":"General Information","Lines":[{"Code":"GT"},{"Code":"RH"}],
                 "Stops":[{"Name":"OL","Code":"OL"}]}
                """),
            record(MetrolinxSourceSystem.GO_GTFS_ALERTS, "GO-BUS-31", """
                {"id":"GO-BUS-31","alert":{"cause":"CONSTRUCTION","effect":"DETOUR",
                 "header_text":{"translation":[{"text":"Route 31 buses are detouring","language":"en"}]},
                 "description_text":{"translation":[{"text":"Use temporary stops.","language":"en"}]},
                 "informed_entity":[{"route_id":"06260926-31"}]}}
                """),
            record(MetrolinxSourceSystem.GO_GTFS_ALERTS, "GO-RAIL-KI", """
                {"id":"GO-RAIL-KI","alert":{"effect":"SIGNIFICANT_DELAYS",
                 "header_text":{"translation":[{"text":"Kitchener train delay","language":"en"}]},
                 "informed_entity":[{"route_id":"06260926-KI"}]}}
                """)));

        RegionalSurfaceServiceNoticeService service = service();
        SurfaceServiceNoticesResponse response = service.getSurfaceNotices(null, null, null);

        assertThat(response.fresh()).isTrue();
        assertThat(response.source()).isEqualTo("Metrolinx GO service notices");
        assertThat(response.notices()).hasSize(4);
        assertThat(response.notices()).anySatisfy(notice -> {
            assertThat(notice.id()).isEqualTo("regional-notice-M0000508515");
            assertThat(notice.routeIds()).containsExactly("MI");
            assertThat(notice.title()).isEqualTo("Platform construction underway");
            assertThat(notice.description()).isEqualTo(
                "Use the temporary platform from 6:30 AM to 3:30 PM."
            );
            assertThat(notice.location()).isEqualTo("Cooksville GO");
            assertThat(notice.category()).isEqualTo("service-change");
        });
        assertThat(response.notices()).anySatisfy(notice -> {
            assertThat(notice.id()).isEqualTo("regional-notice-M0000520001");
            assertThat(notice.routeIds()).containsExactly("KI", "RH");
            assertThat(notice.location()).isEqualTo("Old Cummer GO");
            assertThat(notice.stops()).singleElement().satisfies(stop -> {
                assertThat(stop.stopId()).isEqualTo("OL");
                assertThat(stop.stopName()).isEqualTo("Old Cummer GO");
            });
        });
        assertThat(response.notices()).anySatisfy(notice -> {
            assertThat(notice.id()).isEqualTo("regional-notice-GO-BUS-31");
            assertThat(notice.routeType()).isEqualTo("GO Bus");
            assertThat(notice.routeIds()).containsExactly("31");
            assertThat(notice.title()).isEqualTo("Route 31 buses are detouring");
            assertThat(notice.category()).isEqualTo("detour");
        });
        assertThat(response.notices()).extracting(notice -> notice.id())
            .doesNotContain("regional-notice-GO-RAIL-KI");
    }

    @Test
    void appliesCategoryAndTextFiltersWithoutPublishingStaleRows() {
        when(freshness.isFresh()).thenReturn(true);
        when(properties.getMaxDashboardAge()).thenReturn(java.time.Duration.ofMinutes(10));
        when(repository.findActiveRecords(any())).thenReturn(List.of(
            record(MetrolinxSourceSystem.GO_INFORMATION_ALERTS, "M1", """
                {"Code":"M1","SubjectEnglish":"Barrie pathway notice","BodyEnglish":"Use the east entrance.",
                 "Category":"General Information","Lines":[{"Code":"BR"}],"Stops":[]}
                """),
            record(MetrolinxSourceSystem.GO_INFORMATION_ALERTS, "M2", """
                {"Code":"M2","SubjectEnglish":"Kitchener detour","BodyEnglish":"Buses are detouring.",
                 "Category":"General Information","Lines":[{"Code":"GT"}],"Stops":[]}
                """)));

        SurfaceServiceNoticesResponse filtered = service().getSurfaceNotices("detour", "kitchener", 10);
        assertThat(filtered.notices()).extracting(notice -> notice.id()).containsExactly("regional-notice-M2");

        when(freshness.isFresh()).thenReturn(false);
        SurfaceServiceNoticesResponse stale = service().getSurfaceNotices(null, null, null);
        assertThat(stale.fresh()).isFalse();
        assertThat(stale.notices()).isEmpty();
    }

    @Test
    void linksAnUntaggedStationNoticeToItsSingleCatalogCorridor() {
        when(freshness.isFresh()).thenReturn(true);
        when(properties.getMaxDashboardAge()).thenReturn(java.time.Duration.ofMinutes(10));
        when(repository.findActiveRecords(any())).thenReturn(List.of(
            record(MetrolinxSourceSystem.GO_INFORMATION_ALERTS, "KITCHENER-WORK", """
                {"Code":"KITCHENER-WORK","SubjectEnglish":"Kitchener Line Service Adjustments Sept. 19-20",
                 "BodyEnglish":"No GO train service at Kitchener GO due to planned construction.",
                 "Category":"General Information","SubCategory":"E-Ticket",
                 "Lines":[],"Stops":[{"Name":"Kitchener GO","Code":"KI"}]}
                """)));

        assertThat(service().getSurfaceNotices(null, null, null).notices())
            .singleElement().satisfies(notice -> assertThat(notice.routeIds()).containsExactly("KI"));
    }

    @Test
    void usesAnExplicitCorridorNameToDisambiguateASharedStation() {
        when(freshness.isFresh()).thenReturn(true);
        when(properties.getMaxDashboardAge()).thenReturn(java.time.Duration.ofMinutes(10));
        when(repository.findActiveRecords(any())).thenReturn(List.of(
            record(MetrolinxSourceSystem.GO_INFORMATION_ALERTS, "BLOOR-WORK", """
                {"Code":"BLOOR-WORK","SubjectEnglish":"Kitchener Line Service Adjustments Sept. 19-20",
                 "BodyEnglish":"No GO Transit service at Bloor GO due to planned construction.",
                 "Category":"General Information","SubCategory":"E-Ticket",
                 "Lines":[],"Stops":[{"Name":"Bloor GO","Code":"BL"}]}
                """)));

        assertThat(service().getSurfaceNotices(null, null, null).notices())
            .singleElement().satisfies(notice -> assertThat(notice.routeIds()).containsExactly("KI"));
    }

    @Test
    void canonicalConstructionClosureDoesNotAlsoAppearAsAnOrdinaryServiceChange() throws Exception {
        String payload = """
            {"Code":"BLOOR-CLOSURE", "PostedDateTime":"2026-07-28 09:00:00",
             "SubjectEnglish":"Kitchener Line Service Adjustments Oct. 3-4",
             "BodyEnglish":"No GO Transit service at this station due to planned construction.",
             "SubCategory":"E-Ticket", "Lines":[], "Stops":[{"Code":"BL"}]}
            """;
        var source = new MetrolinxFetchedRecord(MetrolinxSourceSystem.GO_INFORMATION_ALERTS,
            "BLOOR-CLOSURE", payload);
        var feed = new MetrolinxFeed(OffsetDateTime.now(CLOCK), List.of(source), java.util.Map.of());
        var normalizer = new MetrolinxAlertNormalizer(CLOCK);
        var classifications = normalizer.classify(feed);
        assertThat(normalizer.normalize(feed, classifications)).singleElement()
            .satisfies(alert -> assertThat(alert.impactKind()).isEqualTo("planned-closure"));
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper().findAndRegisterModules();
        when(freshness.isFresh()).thenReturn(true);
        when(properties.getMaxDashboardAge()).thenReturn(java.time.Duration.ofMinutes(10));
        when(repository.findActiveRecords(any())).thenReturn(List.of(
            new RegionalSurfaceServiceNoticeReadRepository.SourceRecord(source.sourceSystem(),
                source.sourceId(), payload, OffsetDateTime.now(CLOCK),
                mapper.writeValueAsString(classifications.getFirst()))));
        assertThat(service().getSurfaceNotices(null, null, null).notices()).isEmpty();
    }

    private RegionalSurfaceServiceNoticeService service() {
        return new RegionalSurfaceServiceNoticeService(repository, freshness,
            new com.fasterxml.jackson.databind.ObjectMapper().findAndRegisterModules(), CLOCK, properties);
    }

    @Test
    void exposesRailTimetableAnnouncementsWithoutInventingStationCoverage() {
        when(freshness.isFresh()).thenReturn(true);
        when(properties.getMaxDashboardAge()).thenReturn(java.time.Duration.ofMinutes(10));
        when(repository.findActiveRecords(any())).thenReturn(List.of(
            record(MetrolinxSourceSystem.GO_SERVICE_ALERTS, "M0000524298", """
                {"Code":"M0000524298","SubjectEnglish":"Service changes start Sept. 8",
                 "BodyEnglish":"Weekday service will be adjusted. Trains from Allandale Waterfront GO to Union Station and Union Station to Aurora GO will not run.",
                 "SubCategory":"Train Delay","Lines":[{"Code":"BR"}],"Stops":[]}
                """),
            record(MetrolinxSourceSystem.GO_SERVICE_ALERTS, "M0000524291", """
                {"Code":"M0000524291","SubjectEnglish":"Service changes start Sept. 8",
                 "BodyEnglish":"Weekday service will be adjusted. Trains from Mount Joy to Union Station will not run. New trains to Old Elm GO.",
                 "SubCategory":"Train Delay","Lines":[{"Code":"ST"}],"Stops":[]}
                """),
            record(MetrolinxSourceSystem.GO_GTFS_ALERTS, "524298", """
                {"id":"524298","alert":{"effect":"SIGNIFICANT_DELAYS",
                 "header_text":{"translation":[{"language":"en","text":"Service changes start Sept. 8"}]},
                 "description_text":{"translation":[{"language":"en","text":"Weekday service will be adjusted."}]},
                 "informed_entity":[{"route_id":"09261126-BR"}]}}
                """),
            record(MetrolinxSourceSystem.GO_SERVICE_ALERTS, "delay", """
                {"SubjectEnglish":"Track issue","BodyEnglish":"Trains delayed between Aurora and Union.",
                 "SubCategory":"Train Delay","Lines":[{"Code":"BR"}]}
                """)
        ));
        var service = new RegionalSurfaceServiceNoticeService(repository, freshness,
            new com.fasterxml.jackson.databind.ObjectMapper(), CLOCK, properties);
        var response = service.getSurfaceNotices(null, null, null);
        assertThat(response.notices()).hasSize(2).allSatisfy(notice -> {
            assertThat(notice.category()).isEqualTo("service-change");
            assertThat(notice.location()).isEmpty();
            assertThat(notice.stopIds()).isEmpty();
            assertThat(notice.routeIds()).hasSize(1);
        });
    }

    @Test
    void gtfsOnlyTimetableNoticeRemainsVisibleAndSearchableByCorridor() {
        when(freshness.isFresh()).thenReturn(true);
        when(properties.getMaxDashboardAge()).thenReturn(java.time.Duration.ofMinutes(10));
        when(repository.findActiveRecords(any())).thenReturn(List.of(
            record(MetrolinxSourceSystem.GO_GTFS_ALERTS, "524291", """
                {"id":"524291","alert":{"effect":"SIGNIFICANT_DELAYS",
                 "header_text":{"translation":[{"language":"en","text":"Service changes start Sept. 8"}]},
                 "description_text":{"translation":[{"language":"en","text":"Weekday service will be adjusted from Mount Joy to Union Station and Old Elm."}]},
                 "informed_entity":[{"route_id":"09261126-ST"}]}}
                """)
        ));
        var service = new RegionalSurfaceServiceNoticeService(repository, freshness,
            new com.fasterxml.jackson.databind.ObjectMapper(), CLOCK, properties);
        assertThat(service.getSurfaceNotices("service-change", "ST", null).notices())
            .singleElement().satisfies(notice -> {
                assertThat(notice.routeIds()).containsExactly("ST");
                assertThat(notice.routeType()).isEqualTo("GO / UP");
                assertThat(notice.location()).isEmpty();
            });
    }

    @Test
    void busTimetableAnnouncementsRemainBusNotices() {
        when(freshness.isFresh()).thenReturn(true);
        when(properties.getMaxDashboardAge()).thenReturn(java.time.Duration.ofMinutes(10));
        when(repository.findActiveRecords(any())).thenReturn(List.of(
            record(MetrolinxSourceSystem.GO_GTFS_ALERTS, "bus-schedule", """
                {"alert":{"header_text":{"translation":[{"language":"en","text":"Service changes start Sept. 5"}]},
                 "description_text":{"translation":[{"language":"en","text":"Weekday bus schedules change."}]},
                 "informed_entity":[{"route_id":"202609-31"}]}}
                """)
        ));
        var service = new RegionalSurfaceServiceNoticeService(repository, freshness,
            new com.fasterxml.jackson.databind.ObjectMapper(), CLOCK, properties);
        assertThat(service.getSurfaceNotices(null, null, null).notices()).singleElement().satisfies(notice -> {
            assertThat(notice.routeType()).isEqualTo("GO Bus");
            assertThat(notice.routeIds()).containsExactly("31");
        });
    }

    @Test
    void holidayScheduleIsVisibleFromEitherFeedAndDeduplicatedAcrossFeeds() {
        var rest = record(MetrolinxSourceSystem.GO_SERVICE_ALERTS, "M0000525000", """
            {"Code":"M0000525000",
             "SubjectEnglish":"We are running on a Saturday schedule on September 7 for Labour Day",
             "BodyEnglish":"There will be no GO train service on Richmond Hill or Milton lines.GO bus service will also be running on a Saturday schedule.",
             "Lines":[{"Code":"LE"}],"Stops":[]}
            """);
        var gtfs = record(MetrolinxSourceSystem.GO_GTFS_ALERTS, "525000", """
            {"id":"525000","alert":{"effect":"NO_SERVICE",
             "header_text":{"translation":[{"language":"en","text":"We are running on a Saturday schedule on September 7 for Labour Day"}]},
             "description_text":{"translation":[{"language":"en","text":"There will be no GO train service on Richmond Hill or Milton lines."}]},
             "informed_entity":[{"route_id":"202609-LE"}]}}
            """);
        when(freshness.isFresh()).thenReturn(true);
        when(properties.getMaxDashboardAge()).thenReturn(java.time.Duration.ofMinutes(10));
        for (var records : List.of(List.of(rest), List.of(gtfs), List.of(rest, gtfs))) {
            when(repository.findActiveRecords(any())).thenReturn(records);
            assertThat(service().getSurfaceNotices("service-change", "LE", null).notices())
                .singleElement().satisfies(notice -> {
                    assertThat(notice.id()).isEqualTo("regional-notice-525000");
                    assertThat(notice.scheduleAnnouncement()).isTrue();
                    assertThat(notice.routeIds()).containsExactly("LE");
                    assertThat(notice.description()).contains("Richmond Hill or Milton");
                    assertThat(notice.location()).isEmpty();
                    assertThat(notice.stopIds()).isEmpty();
                });
        }
    }

    @Test
    void exposesLinkedTimetableAndUncertainStartAsNotices() throws Exception {
        String payload = """
            {"Code":"M0000528001","PostedDateTime":"2026-09-18 09:00:00",
             "SubjectEnglish":"UP Express closure September 19–20",
             "BodyEnglish":"Starting late-evening tonight, GO buses replace UP Express trains. No train service on the UP Express line September 19–20. On Monday September 21, the timetable will be adjusted.",
             "Lines":[{"Code":"UP"}],"Stops":[]}
            """;
        MetrolinxFetchedRecord record = new MetrolinxFetchedRecord(
            MetrolinxSourceSystem.GO_SERVICE_ALERTS, "M0000528001", payload);
        var classification = new MetrolinxAlertNormalizer(CLOCK).classify(new MetrolinxFeed(
            OffsetDateTime.parse("2026-09-18T14:00:00Z"), List.of(record), java.util.Map.of())).getFirst();
        String json = new com.fasterxml.jackson.databind.ObjectMapper().findAndRegisterModules()
            .writeValueAsString(classification);
        when(freshness.isFresh()).thenReturn(true);
        when(properties.getMaxDashboardAge()).thenReturn(java.time.Duration.ofMinutes(10));
        when(repository.findActiveRecords(any())).thenReturn(List.of(
            new RegionalSurfaceServiceNoticeReadRepository.SourceRecord(
                record.sourceSystem(), record.sourceId(), payload,
                OffsetDateTime.parse("2026-09-18T14:00:00Z"), json)));

        var notices = service().getSurfaceNotices(null, null, null).notices();
        assertThat(notices).extracting(notice -> notice.title())
            .anySatisfy(title -> assertThat(title).startsWith("Advisory"))
            .anySatisfy(title -> assertThat(title).startsWith("Timetable adjustment"));
        assertThat(notices).allSatisfy(notice -> assertThat(notice.routeIds()).contains("UP"));
    }

    private RegionalSurfaceServiceNoticeReadRepository.SourceRecord record(String source, String id, String payload) {
        return new RegionalSurfaceServiceNoticeReadRepository.SourceRecord(
            source, id, payload, OffsetDateTime.parse("2026-07-30T13:55:00Z")
        );
    }
}
