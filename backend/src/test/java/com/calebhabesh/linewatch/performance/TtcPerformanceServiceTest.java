package com.calebhabesh.linewatch.performance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

class TtcPerformanceServiceTest {
    private final MutableClock clock = new MutableClock(Instant.parse("2026-06-07T12:00:00Z"));
    private final TtcPerformanceClient client = mock(TtcPerformanceClient.class);
    private final TtcPerformanceProperties properties = new TtcPerformanceProperties();
    private final StringRedisTemplate redis = mock(StringRedisTemplate.class);
    @SuppressWarnings("unchecked")
    private final ValueOperations<String, String> valueOps = mock(ValueOperations.class);
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final TtcPerformanceService service;

    public TtcPerformanceServiceTest() {
        objectMapper.findAndRegisterModules();
        when(redis.opsForValue()).thenReturn(valueOps);
        service = new TtcPerformanceService(client, properties, clock, redis, objectMapper);
    }

    @Test
    void returnsOfficialSnapshotWhenEnabled() {
        when(client.fetch()).thenReturn(new TtcPerformanceResponses.SnapshotResponse(
            "available", "TTC.ca", "https://www.ttc.ca/", "On-time performance and elevator/escalator status",
            "June 7, 2026 7:00 AM", OffsetDateTime.parse("2026-06-07T12:00:00Z"), false,
            "Official TTC performance metrics loaded from TTC.ca.",
            List.of(new TtcPerformanceResponses.MetricResponse("line-1", "Line 1", "subway", 94, 90, "94%", null))
        ));

        TtcPerformanceResponses.SnapshotResponse response = service.current();

        assertThat(response.status()).isEqualTo("available");
        assertThat(response.metrics()).singleElement().satisfies(metric -> assertThat(metric.id()).isEqualTo("line-1"));
    }

    @Test
    void reusesLastSuccessfulSnapshotDuringRefreshInterval() {
        properties.setRefreshInterval(Duration.ofHours(24));
        when(client.fetch()).thenReturn(new TtcPerformanceResponses.SnapshotResponse(
            "available", "TTC.ca", "https://www.ttc.ca/", "On-time performance and elevator/escalator status",
            "Jun 6, 9:30 PM", OffsetDateTime.parse("2026-06-07T12:00:00Z"), false,
            "Official TTC performance metrics loaded from TTC.ca.",
            List.of(new TtcPerformanceResponses.MetricResponse("line-1", "Line 1", "subway", 86, 90, "86%", null))
        ));

        TtcPerformanceResponses.SnapshotResponse first = service.current();
        clock.advance(Duration.ofHours(6));
        TtcPerformanceResponses.SnapshotResponse second = service.current();

        assertThat(second).isSameAs(first);
        verify(client, times(1)).fetch();
    }

    @Test
    void refreshesAfterRefreshInterval() {
        properties.setRefreshInterval(Duration.ofHours(24));
        when(client.fetch())
            .thenReturn(new TtcPerformanceResponses.SnapshotResponse(
                "available", "TTC.ca", "https://www.ttc.ca/", "On-time performance and elevator/escalator status",
                "Jun 6, 9:30 PM", OffsetDateTime.parse("2026-06-07T12:00:00Z"), false,
                "Official TTC performance metrics loaded from TTC.ca.",
                List.of(new TtcPerformanceResponses.MetricResponse("line-1", "Line 1", "subway", 86, 90, "86%", null))
            ))
            .thenReturn(new TtcPerformanceResponses.SnapshotResponse(
                "available", "TTC.ca", "https://www.ttc.ca/", "On-time performance and elevator/escalator status",
                "Jun 7, 9:30 PM", OffsetDateTime.parse("2026-06-08T12:05:00Z"), false,
                "Official TTC performance metrics loaded from TTC.ca.",
                List.of(new TtcPerformanceResponses.MetricResponse("line-1", "Line 1", "subway", 88, 90, "88%", null))
            ));

        TtcPerformanceResponses.SnapshotResponse first = service.current();
        clock.advance(Duration.ofHours(24).plusMinutes(5));
        TtcPerformanceResponses.SnapshotResponse second = service.current();

        assertThat(first.metrics()).singleElement().satisfies(metric -> assertThat(metric.valueLabel()).isEqualTo("86%"));
        assertThat(second.metrics()).singleElement().satisfies(metric -> assertThat(metric.valueLabel()).isEqualTo("88%"));
        verify(client, times(2)).fetch();
    }

