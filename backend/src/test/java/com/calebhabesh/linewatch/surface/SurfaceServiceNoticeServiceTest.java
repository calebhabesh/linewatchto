package com.calebhabesh.linewatch.surface;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
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

    private final Clock clock = Clock.fixed(Instant.parse("2026-06-14T15:40:00Z"), ZoneId.of("UTC"));

    private SurfaceServiceNoticeService getService() {
        return new SurfaceServiceNoticeService(repository, ingestionFreshness, clock);
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
    void unknownCategoryThrowsIllegalArgumentException() {
        SurfaceServiceNoticeService service = getService();
        assertThatThrownBy(() -> service.getSurfaceNotices("invalid", null, null))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("Invalid category");
    }
}
