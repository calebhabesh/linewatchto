package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.OptionalInt;
import org.junit.jupiter.api.Test;

class ScheduledRegionalLinkTravelTimesTest {
    private final RegionalGtfsScheduleRepository repository = mock(RegionalGtfsScheduleRepository.class);
    private final MutableClock clock = new MutableClock(Instant.parse("2026-10-28T21:00:00Z"));
    private final ScheduledRegionalLinkTravelTimes times = new ScheduledRegionalLinkTravelTimes(repository, clock);

    @Test
    void looksUpEitherDirectionAndIgnoresImplausibleLinks() {
        when(repository.scheduledLinkTimes()).thenReturn(List.of(
            new RegionalGtfsScheduleRepository.LinkTime("regional-up", "bloor", "union", 540),
            new RegionalGtfsScheduleRepository.LinkTime("regional-up", "union", "bloor", 480),
            new RegionalGtfsScheduleRepository.LinkTime("regional-up", "weston", "pearson-airport", 720),
            new RegionalGtfsScheduleRepository.LinkTime("regional-lw", "oakville", "clarkson", 20),
            new RegionalGtfsScheduleRepository.LinkTime("regional-lw", "clarkson", "port-credit", 9_000)
        ));

        assertThat(times.seconds("regional-up", "bloor", "union")).isEqualTo(OptionalInt.of(540));
        assertThat(times.seconds("regional-up", "union", "bloor")).isEqualTo(OptionalInt.of(480));
        // Only one direction timetabled: the reverse link uses it.
        assertThat(times.seconds("regional-up", "pearson-airport", "weston")).isEqualTo(OptionalInt.of(720));
        assertThat(times.seconds("regional-lw", "oakville", "clarkson")).isEmpty();
        assertThat(times.seconds("regional-lw", "clarkson", "port-credit")).isEmpty();
        assertThat(times.seconds("regional-ki", "weston", "etobicoke-north")).isEmpty();
        verify(repository, times(1)).scheduledLinkTimes();
    }

    @Test
    void keepsLastGoodTimesThroughAFailedReloadAndRetriesSoon() {
        when(repository.scheduledLinkTimes())
            .thenReturn(List.of(new RegionalGtfsScheduleRepository.LinkTime("regional-up", "bloor", "union", 540)))
            .thenThrow(new IllegalStateException("database down"))
            .thenReturn(List.of(new RegionalGtfsScheduleRepository.LinkTime("regional-up", "bloor", "union", 600)));

        assertThat(times.seconds("regional-up", "bloor", "union")).isEqualTo(OptionalInt.of(540));
        clock.advance(ScheduledRegionalLinkTravelTimes.RELOAD_INTERVAL);
        assertThat(times.seconds("regional-up", "bloor", "union")).isEqualTo(OptionalInt.of(540));
        clock.advance(ScheduledRegionalLinkTravelTimes.RETRY_INTERVAL);
        assertThat(times.seconds("regional-up", "bloor", "union")).isEqualTo(OptionalInt.of(600));
    }

    @Test
    void retriesSoonWhenNoTimetableIsImportedYet() {
        when(repository.scheduledLinkTimes())
            .thenReturn(List.of())
            .thenReturn(List.of(new RegionalGtfsScheduleRepository.LinkTime("regional-up", "bloor", "union", 540)));

        assertThat(times.seconds("regional-up", "bloor", "union")).isEmpty();
        clock.advance(ScheduledRegionalLinkTravelTimes.RETRY_INTERVAL);
        assertThat(times.seconds("regional-up", "bloor", "union")).isEqualTo(OptionalInt.of(540));
    }

    private static final class MutableClock extends Clock {
        private Instant instant;

        private MutableClock(Instant instant) {
            this.instant = instant;
        }

        private void advance(Duration duration) {
            instant = instant.plus(duration);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return instant;
        }
    }
}