    @Test
    void returnsRecentLastSuccessfulSnapshotAsStaleWhenRefreshFails() {
        properties.setRefreshInterval(Duration.ofHours(24));
        properties.setMaxAge(Duration.ofDays(2));
        when(client.fetch())
            .thenReturn(new TtcPerformanceResponses.SnapshotResponse(
                "available", "TTC.ca", "https://www.ttc.ca/", "On-time performance and elevator/escalator status",
                "Jun 6, 9:30 PM", OffsetDateTime.parse("2026-06-07T12:00:00Z"), false,
                "Official TTC performance metrics loaded from TTC.ca.",
                List.of(new TtcPerformanceResponses.MetricResponse("line-1", "Line 1", "subway", 86, 90, "86%", null))
            ))
            .thenThrow(new TtcPerformanceClient.TtcPerformanceClientException("Unable to fetch TTC.ca performance metrics", new RuntimeException("boom")));

        service.current();
        clock.advance(Duration.ofHours(24).plusMinutes(5));
        TtcPerformanceResponses.SnapshotResponse response = service.current();

        assertThat(response.status()).isEqualTo("available");
        assertThat(response.stale()).isTrue();
        assertThat(response.updatedLabel()).isEqualTo("Jun 6, 9:30 PM");
        assertThat(response.metrics()).singleElement().satisfies(metric -> assertThat(metric.valueLabel()).isEqualTo("86%"));
        assertThat(response.message()).contains("last successful");
        verify(client, times(2)).fetch();
    }

    @Test
    void reusesUnavailableSnapshotDuringRefreshIntervalWhenInitialFetchFails() {
        properties.setRefreshInterval(Duration.ofHours(24));
        when(client.fetch()).thenThrow(new TtcPerformanceClient.TtcPerformanceClientException("Unable to fetch TTC.ca performance metrics", new RuntimeException("boom")));

        TtcPerformanceResponses.SnapshotResponse first = service.current();
        clock.advance(Duration.ofHours(2));
        TtcPerformanceResponses.SnapshotResponse second = service.current();

        assertThat(first.status()).isEqualTo("unavailable");
        assertThat(second).isSameAs(first);
        verify(client, times(1)).fetch();
    }

    @Test
    void cachedUnavailableAttemptDoesNotMaskRedisLastSuccessfulSnapshot() throws Exception {
        properties.setRefreshInterval(Duration.ofHours(24));
        properties.setMaxAge(Duration.ofDays(2));
        TtcPerformanceResponses.SnapshotResponse lastSuccessful = new TtcPerformanceResponses.SnapshotResponse(
            "available", "TTC.ca", "https://www.ttc.ca/", "On-time performance and elevator/escalator status",
            "Jun 6, 11:30 PM", OffsetDateTime.parse("2026-06-07T03:30:00Z"), false,
            "Official TTC performance metrics loaded from TTC.ca.",
            List.of(new TtcPerformanceResponses.MetricResponse("line-1", "Line 1", "subway", 85, 90, "85%", null))
        );
        when(valueOps.get("linewatch:performance:last_successful"))
            .thenReturn(null)
            .thenReturn(objectMapper.writeValueAsString(lastSuccessful));
        when(client.fetch()).thenThrow(new TtcPerformanceClient.TtcPerformanceClientException("Unable to fetch TTC.ca performance metrics", new RuntimeException("boom")));

        TtcPerformanceResponses.SnapshotResponse first = service.current();
        clock.advance(Duration.ofHours(2));
        TtcPerformanceResponses.SnapshotResponse second = service.current();

        assertThat(first.status()).isEqualTo("unavailable");
        assertThat(second.status()).isEqualTo("available");
        assertThat(second.stale()).isTrue();
        assertThat(second.metrics()).singleElement().satisfies(metric -> {
            assertThat(metric.valueLabel()).isEqualTo("85%");
            assertThat(metric.target()).isEqualTo(90);
        });
        verify(client, times(1)).fetch();
    }

    @Test
    void returnsDisabledSnapshotWhenPropertyDisabled() {
        properties.setEnabled(false);

        TtcPerformanceResponses.SnapshotResponse response = service.current();

        assertThat(response.status()).isEqualTo("disabled");
        assertThat(response.metrics()).isEmpty();
        assertThat(response.message()).contains("disabled");
    }

    @Test
    void returnsUnavailableSnapshotWhenFetchFails() {
        when(client.fetch()).thenThrow(new TtcPerformanceClient.TtcPerformanceClientException("Unable to fetch TTC.ca performance metrics", new RuntimeException("boom")));

        TtcPerformanceResponses.SnapshotResponse response = service.current();

        assertThat(response.status()).isEqualTo("unavailable");
        assertThat(response.metrics()).isEmpty();
        assertThat(response.message()).contains("temporarily unavailable");
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
            return Clock.fixed(instant, zone);
        }

        @Override
        public Instant instant() {
            return instant;
        }
    }
}
