package com.calebhabesh.linewatch.performance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;

class PerformanceControllerTest {
    private final TtcPerformanceService service = mock(TtcPerformanceService.class);
    private final PerformanceController controller = new PerformanceController(service);

    @Test
    void returnsCurrentOfficialPerformanceSnapshot() {
        when(service.current()).thenReturn(new TtcPerformanceResponses.SnapshotResponse(
            "available", "TTC.ca", "https://www.ttc.ca/", "On-time performance and elevator/escalator status",
            "June 7, 2026 7:00 AM", OffsetDateTime.parse("2026-06-07T12:00:00Z"), false,
            "Official TTC performance metrics loaded from TTC.ca.",
            List.of(new TtcPerformanceResponses.MetricResponse("line-2", "Line 2", "subway", 91, "91%", null))
        ));

        TtcPerformanceResponses.SnapshotResponse response = controller.performance();

        assertThat(response.status()).isEqualTo("available");
        assertThat(response.metrics()).singleElement().satisfies(metric -> assertThat(metric.valueLabel()).isEqualTo("91%"));
    }
}
