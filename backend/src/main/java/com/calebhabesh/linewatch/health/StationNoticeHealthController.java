package com.calebhabesh.linewatch.health;

import com.calebhabesh.linewatch.stationnotice.TtcStationNoticeMonitorProperties;
import com.calebhabesh.linewatch.stationnotice.TtcStationNoticeMonitorStore;
import com.calebhabesh.linewatch.stationnotice.TtcStationNoticeMonitorStore.MonitorRun;
import java.time.OffsetDateTime;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/health/station-notices")
public class StationNoticeHealthController {
    private final TtcStationNoticeMonitorStore store;
    private final TtcStationNoticeMonitorProperties properties;

    public StationNoticeHealthController(
        TtcStationNoticeMonitorStore store,
        TtcStationNoticeMonitorProperties properties
    ) {
        this.store = store;
        this.properties = properties;
    }

    @GetMapping
    public StationNoticeHealthResponse health() {
        MonitorRun run = store.findLatestRun().orElse(null);
        return new StationNoticeHealthResponse(
            properties.isEnabled(),
            !properties.isEnabled() ? "disabled" : run == null ? "not-run" : run.status(),
            run == null ? null : run.startedAt(),
            run == null ? null : run.completedAt(),
            run == null ? 0 : run.sitemapPagesDiscovered(),
            run == null ? 0 : run.mappedStationPages(),
            run == null ? 0 : run.pagesFetched(),
            run == null ? 0 : run.pagesUnchanged(),
            run == null ? 0 : run.noticeChanges(),
            run == null ? 0 : run.pageFailures(),
            store.countPendingCandidates()
        );
    }

    public record StationNoticeHealthResponse(
        boolean enabled,
        String status,
        OffsetDateTime startedAt,
        OffsetDateTime completedAt,
        int sitemapPagesDiscovered,
        int mappedStationPages,
        int pagesFetched,
        int pagesUnchanged,
        int noticeChanges,
        int pageFailures,
        int pendingReview
    ) {}
}
