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
    void exposesFreshInformationAndMarketingCollectionsAsSearchableNotices() {
        when(freshness.isFresh()).thenReturn(true);
        when(properties.getMaxDashboardAge()).thenReturn(java.time.Duration.ofMinutes(10));
        when(repository.findActiveRecords(any())).thenReturn(List.of(
            record(MetrolinxSourceSystem.GO_INFORMATION_ALERTS, "M0000508515", """
                {"Code":"M0000508515","PostedDateTime":"2026-07-28 09:00:00",
                 "SubjectEnglish":"Platform construction underway",
                 "BodyEnglish":"Use the temporary platform while construction continues.",
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
        assertThat(response.source()).isEqualTo("Metrolinx GO information, marketing + GTFS-RT bus alerts");
        assertThat(response.notices()).hasSize(4);
        assertThat(response.notices()).anySatisfy(notice -> {
            assertThat(notice.id()).isEqualTo("regional-notice-M0000508515");
            assertThat(notice.routeIds()).containsExactly("MI");
            assertThat(notice.title()).isEqualTo("Platform construction underway");
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

    private RegionalSurfaceServiceNoticeService service() {
        return new RegionalSurfaceServiceNoticeService(repository, freshness, new com.fasterxml.jackson.databind.ObjectMapper(), CLOCK, properties);
    }

    private RegionalSurfaceServiceNoticeReadRepository.SourceRecord record(String source, String id, String payload) {
        return new RegionalSurfaceServiceNoticeReadRepository.SourceRecord(
            source, id, payload, OffsetDateTime.parse("2026-07-30T13:55:00Z")
        );
    }
}
