package com.calebhabesh.linewatch.stationnotice;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class TtcStationNoticeService {
    private static final ZoneId TORONTO_ZONE = ZoneId.of("America/Toronto");

    private final TtcStationNoticeReadRepository repository;
    private final Clock clock;

    public TtcStationNoticeService(TtcStationNoticeReadRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    public List<TtcStationNotice> currentForStation(String stationId) {
        LocalDate today = LocalDate.now(clock.withZone(TORONTO_ZONE));
        return repository.findReviewedByStationId(stationId).stream()
            .filter(notice -> notice.effectiveStart() == null || !notice.effectiveStart().isAfter(today))
            .filter(notice -> notice.effectiveEnd() == null || !notice.effectiveEnd().isBefore(today))
            .toList();
    }
}
