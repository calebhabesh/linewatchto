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
                """)));

        RegionalSurfaceServiceNoticeService service = service();
        SurfaceServiceNoticesResponse response = service.getSurfaceNotices(null, null, null);

        assertThat(response.fresh()).isTrue();
        assertThat(response.source()).isEqualTo("Metrolinx GO information + marketing alerts");
        assertThat(response.notices()).hasSize(2);
        assertThat(response.notices()).anySatisfy(notice -> {
            assertThat(notice.id()).isEqualTo("regional-notice-M0000508515");
            assertThat(notice.routeIds()).containsExactly("MI");
            assertThat(notice.title()).isEqualTo("Platform construction underway");
            assertThat(notice.location()).isEqualTo("Cooksville GO");
            assertThat(notice.category()).isEqualTo("service-change");
        });
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
