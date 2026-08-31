package com.calebhabesh.linewatch.stationnotice;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.stationnotice.TtcStationNoticeMonitorStore.KnownStation;
import com.calebhabesh.linewatch.stationnotice.TtcStationNoticeMonitorStore.NoticeCandidate;
import com.calebhabesh.linewatch.stationnotice.TtcStationNoticeMonitorStore.PageObservation;
import com.calebhabesh.linewatch.stationnotice.TtcStationNoticeMonitorStore.RunCompletion;
import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class TtcStationNoticeMonitorServiceTest {
    private static final URI ROOT = URI.create("https://www.ttc.ca/sitemap.xml");
    private static final URI CHILD = URI.create("https://www.ttc.ca/sitemap-1.xml");
    private static final URI WARDEN = URI.create("https://www.ttc.ca/subway-stations/warden-station");
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-08-31T17:00:00Z"), ZoneOffset.UTC);

    @Mock private TtcStationNoticeClient client;
    @Mock private TtcStationNoticeMonitorStore store;
    private TtcStationNoticeMonitorProperties properties;
    private TtcStationNoticeMonitorService service;

    @BeforeEach
    void setUp() {
        properties = new TtcStationNoticeMonitorProperties();
        properties.setRequestDelay(Duration.ZERO);
        service = new TtcStationNoticeMonitorService(
            client,
            new TtcStationSitemapParser(),
            new TtcStationPageNoticeParser(),
            store,
            properties,
            CLOCK
        );
        when(store.startRun(any())).thenReturn(41L);
        when(store.findKnownStations()).thenReturn(List.of(new KnownStation("warden", "Warden")));
        when(client.fetch(ROOT)).thenReturn("""
            <sitemapindex><sitemap><loc>https://www.ttc.ca/sitemap-1.xml</loc></sitemap></sitemapindex>
            """);
        when(client.fetch(CHILD)).thenReturn("""
            <urlset><url><loc>https://www.ttc.ca/subway-stations/warden-station</loc><lastmod>2026-07-30</lastmod></url></urlset>
            """);
    }

    @Test
    void firstDetectionStagesAReviewedCandidateAndStoresTheObservation() {
        when(store.findObservation("warden")).thenReturn(Optional.empty());
        when(client.fetch(WARDEN)).thenReturn("""
            <div class="component rich-text u-bt--red"><div class="component-content">
              <p><strong>Starting January 5, 2025,</strong> the bus terminal is closed.</p>
              <a href="/riding-the-ttc/Updates/Warden-Station-bus-terminal-closure">Details</a>
            </div></div>
            """);

        service.monitorNow();

        ArgumentCaptor<NoticeCandidate> candidate = ArgumentCaptor.forClass(NoticeCandidate.class);
        verify(store).stageCandidate(candidate.capture());
        assertThat(candidate.getValue().changeType()).isEqualTo("added");
        assertThat(candidate.getValue().stationId()).isEqualTo("warden");
        assertThat(candidate.getValue().currentNoticeText()).contains("bus terminal is closed");
        verify(store).saveObservation(any(PageObservation.class));

        ArgumentCaptor<RunCompletion> completion = ArgumentCaptor.forClass(RunCompletion.class);
        verify(store).finishRun(org.mockito.ArgumentMatchers.eq(41L), completion.capture());
        assertThat(completion.getValue().status()).isEqualTo("succeeded");
        assertThat(completion.getValue().pagesFetched()).isEqualTo(1);
        assertThat(completion.getValue().candidatesStaged()).isEqualTo(1);
    }

    @Test
    void unchangedSitemapDateSkipsTheStationPageRequest() {
        when(store.findObservation("warden")).thenReturn(Optional.of(new PageObservation(
            "warden", WARDEN.toString(), LocalDate.parse("2026-07-30"), "page-hash",
            "notice-hash", "Existing notice", WARDEN.toString(),
            OffsetDateTime.parse("2026-08-30T17:00:00Z"), OffsetDateTime.parse("2026-08-30T17:00:00Z")
        )));

        service.monitorNow();

        verify(client, never()).fetch(WARDEN);
        verify(store, never()).stageCandidate(any());
        ArgumentCaptor<RunCompletion> completion = ArgumentCaptor.forClass(RunCompletion.class);
        verify(store).finishRun(org.mockito.ArgumentMatchers.eq(41L), completion.capture());
        assertThat(completion.getValue().pagesUnchanged()).isEqualTo(1);
        assertThat(completion.getValue().pagesFetched()).isZero();
    }

    @Test
    void reviewedNoticeSourceBecomesTheBaselineWithoutASecondCandidate() {
        when(store.findObservation("warden")).thenReturn(Optional.empty());
        when(store.hasReviewedNoticeForSource(
            "warden",
            "https://www.ttc.ca/riding-the-ttc/Updates/Warden-Station-bus-terminal-closure"
        )).thenReturn(true);
        when(client.fetch(WARDEN)).thenReturn("""
            <div class="component rich-text u-bt--red"><div class="component-content">
              <p>The bus terminal is closed.</p>
              <a href="/riding-the-ttc/Updates/Warden-Station-bus-terminal-closure">Details</a>
            </div></div>
            """);

        service.monitorNow();

        verify(store, never()).stageCandidate(any());
        verify(store).saveObservation(any(PageObservation.class));
    }

    @Test
    void unchangedSitemapDateStillGetsAWeeklyFullRefresh() {
        when(store.findObservation("warden")).thenReturn(Optional.of(new PageObservation(
            "warden", WARDEN.toString(), LocalDate.parse("2026-07-30"), "page-hash",
            null, null, null,
            OffsetDateTime.parse("2026-08-01T17:00:00Z"), OffsetDateTime.parse("2026-08-20T17:00:00Z")
        )));
        when(client.fetch(WARDEN)).thenReturn("<html><body>No station notice</body></html>");

        service.monitorNow();

        verify(client).fetch(WARDEN);
        verify(store).saveObservation(any(PageObservation.class));
    }
}
