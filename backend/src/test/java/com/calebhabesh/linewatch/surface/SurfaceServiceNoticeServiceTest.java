package com.calebhabesh.linewatch.surface;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import com.calebhabesh.linewatch.arrival.schedule.GtfsScheduleReadRepository;
import com.calebhabesh.linewatch.surface.SurfaceServiceNoticeResponses.*;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class SurfaceServiceNoticeServiceTest {
    @Mock
    private SurfaceServiceNoticeReadRepository repository;
    @Mock
    private IngestionFreshness ingestionFreshness;
    @Mock
    private GtfsScheduleReadRepository scheduleRepository;

    private final Clock clock = Clock.fixed(Instant.parse("2026-06-14T15:40:00Z"), ZoneId.of("UTC"));

    private SurfaceServiceNoticeService getService() {
        return new SurfaceServiceNoticeService(repository, scheduleRepository, ingestionFreshness, clock);
    }

    @Test
    void enrichesNumericAlertStopsFromTheActiveGtfsStopCatalog() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        OffsetDateTime now = OffsetDateTime.now(clock);
        when(repository.findActiveNotices()).thenReturn(List.of(new SurfaceServiceNotice(
            "ttc-surface-live-2032", "live-2032", "no-service", "Bus", "Stop 2032", "", "", null,
            "NO_SERVICE", "No Service", null, null, "Other Cause.", now, null, now, true, "{}",
            List.of("29C"), List.of(new SurfaceServiceNotice.StopDetail("2032", "2032"))
        )));
        when(scheduleRepository.findActiveStopNames(List.of("2032")))
            .thenReturn(java.util.Map.of("2032", "Dufferin Gate Loop"));

        NoticeDetail detail = getService().getSurfaceNotices(null, null, null).notices().getFirst();

        assertThat(detail.location()).isEqualTo("Dufferin Gate Loop");
        assertThat(detail.stops()).containsExactly(new StopDetail("2032", "Dufferin Gate Loop"));
    }

    @Test
    void completeCollectionDoesNotTruncateRouteFiltersAtOneHundredNotices() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        OffsetDateTime now = OffsetDateTime.now(clock);
        when(repository.findActiveNotices()).thenReturn(java.util.stream.IntStream.range(0, 120)
            .mapToObj(index -> new SurfaceServiceNotice(
                "notice-" + index, "" + index, "bypass", "Bus", "Stop bypass", "", "Stop", null,
                null, null, null, null, null, now, null, now, true, "{}",
                List.of("" + index), List.of())).toList());
        assertThat(getService().getSurfaceNotices(null, null, null).notices()).hasSize(120);
        assertThat(getService().getSurfaceNotices(null, null, 10).notices()).hasSize(10);
    }

    @Test
    void staleIngestionReturnsEmptyFreshFalseResponse() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(false);
        SurfaceServiceNoticeService service = getService();

        SurfaceServiceNoticesResponse response = service.getSurfaceNotices(null, null, null);

        assertThat(response.fresh()).isFalse();
        assertThat(response.categories()).isEmpty();
        assertThat(response.notices()).isEmpty();
    }

    @Test
    void defaultOrderPutsServiceAlertsBeforeAdvisoriesThenUsesImpactAndRoute() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        OffsetDateTime now = OffsetDateTime.now(clock);
        SurfaceServiceNotice advisory = classifiedNotice(
            "advisory", "1", "no-service", SurfaceServiceNotice.SERVICE_ADVISORY, now.plusMinutes(3));
        SurfaceServiceNotice route100Alert = classifiedNotice(
            "route-100", "100", "detour", SurfaceServiceNotice.SERVICE_ALERT, now.plusMinutes(2));
        SurfaceServiceNotice route50Alert = classifiedNotice(
            "route-50", "50", "detour", SurfaceServiceNotice.SERVICE_ALERT, now.plusMinutes(1));
        SurfaceServiceNotice noServiceAlert = classifiedNotice(
            "no-service", "999", "no-service", SurfaceServiceNotice.SERVICE_ALERT, now);
        when(repository.findActiveNotices()).thenReturn(List.of(advisory, route100Alert, route50Alert, noServiceAlert));

        assertThat(getService().getSurfaceNotices(null, null, null).notices())
            .extracting(NoticeDetail::id)
            .containsExactly("no-service", "route-50", "route-100", "advisory");
    }

    private SurfaceServiceNotice classifiedNotice(
        String id, String route, String category, String alertClass, OffsetDateTime updatedAt
    ) {
        return new SurfaceServiceNotice(
            id, id, category, "Bus", id, "", "", null,
            null, null, null, null, null, updatedAt.minusHours(1), null, updatedAt, true, "{}",
            List.of(route), List.of(), alertClass
        );
    }

    @Test
    void query509ReturnsOnlyRoute509NoticeInMixedFixture() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        OffsetDateTime now = OffsetDateTime.now(clock);

        SurfaceServiceNotice notice509 = new SurfaceServiceNotice(
            "ttc-surface-1", "1", "bypass", "Streetcar", "Streetcars bypass Exhibition", "", "Exhibition", null,
            null, null, "Both ways", null, null, now, null, now, true, "{}",
            List.of("509"), List.of(new SurfaceServiceNotice.StopDetail("13366", "Exhibition Loop"))
        );

        SurfaceServiceNotice notice88 = new SurfaceServiceNotice(
            "ttc-surface-2", "2", "service-change", "Bus", "Route change on 88", "", "88 Yonge", null,
            null, null, null, null, null, now, null, now, true, "{}",
            List.of("88"), List.of()
        );

        when(repository.findActiveNotices()).thenReturn(List.of(notice509, notice88));
        SurfaceServiceNoticeService service = getService();

        SurfaceServiceNoticesResponse response = service.getSurfaceNotices(null, "509", null);

        assertThat(response.fresh()).isTrue();
        assertThat(response.notices()).hasSize(1);
        assertThat(response.notices().get(0).id()).isEqualTo("ttc-surface-1");
    }

    @Test
    void categoryFilterExcludesOtherCategories() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        OffsetDateTime now = OffsetDateTime.now(clock);

        SurfaceServiceNotice notice509 = new SurfaceServiceNotice(
            "ttc-surface-1", "1", "bypass", "Streetcar", "Streetcars bypass Exhibition", "", "Exhibition", null,
            null, null, "Both ways", null, null, now, null, now, true, "{}",
            List.of("509"), List.of(new SurfaceServiceNotice.StopDetail("13366", "Exhibition Loop"))
        );

        SurfaceServiceNotice notice88 = new SurfaceServiceNotice(
            "ttc-surface-2", "2", "service-change", "Bus", "Route change on 88", "", "88 Yonge", null,
            null, null, null, null, null, now, null, now, true, "{}",
            List.of("88"), List.of()
        );

        when(repository.findActiveNotices()).thenReturn(List.of(notice509, notice88));
        SurfaceServiceNoticeService service = getService();

        SurfaceServiceNoticesResponse response = service.getSurfaceNotices("service-change", null, null);

        assertThat(response.fresh()).isTrue();
        assertThat(response.notices()).hasSize(1);
        assertThat(response.notices().get(0).id()).isEqualTo("ttc-surface-2");
        assertThat(response.categories()).hasSize(5); // all summaries returned
        assertThat(response.categories().stream().filter(c -> c.category().equals("service-change")).findFirst().get().count()).isEqualTo(1);
        assertThat(response.categories().stream().filter(c -> c.category().equals("bypass")).findFirst().get().count()).isEqualTo(1);
    }

    @Test
    void synthesizesStopIdAndStopNameVariantsIntoOneStopNotice() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        OffsetDateTime activeStart = OffsetDateTime.parse("2026-06-12T07:13:00Z");
        OffsetDateTime numericUpdated = OffsetDateTime.parse("2026-06-15T12:00:00Z");
        OffsetDateTime namedUpdated = OffsetDateTime.parse("2026-06-12T13:00:00Z");

        SurfaceServiceNotice numericStopNotice = new SurfaceServiceNotice(
            "ttc-surface-live-1063", "live-1063", "bypass", "Streetcar", "1063", "", "", null,
            "BYPASS", "Bypass", "Westbound", null, "Other Cause.", activeStart, null, numericUpdated, true, "{}",
            List.of("509"), List.of(new SurfaceServiceNotice.StopDetail("1063", "1063"))
        );

        SurfaceServiceNotice namedStopNotice = new SurfaceServiceNotice(
            "ttc-surface-gtfs-1063", "gtfs-1063", "bypass", "Streetcar",
            "Streetcars are not stopping at Manitoba Dr at Strachan Ave West Side",
            "Streetcars are not stopping at Manitoba Dr at Strachan Ave West Side due to FIFA World Cup route adjustments.",
            "509 Harbourfront - Service change", null,
            "BYPASS", "Bypass", "Westbound", null, "FIFA World Cup route adjustments.",
            activeStart, null, namedUpdated, true, "{}",
            List.of("509"),
            List.of(new SurfaceServiceNotice.StopDetail("Manitoba Dr at Strachan Ave West Side", "Manitoba Dr at Strachan Ave West Side")),
            SurfaceServiceNotice.SERVICE_ADVISORY
        );

        when(repository.findActiveNotices()).thenReturn(List.of(numericStopNotice, namedStopNotice));
        SurfaceServiceNoticeService service = getService();

        SurfaceServiceNoticesResponse response = service.getSurfaceNotices("bypass", null, null);

        assertThat(response.notices()).hasSize(1);
        NoticeDetail detail = response.notices().getFirst();
        assertThat(detail.location()).isEqualTo("Manitoba Dr at Strachan Ave West Side");
        assertThat(detail.stopIds()).containsExactly("1063");
        assertThat(detail.cause()).isEqualTo("FIFA World Cup route adjustments.");
        assertThat(detail.updatedAt()).isEqualTo(numericUpdated);
        assertThat(detail.alertClass()).isEqualTo(SurfaceServiceNotice.SERVICE_ALERT);
        assertThat(response.categories().stream().filter(c -> c.category().equals("bypass")).findFirst().get().count()).isEqualTo(1);
    }

    @Test
    void synthesizesLongNoServiceStopIdListIntoNamedEndpoints() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        OffsetDateTime activeStart = OffsetDateTime.parse("2026-06-15T07:08:00Z");
        OffsetDateTime numericUpdated = OffsetDateTime.parse("2026-06-15T12:05:00Z");
        OffsetDateTime namedUpdated = OffsetDateTime.parse("2026-06-15T11:46:00Z");

        SurfaceServiceNotice numericStopNotice = new SurfaceServiceNotice(
            "ttc-surface-live-925", "live-925", "no-service", "Bus",
            "5989, 16697, 2979, 2980, 4520, 8349, 8350, 8358, 8344, 9498, 8352, 2987, 1935",
            "", "", null, "NO_SERVICE", "No Service", null, "POLICE_ACTIVITY", "Police Activity.",
            activeStart, null, numericUpdated, true, "{}",
            List.of("925"),
            List.of(
                new SurfaceServiceNotice.StopDetail("5989", "5989"),
                new SurfaceServiceNotice.StopDetail("16697", "16697"),
                new SurfaceServiceNotice.StopDetail("2979", "2979"),
                new SurfaceServiceNotice.StopDetail("2980", "2980"),
                new SurfaceServiceNotice.StopDetail("4520", "4520"),
                new SurfaceServiceNotice.StopDetail("8349", "8349"),
                new SurfaceServiceNotice.StopDetail("8350", "8350"),
                new SurfaceServiceNotice.StopDetail("8358", "8358"),
                new SurfaceServiceNotice.StopDetail("8344", "8344"),
                new SurfaceServiceNotice.StopDetail("9498", "9498"),
                new SurfaceServiceNotice.StopDetail("8352", "8352"),
                new SurfaceServiceNotice.StopDetail("2987", "2987"),
                new SurfaceServiceNotice.StopDetail("1935", "1935")
            )
        );

        SurfaceServiceNotice namedEndpointNotice = new SurfaceServiceNotice(
            "ttc-surface-live-925-names", "live-925-names", "no-service", "Bus",
            "Pape Ave at O'Connor Dr, Don Mills Rd at Gateway Blvd (North)",
            "", "", null, "NO_SERVICE", "No Service", "Both ways", "POLICE_ACTIVITY", "Police Activity.",
            activeStart, null, namedUpdated, true, "{}",
            List.of("925"),
            List.of(
                new SurfaceServiceNotice.StopDetail("Pape Ave at O'Connor Dr", "Pape Ave at O'Connor Dr"),
                new SurfaceServiceNotice.StopDetail("Don Mills Rd at Gateway Blvd (North)", "Don Mills Rd at Gateway Blvd (North)")
            )
        );

        when(repository.findActiveNotices()).thenReturn(List.of(numericStopNotice, namedEndpointNotice));
        SurfaceServiceNoticeService service = getService();

        SurfaceServiceNoticesResponse response = service.getSurfaceNotices("no-service", null, null);

        assertThat(response.notices()).hasSize(1);
        NoticeDetail detail = response.notices().getFirst();
        assertThat(detail.location()).isEqualTo("Pape Ave at O'Connor Dr to Don Mills Rd at Gateway Blvd (North)");
        assertThat(detail.stopIds()).containsExactly("5989", "1935");
        assertThat(detail.direction()).isEqualTo("Both ways");
        assertThat(detail.updatedAt()).isEqualTo(numericUpdated);
        assertThat(response.categories().stream().filter(c -> c.category().equals("no-service")).findFirst().get().count()).isEqualTo(1);
    }

    @Test
    void synthesizesTwoStopNoServiceIdAndNameEndpointsWhenSiblingNoticeIsPresent() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        OffsetDateTime numericActiveStart = OffsetDateTime.parse("2026-06-15T07:08:28Z");
        OffsetDateTime namedActiveStart = OffsetDateTime.parse("2026-06-15T07:08:28.780Z");
        OffsetDateTime numericUpdated = OffsetDateTime.parse("2026-06-15T12:05:00Z");
        OffsetDateTime namedUpdated = OffsetDateTime.parse("2026-06-15T11:46:00Z");

        SurfaceServiceNotice numericEndpointNotice = new SurfaceServiceNotice(
            "ttc-surface-live-325-ids", "live-325-ids", "no-service", "Bus",
            "5989, 1935", "", "", null, "NO_SERVICE", "No Service", null, "POLICE_ACTIVITY", "Police Activity.",
            numericActiveStart, null, numericUpdated, true, "{}",
            List.of("325"),
            List.of(
                new SurfaceServiceNotice.StopDetail("5989", "5989"),
                new SurfaceServiceNotice.StopDetail("1935", "1935")
            )
        );

        SurfaceServiceNotice namedEndpointNotice = new SurfaceServiceNotice(
            "ttc-surface-live-325-names", "live-325-names", "no-service", "Bus",
            "Pape Ave at O'Connor Dr, Don Mills Rd at Gateway Blvd (North)",
            "", "", null, "NO_SERVICE", "No Service", "Both ways", "POLICE_ACTIVITY", "Police Activity.",
            namedActiveStart, null, namedUpdated, true, "{}",
            List.of("325"),
            List.of(
                new SurfaceServiceNotice.StopDetail("Pape Ave at O'Connor Dr", "Pape Ave at O'Connor Dr"),
                new SurfaceServiceNotice.StopDetail("Don Mills Rd at Gateway Blvd (North)", "Don Mills Rd at Gateway Blvd (North)")
            )
        );

        SurfaceServiceNotice siblingNotice = new SurfaceServiceNotice(
            "ttc-surface-live-325-extra", "live-325-extra", "no-service", "Bus",
            "Police activity near Don Mills Station", "", "", null, "NO_SERVICE", "No Service", "Both ways",
            "POLICE_ACTIVITY", "Police Activity.", namedActiveStart, null, namedUpdated, true, "{}",
            List.of("325"),
            List.of(new SurfaceServiceNotice.StopDetail("1234", "Don Mills Station"))
        );

        when(repository.findActiveNotices()).thenReturn(List.of(numericEndpointNotice, namedEndpointNotice, siblingNotice));
        SurfaceServiceNoticeService service = getService();

        SurfaceServiceNoticesResponse response = service.getSurfaceNotices("no-service", null, null);

        assertThat(response.notices()).hasSize(2);
        NoticeDetail endpointDetail = response.notices().stream()
            .filter(notice -> notice.id().equals("ttc-surface-live-325-names"))
            .findFirst()
            .orElseThrow();
        assertThat(endpointDetail.location()).isEqualTo("Pape Ave at O'Connor Dr to Don Mills Rd at Gateway Blvd (North)");
        assertThat(endpointDetail.stopIds()).containsExactly("5989", "1935");
        assertThat(endpointDetail.stops()).extracting(StopDetail::stopName)
            .containsExactly("Pape Ave at O'Connor Dr", "Don Mills Rd at Gateway Blvd (North)");
        assertThat(response.notices()).extracting(NoticeDetail::location)
            .doesNotContain("Stop 5989 to Stop 1935");
        assertThat(response.categories().stream().filter(c -> c.category().equals("no-service")).findFirst().get().count()).isEqualTo(2);
    }

    @Test
    void serviceAdvisoryRouteBranchIsDisplayedForExistingStoredNotice() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        OffsetDateTime activeStart = OffsetDateTime.parse("2026-04-20T09:00:00Z");

        SurfaceServiceNotice notice = new SurfaceServiceNotice(
            "ttc-surface-gtfsrt-101",
            "gtfsrt-101",
            "service-change",
            "Bus",
            "To Leslie Station Via Laird Station – Temporary route change due to bridge work",
            "",
            "To Leslie Station Via Laird Station – Temporary route change due to bridge work",
            "https://www.ttc.ca/service-advisories/Service-Changes/51-Temporary-route-change-due-to-bridge-work",
            "MODIFIED_SERVICE",
            "Modified Service",
            null,
            null,
            null,
            activeStart,
            OffsetDateTime.parse("2026-06-21T21:00:00Z"),
            OffsetDateTime.parse("2026-06-15T08:36:37Z"),
            true,
            "{}",
            List.of("51"),
            List.of()
        );

        when(repository.findActiveNotices()).thenReturn(List.of(notice));
        SurfaceServiceNoticeService service = getService();

        SurfaceServiceNoticesResponse response = service.getSurfaceNotices("service-change", null, null);

        assertThat(response.notices()).hasSize(1);
        assertThat(response.notices().getFirst().routeIds()).containsExactly("51A");

        SurfaceServiceNoticesResponse queryResponse = service.getSurfaceNotices("service-change", "51A", null);

        assertThat(queryResponse.notices()).hasSize(1);
        assertThat(queryResponse.notices().getFirst().routeIds()).containsExactly("51A");
    }

    @Test
    void explicitStreetcarBranchIsDisplayedForExistingStoredNotice() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        OffsetDateTime activeStart = OffsetDateTime.parse("2026-06-01T00:00:00Z");

        SurfaceServiceNotice notice = new SurfaceServiceNotice(
            "ttc-surface-gtfsrt-504b",
            "gtfsrt-504b",
            "service-change",
            "Streetcar",
            "Route change due to FIFA World Cup 2026",
            "",
            "504B King - Route change due to FIFA World Cup 2026",
            "https://www.ttc.ca/service-advisories/Service-Changes/504B-Route-change-due-to-FIFA-World-Cup-2026",
            "MODIFIED_SERVICE",
            "Modified Service",
            null,
            null,
            "FIFA World Cup 2026.",
            activeStart,
            OffsetDateTime.parse("2026-07-31T04:00:00Z"),
            OffsetDateTime.parse("2026-06-30T11:14:00Z"),
            true,
            "{}",
            List.of("504"),
            List.of()
        );

        when(repository.findActiveNotices()).thenReturn(List.of(notice));
        SurfaceServiceNoticeService service = getService();

        SurfaceServiceNoticesResponse response = service.getSurfaceNotices("service-change", null, null);

        assertThat(response.notices()).hasSize(1);
        assertThat(response.notices().getFirst().routeIds()).containsExactly("504B");

        SurfaceServiceNoticesResponse queryResponse = service.getSurfaceNotices("service-change", "504B", null);

        assertThat(queryResponse.notices()).hasSize(1);
        assertThat(queryResponse.notices().getFirst().routeIds()).containsExactly("504B");
    }

    @Test
    void unknownCategoryThrowsIllegalArgumentException() {
        SurfaceServiceNoticeService service = getService();
        assertThatThrownBy(() -> service.getSurfaceNotices("invalid", null, null))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("Invalid category");
    }
}
