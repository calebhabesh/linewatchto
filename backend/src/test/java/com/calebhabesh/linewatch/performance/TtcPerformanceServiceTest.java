package com.calebhabesh.linewatch.performance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;

class TtcPerformanceServiceTest {
    private final TtcPerformanceClient client = mock(TtcPerformanceClient.class);
    private final TtcPerformanceProperties properties = new TtcPerformanceProperties();
    private final TtcPerformanceService service = new TtcPerformanceService(client, properties);

    @Test
    void returnsOfficialSnapshotWhenEnabled() {
        when(client.fetch()).thenReturn(new TtcPerformanceResponses.SnapshotResponse(
            "available", "TTC.ca", "https://www.ttc.ca/", "On-time performance and elevator/escalator status",
            "June 7, 2026 7:00 AM", OffsetDateTime.parse("2026-06-07T12:00:00Z"), false,
            "Official TTC performance metrics loaded from TTC.ca.",
            List.of(new TtcPerformanceResponses.MetricResponse("line-1", "Line 1", "subway", 94, "94%", null))
        ));

        TtcPerformanceResponses.SnapshotResponse response = service.current();

        assertThat(response.status()).isEqualTo("available");
        assertThat(response.metrics()).singleElement().satisfies(metric -> assertThat(metric.id()).isEqualTo("line-1"));
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
}
