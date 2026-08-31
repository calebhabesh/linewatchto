package com.calebhabesh.linewatch.health;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.stationnotice.TtcStationNoticeMonitorProperties;
import com.calebhabesh.linewatch.stationnotice.TtcStationNoticeMonitorStore;
import com.calebhabesh.linewatch.stationnotice.TtcStationNoticeMonitorStore.MonitorRun;
import java.time.OffsetDateTime;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class StationNoticeHealthControllerTest {
    @Mock private TtcStationNoticeMonitorStore store;

    @Test
    void reportsSafeRunMetadataAndPendingReviewCount() {
        TtcStationNoticeMonitorProperties properties = new TtcStationNoticeMonitorProperties();
        properties.setEnabled(true);
        OffsetDateTime started = OffsetDateTime.parse("2026-08-31T12:00:00-04:00");
        when(store.findLatestRun()).thenReturn(Optional.of(new MonitorRun(
            7L, "partial", started, started.plusMinutes(2), 110, 105, 4, 101, 1, 1, 1,
            "private low-level failure detail"
        )));
        when(store.countPendingCandidates()).thenReturn(2);

        var response = new StationNoticeHealthController(store, properties).health();

        assertThat(response.enabled()).isTrue();
        assertThat(response.status()).isEqualTo("partial");
        assertThat(response.pagesFetched()).isEqualTo(4);
        assertThat(response.pageFailures()).isEqualTo(1);
        assertThat(response.pendingReview()).isEqualTo(2);
        assertThat(response.toString()).doesNotContain("private low-level failure detail");
    }
}
