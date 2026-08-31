package com.calebhabesh.linewatch.stationnotice;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class TtcStationNoticeServiceTest {
    @Mock
    private TtcStationNoticeReadRepository repository;

    @Test
    void returnsOnlyReviewedNoticesEffectiveOnTheTorontoServiceDate() {
        Clock clock = Clock.fixed(Instant.parse("2026-08-31T15:00:00Z"), ZoneOffset.UTC);
        TtcStationNoticeService service = new TtcStationNoticeService(repository, clock);
        when(repository.findReviewedByStationId("warden")).thenReturn(List.of(
            notice("current", LocalDate.parse("2025-01-05"), null),
            notice("future", LocalDate.parse("2026-09-01"), null),
            notice("expired", LocalDate.parse("2025-01-01"), LocalDate.parse("2026-08-30"))
        ));

        assertThat(service.currentForStation("warden"))
            .extracting(TtcStationNotice::id)
            .containsExactly("current");
    }

    private TtcStationNotice notice(String id, LocalDate start, LocalDate end) {
        return new TtcStationNotice(
            id, "warden", "construction", "Title", "Summary",
            "https://www.ttc.ca/subway-stations/warden-station", start, end, null,
            OffsetDateTime.parse("2026-08-31T09:00:00-04:00"), "TTC station information"
        );
    }
}
