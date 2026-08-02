package com.calebhabesh.linewatch.announcement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

class TtcAnnouncementServiceTest {
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-06-01T15:00:00Z"), ZoneOffset.UTC);
    private final TtcAnnouncementReadRepository repository = mock(TtcAnnouncementReadRepository.class);
    private final IngestionFreshness freshness = mock(IngestionFreshness.class);
    private final TtcUpdatesService updatesService = mock(TtcUpdatesService.class);
    private final TtcAnnouncementService service = new TtcAnnouncementService(repository, freshness, updatesService, CLOCK);

    @Test
    void suppressesAnnouncementsWhenTtcIngestionIsStale() {
        when(freshness.isDashboardFresh()).thenReturn(false);
        when(updatesService.current()).thenReturn(new TtcUpdatesService.Snapshot(false, OffsetDateTime.now(CLOCK), List.of()));

        TtcAnnouncementResponses.Response response = service.getAnnouncements(null, null);

        assertThat(response.fresh()).isFalse();
        assertThat(response.announcements()).isEmpty();
    }

    @Test
    void returnsSearchableFreshAnnouncements() {
        when(freshness.isDashboardFresh()).thenReturn(true);
        when(updatesService.current()).thenReturn(new TtcUpdatesService.Snapshot(false, OffsetDateTime.now(CLOCK), List.of()));
        when(repository.findActive()).thenReturn(List.of(
            announcement("one", "Station entrance closure"),
            announcement("two", "Fare payment update")
        ));

        TtcAnnouncementResponses.Response response = service.getAnnouncements("fare", 10);

        assertThat(response.fresh()).isTrue();
        assertThat(response.announcements()).extracting(TtcAnnouncementResponses.Detail::id)
            .containsExactly("two");
        assertThat(response.announcements().getFirst().source())
            .isEqualTo("TTC Live Alerts announcements");
    }

    @Test
    void returnsTtcCaUpdatesWithoutARecentLiveAlertsRun() {
        when(freshness.isDashboardFresh()).thenReturn(false);
        when(updatesService.current()).thenReturn(new TtcUpdatesService.Snapshot(
            true,
            OffsetDateTime.now(CLOCK),
            List.of(new TtcAnnouncementResponses.Detail(
                "ttc-update-fares",
                "update",
                "Monthly fare capping is coming to the TTC",
                "",
                "https://www.ttc.ca/riding-the-ttc/Updates/monthly-fare-capping",
                null,
                null,
                null,
                TtcUpdatesService.SOURCE
            ))
        ));

        TtcAnnouncementResponses.Response response = service.getAnnouncements("fare", null);

        assertThat(response.fresh()).isTrue();
        assertThat(response.source()).isEqualTo("TTC.ca Updates");
        assertThat(response.announcements()).extracting(TtcAnnouncementResponses.Detail::scope)
            .containsExactly("update");
    }

    private TtcAnnouncement announcement(String id, String title) {
        OffsetDateTime now = OffsetDateTime.now(CLOCK);
        return new TtcAnnouncement(
            id, "site-wide:" + id, "site-wide", title, "Details", null,
            now.minusHours(1), null, now, "{}"
        );
    }
}
