package com.calebhabesh.linewatch.stationnotice;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(prefix = "linewatch.station-notices.monitor", name = "enabled", havingValue = "true")
public class TtcStationNoticePollingJob {
    private static final Logger log = LoggerFactory.getLogger(TtcStationNoticePollingJob.class);
    private final TtcStationNoticeMonitorService service;

    public TtcStationNoticePollingJob(TtcStationNoticeMonitorService service) {
        this.service = service;
    }

    @Scheduled(
        initialDelayString = "${linewatch.station-notices.monitor.initial-delay:PT1M}",
        fixedDelayString = "${linewatch.station-notices.monitor.fixed-delay:PT24H}"
    )
    public void poll() {
        try {
            service.monitorNow();
        } catch (RuntimeException exception) {
            log.error("TTC station notice monitoring failed: {}", exception.getMessage());
        }
    }
}
